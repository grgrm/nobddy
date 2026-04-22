export async function usdToSats(usdAmount) {
  try {
    const res = await fetch('https://mempool.space/api/v1/prices')
    const data = await res.json()
    const btcPriceUsd = data.USD
    if (!btcPriceUsd) throw new Error('No price data')
    return Math.ceil((usdAmount / btcPriceUsd) * 100_000_000)
  } catch {
    console.warn('Could not fetch BTC price, using fallback')
    return Math.ceil(usdAmount * 2500)
  }
}

export async function createInvoice(amountSats, memo = 'Shop purchase') {
  const res = await fetch('/api/create-invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amountSats, memo }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to create invoice')
  }

  return await res.json()
}

export async function checkInvoicePaid(invoiceId) {
  try {
    const res = await fetch(`/api/check-invoice?invoiceId=${invoiceId}`)
    if (!res.ok) return false
    const data = await res.json()
    return data.paid === true
  } catch {
    return false
  }
}

export async function createProductInvoice(product) {
  let amountSats

  if (product.currency === 'BTC') {
    amountSats = Math.ceil(product.price * 100_000_000)
  } else if (product.currency === 'SATS') {
    amountSats = Math.ceil(product.price)
  } else {
    amountSats = await usdToSats(product.price)
  }

  const invoice = await createInvoice(amountSats, `Purchase: ${product.title}`)
  return { ...invoice, amountSats }
}
