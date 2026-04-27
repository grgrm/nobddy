
// Encode URL to LNURL bech32 format
function encodeLnurl(url) {
  const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
  const hrp = 'lnurl'
  const bytes = Buffer.from(url, 'utf8')
  const words = []
  let buffer = 0, bitsLeft = 0
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bitsLeft += 8
    while (bitsLeft >= 5) {
      bitsLeft -= 5
      words.push((buffer >> bitsLeft) & 31)
    }
  }
  if (bitsLeft > 0) words.push((buffer << (5 - bitsLeft)) & 31)
  const data = words
  const values = [
    ...hrp.split('').map(c => c.charCodeAt(0) >> 5),
    0,
    ...hrp.split('').map(c => c.charCodeAt(0) & 31),
    0,
    ...data
  ]
  let chk = 1
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
  for (const v of values) {
    const b = chk >> 25
    chk = ((chk & 0x1ffffff) << 5) ^ v
    for (let i = 0; i < 5; i++) if ((b >> i) & 1) chk ^= GEN[i]
  }
  chk ^= 1
  const checksum = Array.from({length: 6}, (_, i) => (chk >> (5 * (5 - i))) & 31)
  return (hrp + '1' + [...data, ...checksum].map(v => CHARSET[v]).join('')).toUpperCase()
}

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

  const invoiceId = rawInvoiceId.split(':')[0]
  const originalDenomination = Number(denomination)

  try {
    // 1. Проверяем инвойс через BTCPay
    const checkRes = await fetch(
      `${process.env.BTCPAY_URL}/api/v1/stores/${process.env.BTCPAY_STORE_ID}/invoices/${invoiceId}`,
      { headers: { 'Authorization': `token ${process.env.BTCPAY_API_KEY}` } }
    )

    if (!checkRes.ok) {
      const errText = await checkRes.text()
      return res.status(400).json({ error: 'Could not verify payment', detail: errText })
    }

    const invoice = await checkRes.json()
    console.log('Invoice status:', invoice.status, 'for invoiceId:', invoiceId)

    if (invoice.status !== 'Settled' && invoice.status !== 'Complete') {
      return res.status(403).json({ error: 'Invoice not paid', status: invoice.status })
    }

    // 2. Получаем back URL из Redis
    const backUrl = await redis.get(`postcard:${productId}:${originalDenomination}`)
    console.log('backUrl lookup key:', `postcard:${productId}:${originalDenomination}`, 'result:', backUrl ? 'found' : 'null')
    if (!backUrl) {
      return res.status(404).json({ error: 'Postcard not found', key: `postcard:${productId}:${originalDenomination}` })
    }

    // 3. Идемпотентность
    const existingLnurl = await redis.get(`pullpayment:${invoiceId}`)
    if (existingLnurl) {
      return res.status(200).json({ backUrl, lnurl: existingLnurl })
    }

    // 4. Создаём Pull Payment
    const ppBody = {
      name: `PP-${invoiceId.slice(0,10)}-${originalDenomination}`,
      amount: String(originalDenomination),
      currency: 'SATS',
      paymentMethods: ['BTC-LN'],
      autoApproveClaims: true,
    }
    console.log('Creating pull payment with body:', JSON.stringify(ppBody))

    const ppRes = await fetch(
      `${process.env.BTCPAY_URL}/api/v1/stores/${process.env.BTCPAY_STORE_ID}/pull-payments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `token ${process.env.BTCPAY_API_KEY}`,
        },
        body: JSON.stringify(ppBody),
      }
    )

    const ppText = await ppRes.text()
    console.log('Pull payment response status:', ppRes.status, 'body:', ppText)

    if (!ppRes.ok) {
      return res.status(500).json({ error: 'Could not create pull payment', detail: ppText })
    }

    const pp = JSON.parse(ppText)
    // Fetch LNURL directly from the Pull Payment page
    const ppPageRes = await fetch(`${process.env.BTCPAY_URL}/pull-payments/${pp.id}`)
    const ppHtml = await ppPageRes.text()
    const lnurlMatch = ppHtml.match(/lnurl1[a-z0-9]+/)
    const lnurl = lnurlMatch ? lnurlMatch[0].toUpperCase() : null
    if (!lnurl) {
      return res.status(500).json({ error: 'Could not extract LNURL from pull payment page' })
    }
    console.log('Pull payment created:', pp.id, 'lnurl:', lnurl)

    await redis.set(`pullpayment:${invoiceId}`, lnurl, { ex: 60 * 60 * 24 * 30 })

    return res.status(200).json({ backUrl, lnurl })

  } catch (e) {
    console.error('Error:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
