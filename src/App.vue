<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from './api'
import { auth, markLoggedOut } from './auth'
import AssistantWidget from './components/AssistantWidget.vue'

const route = useRoute()
const router = useRouter()
const isLoginPage = computed(() => route.path === '/login')

// Menü: iki grup (genel bakış sayfaları / uygulama bazlı sayfalar), her öğe 16px çizgi ikonla
const NAV = [
  [
    { to: '/overview', label: 'Genel Bakış', icon: 'M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z' },
    { to: '/issues', label: 'Sorunlar', icon: 'M8 2l6.5 11.5h-13zM8 6.5v3M8 11.5v.1' },
    { to: '/live', label: 'Canlı', icon: 'M1.5 8h3l1.5-4 3 8 1.5-4h4' },
    { to: '/map', label: 'Servis haritası', icon: 'M4 4.5a1.5 1.5 0 1 0 0-.01M12 4a1.5 1.5 0 1 0 0-.01M8 12a1.5 1.5 0 1 0 0-.01M5.2 5.3l2 5M10.8 5.3l-2 5M5.5 4h5' },
    { to: '/reports', label: 'Raporlar', icon: 'M2.5 13.5h11M4 11V8M7 11V4.5M10 11V7M13 11V3' }
  ],
  [
    { to: '/services', label: 'Servisler', icon: 'M2.5 3h11v4h-11zM2.5 9h11v4h-11zM5 5h.1M5 11h.1' },
    { to: '/schedulers', label: 'Görevler', icon: 'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 1 0 0-11M8 5v3l2 1.5' },
    { to: '/alerts', label: 'Alarmlar', icon: 'M4 11.5V7a4 4 0 0 1 8 0v4.5l1 1H3zM6.5 14h3' },
    { to: '/settings', label: 'Ayarlar', icon: 'M2.5 4.5h7M12 4.5h1.5M2.5 11.5h1.5M6.5 11.5h7M10.5 3v3M5 10v3' }
  ]
]

const activeAlerts = ref(0)
const openIssues = ref(0)
let timer: number | undefined

async function refreshAlerts() {
  // Oturum durumu öğrenilmeden istek atılmaz; aksi halde 401 erken yönlendirmeye yol açar.
  if (!auth.loaded || isLoginPage.value || (auth.authEnabled && !auth.authenticated)) return
  try {
    // Rozetler, sayfaların varsayılan aralığıyla (son 1 saat) aynı sayıyı gösterir
    const [alerts, issues] = await Promise.all([api.alerts(), api.issues({ range: '1h' })])
    activeAlerts.value = alerts.active.length
    openIssues.value = issues.length
  } catch {
    // Menü rozetleri kritik değil; API kapalıysa sessizce geç.
  }
}

async function logout() {
  await api.logout().catch(() => {})
  markLoggedOut()
  activeAlerts.value = 0
  openIssues.value = 0
  router.replace('/login')
}

// Oturum durumu öğrenilince / giriş sayfasından çıkılınca rozet hemen dolsun
watch(() => [auth.loaded, auth.authenticated, isLoginPage.value], refreshAlerts)

onMounted(() => {
  refreshAlerts()
  timer = window.setInterval(refreshAlerts, 30_000)
})
onUnmounted(() => window.clearInterval(timer))
</script>

<template>
  <RouterView v-if="isLoginPage" />
  <div v-else class="shell">
    <nav class="sidebar">
      <div class="brand">
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 12h4l3-8 4 16 3-8h4" fill="none" stroke="currentColor" stroke-width="2.2"
                stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        TraceLens
      </div>
      <template v-for="group in NAV" :key="group[0].to">
        <div v-if="group !== NAV[0]" class="sep" role="separator" />
        <!-- Detay sayfası (/services/order-service) ayrı bir route; menüde yine Servisler/Görevler seçili görünsün -->
        <RouterLink v-for="item in group" :key="item.to" :to="item.to" class="nav-item"
                    :class="{ 'router-link-active': route.path.startsWith(`${item.to}/`) }">
          <svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path :d="item.icon" /></svg>
          <span class="label">{{ item.label }}</span>
          <span v-if="item.to === '/issues' && openIssues" class="badge" :aria-label="`${openIssues} açık sorun`">{{ openIssues }}</span>
          <span v-if="item.to === '/alerts' && activeAlerts" class="badge" :aria-label="`${activeAlerts} aktif alarm`">{{ activeAlerts }}</span>
          <span v-if="item.to === '/live'" class="live-dot" aria-hidden="true" />
        </RouterLink>
      </template>
      <div v-if="auth.authEnabled && auth.authenticated" class="user">
        <span class="muted" :title="`Oturum: ${auth.username}`">{{ auth.username }}</span>
        <button class="btn small" @click="logout">Çıkış</button>
      </div>
    </nav>
    <main class="content">
      <RouterView />
    </main>
    <AssistantWidget v-if="auth.loaded && (!auth.authEnabled || auth.authenticated)" />
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: 200px 1fr;
  min-height: 100vh;
}
.sidebar {
  background: var(--surface-1);
  border-right: 1px solid var(--border);
  padding: 16px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: sticky;
  top: 0;
  height: 100vh;
}
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 16px;
  padding: 4px 10px 18px;
  color: var(--accent);
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 8px;
  color: var(--text-secondary);
  font-weight: 500;
  transition: background 0.12s, color 0.12s;
}
.nav-item .label { flex: 1; }
.nav-item:hover { background: var(--surface-2); color: var(--text-primary); text-decoration: none; }
.nav-item.router-link-active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.ico { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; opacity: 0.85; }
.nav-item.router-link-active .ico { opacity: 1; }
@media (max-width: 760px) { .nav-item .label { flex: none; } }
@media (prefers-reduced-motion: reduce) { .nav-item { transition: none; } }
.sep { height: 1px; background: var(--border); margin: 8px 6px; }
@media (max-width: 760px) { .sep { display: none; } }
.user {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 10px 0;
  border-top: 1px solid var(--border);
  font-size: 13px;
}
.user span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.btn.small { padding: 2px 10px; font-size: 12px; }
@media (max-width: 760px) {
  .user { margin-top: 0; margin-left: auto; border-top: none; padding: 0 10px; }
}
.badge {
  background: var(--status-critical);
  color: #fff;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  padding: 0 7px;
  line-height: 18px;
}
.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--status-good);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--status-good) 20%, transparent);
}
.content {
  padding: 24px 28px 48px;
  min-width: 0;
  max-width: 1500px;
}
@media (max-width: 760px) {
  .shell { grid-template-columns: 1fr; }
  .sidebar { position: static; height: auto; flex-direction: row; flex-wrap: wrap; padding: 8px; }
  .brand { padding: 4px 10px; }
  .content { padding: 16px; }
}
</style>
