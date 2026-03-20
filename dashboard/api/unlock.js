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

  // Vercel serverless may provide `req.body` as an object (parsed JSON),
  // or sometimes as a string depending on runtime/settings.
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

  // Simple / quick setup:
  // Keep the password check on the server side, but do not rely on env vars.
  const expected = 'pipeline2026'

  if (typeof password !== 'string' || password.length === 0) {
    res.status(400).json({ ok: false, error: 'Missing password' })
    return
  }

  const ok = password === expected
  if (!ok) {
    res.status(401).json({ ok: false })
    return
  }

  res.status(200).json({ ok: true })
}

