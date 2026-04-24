import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
  const { password, productId, pairs } = req.body

  // Verify admin password
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!productId || !pairs || !Array.isArray(pairs)) {
    return res.status(400).json({ error: 'Missing productId or pairs' })
  }

  try {
    // Store each pair: key = postcard:{productId}:{denomination}
    for (const pair of pairs) {
      if (pair.denomination && pair.back) {
        await redis.set(`postcard:${productId}:${pair.denomination}`, pair.back)
      }
    }
    return res.status(200).json({ ok: true })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
