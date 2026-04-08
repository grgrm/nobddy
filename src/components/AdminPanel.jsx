import React, { useState } from 'react'
import styles from './AdminPanel.module.css'
import { publishProduct, deleteProduct, slugify, npubFromPubkey } from '../utils/nostr.js'

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || ''

const CATEGORIES = ['clothing', 'coffee', 'accessories', 'postcards', 'other']
const CURRENCIES = ['USD', 'EUR', 'SATS', 'BTC']

const EMPTY_FORM = {
  title: '',
  summary: '',
  description: '',
  details: '',
  images: [''],
  price: '',
  currency: 'USD',
  category: 'clothing',
  location: '',
  status: 'active',
  flavors: '',
  sizes: [],
  colors: '',
  denominations: '',
}

function PasswordGate({ onUnlock }) {
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    if (input === ADMIN_PASSWORD) {
      onUnlock()
    } else {
      setError(true)
      setInput('')
      setTimeout(() => setError(false), 2000)
    }
  }

  return (
    <div className={styles.gate}>
      <div className={styles.gateBox}>
        <div className={styles.gateIcon}>⬡</div>
        <div className={styles.gateTitle}>ADMIN ACCESS</div>
        <form onSubmit={handleSubmit} className={styles.gateForm}>
          <input
            type="password"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Enter password"
            autoFocus
            className={error ? styles.gateInputError : ''}
          />
          <button type="submit" className={styles.gateBtn}>ENTER</button>
        </form>
        {error && <div className={styles.gateError}>✕ Wrong password</div>}
      </div>
    </div>
  )
}

const SETTINGS_KEY = 'nobddy_settings'

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}
  } catch { return {} }
}

