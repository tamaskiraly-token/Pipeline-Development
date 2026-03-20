/**
 * POST /api/unlock
 * Body: { password: string }
 *
 * Note: This file lives in the repo root `api/` folder so Vercel can find it.
 * The deployed frontend lives in `dashboard/`, but Vercel resolves API routes
 * from the project root.
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' })
    return
  }

  // Vercel may provide parsed JSON object or a raw string (depending on runtime).
  let password = undefined
  const body = req.body
  if (body && typeof body === 'object') {
    password = body.password
  } else if (typeof body === 'string') {
    try {
      password = JSON.parse(body)?.password
    } catch {
      password = undefined
    }
  }

  const expected = 'pipeline2026'
  if (typeof password !== 'string' || password.length === 0) {
    res.status(400).json({ ok: false, error: 'Missing password' })
    return
  }

  if (password !== expected) {
    res.status(401).json({ ok: false })
    return
  }

  res.status(200).json({ ok: true })
}

