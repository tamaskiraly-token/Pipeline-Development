import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import * as crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

// Dev-only unlock endpoint so local `npm run dev` works like Vercel.
// The password is read from server env: DASHBOARD_PASSWORD (NOT in client bundle).
// Vite by default only loads variables with the `VITE_` prefix into the config env,
// so we explicitly read `DASHBOARD_PASSWORD` from .env.local for local dev.
if (!process.env.DASHBOARD_PASSWORD) {
  const envPaths = [path.resolve(process.cwd(), '.env.local'), path.resolve(process.cwd(), '.env')]
  for (const p of envPaths) {
    if (!fs.existsSync(p)) continue
    const raw = fs.readFileSync(p, 'utf8')
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return
      const eq = trimmed.indexOf('=')
      if (eq === -1) return
      const key = trimmed.slice(0, eq).trim()
      const value = trimmed.slice(eq + 1).trim().replace(/^"|"$/g, '')
      if (key === 'DASHBOARD_PASSWORD' && value) process.env.DASHBOARD_PASSWORD = value
    })
    if (process.env.DASHBOARD_PASSWORD) break
  }
}

const devUnlockMiddleware = {
  name: 'dev-unlock-middleware',
  configureServer(server) {
    server.middlewares.use('/api/unlock', async (req, res, next) => {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }))
        return
      }

      const expected = process.env.DASHBOARD_PASSWORD
      if (!expected) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Server not configured' }))
        return
      }

      try {
        let raw = ''
        for await (const chunk of req) raw += chunk
        const body = raw ? JSON.parse(raw) : {}
        const password = body?.password

        if (typeof password !== 'string' || password.length === 0) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: 'Missing password' }))
          return
        }

        const a = Buffer.from(password, 'utf8')
        const b = Buffer.from(expected, 'utf8')
        const ok = a.length === b.length ? crypto.timingSafeEqual(a, b) : false

        res.statusCode = ok ? 200 : 401
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok }))
      } catch (e) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Bad request' }))
      }
    })
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), devUnlockMiddleware],
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
})
