<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import { auth, refreshAuth } from '../auth'

/**
 * Giriş / kayıt. Hiç hesap yoksa doğrudan "ilk hesabı oluştur" açılır; hesap varsa giriş açılır ve kayıt açıksa
 * "Kayıt ol" seçeneği görünür. Kayıt kapalıysa yeni kullanıcıyı hesabı olan biri Ayarlar'dan ekler.
 */
const route = useRoute()
const router = useRouter()

const mode = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
const passwordAgain = ref('')
const error = ref<string | null>(null)
const submitting = ref(false)

const registering = computed(() => auth.setupRequired || mode.value === 'register')
const title = computed(() => auth.setupRequired ? 'İlk hesabı oluşturun' : registering.value ? 'Kayıt ol' : 'Giriş yap')

// Sayfa açıkken başkası ilk hesabı oluşturmuş olabilir; güncel durumu al
onMounted(() => refreshAuth().catch(() => {}))

function switchMode(next: 'login' | 'register') {
  mode.value = next
  error.value = null
  password.value = ''
  passwordAgain.value = ''
}

async function submit() {
  error.value = null
  if (registering.value && password.value !== passwordAgain.value) {
    error.value = 'Şifreler aynı değil.'
    return
  }
  submitting.value = true
  try {
    const status = registering.value
      ? await api.register(username.value, password.value)
      : await api.login(username.value, password.value)
    Object.assign(auth, status, { loaded: true })
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : '/overview'
    router.replace(redirect)
  } catch (e) {
    error.value = (e as Error).message
    password.value = ''
    passwordAgain.value = ''
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
      <h1>{{ title }}</h1>
      <p v-if="auth.setupRequired" class="hint">
        TraceLens'te henüz hesap yok. İlk hesabı siz oluşturun; diğer kişileri sonra <b>Ayarlar → Kullanıcılar</b>'dan ekleyebilirsiniz.
      </p>

      <label>
        Kullanıcı adı
        <input v-model="username" type="text" autocomplete="username" required autofocus
               :minlength="registering ? 3 : undefined" maxlength="32" />
        <span v-if="registering" class="field-hint">3-32 karakter: harf, rakam, nokta, alt çizgi, tire</span>
      </label>
      <label>
        Şifre
        <input v-model="password" type="password" :autocomplete="registering ? 'new-password' : 'current-password'" required
               :minlength="registering ? 8 : undefined" maxlength="128" />
        <span v-if="registering" class="field-hint">En az 8 karakter</span>
      </label>
      <label v-if="registering">
        Şifre (tekrar)
        <input v-model="passwordAgain" type="password" autocomplete="new-password" required minlength="8" maxlength="128" />
      </label>

      <div v-if="error" class="error" role="alert">{{ error }}</div>
      <button class="btn primary" type="submit" :disabled="submitting">
        <template v-if="submitting">{{ registering ? 'Hesap oluşturuluyor…' : 'Giriş yapılıyor…' }}</template>
        <template v-else>{{ registering ? 'Hesap oluştur' : 'Giriş yap' }}</template>
      </button>

      <template v-if="!auth.setupRequired">
        <p v-if="mode === 'register'" class="switch">
          Zaten hesabınız var mı? <button type="button" class="link" @click="switchMode('login')">Giriş yapın</button>
        </p>
        <p v-else-if="auth.registrationOpen" class="switch">
          Hesabınız yok mu? <button type="button" class="link" @click="switchMode('register')">Kayıt olun</button>
        </p>
        <p v-else class="switch muted">
          Hesabınız yoksa, hesabı olan birinden sizi Ayarlar → Kullanıcılar'dan eklemesini isteyin.
        </p>
      </template>
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
  max-width: 360px;
  padding: 28px 24px 22px;
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
}
h1 { margin: 0; font-size: 17px; text-align: center; }
.hint { margin: -4px 0 0; font-size: 13px; line-height: 1.5; color: var(--text-secondary); text-align: center; }
label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; color: var(--text-secondary); }
input { padding: 8px 10px; }
.field-hint { font-size: 11.5px; color: var(--text-muted); }
.error {
  font-size: 13px;
  color: var(--text-primary);
  background: var(--status-critical-soft);
  border: 1px solid var(--status-critical);
  border-radius: 6px;
  padding: 8px 10px;
}
.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; padding: 8px 12px; font-weight: 600; }
.switch { margin: 0; font-size: 13px; text-align: center; color: var(--text-secondary); line-height: 1.5; }
.link { border: none; background: none; padding: 0; font: inherit; color: var(--accent); font-weight: 600; cursor: pointer; }
.link:hover { text-decoration: underline; }
</style>
