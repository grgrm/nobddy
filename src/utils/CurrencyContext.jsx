import React, { createContext, useContext, useState, useEffect } from 'react'

const CurrencyContext = createContext(null)

export const CURRENCIES = [
  { id: 'USD', symbol: '$',  label: 'USD' },
  { id: 'EUR', symbol: '€',  label: 'EUR' },
  { id: 'GEL', symbol: '₾',  label: 'GEL' },
  { id: 'RUB', symbol: '₽',  label: 'RUB' },
  { id: 'SATS', symbol: '⚡', label: 'SAT' },
]

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState(
    () => localStorage.getItem('shop_currency') || 'USD'
  )
  const [rates, setRates] = useState({ USD: 1, EUR: 1, GEL: 1, RUB: 1, SATS: 100000 })
  const [ratesLoaded, setRatesLoaded] = useState(false)

  useEffect(() => {
    localStorage.setItem('shop_currency', currency)
  }, [currency])

  useEffect(() => {
    async function fetchRates() {
      try {
        // BTC price in USD from mempool.space
        const btcRes = await fetch('https://mempool.space/api/v1/prices')
        const btcData = await btcRes.json()
        const btcUsd = btcData.USD
        const satsPerUsd = 100_000_000 / btcUsd

        // Fiat rates from exchangerate-api (free, no key needed)
        const fiatRes = await fetch('https://open.er-api.com/v6/latest/USD')
        const fiatData = await fiatRes.json()

        setRates({
          USD: 1,
          EUR: fiatData.rates.EUR,
          GEL: fiatData.rates.GEL,
          RUB: fiatData.rates.RUB,
          SATS: satsPerUsd,
        })
        setRatesLoaded(true)
      } catch (e) {
        console.error('Failed to fetch rates:', e)
        setRatesLoaded(true)
      }
    }
    fetchRates()
    const interval = setInterval(fetchRates, 5 * 60_000) // every 5 min
    return () => clearInterval(interval)
  }, [])

  function toUsd(amount, sourceCurrency) {
    if (!sourceCurrency || sourceCurrency === 'USD') return amount
    if (sourceCurrency === 'SATS') return amount / rates.SATS
    if (sourceCurrency === 'BTC') return amount * (100_000_000 / rates.SATS)
    if (rates[sourceCurrency]) return amount / rates[sourceCurrency]
    return amount
  }

  function convert(amount, sourceCurrency = 'USD') {
    if (!amount) return 0
    const usd = toUsd(amount, sourceCurrency)
    return usd * rates[currency]
  }

  function formatPrice(amount, sourceCurrency = 'USD') {
    const cur = CURRENCIES.find(c => c.id === currency)
    const converted = convert(amount, sourceCurrency)
    if (currency === 'SATS') {
      return `${Math.round(converted).toLocaleString()} sats`
    }
    if (currency === 'RUB') {
      return `${Math.round(converted).toLocaleString()} ${cur.symbol}`
    }
    return `${cur.symbol}${converted.toFixed(2)}`
  }

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, rates, ratesLoaded, convert, formatPrice }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  return useContext(CurrencyContext)
}
