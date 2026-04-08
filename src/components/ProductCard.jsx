import React, { useState } from 'react'
import styles from './ProductCard.module.css'
import { useCart } from '../utils/CartContext.jsx'
import { useCurrency } from '../utils/CurrencyContext.jsx'

const PLACEHOLDER = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMWExYTFhIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJtb25vc3BhY2UiIGZvbnQtc2l6ZT0iNDgiIGZpbGw9IiMyYTJhMmEiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj7inqM8L3RleHQ+PC9zdmc+'

export default function ProductCard({ product, index, onClick }) {
  const [imgError, setImgError] = useState(false)
  const [added, setAdded] = useState(false)
  const { addToCart } = useCart()
  const { formatPrice } = useCurrency()

  const priceDisplay = formatPrice(product.price, product.currency)

  const isSoldOut = product.status === 'sold'

  function handleAddToCart(e) {
    e.stopPropagation() // don't open modal
    addToCart(product)
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }

  return (
    <article
      className={`${styles.card} ${isSoldOut ? styles.soldOut : ''}`}
      onClick={onClick}
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <div className={styles.imageWrap}>
        <img
          className={styles.image}
          src={imgError || !product.image ? PLACEHOLDER : product.image}
          alt={product.title}
          onError={() => setImgError(true)}
          loading="lazy"
        />
        {isSoldOut ? (
          <div className={styles.soldOutOverlay}>SOLD OUT</div>
        ) : (
          <div className={styles.overlay}>
            <div className={styles.overlayBtns}>
              <button className={styles.viewBtn} onClick={onClick}>VIEW ⬡</button>
              <button
                className={`${styles.addBtn} ${added ? styles.addBtnDone : ''}`}
                onClick={handleAddToCart}
              >
                {added ? '✓ ADDED' : '+ CART'}
              </button>
            </div>
          </div>
        )}
        <div className={styles.categoryBadge}>{product.category.toUpperCase()}</div>
      </div>

      <div className={styles.info}>
        <h3 className={styles.title}>{product.title}</h3>
        {product.summary && (
          <p className={styles.summary}>{product.summary}</p>
        )}
        <div className={styles.footer}>
          <span className={styles.price}>
            {!isSoldOut && <span className={styles.lightning}>⚡</span>}
            {isSoldOut ? <span className={styles.soldOutPrice}>{priceDisplay}</span> : priceDisplay}
          </span>
          {isSoldOut
            ? <span className={styles.soldOutBadge}>SOLD OUT</span>
            : <span className={styles.nostrBadge}>NOSTR</span>
          }
        </div>
      </div>
    </article>
  )
}
