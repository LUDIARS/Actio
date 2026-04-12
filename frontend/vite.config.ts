import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const frontendPort = parseInt(process.env.FRONTEND_PORT || '5173', 10)
const backendPort = process.env.BACKEND_PORT || '3000'
const extraHosts = process.env.VITE_ALLOWED_HOSTS?.split(',').filter(Boolean) || []

type ProxyLike = {
  on: (event: string, cb: (...args: unknown[]) => void) => unknown
}

// proxy 用の error ハンドラ: ECONNRESET 等で Vite dev server がクラッシュしないようにする
function silenceProxyErrors(proxy: unknown) {
  const p = proxy as ProxyLike
  p.on('error', (err: unknown) => {
    const e = err as { code?: string; message?: string }
    if (e.code === 'ECONNRESET' || e.code === 'ECONNREFUSED' || e.code === 'EPIPE') {
      console.warn(`[vite-proxy] ${e.code}: ${e.message ?? ''}`)
      return
    }
    console.error('[vite-proxy] error:', err)
  })
  p.on('proxyReqWs', (...args: unknown[]) => {
    const socket = args[1] as { on: (event: string, cb: (err: Error) => void) => void } | undefined
    socket?.on('error', (err: Error) => {
      console.warn('[vite-proxy] WS socket error:', err.message)
    })
  })
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: frontendPort,
    allowedHosts: [...extraHosts],
    watch: {
      usePolling: true,
    },
    proxy: {
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
        configure: silenceProxyErrors,
      },
      '/ws': {
        target: `http://localhost:${backendPort}`,
        ws: true,
        configure: silenceProxyErrors,
      },
    },
  },
})
