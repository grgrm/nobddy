export async function sendOrderNotification({ product, variant, amountSats, shipping }) {
  try {
    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'single', product, variant, amountSats, shipping }),
    })
  } catch (e) {
    console.error('Telegram notification failed:', e)
  }
}

export async function sendCartOrderNotification({ items, totalSats, shipping }) {
  try {
    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'cart', items, totalSats, shipping }),
    })
  } catch (e) {
    console.error('Telegram notification failed:', e)
  }
}
