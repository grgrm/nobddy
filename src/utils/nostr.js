import {
  SimplePool,
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
  nip19
} from 'nostr-tools'

// Public relays
export const RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://nostr.wine',
]

export const pool = new SimplePool()

// ─── Key Management ───────────────────────────────────────────────────────────

export function getOrCreateOwnerKey() {
  const stored = localStorage.getItem('shop_owner_sk')
  if (stored) {
    return Uint8Array.from(JSON.parse(stored))
  }
  const sk = generateSecretKey()
  localStorage.setItem('shop_owner_sk', JSON.stringify(Array.from(sk)))
  return sk
}

export function getOwnerPubkey() {
  const sk = getOrCreateOwnerKey()
  return getPublicKey(sk)
}

export function npubFromPubkey(pubkey) {
  return nip19.npubEncode(pubkey)
}

// Check if NIP-07 extension is available (Alby browser extension)
export function hasNip07() {
  return typeof window !== 'undefined' && !!window.nostr
}

// Sign event: prefer NIP-07, fallback to stored key
export async function signEvent(eventTemplate) {
  if (hasNip07()) {
    return await window.nostr.signEvent(eventTemplate)
  }
  const sk = getOrCreateOwnerKey()
  return finalizeEvent(eventTemplate, sk)
}

export async function getSignerPubkey() {
  if (hasNip07()) {
    return await window.nostr.getPublicKey()
  }
  return getOwnerPubkey()
}

// ─── NIP-99 Product Listings (kind: 30402) ───────────────────────────────────

export async function publishProduct(product) {
  const pubkey = await getSignerPubkey()
  const slug = product.id || slugify(product.title)

  const eventTemplate = {
    kind: 30402,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', slug],
      ['title', product.title],
      ['summary', product.summary || ''],
      ...(product.images || [product.image]).filter(Boolean).map(img => {
        const url = typeof img === 'string' ? img : img.url
        const secret = typeof img === 'object' && img.secret ? 'secret' : 'public'
        const denomination = typeof img === 'object' && img.denomination ? img.denomination : ''
        return ['image', url, '800x800', secret, denomination]
      }),
      ['price', String(product.price), product.currency || 'USD'],
      ['t', product.category || 'merch'],
      ['status', product.status || 'active'],
      ['location', product.location || ''],
      ['lnurl', product.lnurl || ''],
      ...(product.details ? [['details', product.details]] : []),
      ...(product.flavors || []).map(f => ['flavor', f]),
      ...(product.sizes || []).map(s => ['size', s]),
      ...(product.colors || []).map(c => ['color', c]),
      ...(product.denominations || []).map(d => ['denomination', d]),
      ...(product.postcardPairs || []).map(p =>
        ['postcard_pair', p.front, p.back, p.denomination || '']
      ),
    ],
    content: product.description || product.summary || '',
    pubkey,
  }

  const signed = await signEvent(eventTemplate)
  const results = await Promise.allSettled(
    RELAYS.map(r => pool.publish([r], signed))
  )
  
  const ok = results.filter(r => r.status === 'fulfilled').length
  return { event: signed, published: ok, total: RELAYS.length }
}

export async function fetchProducts(ownerPubkey, limit = 50) {
  const filter = {
    kinds: [30402],
    limit,
  }
  if (ownerPubkey) {
    filter.authors = [ownerPubkey]
  }

  const events = await pool.querySync(RELAYS, filter)

  // Deduplicate by 'd' tag (keep newest)
  const byId = new Map()
  for (const e of events) {
    const d = e.tags.find(t => t[0] === 'd')?.[1] || e.id
    const existing = byId.get(d)
    if (!existing || e.created_at > existing.created_at) {
      byId.set(d, e)
    }
  }

  return [...byId.values()]
    .map(parseProductEvent)
    .sort((a, b) => b.created_at - a.created_at)
}

export function parseProductEvent(event) {
  const tag = (name) => event.tags.find(t => t[0] === name)?.[1] || ''
  const priceTag = event.tags.find(t => t[0] === 'price')

  return {
    id: tag('d') || event.id,
    eventId: event.id,
    pubkey: event.pubkey,
    title: tag('title') || 'Untitled',
    summary: tag('summary') || '',
    description: event.content || '',
    image: event.tags.find(t => t[0] === 'image')?.[1] || '',
    images: event.tags.filter(t => t[0] === 'image').map(t => ({
      url: t[1],
      secret: t[3] === 'secret',
      denomination: t[4] || '',
    })),
    price: priceTag?.[1] ? Number(priceTag[1]) : 0,
    currency: priceTag?.[2] || 'USD',
    category: tag('t') || 'merch',
    status: tag('status') || 'active',
    location: tag('location') || '',
    lnurl: tag('lnurl') || '',
    details: tag('details') || '',
    flavors: event.tags.filter(t => t[0] === 'flavor').map(t => t[1]),
    sizes: event.tags.filter(t => t[0] === 'size').map(t => t[1]),
    colors: event.tags.filter(t => t[0] === 'color').map(t => t[1]),
    denominations: event.tags.filter(t => t[0] === 'denomination').map(t => t[1]),
    postcardPairs: event.tags.filter(t => t[0] === 'postcard_pair').map(t => ({
      front: t[1],
      back: t[2],
      denomination: t[3] || '',
    })),
    created_at: event.created_at,
  }
}

// ─── Delete product (kind: 5 event deletion) ─────────────────────────────────

export async function deleteProduct(eventId) {
  const pubkey = await getSignerPubkey()
  const eventTemplate = {
    kind: 5,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['e', eventId]],
    content: 'deleted',
    pubkey,
  }
  const signed = await signEvent(eventTemplate)
  await Promise.allSettled(RELAYS.map(r => pool.publish([r], signed)))
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 64)
}
