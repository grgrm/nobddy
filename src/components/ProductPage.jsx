import React, { useState, useEffect, useRef } from 'react'
import styles from './ProductPage.module.css'
import { useCart } from '../utils/CartContext.jsx'
import { useCurrency } from '../utils/CurrencyContext.jsx'
import { createProductInvoice, checkInvoicePaid } from '../utils/lightning.js'
import { sendOrderNotification } from '../utils/telegram.js'
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
  const { formatPrice, currency, convert, rates } = useCurrency()
  const shopSettings = getSettings()

  // Variants
  const isClothing = product.category === 'clothing'
  const isCoffee = product.category === 'coffee'
  const isPostcard = product.category === 'postcards'
  const flavors = product.flavors || []
  const denominations = product.denominations || []
  const POSTCARD_FEE = 1.10 // 10% commission

  const availableSizes = (product.sizes && product.sizes.length > 0)
    ? product.sizes
    : CLOTHING_SIZES

  const colors = product.colors || []
  const [selectedColor, setSelectedColor] = useState(colors[0] || null)
  const [selectedDenomination, setSelectedDenomination] = useState(denominations[0] || null)

  const [selectedSize, setSelectedSize] = useState(null)
  const [selectedFlavor, setSelectedFlavor] = useState(flavors[0] || null)
  const images = (product.images?.length ? product.images : [{ url: product.image, secret: false }])
    .filter(img => img.url || (typeof img === 'string' && img))
    .map(img => typeof img === 'string' ? { url: img, secret: false } : img)
  const [activeImg, setActiveImg] = useState(0)
  const [imgZoomed, setImgZoomed] = useState(false)
  const [added, setAdded] = useState(false)

  // Invoice state
  const [checkoutStep, setCheckoutStep] = useState(null) // null | shipping | generating | invoice | paid | error
  const [revealedBackUrl, setRevealedBackUrl] = useState(null)
  const [revealedLnurl, setRevealedLnurl] = useState(null)
  const [invoice, setInvoice] = useState(null)
  const [error, setError] = useState('')
  const [timeLeft, setTimeLeft] = useState(600)
  const [copied, setCopied] = useState(false)
  const canvasRef = useRef(null)
  const pollRef = useRef(null)
  const timerRef = useRef(null)

  // Shipping form
  const [shipping, setShipping] = useState({
    name: '', country: '', city: '', address: '', zip: '', email: ''
  })
  const [shippingError, setShippingError] = useState('')

  function handleShippingChange(field, value) {
    setShipping(prev => ({ ...prev, [field]: value }))
  }

  function validateShipping() {
    if (isPostcard) {
      if (!shipping.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shipping.email)) {
        setShippingError('Please enter a valid email')
        return false
      }
      setShippingError('')
      return true
    }
    const { name, country, city, address, zip, email } = shipping
    if (!name || !country || !city || !address || !zip || !email) {
      setShippingError('Please fill in all fields')
      return false
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setShippingError('Please enter a valid email')
      return false
    }
    setShippingError('')
    return true
  }

  const postcardSats = isPostcard && selectedDenomination
    ? Math.ceil(Number(selectedDenomination) * POSTCARD_FEE)
    : null
  const priceDisplay = isPostcard && selectedDenomination
    ? `${postcardSats.toLocaleString()} sats`
    : formatPrice(product.price, product.currency)

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
    const price = isPostcard && selectedDenomination ? Math.ceil(Number(selectedDenomination) * POSTCARD_FEE) : product.price
    const currency = isPostcard && selectedDenomination ? 'SATS' : product.currency
    addToCart({ ...product, price, currency, variant: variantLabel() })
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
          sendOrderNotification({
            product,
            variant: variantLabel(),
            amountSats: invoice.amountSats,
            shipping,
          })
          // Fetch back URL from server (secure — not from Nostr)
          let backUrl = null
          if (isPostcard && selectedDenomination) {
            try {
              const backRes = await fetch(`/api/get-postcard-back?productId=${product.id}&denomination=${selectedDenomination}&invoiceId=${invoice.invoiceId}`)
              if (backRes.ok) {
                const data = await backRes.json()
                backUrl = data.backUrl
                setRevealedBackUrl(backUrl)
                if (data.lnurl) setRevealedLnurl(data.lnurl)
              }
            } catch {}
          }
          // Send email to buyer
          const pair = isPostcard && selectedDenomination
            ? (product.postcardPairs || []).find(p => p.denomination === selectedDenomination)
            : null
          fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: isPostcard ? 'postcard' : 'single',
              product,
              variant: variantLabel(),
              amountSats: invoice.amountSats,
              shipping,
              postcards: pair ? [{ frontUrl: pair.front, backUrl: backUrl || '', denomination: selectedDenomination }] : [],
              lnurl: revealedLnurl || undefined,
            }),
          }).catch(() => {})
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
    setCheckoutStep('shipping')
    setError('')
  }

  async function handleProceedToPayment() {
    if (!validateShipping()) return
    setCheckoutStep('generating')
    setError('')
    try {
      // For postcards use selected denomination as price in SATS
      const productForInvoice = isPostcard && selectedDenomination
        ? { ...product, price: Math.ceil(Number(selectedDenomination) * POSTCARD_FEE), currency: 'SATS' }
        : product
      const inv = await createProductInvoice(productForInvoice)
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
            className={`${styles.imageWrap} ${imgZoomed && !images[activeImg]?.secret ? styles.imageZoomed : ''}`}
            onClick={() => !images[activeImg]?.secret && setImgZoomed(z => !z)}
            title={images[activeImg]?.secret ? 'Unlocks after payment' : imgZoomed ? 'Click to zoom out' : 'Click to zoom in'}
          >
            {images[activeImg]?.secret && checkoutStep !== 'paid' ? (
              <div className={styles.secretCanvas}>
                <div className={styles.secretParticles}>
                  {[...Array(40)].map((_, i) => (
                    <div key={i} className={styles.particle} style={{
                      left: `${Math.random() * 100}%`,
                      top: `${Math.random() * 100}%`,
                      animationDelay: `${Math.random() * 3}s`,
                      animationDuration: `${2 + Math.random() * 3}s`,
                      width: `${2 + Math.random() * 4}px`,
                      height: `${2 + Math.random() * 4}px`,
                      opacity: Math.random() * 0.8 + 0.2,
                    }} />
                  ))}
                </div>
                <div className={styles.secretOverlay}>
                  <div className={styles.secretIcon}>🔒</div>
                  <div className={styles.secretLabel}>UNLOCKS AFTER PAYMENT</div>
                </div>
              </div>
            ) : (
              <>
                <img
                  className={styles.image}
                  src={images[activeImg]?.url || images[activeImg] || PLACEHOLDER}
                  alt={product.title}
                  onError={e => e.target.src = PLACEHOLDER}
                />
                <div className={styles.zoomHint}>
                  {imgZoomed ? '↙ ZOOM OUT' : '↗ ZOOM IN'}
                </div>
              </>
            )}
          </div>

          {/* Thumbnails */}
          {images.length > 1 && (
            <div className={styles.thumbs}>
              {images.map((img, i) => {
                const isSecret = img.secret && (checkoutStep !== 'paid' || img.denomination !== selectedDenomination)
                return (
                  <button
                    key={i}
                    className={`${styles.thumb} ${i === activeImg ? styles.thumbActive : ''}`}
                    onClick={() => {
                      if (isSecret) return // don't allow clicking locked thumbnails
                      setActiveImg(i)
                      setImgZoomed(false)
                    }}
                  >
                    {isSecret ? (
                      <div className={styles.thumbSecretBox}>
                        <span className={styles.thumbLock}>🔒</span>
                      </div>
                    ) : (
                      <img
                        src={img.url || img}
                        alt={`photo ${i + 1}`}
                        onError={e => e.target.src = PLACEHOLDER}
                      />
                    )}
                  </button>
                )
              })}
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
            {isPostcard && denominations.length > 0 && selectedDenomination && currency === 'SATS'
              ? <span style={{fontSize:'0.7em', fontWeight:400, color:'var(--text-dim)'}}>≈</span>
              : !isSoldOut && <span className={styles.lightning}>⚡</span>}
            {isPostcard && denominations.length > 0
              ? selectedDenomination
                ? currency === 'SATS'
                  ? `$${(Math.ceil(Number(selectedDenomination) * POSTCARD_FEE) / rates['SATS']).toFixed(2)}`
                  : formatPrice(Math.ceil(Number(selectedDenomination) * POSTCARD_FEE), 'SATS')
                : 'Select amount below'
              : priceDisplay}
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
                    onClick={() => {
                      setSelectedDenomination(d)
                      if (checkoutStep === 'paid') clearCheckout()
                      // Switch to the front image that matches this denomination
                      const frontIdx = images.findIndex(img => !img.secret && img.denomination === d)
                      if (frontIdx !== -1) setActiveImg(frontIdx)
                    }}
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

          {/* ── SHIPPING FORM ── */}
          {checkoutStep === 'shipping' && (
            <div className={styles.checkoutBox}>
              <div className={styles.checkoutTitle}>
                {isPostcard ? 'YOUR EMAIL' : 'DELIVERY INFO'}
              </div>
              <div className={styles.shippingForm}>
                {isPostcard ? (
                  <>
                    <div className={styles.shippingField}>
                      <label className={styles.shippingLabel}>Email</label>
                      <input
                        className={styles.shippingInput}
                        type="email"
                        placeholder="you@example.com"
                        value={shipping.email}
                        onChange={e => handleShippingChange('email', e.target.value)}
                      />
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                      Your postcard will be revealed instantly after payment.
                    </p>
                  </>
                ) : (
                  [
                    { field: 'name', label: 'Full Name', placeholder: 'John Doe' },
                    { field: 'country', label: 'Country', placeholder: 'Georgia' },
                    { field: 'city', label: 'City', placeholder: 'Tbilisi' },
                    { field: 'address', label: 'Address', placeholder: 'Street, building, apartment' },
                    { field: 'zip', label: 'Postal Code', placeholder: '0105' },
                    { field: 'email', label: 'Email', placeholder: 'you@example.com' },
                  ].map(({ field, label, placeholder }) => (
                    <div key={field} className={styles.shippingField}>
                      <label className={styles.shippingLabel}>{label}</label>
                      <input
                        className={styles.shippingInput}
                        type={field === 'email' ? 'email' : 'text'}
                        placeholder={placeholder}
                        value={shipping[field]}
                        onChange={e => handleShippingChange(field, e.target.value)}
                      />
                    </div>
                  ))
                )}
                {shippingError && <div className={styles.shippingError}>{shippingError}</div>}
                <button className={styles.buyBtn} onClick={handleProceedToPayment}>
                  PROCEED TO PAYMENT ⚡
                </button>
                <button className={styles.cancelBtn} onClick={clearCheckout}>← CANCEL</button>
              </div>
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
            isPostcard && selectedDenomination ? (() => {
              const pair = (product.postcardPairs || []).find(p => p.denomination === selectedDenomination)
              return (
                <div className={styles.checkoutBox}>
                  <div className={styles.checkoutTitle}>⚡ YOUR POSTCARD IS UNLOCKED!</div>
                  <div className={styles.postcardReveal}>
                    <div className={styles.postcardRevealItem}>
                      <div className={styles.postcardRevealLabel}>FRONT</div>
                      <img src={pair?.front} alt="front" className={styles.postcardRevealImg} />
                    </div>
                    <div className={styles.postcardRevealItem}>
                      <div className={styles.postcardRevealLabel}>BACK 🔓</div>
                      {revealedBackUrl
                        ? <img src={revealedBackUrl} alt="back" className={`${styles.postcardRevealImg} ${styles.postcardRevealBack}`} />
                        : <div className={styles.postcardRevealImg} style={{display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-dim)',fontSize:12}}>Loading...</div>
                      }
                    </div>
                  </div>

                  {/* ── LNURL QR для получателя ── */}
                  {revealedLnurl && (
                    <div style={{margin:'20px 0', textAlign:'center'}}>
                      <div style={{fontSize:12, fontFamily:'var(--font-mono)', color:'var(--text-dim)', marginBottom:8, textTransform:'uppercase', letterSpacing:1}}>
                        ⚡ Gift QR — scan to claim sats
                      </div>
                      <img
                        src={'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(revealedLnurl) + '&color=cc3a00&bgcolor=f5f0e8'}
                        alt="LNURL QR"
                        style={{width:220, height:220, borderRadius:8, border:'2px solid #cc3a00'}}
                      />
                      <p style={{fontSize:11, color:'var(--text-dim)', fontFamily:'var(--font-mono)', marginTop:8}}>
                        Give this QR to the recipient — they scan it to receive ⚡ {Number(selectedDenomination).toLocaleString()} sats
                      </p>
                    </div>
                  )}

                  <a
                    href={revealedBackUrl || '#'}
                    download
                    className={styles.downloadBtn}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={!revealedBackUrl ? {opacity:0.4,pointerEvents:'none'} : {}}
                  >
                    ↓ DOWNLOAD BACK
                  </a>
                  <button className={styles.doneBtn} onClick={() => { clearCheckout(); onBack() }}>
                    BACK TO STORE
                  </button>
                </div>
              )
            })() : (
              <div className={styles.checkoutBox}>
                <div className={styles.successIcon}>✓</div>
                <div className={styles.checkoutTitle}>PAYMENT RECEIVED!</div>
                <p className={styles.checkoutSub}>Thank you for your order of <strong>{product.title}</strong>.</p>
                <button className={styles.doneBtn} onClick={() => { clearCheckout(); onBack() }}>
                  BACK TO STORE
                </button>
              </div>
            )
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
