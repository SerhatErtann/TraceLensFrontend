import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    // 5173 başka projelerle çakışmasın diye sabit port (npm run dev -- --port 5181 ile değiştirilebilir)
    port: 5180,
    strictPort: true,
    // Geliştirmede /api istekleri TraceLensService'e yönlenir; CORS ayarına gerek kalmaz.
    // Farklı bir API'ye bağlanmak için: TRACELENS_API_URL=http://localhost:5197 npm run dev
    proxy: {
      '/api': process.env.TRACELENS_API_URL ?? 'http://localhost:5100'
    }
  }
})
