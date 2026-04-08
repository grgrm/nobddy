import React from 'react'
import styles from './LightningBolts.module.css'

// Pixel art lightning bolt as SVG path
function Bolt({ className, style }) {
  return (
    <svg
      className={className}
      style={style}
      width="24"
      height="48"
      viewBox="0 0 6 12"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Pixel art bolt — each rect is one "pixel" */}
      <rect x="3" y="0" width="2" height="1"/>
      <rect x="2" y="1" width="2" height="1"/>
      <rect x="1" y="2" width="2" height="1"/>
      <rect x="0" y="3" width="2" height="1"/>
      <rect x="1" y="4" width="4" height="1"/>
      <rect x="2" y="5" width="4" height="1"/>
      <rect x="3" y="6" width="2" height="1"/>
      <rect x="2" y="7" width="2" height="1"/>
      <rect x="1" y="8" width="2" height="1"/>
      <rect x="0" y="9" width="2" height="1"/>
    </svg>
  )
}

export default function LightningBolts() {
  const leftDelays  = [0, 0.6, 1.2, 0.3, 0.9, 1.5, 0.4, 1.1, 0.7, 1.8]
  const rightDelays = [0.4, 1.0, 0.2, 0.8, 1.4, 0.6, 0.1, 1.3, 0.5, 1.9]

  return (
    <>
      <div className={styles.sideLeft}>
        {leftDelays.map((delay, i) => (
          <Bolt key={i} className={styles.bolt} style={{ animationDelay: `${delay}s` }} />
        ))}
      </div>
      <div className={styles.sideRight}>
        {rightDelays.map((delay, i) => (
          <Bolt key={i} className={`${styles.bolt} ${styles.boltFlip}`} style={{ animationDelay: `${delay}s` }} />
        ))}
      </div>
    </>
  )
}
