/**
 * Telegram Bot Notifications
 * Sends order details to your Telegram when a purchase is made
 *
 * Setup:
 * 1. Create bot via @BotFather → get token
 * 2. Get your Chat ID via @userinfobot
 * 3. Add to .env:
 *    VITE_TELEGRAM_BOT_TOKEN=your_token
 *    VITE_TELEGRAM_CHAT_ID=your_chat_id
 */

const BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN || ''
const CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID || ''

export async function sendOrderNotification({ product, variant, amountSats, shipping }) {
  if (!BOT_TOKEN || !CHAT_ID) return

  const lines = [
    '🛍 *NEW ORDER — NOBDDY*',
    '',
    `📦 *Product:* ${product.title}`,
    variant ? `🎨 *Variant:* ${variant}` : null,
    `⚡ *Amount:* ${amountSats.toLocaleString()} sats`,
    '',
    '📮 *Delivery:*',
    `👤 ${shipping.name}`,
    `🌍 ${shipping.country}, ${shipping.city}`,
    `🏠 ${shipping.address}`,
    `📮 ${shipping.zip}`,
    `✉️ ${shipping.email}`,
    '',
    `🕐 ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Tbilisi' })}`,
  ].filter(Boolean).join('\n')

  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: lines,
        parse_mode: 'Markdown',
      }),
    })
  } catch (e) {
    console.error('Telegram notification failed:', e)
  }
}

export async function sendCartOrderNotification({ items, totalSats, shipping }) {
  if (!BOT_TOKEN || !CHAT_ID) return

  const itemLines = items.map(({ product, qty, variant }) => {
    const v = variant ? ` (${variant})` : ''
    return `• ${product.title}${v} ×${qty}`
  }).join('\n')

  const lines = [
    '🛍 *NEW ORDER — NOBDDY*',
    '',
    '*Items:*',
    itemLines,
    '',
    `⚡ *Total:* ${totalSats.toLocaleString()} sats`,
    '',
    '📮 *Delivery:*',
    `👤 ${shipping.name}`,
    `🌍 ${shipping.country}, ${shipping.city}`,
    `🏠 ${shipping.address}`,
    `📮 ${shipping.zip}`,
    `✉️ ${shipping.email}`,
    '',
    `🕐 ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Tbilisi' })}`,
  ].join('\n')

  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: lines,
        parse_mode: 'Markdown',
      }),
    })
  } catch (e) {
    console.error('Telegram notification failed:', e)
  }
}
