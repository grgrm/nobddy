export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID

  if (!BOT_TOKEN || !CHAT_ID) {
    return res.status(500).json({ error: 'Telegram not configured' })
  }

  const { type, product, variant, amountSats, shipping, items, totalSats } = req.body

  let lines = []

  if (type === 'cart') {
    const itemLines = (items || []).map(({ product, qty, variant }) => {
      const v = variant ? ` (${variant})` : ''
      return `• ${product.title}${v} ×${qty}`
    }).join('\n')

    lines = [
      '🛍 *NEW ORDER — NOBDDY*',
      '',
      '*Items:*',
      itemLines,
      '',
      `⚡ *Total:* ${(totalSats || amountSats || 0).toLocaleString()} sats`,
      '',
      '📮 *Delivery:*',
      shipping?.name ? `👤 ${shipping.name}` : null,
      shipping?.country ? `🌍 ${shipping.country}${shipping.city ? `, ${shipping.city}` : ''}` : null,
      shipping?.address ? `🏠 ${shipping.address}` : null,
      shipping?.zip ? `📮 ${shipping.zip}` : null,
      shipping?.email ? `✉️ ${shipping.email}` : null,
      '',
      `🕐 ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Tbilisi' })}`,
    ].filter(Boolean)
  } else {
    lines = [
      '🛍 *NEW ORDER — NOBDDY*',
      '',
      `📦 *Product:* ${product?.title || 'Unknown'}`,
      variant ? `🎨 *Variant:* ${variant}` : null,
      `⚡ *Amount:* ${(amountSats || 0).toLocaleString()} sats`,
      '',
      '📮 *Delivery:*',
      shipping?.name ? `👤 ${shipping.name}` : null,
      shipping?.country ? `🌍 ${shipping.country}${shipping.city ? `, ${shipping.city}` : ''}` : null,
      shipping?.address ? `🏠 ${shipping.address}` : null,
      shipping?.zip ? `📮 ${shipping.zip}` : null,
      shipping?.email ? `✉️ ${shipping.email}` : null,
      '',
      `🕐 ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Tbilisi' })}`,
    ].filter(Boolean)
  }

  try {
    const tgRes = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text: lines.join('\n'),
          parse_mode: 'Markdown',
        }),
      }
    )

    if (!tgRes.ok) {
      const err = await tgRes.json().catch(() => ({}))
      return res.status(500).json({ error: err.description || 'Telegram error' })
    }

    return res.status(200).json({ ok: true })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
