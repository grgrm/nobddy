import { Redis } from '@upstash/redis'
import sharp from 'sharp'
import QRCode from 'qrcode'

const redis = Redis.fromEnv()

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { productId, denomination, invoiceId: rawInvoiceId } = req.query

  if (!productId || !denomination || !rawInvoiceId) {
    return res.status(400).json({ error: 'Missing params' })
  }

  const invoiceId = rawInvoiceId.split(':')[0]
  const originalDenomination = Number(denomination)

  try {
    // 1. Проверяем инвойс через BTCPay
    const checkRes = await fetch(
      `${process.env.BTCPAY_URL}/api/v1/stores/${process.env.BTCPAY_STORE_ID}/invoices/${invoiceId}`,
      { headers: { 'Authorization': `token ${process.env.BTCPAY_API_KEY}` } }
    )

    if (!checkRes.ok) {
      const errText = await checkRes.text()
      return res.status(400).json({ error: 'Could not verify payment', detail: errText })
    }

    const invoice = await checkRes.json()
    console.log('Invoice status:', invoice.status, 'for invoiceId:', invoiceId)

    if (invoice.status !== 'Settled' && invoice.status !== 'Complete') {
      return res.status(403).json({ error: 'Invoice not paid', status: invoice.status })
    }

    // 2. Получаем back URL из Redis
    const backUrl = await redis.get(`postcard:${productId}:${originalDenomination}`)
    if (!backUrl) {
      return res.status(404).json({ error: 'Postcard not found', key: `postcard:${productId}:${originalDenomination}` })
    }

    // 3. Идемпотентность — если уже есть lnurl и backWithQr
    const existingLnurl = await redis.get(`pullpayment:${invoiceId}`)
    const existingBackWithQr = await redis.get(`backwithqr:${invoiceId}`)
    if (existingLnurl && existingBackWithQr) {
      return res.status(200).json({ backUrl, lnurl: existingLnurl, backWithQr: existingBackWithQr })
    }

    // 4. Создаём Pull Payment если ещё нет
    let lnurl = existingLnurl
    if (!lnurl) {
      const ppBody = {
        name: `PP-${invoiceId.slice(0,10)}-${originalDenomination}`,
        amount: String(originalDenomination),
        currency: 'SATS',
        paymentMethods: ['BTC-LN'],
        autoApproveClaims: true,
      }

      const ppRes = await fetch(
        `${process.env.BTCPAY_URL}/api/v1/stores/${process.env.BTCPAY_STORE_ID}/pull-payments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `token ${process.env.BTCPAY_API_KEY}`,
          },
          body: JSON.stringify(ppBody),
        }
      )

      const ppText = await ppRes.text()
      if (!ppRes.ok) {
        return res.status(500).json({ error: 'Could not create pull payment', detail: ppText })
      }

      const pp = JSON.parse(ppText)
      const ppPageRes = await fetch(`${process.env.BTCPAY_URL}/pull-payments/${pp.id}`)
      const ppHtml = await ppPageRes.text()
      const lnurlMatch = ppHtml.match(/lnurl1[a-z0-9]+/)
      lnurl = lnurlMatch ? lnurlMatch[0].toUpperCase() : null
      if (!lnurl) {
        return res.status(500).json({ error: 'Could not extract LNURL from pull payment page' })
      }

      await redis.set(`pullpayment:${invoiceId}`, lnurl, { ex: 60 * 60 * 24 * 30 })
      console.log('Pull payment created:', pp.id, 'lnurl:', lnurl)
    }

    // 5. Накладываем QR на back изображение
    let backWithQr = existingBackWithQr
    if (!backWithQr) {
      try {
        // Скачиваем back изображение
        const backImgRes = await fetch(backUrl)
        const backImgBuffer = Buffer.from(await backImgRes.arrayBuffer())

        // Получаем размеры изображения
        const backMeta = await sharp(backImgBuffer).metadata()
        const imgWidth = backMeta.width || 800
        const imgHeight = backMeta.height || 600

        // Размер QR — 25% от меньшей стороны
        const qrSize = Math.round(Math.min(imgWidth, imgHeight) * 0.25)

        // Генерируем QR как PNG буфер
        const qrBuffer = await QRCode.toBuffer(lnurl, {
          type: 'png',
          width: qrSize,
          margin: 1,
          color: { dark: '#000000', light: '#ffffff' }
        })

        // Позиция QR — правый нижний угол с отступом
        const padding = Math.round(qrSize * 0.1)
        const qrLeft = imgWidth - qrSize - padding
        const qrTop = imgHeight - qrSize - padding

        // Накладываем QR на back
        const compositeBuffer = await sharp(backImgBuffer)
          .composite([{ input: qrBuffer, left: qrLeft, top: qrTop }])
          .png()
          .toBuffer()

        backWithQr = `data:image/png;base64,${compositeBuffer.toString('base64')}`

        // Сохраняем в Redis на 30 дней
        await redis.set(`backwithqr:${invoiceId}`, backWithQr, { ex: 60 * 60 * 24 * 30 })
        console.log('Back with QR generated successfully')
      } catch (imgErr) {
        console.error('Image processing error:', imgErr.message)
        // Если не получилось наложить QR — возвращаем оригинальный back
        backWithQr = null
      }
    }

    return res.status(200).json({ backUrl, lnurl, backWithQr })

  } catch (e) {
    console.error('Error:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
