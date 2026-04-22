export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
  if (!ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'Admin password not configured' })
  }

  const { password } = req.body
  if (!password) {
    return res.status(400).json({ error: 'Password required' })
  }

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password' })
  }

  // Generate a simple session token
  const token = Buffer.from(`nobddy-admin-${Date.now()}-${Math.random()}`).toString('base64')

  return res.status(200).json({ ok: true, token })
}
