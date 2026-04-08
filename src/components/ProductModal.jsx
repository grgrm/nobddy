import React, { useState, useEffect, useRef } from 'react'
import styles from './ProductModal.module.css'
import { createProductInvoice, checkInvoicePaid } from '../utils/lightning.js'
import QRCode from 'qrcode'

export default function ProductModal({ product, onClose }) {
  const [step, setStep] = useState('detail') // detail | generating | invoice | paid | error
  const [invoice, setInvoice] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [timeLeft, setTimeLeft] = useState(600)
  const canvasRef = useRef(null)
  const pollRef = useRef(null)
  const timerRef = useRef(null)

  const priceDisplay = product.currency === 'SATS'
    ? `${product.price.toLocaleString()} sats`
    : `${product.currency} ${product.price}`

  // Render QR code
  useEffect(() => {
    if (step === 'invoice' && invoice && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, invoice.paymentRequest.toUpperCase(), {
        width: 280,
        margin: 2,
        color: { dark: '#ff4500', light: '#0a0a0a' },
      })
    }
  }, [step, invoice])

  // Poll for payment + countdown
  useEffect(() => {
    if (step !== 'invoice' || !invoice) return

    const remaining = Math.ceil((invoice.expiresAt - Date.now()) / 1000)
    setTimeLeft(remaining)

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          setStep('error')
          setError('Invoice expired. Please try again.')
          return 0
        }
        return prev - 1
      })
    }, 1000)

    pollRef.current = setInterval(async () => {
      try {
        const paid = await checkInvoicePaid(invoice.paymentHash)
        if (paid) {
          clearInterval(pollRef.current)
          clearInterval(timerRef.current)
          setStep('paid')
        }
      } catch (e) {
        console.error('Poll error:', e)
      }
    }, 3000)

    return () => {
      clearInterval(pollRef.current)
      clearInterval(timerRef.current)
    }
  }, [step, invoice])

  async function handleBuy() {
    setStep('generating')
    setError('')
    try {
      const inv = await createProductInvoice(product)
      setInvoice(inv)
      setStep('invoice')
    } catch (err) {
      setError(err.message || 'Failed to create invoice')
      setStep('error')
    }
  }

  function copyInvoice() {
    if (!invoice) return
    navigator.clipboard.writeText(invoice.paymentRequest)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function formatTime(secs) {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  return (
    <div className={styles.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>

        {/* ─── DETAIL STEP ─── */}
        {step === 'detail' && (
          <div className={styles.detail}>
            <div className={styles.imageCol}>
              {product.image ? (
                <img className={styles.image} src={product.image} alt={product.title} />
              ) : (
                <div className={styles.imagePlaceholder}>⬡</div>
              )}
            </div>
            <div className={styles.infoCol}>
              <div className={styles.catTag}>{product.category.toUpperCase()}</div>
              <h2 className={styles.title}>{product.title}</h2>
              <p className={styles.summary}>{product.summary}</p>
              {product.description && product.description !== product.summary && (
                <p className={styles.description}>{product.description}</p>
              )}
              <div className={styles.priceRow}>
                <div className={styles.price}>
                  <span className={styles.lightning}>⚡</span>
                  {priceDisplay}
                </div>
                {invoice?.amountSats && (
                  <div className={styles.priceSub}>
                    ≈ {invoice.amountSats.toLocaleString()} sats
                  </div>
                )}
              </div>
              <button className={styles.buyBtn} onClick={handleBuy}>
                PAY WITH LIGHTNING ⚡
              </button>
              <div className={styles.disclaimer}>
                No account required · Instant settlement · Bitcoin only
              </div>
            </div>
          </div>
        )}

        {/* ─── GENERATING STEP ─── */}
        {step === 'generating' && (
          <div className={styles.center}>
            <div className={styles.spinner} />
            <div className={styles.centerTitle}>GENERATING INVOICE</div>
            <div className={styles.centerSub}>Connecting to Lightning network…</div>
          </div>
        )}

        {/* ─── INVOICE STEP ─── */}
        {step === 'invoice' && invoice && (
          <div className={styles.invoiceView}>
            <div className={styles.invoiceHeader}>
              <div className={styles.invoiceTitle}>SCAN TO PAY</div>
              <div className={`${styles.timer} ${timeLeft < 60 ? styles.timerUrgent : ''}`}>
                {formatTime(timeLeft)}
              </div>
            </div>

            <div className={styles.qrWrap}>
              <canvas ref={canvasRef} className={styles.qr} />
            </div>

            <div className={styles.invoiceAmount}>
              <span className={styles.lightning}>⚡</span>
              {invoice.amountSats.toLocaleString()} sats
            </div>

            <div className={styles.invoiceProduct}>for: {product.title}</div>

            <div className={styles.invoiceStr}>
              <code className={styles.invoiceCode}>
                {invoice.paymentRequest.slice(0, 40)}…
              </code>
              <button className={styles.copyBtn} onClick={copyInvoice}>
                {copied ? '✓ COPIED' : 'COPY'}
              </button>
            </div>

            <div className={styles.invoiceHint}>
              Open your Lightning wallet and scan the QR code or paste the invoice.
            </div>
          </div>
        )}

        {/* ─── PAID STEP ─── */}
        {step === 'paid' && (
          <div className={styles.center}>
            <div className={styles.successIcon}>✓</div>
            <div className={styles.centerTitle}>PAYMENT RECEIVED!</div>
            <div className={styles.centerSub}>
              Thank you for your purchase.<br />
              Your order for <strong>{product.title}</strong> is confirmed.
            </div>
            <button className={styles.doneBtn} onClick={onClose}>CLOSE</button>
          </div>
        )}

        {/* ─── ERROR STEP ─── */}
        {step === 'error' && (
          <div className={styles.center}>
            <div className={styles.errorIcon}>✕</div>
            <div className={styles.centerTitle}>SOMETHING WENT WRONG</div>
            <div className={styles.centerSub}>{error}</div>
            <button className={styles.retryBtn} onClick={() => setStep('detail')}>
              TRY AGAIN
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
