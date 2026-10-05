<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import { auth } from '../auth'

const route = useRoute()
const router = useRouter()

const username = ref('')
const password = ref('')
const error = ref<string | null>(null)
const submitting = ref(false)

async function submit() {
  submitting.value = true
  error.value = null
  try {
    Object.assign(auth, await api.login(username.value, password.value), { loaded: true })
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : '/services'
    router.replace(redirect)
  } catch (e) {
    error.value = (e as Error).message
    password.value = ''
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="login">
    <form class="card box" @submit.prevent="submit">
      <div class="brand">
        <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 12h4l3-8 4 16 3-8h4" fill="none" stroke="currentColor" stroke-width="2.2"
                stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        TraceLens
      </div>
      <label>
        Kullanıcı adı
        <input v-model="username" type="text" autocomplete="username" required autofocus />
      </label>
      <label>
        Şifre
        <input v-model="password" type="password" autocomplete="current-password" required />
      </label>
      <div v-if="error" class="error" role="alert">{{ error }}</div>
      <button class="btn primary" type="submit" :disabled="submitting">
        {{ submitting ? 'Giriş yapılıyor…' : 'Giriş yap' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.login {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 16px;
}
.box {
  width: 100%;
  max-width: 340px;
  padding: 28px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.brand {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 700;
  font-size: 20px;
  color: var(--accent);
  margin-bottom: 6px;
}
label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; color: var(--text-secondary); }
input { padding: 8px 10px; }
.error {
  font-size: 13px;
  color: var(--text-primary);
  background: var(--status-critical-soft);
  border: 1px solid var(--status-critical);
  border-radius: 6px;
  padding: 8px 10px;
}
.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; padding: 8px 12px; font-weight: 600; }
</style>
