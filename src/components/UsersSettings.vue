<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api, type DashboardUser } from '../api'
import { formatDateTime } from '../format'
import StatusBadge from './StatusBadge.vue'

/** Ayarlar sayfası: dashboard kullanıcıları (ekle / sil) ve kendi şifresini değiştirme. */
const users = ref<DashboardUser[]>([])
const listError = ref<string | null>(null)

const newName = ref('')
const newPassword = ref('')
const adding = ref(false)
const addResult = ref<{ ok: boolean; text: string } | null>(null)

const current = ref('')
const next = ref('')
const nextAgain = ref('')
const changing = ref(false)
const changeResult = ref<{ ok: boolean; text: string } | null>(null)

async function load() {
  try {
    users.value = await api.users()
    listError.value = null
  } catch (e) {
    listError.value = (e as Error).message
  }
}

async function add() {
  adding.value = true
  addResult.value = null
  try {
    users.value = await api.addUser(newName.value, newPassword.value)
    addResult.value = { ok: true, text: `${newName.value.trim().toLowerCase()} eklendi` }
    newName.value = ''
    newPassword.value = ''
  } catch (e) {
    addResult.value = { ok: false, text: (e as Error).message }
  } finally {
    adding.value = false
  }
}

async function remove(u: DashboardUser) {
  if (!window.confirm(`${u.username} silinsin mi? Açık oturumu da kapanır.`)) return
  try {
    users.value = await api.deleteUser(u.username)
  } catch (e) {
    listError.value = (e as Error).message
  }
}

async function changePassword() {
  changeResult.value = null
  if (next.value !== nextAgain.value) {
    changeResult.value = { ok: false, text: 'Yeni şifreler aynı değil' }
    return
  }
  changing.value = true
  try {
    await api.changePassword(current.value, next.value)
    changeResult.value = { ok: true, text: 'Şifre değişti; diğer cihazlardaki oturumlar kapandı' }
    current.value = next.value = nextAgain.value = ''
  } catch (e) {
    changeResult.value = { ok: false, text: (e as Error).message }
  } finally {
    changing.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="card section">
    <div class="card-header">
      <h2>Kullanıcılar <span class="muted count">{{ users.length }}</span></h2>
      <span class="muted small">Dashboard'a girebilen kişiler. Eklediğiniz kişiye kullanıcı adını ve şifreyi siz iletin; şifresini sonra kendisi değiştirebilir.</span>
    </div>
    <div v-if="listError" class="error-box inset">{{ listError }}</div>
    <div v-if="users.length" class="table-wrap">
      <table class="data">
        <thead><tr><th>Kullanıcı adı</th><th>Eklenme</th><th></th></tr></thead>
        <tbody>
          <tr v-for="u in users" :key="u.username">
            <td>{{ u.username }} <span v-if="u.isMe" class="pill">siz</span></td>
            <td class="secondary nowrap">{{ formatDateTime(u.createdAt) }}</td>
            <td class="num">
              <button v-if="!u.isMe" class="btn small" @click="remove(u)">Sil</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <form class="inline-form" @submit.prevent="add">
      <input v-model="newName" type="text" placeholder="Kullanıcı adı" aria-label="Yeni kullanıcı adı" autocomplete="off"
             required minlength="3" maxlength="32" />
      <input v-model="newPassword" type="password" placeholder="Şifre (en az 8)" aria-label="Yeni kullanıcının şifresi"
             autocomplete="new-password" required minlength="8" maxlength="128" />
      <button class="btn primary" type="submit" :disabled="adding">{{ adding ? 'Ekleniyor…' : 'Kullanıcı ekle' }}</button>
      <StatusBadge v-if="addResult" :kind="addResult.ok ? 'ok' : 'error'" :label="addResult.text" />
    </form>
  </section>

  <section class="card section">
    <div class="card-header"><h2>Şifremi değiştir</h2></div>
    <form class="inline-form" @submit.prevent="changePassword">
      <input v-model="current" type="password" placeholder="Mevcut şifre" aria-label="Mevcut şifre" autocomplete="current-password" required />
      <input v-model="next" type="password" placeholder="Yeni şifre (en az 8)" aria-label="Yeni şifre" autocomplete="new-password"
             required minlength="8" maxlength="128" />
      <input v-model="nextAgain" type="password" placeholder="Yeni şifre (tekrar)" aria-label="Yeni şifre tekrar" autocomplete="new-password"
             required minlength="8" maxlength="128" />
      <button class="btn primary" type="submit" :disabled="changing">{{ changing ? 'Değiştiriliyor…' : 'Değiştir' }}</button>
      <StatusBadge v-if="changeResult" :kind="changeResult.ok ? 'ok' : 'error'" :label="changeResult.text" />
    </form>
  </section>
</template>

<style scoped>
.section { margin-top: 16px; }
.count { font-weight: 400; font-size: 13px; margin-left: 6px; }
.small { font-size: 12px; }
.nowrap { white-space: nowrap; }
.btn.small { padding: 2px 10px; font-size: 12px; }
.inset { margin: 0 16px 12px; }
.inline-form { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px 16px 16px; }
.inline-form input { width: 190px; max-width: 100%; }
@media (max-width: 760px) { .inline-form input { width: 100%; } }
</style>
