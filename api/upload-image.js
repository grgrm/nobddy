import { put } from '@vercel/blob'
import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const token = req.headers['x-admin-password']
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const valid = await redis.get(`admin_token:${token}`)
  if (!valid) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  try {
    const { base64, contentType, filename, isSecret } = req.body

    if (!base64 || !contentType || !filename) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    const buffer = Buffer.from(base64, 'base64')
    const folder = isSecret ? 'postcards/back' : 'images'

    const blob = await put(`${folder}/${filename}`, buffer, {
      access: 'public',
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })

    return res.status(200).json({ url: blob.url })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
