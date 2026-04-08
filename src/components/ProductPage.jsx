import React, { useState, useEffect, useRef } from 'react'
import styles from './ProductPage.module.css'
import { useCart } from '../utils/CartContext.jsx'
import { useCurrency } from '../utils/CurrencyContext.jsx'
import { createProductInvoice, checkInvoicePaid } from '../utils/lightning.js'
import QRCode from 'qrcode'

const CLOTHING_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
const PLACEHOLDER = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjgwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMWExYTFhIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJtb25vc3BhY2UiIGZvbnQtc2l6ZT0iOTYiIGZpbGw9IiMyYTJhMmEiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj7inqM8L3RleHQ+PC9zdmc+'

const SETTINGS_KEY = 'nobddy_settings'

function getSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}
  } catch { return {} }
}

export default function ProductPage({ product, onBack }) {
  const { addToCart } = useCart()
  const { formatPrice } = useCurrency()
  const shopSettings = getSettings()

  // Variants
  const isClothing = product.category === 'clothing'
  const isCoffee = product.category === 'coffee'
  const isPostcard = product.category === 'postcards'
  const flavors = product.flavors || []
  const denominations = product.denominations || []

  const availableSizes = (product.sizes && product.sizes.length > 0)
    ? product.sizes
    : CLOTHING_SIZES

  const colors = product.colors || []
  const [selectedColor, setSelectedColor] = useState(colors[0] || null)
  const [selectedDenomination, setSelectedDenomination] = useState(denominations[0] || null)

  const [selectedSize, setSelectedSize] = useState(null)
  const [selectedFlavor, setSelectedFlavor] = useState(flavors[0] || null)
  const images = (product.images?.length ? product.images : [product.image]).filter(Boolean)
  const [activeImg, setActiveImg] = useState(0)
  const [imgZoomed, setImgZoomed] = useState(false)
  const [added, setAdded] = useState(false)

  // Invoice state
  const [checkoutStep, setCheckoutStep] = useState(null) // null | generating | invoice | paid | error
  const [invoice, setInvoice] = useState(null)
  const [error, setError] = useState('')
  const [timeLeft, setTimeLeft] = useState(600)
  const [copied, setCopied] = useState(false)
  const canvasRef = useRef(null)
  const pollRef = useRef(null)
  const timerRef = useRef(null)

  const priceDisplay = formatPrice(product.price, product.currency)

  const isSoldOut = product.status === 'sold'

  // Variant label for cart
  function variantLabel() {
    const parts = []
    if (selectedColor) parts.push(selectedColor)
    if (selectedSize) parts.push(selectedSize)
    if (selectedFlavor) parts.push(selectedFlavor)
    if (selectedDenomination) parts.push(`${selectedDenomination} sats`)
    return parts.join(' · ')
  }

  function handleAddToCart() {
    if (!checkSize()) return
    addToCart({ ...product, variant: variantLabel() })
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }

  // QR code
  useEffect(() => {
    if (checkoutStep === 'invoice' && invoice && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, invoice.paymentRequest.toUpperCase(), {
        width: 260,
        margin: 2,
        color: { dark: '#cc3a00', light: '#f5f0e8' },
      })
    }
  }, [checkoutStep, invoice])

  // Poll + countdown
  useEffect(() => {
    if (checkoutStep !== 'invoice' || !invoice) return
    const remaining = Math.ceil((invoice.expiresAt - Date.now()) / 1000)
    setTimeLeft(remaining)

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          clearInterval(pollRef.current)
          setError('Invoice expired. Please try again.')
          setCheckoutStep('error')
          return 0
        }
        return prev - 1
      })
    }, 1000)

    pollRef.current = setInterval(async () => {
      try {
        const paid = await checkInvoicePaid(invoice.invoiceId)
        if (paid) {
          clearInterval(pollRef.current)
          clearInterval(timerRef.current)
          setCheckoutStep('paid')
        }
      } catch (e) {}
    }, 3000)

    return () => {
      clearInterval(timerRef.current)
      clearInterval(pollRef.current)
    }
  }, [checkoutStep, invoice])

  const [sizeWarning, setSizeWarning] = useState(false)

  function checkSize() {
    if (isClothing && !selectedSize) {
      setSizeWarning(true)
      setTimeout(() => setSizeWarning(false), 2500)
      return false
    }
    return true
  }

  async function handleBuyNow() {
    if (!checkSize()) return
    setCheckoutStep('generating')
    setError('')
    try {
      const inv = await createProductInvoice(product)
      setInvoice(inv)
      setCheckoutStep('invoice')
    } catch (err) {
      setError(err.message)
      setCheckoutStep('error')
    }
  }

  function formatTime(s) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  function clearCheckout() {
    clearInterval(timerRef.current)
    clearInterval(pollRef.current)
    setCheckoutStep(null)
    setInvoice(null)
    setError('')
    setCopied(false)
  }

  return (
    <div className={styles.page}>
      {/* Back button */}
      <button className={styles.backBtn} onClick={onBack}>
        ← BACK
      </button>

      <div className={styles.layout}>
        {/* ── LEFT: Image ── */}
        <div className={styles.imageCol}>
          <div
            className={`${styles.imageWrap} ${imgZoomed ? styles.imageZoomed : ''}`}
            onClick={() => setImgZoomed(z => !z)}
            title={imgZoomed ? 'Click to zoom out' : 'Click to zoom in'}
          >
            <img
              className={styles.image}
              src={images[activeImg] || PLACEHOLDER}
              alt={product.title}
              onError={e => e.target.src = PLACEHOLDER}
            />
            <div className={styles.zoomHint}>
              {imgZoomed ? '↙ ZOOM OUT' : '↗ ZOOM IN'}
            </div>
          </div>

          {/* Thumbnails */}
          {images.length > 1 && (
            <div className={styles.thumbs}>
              {images.map((img, i) => (
                <button
                  key={i}
                  className={`${styles.thumb} ${i === activeImg ? styles.thumbActive : ''}`}
                  onClick={() => { setActiveImg(i); setImgZoomed(false) }}
                >
                  <img src={img} alt={`photo ${i + 1}`} onError={e => e.target.src = PLACEHOLDER} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── RIGHT: Info + checkout ── */}
        <div className={styles.infoCol}>
          {/* Header */}
          <div className={styles.catTag}>{product.category.toUpperCase()}</div>
          <h1 className={styles.title}>{product.title}</h1>
          {product.summary && <p className={styles.summary}>{product.summary}</p>}

          <div className={styles.price}>
            {!isSoldOut && <span className={styles.lightning}>⚡</span>}
            {priceDisplay}
          </div>

          {/* Description */}
          {product.description && product.description !== product.summary && (
            <div className={styles.description}>
              <div className={styles.sectionLabel}>DESCRIPTION</div>
              <p>{product.description}</p>
            </div>
          )}

          {/* ── Color selector ── */}
          {isClothing && colors.length > 0 && !isSoldOut && (
            <div className={styles.variants}>
              <div className={styles.sectionLabel}>
                COLOR{selectedColor && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}> — {selectedColor}</span>}
              </div>
              <div className={styles.colorList}>
                {colors.map(color => (
                  <button
                    key={color}
                    className={`${styles.colorSwatch} ${selectedColor === color ? styles.colorSwatchActive : ''}`}
                    style={{ backgroundColor: color.toLowerCase() }}
                    onClick={() => setSelectedColor(color)}
                    title={color}
                  >
                    {selectedColor === color && (
                      <span className={styles.colorCheck}>✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Clothing sizes ── */}
          {isClothing && !isSoldOut && (
            <div className={styles.variants}>
              <div className={styles.sectionLabel}>
                SIZE
                {sizeWarning && <span className={styles.sizeWarning}>← please select a size</span>}
              </div>
              <div className={styles.sizeGrid}>
                {availableSizes.map(size => (
                  <button
                    key={size}
                    className={`${styles.sizeBtn} ${selectedSize === size ? styles.sizeBtnActive : ''}`}
                    onClick={() => { setSelectedSize(size); setSizeWarning(false) }}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Postcard denominations ── */}
          {isPostcard && denominations.length > 0 && !isSoldOut && (
            <div className={styles.variants}>
              <div className={styles.sectionLabel}>AMOUNT</div>
              <div className={styles.sizeGrid}>
                {denominations.map(d => (
                  <button
                    key={d}
                    className={`${styles.sizeBtn} ${selectedDenomination === d ? styles.sizeBtnActive : ''}`}
                    onClick={() => setSelectedDenomination(d)}
                    style={{ width: 'auto', padding: '0 16px' }}
                  >
                    {Number(d).toLocaleString()} sats
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Coffee flavors ── */}
          {isCoffee && flavors.length > 0 && !isSoldOut && (
            <div className={styles.variants}>
              <div className={styles.sectionLabel}>FLAVOR</div>
              <div className={styles.flavorList}>
                {flavors.map(flavor => (
                  <button
                    key={flavor}
                    className={`${styles.flavorBtn} ${selectedFlavor === flavor ? styles.flavorBtnActive : ''}`}
                    onClick={() => setSelectedFlavor(flavor)}
                  >
                    {flavor}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── SOLD OUT ── */}
          {isSoldOut && (
            <div className={styles.soldOutBanner}>SOLD OUT</div>
          )}

          {/* ── Actions ── */}
          {!isSoldOut && !checkoutStep && (
            <div className={styles.actions}>
              <button
                className={styles.buyBtn}
                onClick={handleBuyNow}
              >
                BUY NOW ⚡
              </button>
              <button
                className={`${styles.cartBtn} ${added ? styles.cartBtnDone : ''}`}
                onClick={handleAddToCart}
              >
                {added ? '✓ ADDED TO CART' : '+ ADD TO CART'}
              </button>
            </div>
          )}

          {/* ── GENERATING ── */}
          {checkoutStep === 'generating' && (
            <div className={styles.checkoutBox}>
              <div className={styles.spinner} />
              <div className={styles.checkoutTitle}>GENERATING INVOICE…</div>
            </div>
          )}

          {/* ── INVOICE ── */}
          {checkoutStep === 'invoice' && invoice && (
            <div className={styles.checkoutBox}>
              <div className={styles.invoiceHeader}>
                <div className={styles.checkoutTitle}>SCAN TO PAY</div>
                <div className={`${styles.timer} ${timeLeft < 60 ? styles.timerUrgent : ''}`}>
                  {formatTime(timeLeft)}
                </div>
              </div>
              <canvas ref={canvasRef} className={styles.qr} />
              <div className={styles.invoiceAmount}>
                ⚡ {invoice.amountSats.toLocaleString()} sats
              </div>
              <div className={styles.invoiceStr}>
                <code className={styles.invoiceCode}>{invoice.paymentRequest.slice(0, 36)}…</code>
                <button className={styles.copyBtn} onClick={() => {
                  navigator.clipboard.writeText(invoice.paymentRequest)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}>
                  {copied ? '✓' : 'COPY'}
                </button>
              </div>
              <button className={styles.cancelBtn} onClick={clearCheckout}>← CANCEL</button>
            </div>
          )}

          {/* ── PAID ── */}
          {checkoutStep === 'paid' && (
            <div className={styles.checkoutBox}>
              <div className={styles.successIcon}>✓</div>
              <div className={styles.checkoutTitle}>PAYMENT RECEIVED!</div>
              <p className={styles.checkoutSub}>Thank you for your order of <strong>{product.title}</strong>.</p>
              <button className={styles.doneBtn} onClick={() => { clearCheckout(); onBack() }}>
                BACK TO STORE
              </button>
            </div>
          )}

          {/* ── ERROR ── */}
          {checkoutStep === 'error' && (
            <div className={styles.checkoutBox}>
              <div className={styles.errorIcon}>✕</div>
              <div className={styles.checkoutTitle}>ERROR</div>
              <p className={styles.checkoutSub}>{error}</p>
              <button className={styles.cancelBtn} onClick={clearCheckout}>← TRY AGAIN</button>
            </div>
          )}

          {/* ── DETAILS — under buttons ── */}
          {product.details && (
            <div className={styles.detailsBlock}>
              <div className={styles.sectionLabel}>DETAILS</div>
              <p className={styles.detailsText}>{product.details}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── INFO SECTIONS ── */}
      <div className={styles.sections}>

        {/* Shipping */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>SHIPPING</div>
          <div className={styles.sectionContent}>
            {shopSettings.shipping || 'We ship worldwide. Orders are processed within 1–3 business days.'}
          </div>
        </div>

        {/* Payment */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>PAYMENT</div>
          <div className={styles.sectionContent}>
            {shopSettings.payment || 'We accept Bitcoin Lightning payments only. No accounts, no data collection, instant settlement.'}
          </div>
        </div>

        {/* Returns */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>RETURNS & CARE</div>
          <div className={styles.sectionContent}>
            {shopSettings.returns || 'All sales are final. If you received a damaged or incorrect item, please contact us.'}
          </div>
        </div>

      </div>
    </div>
  )
}
