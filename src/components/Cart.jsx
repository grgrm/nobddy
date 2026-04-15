import React, { useState, useEffect, useRef } from 'react'
import styles from './Cart.module.css'
import { useCart } from '../utils/CartContext.jsx'
import { createInvoice, checkInvoicePaid, toSats } from '../utils/lightning.js'
import { sendCartOrderNotification } from '../utils/telegram.js'
import QRCode from 'qrcode'

export default function Cart() {
  const { items, open, setOpen, removeFromCart, updateQty, clearCart, totalPrice, totalItems, currency } = useCart()

  // checkout state: null | 'shipping' | 'generating' | 'invoice' | 'split' | 'paid' | 'error'
  const [checkoutStep, setCheckoutStep] = useState(null)
  const [invoice, setInvoice] = useState(null)         // single invoice
  const [splitQueue, setSplitQueue] = useState([])     // [{label, amountSats, paymentRequest, invoiceId, paid}]
  const [splitIndex, setSplitIndex] = useState(0)      // current split invoice index
  const [error, setError] = useState('')
  const [timeLeft, setTimeLeft] = useState(600)
  const [copied, setCopied] = useState(false)
  const canvasRef = useRef(null)
  const pollRef = useRef(null)
  const timerRef = useRef(null)

  // Shipping form
  const [shipping, setShipping] = useState({ name: '', country: '', city: '', address: '', zip: '', email: '' })
  const [shippingError, setShippingError] = useState('')
  const [pendingPayType, setPendingPayType] = useState(null) // 'all' | 'split'

  function handleShippingChange(field, value) {
    setShipping(prev => ({ ...prev, [field]: value }))
  }

  function validateShipping() {
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

  // Reset checkout when cart closes (but not if we're in checkout modal)
  useEffect(() => {
    if (!open && !checkoutStep) {
      clearCheckout()
    }
  }, [open])

  // Draw QR for single invoice
  useEffect(() => {
    if (checkoutStep === 'invoice' && invoice && canvasRef.current) {
      drawQR(canvasRef.current, invoice.paymentRequest)
    }
  }, [checkoutStep, invoice])

  // Draw QR for current split invoice
  useEffect(() => {
    if (checkoutStep === 'split' && splitQueue[splitIndex] && canvasRef.current) {
      drawQR(canvasRef.current, splitQueue[splitIndex].paymentRequest)
    }
  }, [checkoutStep, splitIndex, splitQueue])

  // Polling + countdown for single invoice
  useEffect(() => {
    if (checkoutStep !== 'invoice' || !invoice) return
    startTimerAndPoll(invoice.expiresAt, invoice.invoiceId, () => {
      setCheckoutStep('paid')
      sendCartOrderNotification({
        items,
        totalSats: invoice.amountSats,
        shipping,
      })
      clearCart()
    })
    return () => stopTimerAndPoll()
  }, [checkoutStep, invoice])

  // Polling + countdown for current split invoice
  useEffect(() => {
    if (checkoutStep !== 'split' || !splitQueue[splitIndex]) return
    const current = splitQueue[splitIndex]
    startTimerAndPoll(current.expiresAt, current.invoiceId, () => {
      setSplitQueue(prev => prev.map((inv, i) => i === splitIndex ? { ...inv, paid: true } : inv))
      if (splitIndex + 1 >= splitQueue.length) {
        setCheckoutStep('paid')
        clearCart()
      } else {
        setSplitIndex(i => i + 1)
      }
    })
    return () => stopTimerAndPoll()
  }, [checkoutStep, splitIndex, splitQueue])

  function drawQR(canvas, data) {
    QRCode.toCanvas(canvas, data.toUpperCase(), {
      width: 240,
      margin: 2,
      color: { dark: '#ff4500', light: '#0a0a0a' },
    })
  }

  function startTimerAndPoll(expiresAt, invoiceId, onPaid) {
    stopTimerAndPoll()
    const remaining = Math.ceil((expiresAt - Date.now()) / 1000)
    setTimeLeft(remaining)

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          stopTimerAndPoll()
          setError('Invoice expired. Please try again.')
          setCheckoutStep('error')
          return 0
        }
        return prev - 1
      })
    }, 1000)

    pollRef.current = setInterval(async () => {
      try {
        const paid = await checkInvoicePaid(invoiceId)
        if (paid) {
          stopTimerAndPoll()
          onPaid()
        }
      } catch (e) {
        console.error('Poll error:', e)
      }
    }, 3000)
  }

  function stopTimerAndPoll() {
    clearInterval(timerRef.current)
    clearInterval(pollRef.current)
  }

  function clearCheckout() {
    stopTimerAndPoll()
    setCheckoutStep(null)
    setInvoice(null)
    setSplitQueue([])
    setSplitIndex(0)
    setError('')
    setCopied(false)
    setPendingPayType(null)
    setShippingError('')
  }

  // Build list of invoices to generate for split: one per line item × qty
  function buildSplitItems() {
    const list = []
    for (const { product, qty } of items) {
      for (let i = 0; i < qty; i++) {
        list.push({
          label: qty > 1 ? `${product.title} (${i + 1}/${qty})` : product.title,
          price: product.price,
          currencyCode: product.currency,
        })
      }
    }
    return list
  }

  function handlePayAll() {
    setPendingPayType('all')
    setCheckoutStep('shipping')
    setOpen(false)
  }

  function handleSplit() {
    setPendingPayType('split')
    setCheckoutStep('shipping')
    setOpen(false)
  }

  async function handleProceedToPayment() {
    if (!validateShipping()) return
    if (pendingPayType === 'all') {
      await doPayAll()
    } else {
      await doSplit()
    }
  }

  async function doPayAll() {
    setCheckoutStep('generating')
    setError('')
    try {
      const amountSats = await toSats(totalPrice)
      const memo = items.map(i => `${i.product.title} ×${i.qty}`).join(', ')
      const inv = await createInvoice(amountSats, memo)
      setInvoice({ ...inv, amountSats })
      setCheckoutStep('invoice')
    } catch (err) {
      setError(err.message)
      setCheckoutStep('error')
    }
  }

  async function doSplit() {
    setCheckoutStep('generating')
    setError('')
    try {
      const splitItems = buildSplitItems()
      const generated = []
      for (const item of splitItems) {
        const amountSats = await toSats(item.price)
        const inv = await createInvoice(amountSats, `Purchase: ${item.label}`)
        generated.push({ ...inv, amountSats, label: item.label, paid: false })
      }
      setSplitQueue(generated)
      setSplitIndex(0)
      setCheckoutStep('split')
    } catch (err) {
      setError(err.message)
      setCheckoutStep('error')
    }
  }

  function copyInvoice(pr) {
    navigator.clipboard.writeText(pr)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function formatTime(secs) {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const currentSplit = splitQueue[splitIndex]

  return (
    <>
      {/* Backdrop */}
      {open && <div className={styles.backdrop} onClick={() => setOpen(false)} />}

      {/* Sidebar */}
      <div className={`${styles.sidebar} ${open ? styles.sidebarOpen : ''}`}>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.title}>
            CART
            {totalItems > 0 && <span className={styles.count}>{totalItems}</span>}
          </div>
          <button className={styles.closeBtn} onClick={() => setOpen(false)}>✕</button>
        </div>

        {/* ─── CART ITEMS ─── */}
        {!checkoutStep && (
          <>
            {items.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}>⬡</div>
                <div className={styles.emptyText}>Your cart is empty</div>
              </div>
            ) : (
              <>
                <div className={styles.items}>
                  {items.map(({ key, product, qty }) => (
                    <div key={key} className={styles.item}>
                      {product.image && (
                        <img className={styles.itemImg} src={product.image} alt={product.title} />
                      )}
                      <div className={styles.itemInfo}>
                        <div className={styles.itemTitle}>{product.title}</div>
                        {product.variant && (
                          <div className={styles.itemVariant}>{product.variant}</div>
                        )}
                        <div className={styles.itemPrice}>
                          {product.currency} {(product.price * qty).toFixed(2)}
                        </div>
                      </div>
                      <div className={styles.qtyControl}>
                        <button className={styles.qtyBtn} onClick={() => updateQty(key, qty - 1)}>−</button>
                        <span className={styles.qty}>{qty}</span>
                        <button className={styles.qtyBtn} onClick={() => updateQty(key, qty + 1)}>+</button>
                      </div>
                      <button className={styles.removeBtn} onClick={() => removeFromCart(key)}>✕</button>
                    </div>
                  ))}
                </div>

                <div className={styles.footer}>
                  <div className={styles.total}>
                    <span className={styles.totalLabel}>TOTAL</span>
                    <span className={styles.totalAmount}>
                      <span className={styles.lightning}>⚡</span>
                      {currency} {totalPrice.toFixed(2)}
                    </span>
                  </div>

                  <button className={styles.payAllBtn} onClick={handlePayAll}>
                    PAY ALL ⚡
                    <span className={styles.payAllSub}>One invoice · Full amount</span>
                  </button>

                  <button className={styles.splitBtn} onClick={handleSplit}>
                    SPLIT PAYMENT
                    <span className={styles.splitSub}>Separate invoice per item</span>
                  </button>

                  <button className={styles.clearBtn} onClick={clearCart}>Clear cart</button>
                </div>
              </>
            )}
          </>
        )}

        {/* ─── GENERATING ─── */}
        {checkoutStep === 'generating' && (
          <div className={styles.center}>
            <div className={styles.spinner} />
            <div className={styles.centerTitle}>GENERATING INVOICE</div>
            <div className={styles.centerSub}>Connecting to Lightning…</div>
          </div>
        )}

        {/* ─── SINGLE INVOICE ─── */}
        {checkoutStep === 'invoice' && invoice && (
          <div className={styles.invoiceView}>
            <div className={styles.invoiceHeader}>
              <div className={styles.invoiceTitle}>SCAN TO PAY</div>
              <div className={`${styles.timer} ${timeLeft < 60 ? styles.timerUrgent : ''}`}>
                {formatTime(timeLeft)}
              </div>
            </div>
            <canvas ref={canvasRef} className={styles.qr} />
            <div className={styles.invoiceAmount}>
              <span className={styles.lightning}>⚡</span>
              {invoice.amountSats.toLocaleString()} sats
            </div>
            <div className={styles.invoiceSub}>Full cart · {items.length} item{items.length > 1 ? 's' : ''}</div>
            <div className={styles.invoiceStr}>
              <code className={styles.invoiceCode}>{invoice.paymentRequest.slice(0, 32)}…</code>
              <button className={styles.copyBtn} onClick={() => copyInvoice(invoice.paymentRequest)}>
                {copied ? '✓' : 'COPY'}
              </button>
            </div>
            <button className={styles.backBtn} onClick={clearCheckout}>← BACK TO CART</button>
          </div>
        )}

        {/* ─── SPLIT INVOICES ─── */}
        {checkoutStep === 'split' && currentSplit && (
          <div className={styles.invoiceView}>
            <div className={styles.splitProgress}>
              {splitQueue.map((inv, i) => (
                <div
                  key={i}
                  className={`${styles.splitDot} ${inv.paid ? styles.splitDotPaid : ''} ${i === splitIndex ? styles.splitDotActive : ''}`}
                />
              ))}
            </div>
            <div className={styles.invoiceHeader}>
              <div className={styles.invoiceTitle}>
                {splitIndex + 1}/{splitQueue.length}: {currentSplit.label}
              </div>
              <div className={`${styles.timer} ${timeLeft < 60 ? styles.timerUrgent : ''}`}>
                {formatTime(timeLeft)}
              </div>
            </div>
            <canvas ref={canvasRef} className={styles.qr} />
            <div className={styles.invoiceAmount}>
              <span className={styles.lightning}>⚡</span>
              {currentSplit.amountSats.toLocaleString()} sats
            </div>
            <div className={styles.invoiceSub}>{currentSplit.label}</div>
            <div className={styles.invoiceStr}>
              <code className={styles.invoiceCode}>{currentSplit.paymentRequest.slice(0, 32)}…</code>
              <button className={styles.copyBtn} onClick={() => copyInvoice(currentSplit.paymentRequest)}>
                {copied ? '✓' : 'COPY'}
              </button>
            </div>
            <button className={styles.backBtn} onClick={clearCheckout}>← BACK TO CART</button>
          </div>
        )}

        {/* ─── PAID ─── */}
        {checkoutStep === 'paid' && (
          <div className={styles.center}>
            <div className={styles.successIcon}>✓</div>
            <div className={styles.centerTitle}>PAYMENT COMPLETE!</div>
            <div className={styles.centerSub}>Thank you for your order.</div>
            <button className={styles.doneBtn} onClick={() => { clearCheckout(); setOpen(false) }}>
              CLOSE
            </button>
          </div>
        )}

        {/* ─── ERROR ─── */}
        {checkoutStep === 'error' && (
          <div className={styles.center}>
            <div className={styles.errorIcon}>✕</div>
            <div className={styles.centerTitle}>SOMETHING WENT WRONG</div>
            <div className={styles.centerSub}>{error}</div>
            <button className={styles.backBtn} onClick={clearCheckout}>← TRY AGAIN</button>
          </div>
        )}
      </div>

      {/* ─── CHECKOUT MODAL (shipping + invoice) ─── */}
      {(checkoutStep === 'shipping' || checkoutStep === 'generating' || checkoutStep === 'invoice' || checkoutStep === 'split' || checkoutStep === 'paid') && (
        <>
          <div className={styles.modalBackdrop} onClick={() => { if (checkoutStep === 'shipping') clearCheckout() }} />
          <div className={styles.modal}>

            {/* SHIPPING */}
            {checkoutStep === 'shipping' && (
              <>
                <div className={styles.modalTitle}>DELIVERY INFO</div>
                <div className={styles.shippingForm}>
                  {[
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
                  ))}
                  {shippingError && <div className={styles.shippingError}>{shippingError}</div>}
                  <button className={styles.modalPayBtn} onClick={handleProceedToPayment}>
                    PROCEED TO PAYMENT ⚡
                  </button>
                  <button className={styles.modalCancelBtn} onClick={clearCheckout}>← CANCEL</button>
                </div>
              </>
            )}

            {/* GENERATING */}
            {checkoutStep === 'generating' && (
              <div className={styles.modalCenter}>
                <div className={styles.spinner} />
                <div className={styles.modalTitle}>GENERATING INVOICE…</div>
              </div>
            )}

            {/* INVOICE */}
            {checkoutStep === 'invoice' && invoice && (
              <>
                <div className={styles.modalTitle}>SCAN TO PAY</div>
                <div className={styles.modalTimer}>{formatTime(timeLeft)}</div>
                <canvas ref={canvasRef} className={styles.modalQr} />
                <div className={styles.modalAmount}>⚡ {invoice.amountSats.toLocaleString()} sats</div>
                <div className={styles.modalInvoiceStr}>
                  <code>{invoice.paymentRequest.slice(0, 30)}…</code>
                  <button onClick={() => copyInvoice(invoice.paymentRequest)}>{copied ? '✓' : 'COPY'}</button>
                </div>
                <button className={styles.modalCancelBtn} onClick={clearCheckout}>← CANCEL</button>
              </>
            )}

            {/* PAID */}
            {checkoutStep === 'paid' && (
              <div className={styles.modalCenter}>
                <div className={styles.paidIcon}>⚡</div>
                <div className={styles.modalTitle}>PAYMENT RECEIVED!</div>
                <div className={styles.modalSub}>Thank you for your order.</div>
                <button className={styles.modalPayBtn} onClick={clearCheckout}>CLOSE</button>
              </div>
            )}

          </div>
        </>
      )}
    </>
  )
}
