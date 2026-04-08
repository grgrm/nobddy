import React, { useState } from 'react'
import styles from './StoreFront.module.css'
import ProductCard from './ProductCard.jsx'

const CATEGORIES = ['all', 'clothing', 'coffee', 'accessories', 'postcards']

function randomTransform(maxRotate, maxX, maxY) {
  const r = (Math.random() * 2 - 1) * maxRotate
  const x = (Math.random() * 2 - 1) * maxX
  const y = (Math.random() * 2 - 1) * maxY
  return `rotate(${r}deg) translate(${x}px, ${y}px)`
}

const INITIAL = {
  cube1: 'rotate(-12deg)',
  cube2: 'rotate(4deg)',
  cube3: 'rotate(14deg)',
}

export default function StoreFront({ products, loading, onSelectProduct }) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [cubeTransforms, setCubeTransforms] = useState(INITIAL)
  const [animating, setAnimating] = useState(false)

  function handleCubesClick() {
    if (animating) return
    setAnimating(true)
    setCubeTransforms({
      cube1: randomTransform(20, 12, 8),
      cube2: randomTransform(18, 8, 14),
      cube3: randomTransform(22, 14, 8),
    })
    setTimeout(() => setAnimating(false), 600)
  }

  const filtered = products.filter(p => {
    const matchCat = filter === 'all' || p.category === filter
    const matchSearch = !search ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.summary.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  return (
    <div className={styles.container}>
      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <div className={styles.tag}>⚡ Lightning Payments · No KYC</div>
          <h1 className={styles.heroTitle}>
            OWN YOUR KEYS.<br />
            OWN YOUR <span className={styles.heroAccent}>FIT.</span><br />
            OWN YOUR ENERGY.
          </h1>
          <p className={styles.heroSub}>
            Decentralized shop on Bitcoin &amp; Nostr.
          </p>
          <div
            className={styles.cubesWrap}
            onClick={handleCubesClick}
            style={{ cursor: 'pointer' }}
          >
            <svg className={styles.cubesSvg} viewBox="150 10 340 180" xmlns="http://www.w3.org/2000/svg">
              <g stroke="currentColor" strokeWidth="1.5" fill="none"
                className={styles.cube1}
                style={{ transform: cubeTransforms.cube1, transformOrigin: '240px 117px', transition: 'transform 0.5s ease-in-out' }}>
                <polygon points="200,95 240,78 280,95 240,112"/>
                <polygon points="200,95 200,140 240,157 240,112"/>
                <polygon points="280,95 280,140 240,157 240,112"/>
              </g>
              <g stroke="currentColor" strokeWidth="1.5" fill="none"
                className={styles.cube2}
                style={{ transform: cubeTransforms.cube2, transformOrigin: '315px 75px', transition: 'transform 0.55s ease-in-out 0.04s' }}>
                <polygon points="278,50 315,34 352,50 315,66"/>
                <polygon points="278,50 278,100 315,116 315,66"/>
                <polygon points="352,50 352,100 315,116 315,66"/>
              </g>
              <g stroke="currentColor" strokeWidth="1.5" fill="none"
                className={styles.cube3}
                style={{ transform: cubeTransforms.cube3, transformOrigin: '396px 113px', transition: 'transform 0.5s ease-in-out 0.08s' }}>
                <polygon points="358,95 396,78 434,95 396,112"/>
                <polygon points="358,95 358,140 396,157 396,112"/>
                <polygon points="434,95 434,140 396,157 396,112"/>
              </g>
              <path d="M198,32 L190,52 L199,49 L186,76 L208,46 L197,49 Z" fill="#ffb347" stroke="#cc6600" strokeWidth="0.7"/>
              <path d="M432,28 L424,48 L433,45 L420,72 L442,42 L431,45 Z" fill="#ffb347" stroke="#cc6600" strokeWidth="0.7"/>
              <path d="M300,158 L293,174 L301,172 L290,192 L309,166 L299,168 Z" fill="#ffb347" stroke="#cc6600" strokeWidth="0.7"/>
              <path d="M340,14 L334,28 L341,26 L332,44 L346,22 L339,24 Z" fill="#ffb347" stroke="#cc6600" strokeWidth="0.7"/>
              <path d="M446,95 L440,110 L447,108 L437,126 L452,104 L444,106 Z" fill="#ffb347" stroke="#cc6600" strokeWidth="0.7"/>
            </svg>
          </div>
        </div>
        <div className={styles.heroImage}>
          <img src="/hero.png" alt="Nakamoto" className={styles.heroImg} />
        </div>
      </section>

      {/* Filters */}
      <div className={styles.controls}>
        <div className={styles.categories}>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              className={`${styles.catBtn} ${filter === cat ? styles.catActive : ''}`}
              onClick={() => setFilter(cat)}
            >
              {cat.toUpperCase()}
            </button>
          ))}
        </div>
        <input
          className={styles.search}
          type="text"
          placeholder="SEARCH PRODUCTS..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Products */}
      <div className={styles.grid}>
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={styles.skeleton} />
          ))
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>⬡</div>
            <div className={styles.emptyText}>
              {products.length === 0
                ? 'NO PRODUCTS YET.\nADD YOUR FIRST ITEM IN ADMIN.'
                : 'NO PRODUCTS MATCH YOUR FILTER.'}
            </div>
          </div>
        ) : (
          filtered.map((product, i) => (
            <ProductCard
              key={product.id}
              product={product}
              index={i}
              onClick={() => onSelectProduct(product)}
            />
          ))
        )}
      </div>
    </div>
  )
}
