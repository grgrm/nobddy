/**
 * BTCPay Server Lightning Invoice Generator
 *
 * Setup:
 * 1. Go to pay.nobddy.store → Account → API Keys → Generate Key
 * 2. Set VITE_BTCPAY_URL in your .env file (e.g. https://pay.nobddy.store)
 * 3. Set VITE_BTCPAY_STORE_ID in your .env file
 * 4. Set VITE_BTCPAY_API_KEY in your .env file
 */

const BTCPAY_URL = import.meta.env.VITE_BTCPAY_URL || 'https://pay.nobddy.store'
const BTCPAY_STORE_ID = import.meta.env.VITE_BTCPAY_STORE_ID || ''
const BTCPAY_API_KEY = import.meta.env.VITE_BTCPAY_API_KEY || ''

// Convert any currency amount to satoshis
export async function toSats(amount, currency = 'USD') {
  try {
    const res = await fetch('https://mempool.space/api/v1/prices')
    const data = await res.json()
    const btcPriceUsd = data.USD
    if (!btcPriceUsd) throw new Error('No price data')

    if (currency === 'SATS') return Math.ceil(amount)
    if (currency === 'BTC') return Math.ceil(amount * 100_000_000)

    if (currency === 'USD') {
      return Math.ceil((amount / btcPriceUsd) * 100_000_000)
    }

    const fiatRes = await fetch('https://open.er-api.com/v6/latest/USD')
    const fiatData = await fiatRes.json()
    const rate = fiatData.rates[currency]
    if (!rate) throw new Error(`Unknown currency: ${currency}`)
    const usdAmount = amount / rate
    return Math.ceil((usdAmount / btcPriceUsd) * 100_000_000)
  } catch (e) {
    console.warn('Could not convert to sats:', e)
    return Math.ceil(amount * 2500)
  }
}

export async function createInvoice(amountSats, memo = 'NOBDDY purchase') {
  if (!BTCPAY_STORE_ID || !BTCPAY_API_KEY) {
    throw new Error('BTCPay not configured. Add VITE_BTCPAY_STORE_ID and VITE_BTCPAY_API_KEY to .env')
  }

  const res = await fetch(`${BTCPAY_URL}/api/v1/stores/${BTCPAY_STORE_ID}/invoices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `token ${BTCPAY_API_KEY}`,
    },
    body: JSON.stringify({
      amount: amountSats,
      currency: 'SATS',
      metadata: { itemDesc: memo },
      checkout: {
        expirationMinutes: 10,
        paymentMethods: ['BTC-LightningNetwork'],
      },
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `BTCPay error: ${res.status}`)
  }

  const data = await res.json()

  const methodsRes = await fetch(
    `${BTCPAY_URL}/api/v1/stores/${BTCPAY_STORE_ID}/invoices/${data.id}/payment-methods`,
    { headers: { 'Authorization': `token ${BTCPAY_API_KEY}` } }
  )
  const methods = await methodsRes.json()
  const lightning = methods.find(m => m.paymentMethodId === 'BTC-LightningNetwork')

  return {
    invoiceId: data.id,
    paymentRequest: lightning?.destination || '',
    expiresAt: Date.now() + 600_000,
  }
}

export async function checkInvoicePaid(invoiceId) {
  if (!BTCPAY_STORE_ID || !BTCPAY_API_KEY) return false

  try {
    const res = await fetch(
      `${BTCPAY_URL}/api/v1/stores/${BTCPAY_STORE_ID}/invoices/${invoiceId}`,
      { headers: { 'Authorization': `token ${BTCPAY_API_KEY}` } }
    )
    if (!res.ok) return false
    const data = await res.json()
    return data.status === 'Settled' || data.status === 'Processing'
  } catch {
    return false
  }
}

export async function createProductInvoice(product) {
  const amountSats = await toSats(product.price, product.currency || 'USD')
  const invoice = await createInvoice(amountSats, `NOBDDY: ${product.title}`)
  return { ...invoice, amountSats }
}
