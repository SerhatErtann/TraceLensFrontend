import { createApp } from 'vue'
import App from './App.vue'
import { onUnauthorized } from './api'
import { markLoggedOut } from './auth'
import { router } from './router'
import './styles.css'

// Oturum süresi dolarsa (API 401 döner) bulunulan sayfaya geri dönülecek şekilde giriş ekranı açılır.
onUnauthorized(() => {
  markLoggedOut()
  const current = router.currentRoute.value
  // İlk yükleme bitmeden 401 gelirse router henüz hedef sayfayı bilmez; adresi tarayıcıdan al.
  const target = current.matched.length ? current.fullPath : location.pathname + location.search
  if (!target.startsWith('/login')) router.replace({ path: '/login', query: { redirect: target } })
})

createApp(App).use(router).mount('#app')