export default function AdminPanel({ products, ownerPubkey, onRefresh }) {
  const [unlocked, setUnlocked] = useState(!ADMIN_PASSWORD)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [publishing, setPublishing] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [result, setResult] = useState(null)
  const [activeTab, setActiveTab] = useState('add') // add | list | settings

  const [settings, setSettings] = useState(() => {
    const s = loadSettings()
    return {
      shipping: s.shipping || 'We ship worldwide. Orders processed within 1–3 business days.',
      returns: s.returns || 'All sales are final. Damaged or incorrect items? Contact us.',
      payment: s.payment || 'Bitcoin Lightning only. No accounts, no data collection, instant settlement.',
    }
  })
  const [settingsSaved, setSettingsSaved] = useState(false)

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 2000)
  }

  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />

  const npub = ownerPubkey ? npubFromPubkey(ownerPubkey) : ''

  function setField(key, value) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function handleEdit(product) {
    setForm({
      title: product.title,
      summary: product.summary || '',
      description: product.description || '',
      details: product.details || '',
      images: product.images?.length ? product.images : [product.image || ''],
      price: String(product.price),
      currency: product.currency || 'USD',
      category: product.category || 'clothing',
      location: product.location || '',
      status: product.status || 'active',
      flavors: (product.flavors || []).join(', '),
      sizes: product.sizes || [],
      colors: (product.colors || []).join(', '),
      denominations: (product.denominations || []).join(', '),
    })
    setEditingId(product.id)
    setResult(null)
    setActiveTab('add')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleCancelEdit() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setResult(null)
  }

  async function handlePublish(e) {
    e.preventDefault()
    if (!form.title || !form.price) return
    setPublishing(true)
    setResult(null)
    try {
      const res = await publishProduct({
        ...form,
        price: Number(form.price),
        id: editingId || slugify(form.title),
        images: (form.images || ['']).filter(Boolean),
        flavors: form.flavors
          ? form.flavors.split(',').map(f => f.trim()).filter(Boolean)
          : [],
        sizes: form.sizes || [],
        colors: form.colors
          ? form.colors.split(',').map(c => c.trim()).filter(Boolean)
          : [],
        denominations: form.denominations
          ? form.denominations.split(',').map(d => d.trim().replace(/[^0-9]/g, '')).filter(Boolean)
          : [],
      })
      setResult({ ok: true, msg: editingId ? `Updated on ${res.published}/${res.total} relays` : `Published to ${res.published}/${res.total} relays` })
      setForm(EMPTY_FORM)
      setEditingId(null)
      setTimeout(onRefresh, 2000)
    } catch (err) {
      setResult({ ok: false, msg: err.message })
    } finally {
      setPublishing(false)
    }
  }

  async function handleDelete(product) {
    if (!confirm(`Delete "${product.title}"?`)) return
    setDeleting(product.id)
    try {
      await deleteProduct(product.eventId)
      setTimeout(onRefresh, 1500)
    } catch (err) {
      alert('Delete failed: ' + err.message)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>ADMIN PANEL</h2>
          <div className={styles.pubkey}>
            <span className={styles.pubkeyLabel}>YOUR PUBKEY:</span>
            <span className={styles.pubkeyVal}>{npub.slice(0, 20)}…{npub.slice(-8)}</span>
          </div>
        </div>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'add' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('add')}
          >
            {editingId ? '✎ EDIT PRODUCT' : '+ ADD PRODUCT'}
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'list' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('list')}
          >
            MANAGE ({products.length})
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'settings' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            SETTINGS
          </button>
        </div>
      </div>

      {/* ─── ADD / EDIT PRODUCT ─── */}
      {activeTab === 'add' && (
        <form className={styles.form} onSubmit={handlePublish}>
          {editingId && (
            <div className={styles.editBanner}>
              <span>✎ Editing: <strong>{form.title}</strong></span>
              <button type="button" className={styles.cancelEditBtn} onClick={handleCancelEdit}>
                ✕ CANCEL EDIT
              </button>
            </div>
          )}
          <div className={styles.formGrid}>
            {/* Left column */}
            <div className={styles.formCol}>
              <div className={styles.field}>
                <label className={styles.label}>PRODUCT TITLE *</label>
                <input
                  value={form.title}
                  onChange={e => setField('title', e.target.value)}
                  placeholder="Black Logo T-Shirt"
                  required
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>SHORT SUMMARY</label>
                <input
                  value={form.summary}
                  onChange={e => setField('summary', e.target.value)}
                  placeholder="One-line description shown on card"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>FULL DESCRIPTION</label>
                <textarea
                  value={form.description}
                  onChange={e => setField('description', e.target.value)}
                  rows={5}
                  placeholder="Detailed product description. Supports markdown."
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>DETAILS (materials, specs, etc.)</label>
                <textarea
                  value={form.details}
                  onChange={e => setField('details', e.target.value)}
                  rows={3}
                  placeholder="100% organic cotton. Screen printed. Made in Portugal."
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>PHOTOS</label>
                {(form.images || ['']).map((url, i) => (
                  <div key={i} className={styles.imageRow}>
                    <input
                      value={url}
                      onChange={e => {
                        const next = [...(form.images || [''])]
                        next[i] = e.target.value
                        setField('images', next)
                      }}
                      placeholder={i === 0 ? 'https://example.com/photo1.jpg (main)' : `https://example.com/photo${i + 1}.jpg`}
                      type="url"
                    />
                    {(form.images || ['']).length > 1 && (
                      <button
                        type="button"
                        className={styles.removeImageBtn}
                        onClick={() => {
                          const next = (form.images || ['']).filter((_, idx) => idx !== i)
                          setField('images', next.length ? next : [''])
                        }}
                      >✕</button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className={styles.addImageBtn}
                  onClick={() => setField('images', [...(form.images || ['']), ''])}
                >
                  + ADD PHOTO
                </button>
                {form.images?.[0] && (
                  <img
                    className={styles.imgPreview}
                    src={form.images[0]}
                    alt="preview"
                    onError={e => e.target.style.display = 'none'}
                  />
                )}
              </div>
            </div>

            {/* Right column */}
            <div className={styles.formCol}>
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label className={styles.label}>PRICE *</label>
                  <input
                    value={form.price}
                    onChange={e => setField('price', e.target.value)}
                    placeholder="25"
                    type="number"
                    min="0"
                    step="any"
                    required
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>CURRENCY</label>
                  <select
                    value={form.currency}
                    onChange={e => setField('currency', e.target.value)}
                  >
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>CATEGORY</label>
                <select
                  value={form.category}
                  onChange={e => setField('category', e.target.value)}
                >
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>LOCATION (optional)</label>
                <input
                  value={form.location}
                  onChange={e => setField('location', e.target.value)}
                  placeholder="City, Country"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>STATUS</label>
                <select
                  value={form.status}
                  onChange={e => setField('status', e.target.value)}
                >
                  <option value="active">Active</option>
                  <option value="sold">Sold out</option>
                </select>
              </div>

              {form.category === 'clothing' && (
                <div className={styles.field}>
                  <label className={styles.label}>AVAILABLE COLORS (comma-separated)</label>
                  <input
                    value={form.colors}
                    onChange={e => setField('colors', e.target.value)}
                    placeholder="Black, White, Navy, Olive"
                  />
                </div>
              )}

              {form.category === 'postcards' && (
                <div className={styles.field}>
                  <label className={styles.label}>SATS DENOMINATIONS (comma-separated)</label>
                  <input
                    value={form.denominations}
                    onChange={e => setField('denominations', e.target.value)}
                    placeholder="1000, 5000, 10000, 21000"
                  />
                </div>
              )}

              {form.category === 'coffee' && (                <div className={styles.field}>
                  <label className={styles.label}>FLAVORS (comma-separated)</label>
                  <input
                    value={form.flavors}
                    onChange={e => setField('flavors', e.target.value)}
                    placeholder="Espresso, Latte, Cappuccino, Cold Brew"
                  />
                </div>
              )}

              {form.category === 'clothing' && (
                <div className={styles.field}>
                  <label className={styles.label}>AVAILABLE SIZES</label>
                  <div className={styles.sizesGrid}>
                    {['XS','S','M','L','XL','XXL'].map(size => (
                      <label key={size} className={styles.sizeCheck}>
                        <input
                          type="checkbox"
                          checked={(form.sizes || []).includes(size)}
                          onChange={e => {
                            const current = form.sizes || []
                            const next = e.target.checked
                              ? [...current, size]
                              : current.filter(s => s !== size)
                            setField('sizes', next)
                          }}
                        />
                        <span className={`${styles.sizeLabel} ${(form.sizes || []).includes(size) ? styles.sizeLabelActive : ''}`}>
                          {size}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview */}
              <div className={styles.preview}>
                <div className={styles.previewLabel}>NOSTR EVENT PREVIEW</div>
                <pre className={styles.previewCode}>
{`kind: 30402
title: "${form.title || '—'}"
price: ["${form.price || '0'}", "${form.currency}"]
category: "${form.category}"
status: "${form.status}"`}
                </pre>
              </div>
            </div>
          </div>

          {result && (
            <div className={`${styles.result} ${result.ok ? styles.resultOk : styles.resultErr}`}>
              {result.ok ? '✓' : '✕'} {result.msg}
            </div>
          )}

          <button
            className={styles.publishBtn}
            type="submit"
            disabled={publishing || !form.title || !form.price}
          >
            {publishing ? (
              <><span className={styles.spin} /> {editingId ? 'UPDATING…' : 'PUBLISHING TO NOSTR…'}</>
            ) : editingId ? (
              'UPDATE PRODUCT ✎'
            ) : (
              'PUBLISH TO NOSTR RELAYS ⬡'
            )}
          </button>
        </form>
      )}

      {/* ─── MANAGE LIST ─── */}
      {activeTab === 'list' && (
        <div className={styles.list}>
          {products.length === 0 ? (
            <div className={styles.listEmpty}>
              No products yet. Add your first product above.
            </div>
          ) : (
            products.map(product => (
              <div key={product.id} className={styles.listItem}>
                {product.image && (
                  <img className={styles.listImg} src={product.image} alt={product.title} />
                )}
                <div className={styles.listInfo}>
                  <div className={styles.listTitle}>{product.title}</div>
                  <div className={styles.listMeta}>
                    <span>{product.currency} {product.price}</span>
                    <span>·</span>
                    <span>{product.category}</span>
                    <span>·</span>
                    <span className={product.status === 'active' ? styles.statusActive : styles.statusSold}>
                      {product.status}
                    </span>
                  </div>
                  <div className={styles.listId}>id: {product.id}</div>
                </div>
                <div className={styles.listActions}>
                  <button
                    className={styles.editBtn}
                    onClick={() => handleEdit(product)}
                  >
                    EDIT
                  </button>
                  <button
                    className={styles.deleteBtn}
                    onClick={() => handleDelete(product)}
                    disabled={deleting === product.id}
                  >
                    {deleting === product.id ? '…' : 'DELETE'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ─── SETTINGS ─── */}
      {activeTab === 'settings' && (
        <div className={styles.settingsPanel}>
          <div className={styles.settingsGrid}>

            <div className={styles.field}>
              <label className={styles.label}>SHIPPING INFO</label>
              <textarea
                rows={4}
                value={settings.shipping}
                onChange={e => setSettings(s => ({ ...s, shipping: e.target.value }))}
                placeholder="Shipping details shown on every product page..."
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>RETURNS & CARE</label>
              <textarea
                rows={4}
                value={settings.returns}
                onChange={e => setSettings(s => ({ ...s, returns: e.target.value }))}
                placeholder="Returns and care instructions..."
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>PAYMENT INFO</label>
              <textarea
                rows={4}
                value={settings.payment}
                onChange={e => setSettings(s => ({ ...s, payment: e.target.value }))}
                placeholder="Payment information shown on every product page..."
              />
            </div>

          </div>

          {settingsSaved && (
            <div className={`${styles.result} ${styles.resultOk}`}>✓ Settings saved</div>
          )}

          <button className={styles.publishBtn} onClick={saveSettings}>
            SAVE SETTINGS
          </button>
        </div>
      )}
    </div>
  )
}
