import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd() + '/..', '')
  const backendPort = env.BACKEND_PORT || '3000'
  const frontendPort = env.FRONTEND_PORT || '5173'

  return {
    plugins: [react()],
    server: {
      port: parseInt(frontendPort),
      proxy: {
        '/api': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true
        }
      }
    }
  }
})
