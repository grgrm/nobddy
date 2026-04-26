async function fetchImageAsBase64(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buffer = await res.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const contentType = res.headers.get('content-type') || 'image/jpeg'
    const ext = contentType.includes('png') ? 'png' : contentType.includes('svg') ? 'svg' : 'jpg'
    return { base64, contentType, ext }
  } catch {
    return null
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY

  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: 'Email not configured' })
  }

  const { type, product, variant, amountSats, shipping, items, totalSats, postcards, lnurl } = req.body

  // Must have email
  const toEmail = shipping?.email
  if (!toEmail) {
    return res.status(400).json({ error: 'No recipient email' })
  }

  let subject = ''
  let html = ''

  if (type === 'postcard') {
    // ── POSTCARD EMAIL ──────────────────────────────────────────────
    subject = 'Your NOBDDY Postcard ⚡'

    const cardRows = (postcards || []).map(({ denomination }) => `
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #e5e0d8;">
          <p style="margin: 0; font-family: 'Space Mono', monospace; font-size: 13px; color: #333;">
            ⚡ ${denomination ? `${Number(denomination).toLocaleString()} sats` : 'Postcard'} — attached as files (front + back)
          </p>
        </td>
      </tr>
    `).join('')

    html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0; padding:0; background:#f5f0e8; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8; padding: 40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background:#ffffff; border-radius:12px; overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:#1a0f2e; padding: 32px 40px; text-align: center;">
            <p style="margin:0; font-size: 28px; font-weight: 900; letter-spacing: 2px; color: #ffffff;">
              NO<span style="color:#ff6b35;">BDDY</span>
            </p>
            <p style="margin: 6px 0 0; font-size: 10px; letter-spacing: 3px; color: #888; text-transform: uppercase;">
              SOVEREIGN BY DEFAULT
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding: 40px;">
            <h1 style="margin: 0 0 8px; font-size: 22px; color: #1a0f2e; font-weight: 700;">Your postcard is ready ⚡</h1>
            <p style="margin: 0 0 32px; color: #666; font-size: 15px;">Payment confirmed. Here are your postcards:</p>

            <table width="100%" cellpadding="0" cellspacing="0">
              ${cardRows}
            </table>

            ${lnurl ? `
            <div style="margin: 32px 0 24px; text-align: center; background: #f5f0e8; border-radius: 12px; padding: 24px;">
              <p style="margin: 0 0 12px; font-family: monospace; font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: #cc3a00; font-weight: 700;">⚡ Gift QR Code</p>
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(lnurl)}&color=cc3a00&bgcolor=f5f0e8" alt="Gift QR" width="200" height="200" style="border-radius: 8px; border: 2px solid #cc3a00;" />
              <p style="margin: 12px 0 0; font-size: 13px; color: #666; line-height: 1.6;">Give this QR code to the recipient — they scan it with any Lightning wallet to claim their sats.</p>
            </div>` : ''}

            <p style="margin: 32px 0 0; color: #999; font-size: 13px; line-height: 1.6;">
              This is a digital product. Save these images — they won't be available again without your payment proof.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f5f0e8; padding: 24px 40px; text-align: center;">
            <p style="margin:0; font-size: 12px; color: #999;">
              nobddy.store — exist without permission.
            </p>
            <p style="margin: 8px 0 0; font-size: 11px; color: #bbb;">
              You received this email because you made a purchase at <a href="https://nobddy.store" style="color:#bbb;">nobddy.store</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  } else {
    // ── ORDER CONFIRMATION EMAIL (clothing, coffee, accessories) ────
    subject = 'Your NOBDDY Order Confirmed ⚡'

    let itemsHtml = ''
    if (type === 'cart' && items?.length) {
      itemsHtml = (items || []).map(({ product, qty, variant }) => {
        const v = variant ? `<span style="color:#888; font-size:13px;"> (${variant})</span>` : ''
        return `
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #f0ece4; font-size: 15px; color: #333;">
              ${product.title}${v}
            </td>
            <td style="padding: 10px 0; border-bottom: 1px solid #f0ece4; text-align: right; font-size: 15px; color: #333;">
              ×${qty}
            </td>
          </tr>`
      }).join('')
    } else {
      const v = variant ? ` (${variant})` : ''
      itemsHtml = `
        <tr>
          <td style="padding: 10px 0; font-size: 15px; color: #333;">${product?.title || ''}${v}</td>
          <td style="padding: 10px 0; text-align: right; font-size: 15px; color: #333;">×1</td>
        </tr>`
    }

    const totalDisplay = (totalSats || amountSats || 0).toLocaleString()

    const deliveryRows = [
      shipping?.name ? `<tr><td style="color:#888; font-size:13px; padding: 4px 0;">Name</td><td style="font-size:13px; padding: 4px 0;">${shipping.name}</td></tr>` : '',
      shipping?.country ? `<tr><td style="color:#888; font-size:13px; padding: 4px 0;">Country</td><td style="font-size:13px; padding: 4px 0;">${shipping.country}${shipping.city ? `, ${shipping.city}` : ''}</td></tr>` : '',
      shipping?.address ? `<tr><td style="color:#888; font-size:13px; padding: 4px 0;">Address</td><td style="font-size:13px; padding: 4px 0;">${shipping.address}</td></tr>` : '',
      shipping?.zip ? `<tr><td style="color:#888; font-size:13px; padding: 4px 0;">ZIP</td><td style="font-size:13px; padding: 4px 0;">${shipping.zip}</td></tr>` : '',
    ].filter(Boolean).join('')

    html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0; padding:0; background:#f5f0e8; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8; padding: 40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background:#ffffff; border-radius:12px; overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:#1a0f2e; padding: 32px 40px; text-align: center;">
            <p style="margin:0; font-size: 28px; font-weight: 900; letter-spacing: 2px; color: #ffffff;">
              NO<span style="color:#ff6b35;">BDDY</span>
            </p>
            <p style="margin: 6px 0 0; font-size: 10px; letter-spacing: 3px; color: #888; text-transform: uppercase;">
              SOVEREIGN BY DEFAULT
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding: 40px;">
            <h1 style="margin: 0 0 8px; font-size: 22px; color: #1a0f2e; font-weight: 700;">Order confirmed ⚡</h1>
            <p style="margin: 0 0 32px; color: #666; font-size: 15px;">Payment received. Here's your order summary:</p>

            <!-- Items -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
              ${itemsHtml}
              <tr>
                <td style="padding: 14px 0 0; font-weight: 700; font-size: 15px; color: #1a0f2e;">Total</td>
                <td style="padding: 14px 0 0; text-align: right; font-weight: 700; font-size: 15px; color: #ff6b35;">⚡ ${totalDisplay} sats</td>
              </tr>
            </table>

            <!-- Delivery -->
            ${deliveryRows ? `
            <div style="background:#f5f0e8; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
              <p style="margin: 0 0 12px; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #1a0f2e;">Delivery Details</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
                ${deliveryRows}
              </table>
            </div>` : ''}

            <!-- Shipping notice -->
            <div style="border-left: 3px solid #ff6b35; padding-left: 16px; margin-bottom: 0;">
              <p style="margin: 0 0 8px; font-size: 14px; color: #333; line-height: 1.6;">
                📦 Your order will be shipped within <strong>1–3 business days</strong>.
              </p>
              <p style="margin: 0; font-size: 14px; color: #333; line-height: 1.6;">
                Once dispatched, you'll receive a <strong>tracking number</strong> at this email address.
              </p>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f5f0e8; padding: 24px 40px; text-align: center;">
            <p style="margin:0; font-size: 12px; color: #999;">
              nobddy.store — exist without permission.
            </p>
            <p style="margin: 8px 0 0; font-size: 11px; color: #bbb;">
              You received this email because you made a purchase at <a href="https://nobddy.store" style="color:#bbb;">nobddy.store</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
  }

  // ── Build attachments for postcards ────────────────────────────
  const attachments = []
  if (type === 'postcard' && postcards?.length) {
    for (let i = 0; i < postcards.length; i++) {
      const { frontUrl, backUrl, denomination } = postcards[i]
      const label = denomination ? `${denomination}sats` : `postcard${i + 1}`
      if (frontUrl) {
        const img = await fetchImageAsBase64(frontUrl)
        if (img) attachments.push({ filename: `${label}-front.${img.ext}`, content: img.base64 })
      }
      if (backUrl) {
        const img = await fetchImageAsBase64(backUrl)
        if (img) attachments.push({ filename: `${label}-back.${img.ext}`, content: img.base64 })
      }
    }
  }

  // ── Send via Resend ─────────────────────────────────────────────
  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'NOBDDY <orders@nobddy.store>',
        to: toEmail,
        subject,
        html,
        ...(attachments.length ? { attachments } : {}),
        headers: {
          'List-Unsubscribe': '<https://nobddy.store>',
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }),
    })

    if (!emailRes.ok) {
      const err = await emailRes.json().catch(() => ({}))
      return res.status(500).json({ error: err.message || 'Resend error' })
    }

    return res.status(200).json({ ok: true })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
