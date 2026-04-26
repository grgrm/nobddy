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

  try {
    // 1. Проверяем инвойс через BTCPay напрямую
    const checkRes = await fetch(
      `${process.env.BTCPAY_URL}/api/v1/stores/${process.env.BTCPAY_STORE_ID}/invoices/${invoiceId}`,
      { headers: { 'Authorization': `token ${process.env.BTCPAY_API_KEY}` } }
    )

    if (!checkRes.ok) {
      return res.status(400).json({ error: 'Could not verify payment' })
    }

    const invoice = await checkRes.json()

    // Только Settled — Processing убран намеренно
    if (invoice.status !== 'Settled') {
      return res.status(403).json({ error: 'Invoice not paid' })
    }

    // 2. Получаем back URL из Redis
    const backUrl = await redis.get(`postcard:${productId}:${denomination}`)
    if (!backUrl) {
      return res.status(404).json({ error: 'Postcard not found' })
    }

    // 3. Идемпотентность — если Pull Payment уже создан для этого инвойса, возвращаем его
    const existingLnurl = await redis.get(`pullpayment:${invoiceId}`)
    if (existingLnurl) {
      return res.status(200).json({ backUrl, lnurl: existingLnurl })
    }

    // 4. Создаём Pull Payment строго на denomination (не на denomination*1.10!)
    const ppRes = await fetch(
      `${process.env.BTCPAY_URL}/api/v1/stores/${process.env.BTCPAY_STORE_ID}/pull-payments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `token ${process.env.BTCPAY_API_KEY}`,
        },
        body: JSON.stringify({
          name: `Postcard ${denomination} sats (Invoice ${invoiceId})`,
          amount: String(denomination),
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
