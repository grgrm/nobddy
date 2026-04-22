export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const BTCPAY_URL = process.env.BTCPAY_URL
  const BTCPAY_STORE_ID = process.env.BTCPAY_STORE_ID
  const BTCPAY_API_KEY = process.env.BTCPAY_API_KEY

  const { invoiceId } = req.query

  if (!invoiceId) {
    return res.status(400).json({ error: 'invoiceId is required' })
  }

  try {
    const invoiceRes = await fetch(
      `${BTCPAY_URL}/api/v1/stores/${BTCPAY_STORE_ID}/invoices/${invoiceId}`,
      {
        headers: { Authorization: `token ${BTCPAY_API_KEY}` },
      }
    )

    if (!invoiceRes.ok) {
      return res.status(500).json({ error: 'Could not check invoice' })
    }

    const data = await invoiceRes.json()
    const paid = data.status === 'Settled' || data.status === 'Complete'

    return res.status(200).json({ paid })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
