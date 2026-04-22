require('dotenv').config({ path: require('path').join(__dirname, '.env') })
const express = require('express')

const app = express()
app.use(express.json())

app.post('/api/create-invoice', async (req, res) => {
  const BTCPAY_URL = process.env.BTCPAY_URL
  const BTCPAY_STORE_ID = process.env.BTCPAY_STORE_ID
  const BTCPAY_API_KEY = process.env.BTCPAY_API_KEY
  const { amountSats, memo } = req.body
  try {
    const invoiceRes = await fetch(
      `${BTCPAY_URL}/api/v1/stores/${BTCPAY_STORE_ID}/invoices`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `token ${BTCPAY_API_KEY}` },
        body: JSON.stringify({
          amount: (amountSats / 100_000_000).toFixed(8),
          currency: 'BTC',
          metadata: { itemDesc: memo || 'Shop purchase' },
          checkout: { expirationMinutes: 10, paymentMethods: ['BTC-LN'] },
        }),
      }
    )
    const invoice = await invoiceRes.json()
    if (!invoice.id) return res.status(500).json({ error: invoice.message || 'Invoice creation failed' })
    const methodsRes = await fetch(
      `${BTCPAY_URL}/api/v1/stores/${BTCPAY_STORE_ID}/invoices/${invoice.id}/payment-methods`,
      { headers: { Authorization: `token ${BTCPAY_API_KEY}` } }
    )
    const methods = await methodsRes.json()
    const ln = methods.find(m => m.paymentMethodId === 'BTC-LN')
    if (!ln || !ln.destination) return res.status(500).json({ error: 'Lightning not available' })
    res.json({
      invoiceId: invoice.id,
      paymentRequest: ln.destination,
      paymentHash: ln.additionalData?.paymentHash || invoice.id,
      amountSats,
      expiresAt: Date.now() + 600_000,
    })
  } catch (e) {
    console.error('create-invoice error:', e)
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/check-invoice', async (req, res) => {
  const BTCPAY_URL = process.env.BTCPAY_URL
  const BTCPAY_STORE_ID = process.env.BTCPAY_STORE_ID
  const BTCPAY_API_KEY = process.env.BTCPAY_API_KEY
  const { invoiceId } = req.query
  try {
    const r = await fetch(
      `${BTCPAY_URL}/api/v1/stores/${BTCPAY_STORE_ID}/invoices/${invoiceId}`,
      { headers: { Authorization: `token ${BTCPAY_API_KEY}` } }
    )
    const data = await r.json()
    res.json({ paid: data.status === 'Settled' || data.status === 'Complete' })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/notify', async (req, res) => {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID
  const { type, product, variant, amountSats, shipping, items, totalSats } = req.body
  let lines = []
  if (type === 'cart') {
    const itemLines = (items || []).map(({ product, qty, variant }) =>
      `• ${product.title}${variant ? ` (${variant})` : ''} ×${qty}`
    ).join('\n')
    lines = ['🛍 *NEW ORDER — NOBDDY*', '', '*Items:*', itemLines, '', `⚡ *Total:* ${(totalSats || 0).toLocaleString()} sats`, '', '📮 *Delivery:*', shipping?.name && `👤 ${shipping.name}`, shipping?.email && `✉️ ${shipping.email}`, '', `🕐 ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Tbilisi' })}`].filter(Boolean)
  } else {
    lines = ['🛍 *NEW ORDER — NOBDDY*', '', `📦 *Product:* ${product?.title}`, variant && `🎨 *Variant:* ${variant}`, `⚡ *Amount:* ${(amountSats || 0).toLocaleString()} sats`, '', '📮 *Delivery:*', shipping?.name && `👤 ${shipping.name}`, shipping?.email && `✉️ ${shipping.email}`, '', `🕐 ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Tbilisi' })}`].filter(Boolean)
  }
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: lines.join('\n'), parse_mode: 'Markdown' }),
    })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

