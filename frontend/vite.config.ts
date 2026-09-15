import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Excubitor が catalog の port から ACTIO_WEB_PORT / ACTIO_PORT / ACTIO_URL を注入する。
// FRONTEND_PORT / BACKEND_PORT は Excubitor 外 (docker-compose) の起動用に残す。
const frontendPort = parseInt(process.env.ACTIO_WEB_PORT || process.env.FRONTEND_PORT || '5173', 10)
const backendPort = process.env.ACTIO_PORT || process.env.BACKEND_PORT || '3000'
const backendTarget = process.env.ACTIO_URL || process.env.ACTIO_BACKEND_URL
const backendHost = process.env.ACTIO_LOCAL_MODE === '1' ? '127.0.0.1' : 'localhost'
const extraHosts = [
  ...(process.env.VITE_ALLOWED_HOSTS?.split(',').filter(Boolean) ?? []),
  ...(process.env.LUDIARS_ALLOWED_HOSTS?.split(',').map(s => s.trim()).filter(Boolean) ?? []),
]

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

// dev server と preview で同じ proxy 定義を使う。ビルド済み frontend は
// same-origin の /api・/ws を叩くため、preview 側にも proxy が要る。
const apiProxy = {
  '/api': {
    target: backendTarget || `http://${backendHost}:${backendPort}`,
    changeOrigin: process.env.ACTIO_LOCAL_MODE !== '1',
    configure: silenceProxyErrors,
  },
  '/ws': {
    target: backendTarget || `http://${backendHost}:${backendPort}`,
    ws: true,
    configure: silenceProxyErrors,
  },
  // declarative.ts が backend の corpus manifest を fetch するため。
  '/.well-known': {
    target: backendTarget || `http://${backendHost}:${backendPort}`,
    changeOrigin: process.env.ACTIO_LOCAL_MODE !== '1',
    configure: silenceProxyErrors,
  },
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
    host: process.env.ACTIO_LOCAL_MODE === '1' ? '127.0.0.1' : '0.0.0.0',
    port: frontendPort,
    allowedHosts: [...extraHosts],
    watch: {
      usePolling: process.env.ACTIO_VITE_POLLING === '1',
    },
    proxy: apiProxy,
  },
  preview: {
    host: process.env.ACTIO_LOCAL_MODE === '1' ? '127.0.0.1' : '0.0.0.0',
    port: frontendPort,
    allowedHosts: [...extraHosts],
    proxy: apiProxy,
  },
})
