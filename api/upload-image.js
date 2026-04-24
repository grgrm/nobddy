import { put } from '@vercel/blob'

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
  const password = req.headers['x-admin-password']

  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const chunks = []
    for await (const chunk of req) {
      chunks.push(chunk)
    }
    const buffer = Buffer.concat(chunks)

    const contentType = req.headers['content-type'] || 'image/jpeg'
    const filename = req.headers['x-filename'] || `image-${Date.now()}`
    const isSecret = req.headers['x-secret'] === 'true'

    const folder = isSecret ? 'postcards/back' : 'postcards/front'
    const { url } = await put(`${folder}/${filename}`, buffer, {
      access: isSecret ? 'private' : 'public',
      contentType,
    })

    return res.status(200).json({ url })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
