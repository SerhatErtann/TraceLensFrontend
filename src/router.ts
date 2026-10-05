import { createRouter, createWebHistory } from 'vue-router'
import { auth, refreshAuth } from './auth'
import OverviewView from './views/OverviewView.vue'
import TraceView from './views/TraceView.vue'
import AlertsView from './views/AlertsView.vue'
import SettingsView from './views/SettingsView.vue'
import LoginView from './views/LoginView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/services' },
    { path: '/login', component: LoginView, meta: { public: true } },
    { path: '/services', component: OverviewView, props: { app: 'service' } },
    { path: '/schedulers', component: OverviewView, props: { app: 'scheduler' } },
    { path: '/traces/:traceId', component: TraceView, props: true },
    { path: '/alerts', component: AlertsView },
    { path: '/settings', component: SettingsView }
  ]
})

// Giriş açıksa ve oturum yoksa giriş sayfasına; girişten sonra gidilmek istenen sayfaya dönülür.
router.beforeEach(async to => {
  if (!auth.loaded) {
    try {
      await refreshAuth()
    } catch {
      return true // API'ye ulaşılamıyorsa sayfa kendi hata mesajını gösterir
    }
  }
  if (to.meta.public) {
    return to.path === '/login' && auth.authenticated ? '/services' : true
  }
  if (auth.authEnabled && !auth.authenticated) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  return true
})
