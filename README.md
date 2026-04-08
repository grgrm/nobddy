# ⬡ NOSTR Shop

Decentralized merch + coffee shop built on the [Nostr protocol](https://nostr.com).  
Products are published as **NIP-99 Classified Listings** (`kind: 30402`) to public relays.  
Payments via **Bitcoin Lightning** using the Alby API (auto-generated BOLT11 invoices + QR code).

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite |
| Nostr | `nostr-tools` v2, NIP-99, NIP-07 |
| Relays | Public (damus.io, nos.lol, nostr.band, nostr.wine) |
| Payments | Alby API → BOLT11 invoice → QR code |
| Styling | CSS Modules + custom design system |

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Your Nostr pubkey in hex format (see .env.example for how to get it)
VITE_OWNER_PUBKEY=your_hex_pubkey_here

# Alby API token (from getalby.com/user/settings/developer)
# Scope required: invoices:create
VITE_ALBY_API_TOKEN=your_alby_token_here

# Your Alby Lightning address
VITE_ALBY_LIGHTNING_ADDRESS=yourname@getalby.com
```

### 3. Start development server

```bash
npm run dev
```

Open http://localhost:5173

---

## Getting Your Nostr Keys

### Option A — Auto-generated (easiest)
Leave `VITE_OWNER_PUBKEY` empty. The app auto-generates a keypair on first run and stores it in `localStorage`. Your pubkey is shown in the header. Copy it to `.env` to lock it in.

### Option B — Use existing key (recommended)
If you already have a Nostr identity (e.g. from Damus, Amethyst, or Alby extension):

1. Open https://nostrcheck.me/converter/
2. Paste your `npub...` → copy the hex version
3. Set `VITE_OWNER_PUBKEY=<hex>`

### Option C — NIP-07 browser extension (most secure)
Install [Alby browser extension](https://getalby.com) or [nos2x](https://chrome.google.com/webstore/detail/nos2x/kpgefcfmnafjgpblomihpgmejjdanjjp).  
The shop auto-detects NIP-07 and uses it for signing — your private key never touches the app.

---

## Setting Up Alby Payments

1. Create a free account at [getalby.com](https://getalby.com)
2. Go to **Settings → Developer → API Tokens**
3. Create token with scope: `invoices:create`
4. Add to `.env` as `VITE_ALBY_API_TOKEN`

**How it works:**
```
Customer clicks "Buy" 
→ App calls Alby API: POST /invoices {amount_sats, description}
→ Alby returns BOLT11 invoice string
→ App renders QR code (colored with your brand)
→ Customer scans with any Lightning wallet
→ App polls GET /invoices/{payment_hash} every 3 seconds
→ When settled=true → shows "Payment Received!" screen
```

---

## Adding Products (Admin Panel)

1. Open the app → click **ADMIN** in the header
2. Fill in product details:
   - **Title** (required)
   - **Price + Currency** — supports USD, EUR, SATS, BTC
   - **Category** — clothing, coffee, accessories, prints
   - **Image URL** — link to product photo (use imgur, cloudinary, etc.)
   - **Description** — supports Markdown
3. Click **PUBLISH TO NOSTR RELAYS**

The product is published as a `kind: 30402` event to 4 public relays simultaneously. It appears in the store immediately.

---

## Production Deployment

### ⚠️ Important: Hide your Alby API token

The Alby token in `.env` is exposed to the browser in a Vite app. For production:

**Option 1 — Cloudflare Worker (simplest)**
```js
// worker.js
export default {
  async fetch(request) {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
    const body = await request.json()
    const res = await fetch('https://api.getalby.com/invoices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ALBY_TOKEN}`, // set as Worker secret
      },
      body: JSON.stringify(body),
    })
    return new Response(await res.text(), { headers: { 'Content-Type': 'application/json' } })
  }
}
```

Then change `ALBY_API` in `src/utils/lightning.js` to your Worker URL.

**Option 2 — Express backend**
Wrap the Alby API calls in Express routes and deploy to Railway/Render/Fly.io.

### Build for production
```bash
npm run build
# output is in dist/ — deploy to Vercel, Netlify, Cloudflare Pages, or GitHub Pages
```

---

## Project Structure

```
nostr-shop/
├── src/
│   ├── components/
│   │   ├── Header.jsx          # Navigation + ticker
│   │   ├── StoreFront.jsx      # Product grid + filters
│   │   ├── ProductCard.jsx     # Product thumbnail card
│   │   ├── ProductModal.jsx    # Detail view + Lightning invoice + QR
│   │   └── AdminPanel.jsx      # Add/manage products
│   ├── utils/
│   │   ├── nostr.js            # Nostr relay pool, NIP-99 publish/fetch
│   │   └── lightning.js        # Alby API, invoice creation, payment poll
│   ├── styles/
│   │   └── global.css          # Design system, CSS variables
│   ├── App.jsx                 # Root component, routing state
│   └── main.jsx                # React entry point
├── .env.example                # Environment variable template
├── vite.config.js
└── package.json
```

---

## Nostr Event Format (NIP-99)

Products are stored as this event structure on Nostr relays:

```json
{
  "kind": 30402,
  "tags": [
    ["d", "product-slug"],
    ["title", "Black Logo T-Shirt"],
    ["summary", "100% organic cotton"],
    ["image", "https://example.com/tshirt.jpg", "800x800"],
    ["price", "35", "USD"],
    ["t", "clothing"],
    ["status", "active"],
    ["location", "Tallinn, Estonia"]
  ],
  "content": "Full product description in Markdown...",
  "pubkey": "your_pubkey",
  "sig": "..."
}
```

This means your product catalogue lives on the decentralized Nostr network — no database, no server, no vendor lock-in.

---

## License

MIT
