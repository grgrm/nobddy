import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { productId, denomination, invoiceId } = req.query

  if (!productId || !denomination || !invoiceId) {
    return res.status(400).json({ error: 'Missing params' })
  }

  // Verify invoice is actually paid before revealing back URL
  try {
    const checkRes = await fetch(`${process.env.BTCPAY_URL}/api/v1/stores/${process.env.BTCPAY_STORE_ID}/invoices/${invoiceId}`, {
      headers: { 'Authorization': `token ${process.env.BTCPAY_API_KEY}` }
    })

    if (!checkRes.ok) {
      return res.status(400).json({ error: 'Could not verify payment' })
    }

    const invoice = await checkRes.json()
    if (invoice.status !== 'Settled' && invoice.status !== 'Processing') {
      return res.status(403).json({ error: 'Invoice not paid' })
    }

    const backUrl = await redis.get(`postcard:${productId}:${denomination}`)
    if (!backUrl) {
      return res.status(404).json({ error: 'Postcard not found' })
    }

    return res.status(200).json({ backUrl })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
