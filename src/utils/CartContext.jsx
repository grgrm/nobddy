import React, { createContext, useContext, useState, useEffect } from 'react'

const CartContext = createContext(null)

const STORAGE_KEY = 'nobddy_cart'

// Unique key per product+variant combination
function cartKey(product) {
  const variant = product.variant || ''
  return `${product.id}::${variant}`
}

function loadCart() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : []
  } catch {
    return []
  }
}

function saveCart(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {}
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => loadCart())
  const [open, setOpen] = useState(false)

  // Persist to localStorage on every change
  useEffect(() => {
    saveCart(items)
  }, [items])

  function addToCart(product) {
    const key = cartKey(product)
    setItems(prev => {
      const existing = prev.find(i => i.key === key)
      if (existing) {
        return prev.map(i => i.key === key ? { ...i, qty: i.qty + 1 } : i)
      }
      return [...prev, { key, product, qty: 1 }]
    })
    setOpen(true)
  }

  function removeFromCart(key) {
    setItems(prev => prev.filter(i => i.key !== key))
  }

  function updateQty(key, qty) {
    if (qty <= 0) {
      removeFromCart(key)
      return
    }
    setItems(prev => prev.map(i => i.key === key ? { ...i, qty } : i))
  }

  function clearCart() {
    setItems([])
  }

  const totalItems = items.reduce((sum, i) => sum + i.qty, 0)
  const totalPrice = items.reduce((sum, i) => sum + i.product.price * i.qty, 0)
  const currency = items[0]?.product.currency || 'USD'

  return (
    <CartContext.Provider value={{
      items, open, setOpen,
      addToCart, removeFromCart, updateQty, clearCart,
      totalItems, totalPrice, currency
    }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  return useContext(CartContext)
}
