export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const BTCPAY_URL = process.env.BTCPAY_URL
  const BTCPAY_STORE_ID = process.env.BTCPAY_STORE_ID
  const BTCPAY_API_KEY = process.env.BTCPAY_API_KEY

  if (!BTCPAY_URL || !BTCPAY_STORE_ID || !BTCPAY_API_KEY) {
    return res.status(500).json({ error: 'BTCPay not configured' })
  }

  const { amountSats, memo } = req.body

  if (!amountSats) {
    return res.status(400).json({ error: 'amountSats is required' })
  }

  try {
    const invoiceRes = await fetch(
      `${BTCPAY_URL}/api/v1/stores/${BTCPAY_STORE_ID}/invoices`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `token ${BTCPAY_API_KEY}`,
        },
        body: JSON.stringify({
          amount: (amountSats / 100_000_000).toFixed(8),
          currency: 'BTC',
          metadata: { itemDesc: memo || 'Shop purchase' },
          checkout: {
            expirationMinutes: 10,
            paymentMethods: ['BTC-LN'],
          },
        }),
      }
    )

    if (!invoiceRes.ok) {
      const err = await invoiceRes.json().catch(() => ({}))
      return res.status(500).json({ error: err.message || 'BTCPay error' })
    }

    const invoice = await invoiceRes.json()

    const methodsRes = await fetch(
      `${BTCPAY_URL}/api/v1/stores/${BTCPAY_STORE_ID}/invoices/${invoice.id}/payment-methods`,
      {
        headers: { Authorization: `token ${BTCPAY_API_KEY}` },
      }
    )

    if (!methodsRes.ok) {
      return res.status(500).json({ error: 'Could not get payment methods' })
    }

    const methods = await methodsRes.json()
    const ln = methods.find(m => m.paymentMethodId === 'BTC-LN')

    if (!ln || !ln.destination) {
      return res.status(500).json({ error: 'Lightning payment method not available' })
    }

    return res.status(200).json({
      invoiceId: invoice.id,
      paymentRequest: ln.destination,
      paymentHash: ln.additionalData?.paymentHash || invoice.id,
      amountSats,
      expiresAt: Date.now() + 600_000,
    })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
