import React, { useState, useEffect, useRef } from 'react'
import styles from './Header.module.css'
import { npubFromPubkey } from '../utils/nostr.js'
import { useCart } from '../utils/CartContext.jsx'
import { useCurrency, CURRENCIES } from '../utils/CurrencyContext.jsx'

const THEMES = [
  { id: 'beige',  label: '🌿' },
  { id: 'purple', label: '🌌' },
]

const SECRET_TAPS = 5

export default function Header({ view, setView, ownerPubkey }) {
  const npub = ownerPubkey ? npubFromPubkey(ownerPubkey) : ''
  const shortNpub = npub ? `${npub.slice(0, 10)}…${npub.slice(-6)}` : ''
  const { totalItems, setOpen } = useCart()
  const { currency, setCurrency } = useCurrency()
  const [currencyOpen, setCurrencyOpen] = useState(false)
  const currencyRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (currencyRef.current && !currencyRef.current.contains(e.target)) {
        setCurrencyOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  const tapCount = useRef(0)
  const tapTimer = useRef(null)

  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('shop_theme')
    if (saved === 'beige' || saved === 'purple') return saved
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'purple'
    return 'beige'
  })

  const [btcPrice, setBtcPrice] = useState(null)

  useEffect(() => {
    document.documentElement.className = theme === 'purple' ? 'theme-purple' : ''
    localStorage.setItem('shop_theme', theme)
  }, [theme])

  useEffect(() => {
    async function fetchPrice() {
      try {
        const res = await fetch('https://mempool.space/api/v1/prices')
        const data = await res.json()
        setBtcPrice(data.USD)
      } catch (e) {}
    }
    fetchPrice()
    const interval = setInterval(fetchPrice, 60_000)
    return () => clearInterval(interval)
  }, [])

  // Secret keyboard shortcut: Ctrl+Shift+A
  useEffect(() => {
    function onKey(e) {
      if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        setView(v => v === 'admin' ? 'shop' : 'admin')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Secret logo tap: 5 taps within 2 seconds
  function handleLogoTap() {
    tapCount.current += 1
    clearTimeout(tapTimer.current)
    if (tapCount.current >= SECRET_TAPS) {
      tapCount.current = 0
      setView(v => v === 'admin' ? 'shop' : 'admin')
    } else {
      tapTimer.current = setTimeout(() => {
        tapCount.current = 0
        setView('shop')
      }, 2000)
    }
  }

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <button className={styles.brand} onClick={handleLogoTap}>
          <span className={styles.logo}>⬡</span>
          <div>
            <div className={styles.title}>NO<span className={styles.accent}>BDDY</span></div>
            <div className={styles.subtitle}>
              decentralized · censorship-resistant
              {btcPrice && <span className={styles.btcPrice}> · ₿ ${btcPrice.toLocaleString()}</span>}
            </div>
          </div>
        </button>

        <div className={styles.right}>
          <div className={styles.themeSwitcher}>
            {THEMES.map(t => (
              <button
                key={t.id}
                className={`${styles.themeBtn} ${theme === t.id ? styles.themeBtnActive : ''}`}
                onClick={() => setTheme(t.id)}
                title={t.id}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className={styles.currencyWrap} ref={currencyRef}>
            <button
              className={styles.currencyBtn}
              onClick={() => setCurrencyOpen(o => !o)}
            >
              {CURRENCIES.find(c => c.id === currency)?.symbol}
            </button>
            {currencyOpen && (
              <div className={styles.currencyDropdown}>
                {CURRENCIES.map(c => (
                  <button
                    key={c.id}
                    className={`${styles.currencyOption} ${currency === c.id ? styles.currencyOptionActive : ''}`}
                    onClick={() => { setCurrency(c.id); setCurrencyOpen(false) }}
                  >
                    <span className={styles.currencyOptionSymbol}>{c.id === 'SATS' ? '⚡' : c.symbol}</span>
                    <span>{c.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button className={styles.cartIcon} onClick={() => setOpen(true)} aria-label="Open cart">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 01-8 0"/>
            </svg>
            {totalItems > 0 && <span className={styles.cartCount}>{totalItems}</span>}
          </button>

          <div className={styles.identity}>
            <span className={styles.identityLabel}>pubkey</span>
            <span className={styles.identityKey}>{shortNpub}</span>
          </div>
        </div>
      </div>
    </header>
  )
}
