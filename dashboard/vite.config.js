import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

// Dev-only unlock endpoint so local `npm run dev` works like Vercel.
// For the simplest setup we hardcode the password server-side (no env required).
const DASHBOARD_PASSWORD = 'pipeline2026'

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

        const ok = password === DASHBOARD_PASSWORD

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
