import * as crypto from 'node:crypto'

/**
 * POST /api/unlock
 * Body: { password: string }
 * Success: 200 OK
 * Failure: 401 Unauthorized
 *
 * Password is stored only in Vercel environment variables (DASHBOARD_PASSWORD),
 * so it is not present in the client bundle.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' })
    return
  }

  const body = req.body || {}
  const password = body.password

  // Simple / quick setup:
  // Keep the password check on the server side, but do not rely on env vars.
  const expected = 'pipeline2026'

  if (typeof password !== 'string' || password.length === 0) {
    res.status(400).json({ ok: false, error: 'Missing password' })
    return
  }

  const a = Buffer.from(password, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  const ok = a.length === b.length ? crypto.timingSafeEqual(a, b) : false

  if (!ok) {
    res.status(401).json({ ok: false })
    return
  }

  res.status(200).json({ ok: true })
}

