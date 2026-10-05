import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    // 5173 başka projelerle çakışmasın diye sabit port
    port: 5180,
    strictPort: true,
    // Geliştirmede /api istekleri TraceLensService'e yönlenir; CORS ayarına gerek kalmaz.
    proxy: {
      '/api': 'http://localhost:5100'
    }
  }
})
