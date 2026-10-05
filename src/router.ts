import { createRouter, createWebHistory } from 'vue-router'
import { auth, refreshAuth } from './auth'
import HomeView from './views/HomeView.vue'
import IssuesView from './views/IssuesView.vue'
import OverviewView from './views/OverviewView.vue'
import ServiceDetailView from './views/ServiceDetailView.vue'
import TraceView from './views/TraceView.vue'
import AlertsView from './views/AlertsView.vue'
import SettingsView from './views/SettingsView.vue'
import LoginView from './views/LoginView.vue'

export const HOME = '/overview'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: HOME },
    { path: '/login', component: LoginView, meta: { public: true } },
    { path: '/overview', component: HomeView },
    { path: '/issues', component: IssuesView },
    { path: '/services', component: OverviewView, props: { app: 'service' } },
    { path: '/schedulers', component: OverviewView, props: { app: 'scheduler' } },
    { path: '/services/:service', component: ServiceDetailView, props: r => ({ app: 'service', service: r.params.service }) },
    { path: '/schedulers/:service', component: ServiceDetailView, props: r => ({ app: 'scheduler', service: r.params.service }) },
    { path: '/traces/:traceId', component: TraceView, props: true },
    { path: '/alerts', component: AlertsView },
    { path: '/settings', component: SettingsView }
  ],
  // Sayfa değişince başa dön; #bölüm adresleri sayfa verisi yüklenince ilgili sayfa kendisi kaydırır
  scrollBehavior: (to, from) => (to.path !== from.path ? { top: 0 } : false)
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
    return to.path === '/login' && auth.authenticated ? HOME : true
  }
  if (auth.authEnabled && !auth.authenticated) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  return true
})
