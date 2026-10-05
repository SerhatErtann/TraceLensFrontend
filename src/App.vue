<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from './api'
import { auth, markLoggedOut } from './auth'

const route = useRoute()
const router = useRouter()
const isLoginPage = computed(() => route.path === '/login')

const activeAlerts = ref(0)
const openIssues = ref(0)
let timer: number | undefined

async function refreshAlerts() {
  // Oturum durumu öğrenilmeden istek atılmaz; aksi halde 401 erken yönlendirmeye yol açar.
  if (!auth.loaded || isLoginPage.value || (auth.authEnabled && !auth.authenticated)) return
  try {
    // Rozetler, sayfaların varsayılan aralığıyla (son 1 saat) aynı sayıyı gösterir
    const [alerts, issues] = await Promise.all([api.alerts(), api.issues('1h')])
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
      <RouterLink to="/overview" class="nav-item">Genel Bakış</RouterLink>
      <RouterLink to="/issues" class="nav-item">
        Sorunlar
        <span v-if="openIssues" class="badge" :aria-label="`${openIssues} açık sorun`">{{ openIssues }}</span>
      </RouterLink>
      <div class="sep" role="separator" />
      <RouterLink to="/services" class="nav-item">Servisler</RouterLink>
      <RouterLink to="/schedulers" class="nav-item">Görevler</RouterLink>
      <RouterLink to="/alerts" class="nav-item">
        Alarmlar
        <span v-if="activeAlerts" class="badge" :aria-label="`${activeAlerts} aktif alarm`">{{ activeAlerts }}</span>
      </RouterLink>
      <RouterLink to="/settings" class="nav-item">Ayarlar</RouterLink>
      <div v-if="auth.authEnabled && auth.authenticated" class="user">
        <span class="muted" :title="`Oturum: ${auth.username}`">{{ auth.username }}</span>
        <button class="btn small" @click="logout">Çıkış</button>
      </div>
    </nav>
    <main class="content">
      <RouterView />
    </main>
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
  justify-content: space-between;
  padding: 7px 10px;
  border-radius: 6px;
  color: var(--text-secondary);
  font-weight: 500;
}
.nav-item:hover { background: var(--surface-2); text-decoration: none; }
.nav-item.router-link-active { background: var(--accent-soft); color: var(--text-primary); }
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
