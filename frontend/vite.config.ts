import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

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
  // Multi-entry build (Corpus DESIGN.md §13 — declarative UI β)。
  // declarative.html は React Router の外側で独立 mount し、
  // corpus-renderer + taskPanel descriptor だけで描画する。
  // main.tsx (既存 React 全面 UI) は無改変で共存する。
  build: {
    rollupOptions: {
      input: {
        main:        resolve(__dirname, 'index.html'),
        declarative: resolve(__dirname, 'declarative.html'),
      },
    },
  },
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
      // declarative.ts が backend の corpus manifest を fetch するため。
      '/.well-known': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
        configure: silenceProxyErrors,
      },
    },
  },
})
