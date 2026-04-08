import React, { useState, useEffect } from 'react'
import Header from './components/Header.jsx'
import StoreFront from './components/StoreFront.jsx'
import AdminPanel from './components/AdminPanel.jsx'
import ProductModal from './components/ProductModal.jsx'
import ProductPage from './components/ProductPage.jsx'
import Cart from './components/Cart.jsx'
import LightningBolts from './components/LightningBolts.jsx'
import { CartProvider } from './utils/CartContext.jsx'
import { CurrencyProvider } from './utils/CurrencyContext.jsx'
import { useRouter } from './utils/useRouter.js'
import styles from './styles/App.module.css'
import { getOwnerPubkey, fetchProducts } from './utils/nostr.js'

const CONFIGURED_OWNER = import.meta.env.VITE_OWNER_PUBKEY || null

export default function App() {
  const { path, navigate } = useRouter()
  const [view, setView] = useState('shop')
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [ownerPubkey] = useState(() => CONFIGURED_OWNER || getOwnerPubkey())

  async function loadProducts() {
    setLoading(true)
    try {
      const list = await fetchProducts(ownerPubkey)
      setProducts(list)
    } catch (err) {
      console.error('Failed to fetch products:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadProducts() }, [ownerPubkey])

  // Resolve product from URL - use cached version while loading
  const productPageId = path.startsWith('/product/') ? path.slice(9) : null
  const productPageItem = productPageId
    ? products.find(p => p.id === productPageId)
    : null

  function openProduct(product) {
    navigate(`/product/${product.id}`)
  }

  function goHome() {
    navigate('/')
    setView('shop')
  }

  return (
    <CurrencyProvider>
      <CartProvider>
      <div className={styles.app}>
        <Header view={view} setView={(v) => { setView(v); navigate('/') }} ownerPubkey={ownerPubkey} />
        <main className={styles.main}>
          {productPageId ? (
            loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: '16px' }}>
                <div style={{ width: 40, height: 40, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: '0.15em', color: 'var(--text-muted)' }}>LOADING…</div>
              </div>
            ) : productPageItem ? (
              <ProductPage product={productPageItem} onBack={goHome} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: '16px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, letterSpacing: '0.1em', color: 'var(--text-muted)' }}>PRODUCT NOT FOUND</div>
                <button onClick={goHome} style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', color: 'var(--accent)', border: '1px solid var(--accent)', padding: '8px 20px', borderRadius: 'var(--radius)', background: 'transparent', cursor: 'pointer' }}>← BACK TO STORE</button>
              </div>
            )
          ) : view === 'shop' ? (
            <StoreFront
              products={products}
              loading={loading}
              onSelectProduct={openProduct}
            />
          ) : (
            <AdminPanel
              products={products}
              ownerPubkey={ownerPubkey}
              onRefresh={loadProducts}
            />
          )}
        </main>
        {selectedProduct && (
          <ProductModal
            product={selectedProduct}
            onClose={() => setSelectedProduct(null)}
          />
        )}
        <Cart />
        <LightningBolts />
      </div>
    </CartProvider>
    </CurrencyProvider>
  )
}
