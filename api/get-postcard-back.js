import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { productId, denomination, invoiceId: rawInvoiceId } = req.query

  if (!productId || !denomination || !rawInvoiceId) {
    return res.status(400).json({ error: 'Missing params' })
  }

  // Чистим invoiceId от возможного :1 суффикса
  const invoiceId = rawInvoiceId.split(':')[0]

  // Оригинальный номинал без 10% комиссии (так сохранено в Redis)
  // denomination уже является оригинальным номиналом
  const originalDenomination = Number(denomination)

  try {
    // 1. Проверяем инвойс через BTCPay напрямую
    const checkRes = await fetch(
      `${process.env.BTCPAY_URL}/api/v1/stores/${process.env.BTCPAY_STORE_ID}/invoices/${invoiceId}`,
      { headers: { 'Authorization': `token ${process.env.BTCPAY_API_KEY}` } }
    )

    if (!checkRes.ok) {
      const errText = await checkRes.text()
      return res.status(400).json({ error: 'Could not verify payment', btcpayStatus: checkRes.status, btcpayBody: errText })
    }

    const invoice = await checkRes.json()

    console.log('Invoice status:', invoice.status, 'for invoiceId:', invoiceId)

    // Принимаем Settled и Complete
    if (invoice.status !== 'Settled' && invoice.status !== 'Complete') {
      return res.status(403).json({ error: 'Invoice not paid', status: invoice.status })
    }

    // 2. Получаем back URL из Redis по оригинальному номиналу
    const backUrl = await redis.get(`postcard:${productId}:${originalDenomination}`)
    if (!backUrl) {
      return res.status(404).json({ error: 'Postcard not found', key: `postcard:${productId}:${originalDenomination}` })
    }

    // 3. Идемпотентность — если Pull Payment уже создан для этого инвойса, возвращаем его
    const existingLnurl = await redis.get(`pullpayment:${invoiceId}`)
    if (existingLnurl) {
      return res.status(200).json({ backUrl, lnurl: existingLnurl })
    }

    // 4. Создаём Pull Payment строго на originalDenomination (без комиссии)
    const ppRes = await fetch(
      `${process.env.BTCPAY_URL}/api/v1/stores/${process.env.BTCPAY_STORE_ID}/pull-payments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `token ${process.env.BTCPAY_API_KEY}`,
        },
        body: JSON.stringify({
          name: `Postcard ${originalDenomination} sats (Invoice ${invoiceId})`,
          amount: String(originalDenomination),
          currency: 'SATS',
          paymentMethods: ['BTC-LN'],
          autoApproveClaims: true,
        }),
      }
    )

    if (!ppRes.ok) {
      const err = await ppRes.json().catch(() => ({}))
      return res.status(500).json({ error: err.message || 'Could not create pull payment' })
    }

    const pp = await ppRes.json()
    const lnurl = `${process.env.BTCPAY_URL}/pull-payments/${pp.id}/lnurlw`

    // 5. Сохраняем LNURL в Redis на 30 дней
    await redis.set(`pullpayment:${invoiceId}`, lnurl, { ex: 60 * 60 * 24 * 30 })

    return res.status(200).json({ backUrl, lnurl })

  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
