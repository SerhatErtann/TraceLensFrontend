<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { api } from './api'

const activeAlerts = ref(0)
let timer: number | undefined

async function refreshAlerts() {
  try {
    activeAlerts.value = (await api.alerts()).active.length
  } catch {
    // Menü rozeti kritik değil; API kapalıysa sessizce geç.
  }
}

onMounted(() => {
  refreshAlerts()
  timer = window.setInterval(refreshAlerts, 30_000)
})
onUnmounted(() => window.clearInterval(timer))
</script>

<template>
  <div class="shell">
    <nav class="sidebar">
      <div class="brand">
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 12h4l3-8 4 16 3-8h4" fill="none" stroke="currentColor" stroke-width="2.2"
                stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        TraceLens
      </div>
      <RouterLink to="/services" class="nav-item">Services</RouterLink>
      <RouterLink to="/schedulers" class="nav-item">Schedulers</RouterLink>
      <RouterLink to="/alerts" class="nav-item">
        Alarmlar
        <span v-if="activeAlerts" class="badge" :aria-label="`${activeAlerts} aktif alarm`">{{ activeAlerts }}</span>
      </RouterLink>
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
