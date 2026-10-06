<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api, type AssistantMessage } from '../api'
import { renderMarkdown } from '../markdown'

/**
 * Sağ alttaki AI asistanı: gözlü turkuaz buton ve sohbet paneli. Sorular TraceLensService üzerinden Claude'a gider;
 * Claude cevabı TraceLens verisini araçlarla okuyarak yazar. Sohbet bu sekmede tutulur (sayfa değişse de kalır).
 */
interface ChatEntry extends AssistantMessage {
  steps?: string[]
  error?: boolean
}

const router = useRouter()
const STORAGE_KEY = 'tracelens.assistant'
const SUGGESTIONS = [
  'Bugün hata veren servisler hangileri?',
  'Son 1 saatte en yavaş endpoint hangisi?',
  'Dünle bugünü karşılaştır',
  'Şu an açık alarm var mı?',
  'order-service neden yavaş?'
]

const open = ref(false)
const enabled = ref<boolean | null>(null)
const entries = ref<ChatEntry[]>(load())
const draft = ref('')
const busy = ref(false)
const scroller = ref<HTMLDivElement>()
const input = ref<HTMLTextAreaElement>()

function load(): ChatEntry[] {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]') as ChatEntry[] } catch { return [] }
}
watch(entries, v => {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(v.slice(-30))) } catch { /* depolama kapalı */ }
}, { deep: true })

async function scrollDown() {
  await nextTick()
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: reduceMotion() ? 'auto' : 'smooth' })
}

async function toggle() {
  open.value = !open.value
  if (!open.value) return
  if (enabled.value === null) {
    try { enabled.value = (await api.assistantStatus()).enabled } catch { enabled.value = false }
  }
  await nextTick()
  input.value?.focus()
  scrollDown()
}

async function ask(text?: string) {
  const question = (text ?? draft.value).trim()
  if (!question || busy.value) return
  draft.value = ''
  entries.value.push({ role: 'user', content: question })
  busy.value = true
  scrollDown()
  try {
    // Hatalı cevaplar sohbete gönderilmez; Claude sadece gerçek soru-cevapları görür
    const history = entries.value.filter(e => !e.error).map(({ role, content }) => ({ role, content }))
    const reply = await api.assistantChat(history)
    entries.value.push({ role: 'assistant', content: reply.answer, steps: reply.steps })
  } catch (e) {
    entries.value.push({ role: 'assistant', content: (e as Error).message, error: true })
  } finally {
    busy.value = false
    scrollDown()
    await nextTick()
    input.value?.focus()
  }
}

function reset() {
  entries.value = []
  input.value?.focus()
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    ask()
  }
}

// Cevaptaki dashboard linkleri sayfayı yeniden yüklemeden açılır
function onAnswerClick(e: MouseEvent) {
  const a = (e.target as HTMLElement).closest('a[data-internal]') as HTMLAnchorElement | null
  if (!a) return
  e.preventDefault()
  router.push(a.getAttribute('href')!)
}

// Gözler: fareyi takip eder, arada kırpar; düşünürken etrafa bakar
const button = ref<HTMLButtonElement>()
const look = ref({ x: 0, y: 0 })
let frame = 0
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
function onPointer(e: PointerEvent) {
  if (frame || reduceMotion()) return
  frame = requestAnimationFrame(() => {
    frame = 0
    const r = button.value?.getBoundingClientRect()
    if (!r) return
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    const dist = Math.hypot(dx, dy) || 1
    const reach = Math.min(1, dist / 160) * 2.6
    look.value = { x: (dx / dist) * reach, y: (dy / dist) * reach }
  })
}
const pupilStyle = computed(() => ({ transform: `translate(${look.value.x}px, ${look.value.y}px)` }))

function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) open.value = false
}
onMounted(() => {
  window.addEventListener('pointermove', onPointer)
  window.addEventListener('keydown', onEsc)
})
onUnmounted(() => {
  window.removeEventListener('pointermove', onPointer)
  window.removeEventListener('keydown', onEsc)
  cancelAnimationFrame(frame)
})
</script>

<template>
  <div class="assistant">
    <section v-if="open" class="panel" role="dialog" aria-label="TraceLens asistanı">
      <header class="head">
        <span class="mini-face" aria-hidden="true"><i /><i /></span>
        <div class="title">
          <b>TraceLens Asistan</b>
          <span>Verilerinize bakarak cevaplar · Claude</span>
        </div>
        <button v-if="entries.length" type="button" class="icon-btn" title="Yeni sohbet" aria-label="Yeni sohbet" @click="reset">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
        </button>
        <button type="button" class="icon-btn" title="Kapat" aria-label="Asistanı kapat" @click="open = false">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </header>

      <div ref="scroller" class="body">
        <div v-if="enabled === false" class="notice">
          <b>Asistan kapalı.</b>
          TraceLensService'i <code>ANTHROPIC_API_KEY</code> ortam değişkeniyle (Claude API anahtarı) başlatınca açılır.
        </div>

        <div v-if="!entries.length" class="welcome">
          <p>Merhaba! Servisleriniz, görevleriniz, hatalar ve alarmlar hakkında soru sorabilirsiniz. Cevaplar dashboard'daki verilerden gelir.</p>
          <div class="suggestions">
            <button v-for="s in SUGGESTIONS" :key="s" type="button" class="chip" :disabled="enabled === false || busy" @click="ask(s)">{{ s }}</button>
          </div>
        </div>

        <template v-for="(m, i) in entries" :key="i">
          <div v-if="m.role === 'user'" class="msg user">{{ m.content }}</div>
          <div v-else class="msg bot" :class="{ error: m.error }">
            <!-- renderMarkdown önce tüm HTML'i kaçışlar; yalnızca kalın, liste, kod ve dashboard içi link üretir -->
            <div class="md" @click="onAnswerClick" v-html="renderMarkdown(m.content)" />
            <ul v-if="m.steps?.length" class="steps">
              <li v-for="s in m.steps" :key="s">
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>{{ s }}
              </li>
            </ul>
          </div>
        </template>

        <div v-if="busy" class="msg bot thinking" aria-live="polite">
          <span class="dots" aria-hidden="true"><i /><i /><i /></span> Veriler inceleniyor…
        </div>
      </div>

      <form class="composer" @submit.prevent="ask()">
        <textarea ref="input" v-model="draft" rows="1" placeholder="Bir soru yazın…" aria-label="Soru"
                  :disabled="enabled === false" @keydown="onKey" />
        <button type="submit" class="send" :disabled="!draft.trim() || busy || enabled === false" aria-label="Gönder">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4.5L12 8l-3.5 3.5" /></svg>
        </button>
      </form>
    </section>

    <button ref="button" type="button" class="fab" :class="{ thinking: busy, open }" :aria-expanded="open"
            :aria-label="open ? 'Asistanı kapat' : 'AI asistanını aç'" @click="toggle">
      <span class="eye"><span class="pupil" :style="pupilStyle" /></span>
      <span class="eye"><span class="pupil" :style="pupilStyle" /></span>
    </button>
  </div>
</template>

<style scoped>
.assistant { --teal: #4f9ca6; --teal-dark: #3f8590; --pupil: #1d2a42; position: fixed; right: 20px; bottom: 20px; z-index: 50; }

/* Buton: yuvarlak köşeli turkuaz kare, iki göz */
.fab {
  position: relative;
  width: 56px;
  height: 56px;
  border: none;
  border-radius: 16px;
  background: var(--teal);
  box-shadow: 0 6px 18px rgb(0 0 0 / 0.18), inset 0 -3px 0 rgb(0 0 0 / 0.08);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding-bottom: 6px;
  transition: transform 0.15s, background 0.15s;
}
.fab:hover { transform: translateY(-2px); background: var(--teal-dark); }
.fab:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
.eye {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: blink 5.5s infinite;
}
.eye:nth-child(2) { animation-delay: 0.04s; }
.pupil { width: 8px; height: 8px; border-radius: 50%; background: var(--pupil); transition: transform 0.08s linear; }
.fab.thinking .pupil { animation: look 1.6s ease-in-out infinite; }
@keyframes blink { 0%, 94%, 100% { transform: scaleY(1); } 96% { transform: scaleY(0.12); } }
@keyframes look { 0%, 100% { transform: translate(-2.5px, -1px); } 50% { transform: translate(2.5px, -1px); } }

/* Panel */
.panel {
  position: absolute;
  right: 0;
  bottom: 72px;
  width: 400px;
  height: min(620px, calc(100vh - 120px));
  display: flex;
  flex-direction: column;
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: 0 18px 48px rgb(0 0 0 / 0.18), 0 2px 6px rgb(0 0 0 / 0.06);
  overflow: hidden;
}
.head { display: flex; align-items: center; gap: 10px; padding: 12px 12px 12px 14px; border-bottom: 1px solid var(--border); }
.mini-face { width: 32px; height: 32px; flex: none; border-radius: 10px; background: var(--teal); display: flex; align-items: center; justify-content: center; gap: 4px; padding-bottom: 3px; }
.mini-face i { width: 9px; height: 9px; border-radius: 50%; background: #fff; box-shadow: inset 2px 1px 0 2px var(--pupil); }
.title { flex: 1; display: flex; flex-direction: column; line-height: 1.25; }
.title b { font-size: 14px; }
.title span { font-size: 11.5px; color: var(--text-muted); }
.icon-btn { width: 30px; height: 30px; border: none; border-radius: 8px; background: none; color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; }
.icon-btn:hover { background: var(--surface-2); color: var(--text-primary); }
.icon-btn svg, .send svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

.body { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.notice { padding: 10px 12px; border-radius: 10px; background: var(--status-warning-soft); font-size: 13px; line-height: 1.5; }
.notice code { font-family: var(--mono); font-size: 12px; }
.welcome p { margin: 0 0 10px; font-size: 13.5px; color: var(--text-secondary); line-height: 1.5; }
.suggestions { display: flex; flex-wrap: wrap; gap: 6px; }
.suggestions .chip { height: auto; min-height: 28px; padding: 4px 12px; white-space: normal; text-align: left; }
.suggestions .chip:disabled { opacity: 0.5; cursor: default; }

.msg { max-width: 88%; padding: 9px 12px; border-radius: 14px; font-size: 13.5px; line-height: 1.5; overflow-wrap: anywhere; }
.msg.user { align-self: flex-end; background: var(--accent); color: #fff; border-bottom-right-radius: 4px; white-space: pre-wrap; }
.msg.bot { align-self: flex-start; background: var(--surface-2); border-bottom-left-radius: 4px; }
.msg.bot.error { background: var(--status-critical-soft); }
.md :deep(p) { margin: 0 0 6px; }
.md :deep(p:last-child) { margin-bottom: 0; }
.md :deep(ul), .md :deep(ol) { margin: 4px 0 6px; padding-left: 18px; }
.md :deep(li) { margin: 2px 0; }
.md :deep(code) { font-family: var(--mono); font-size: 12px; background: var(--surface-1); padding: 0 4px; border-radius: 4px; }
.md :deep(a) { color: var(--accent); font-weight: 500; }
.steps { list-style: none; margin: 8px 0 0; padding: 6px 0 0; border-top: 1px solid var(--border); display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 11.5px; color: var(--text-muted); }
.steps li { display: inline-flex; align-items: center; gap: 4px; }
.steps svg { width: 12px; height: 12px; fill: none; stroke: var(--status-good); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.thinking { display: inline-flex; align-items: center; gap: 8px; color: var(--text-secondary); }
.dots { display: inline-flex; gap: 3px; }
.dots i { width: 6px; height: 6px; border-radius: 50%; background: var(--teal); animation: dot 1.2s infinite ease-in-out; }
.dots i:nth-child(2) { animation-delay: 0.15s; }
.dots i:nth-child(3) { animation-delay: 0.3s; }
@keyframes dot { 0%, 80%, 100% { opacity: 0.3; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }

.composer { display: flex; align-items: flex-end; gap: 8px; padding: 10px 12px 12px; border-top: 1px solid var(--border); }
.composer textarea {
  flex: 1;
  resize: none;
  max-height: 120px;
  min-height: 38px;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-1);
  font: inherit;
  font-size: 13.5px;
  color: inherit;
  field-sizing: content;
}
.composer textarea:focus-visible { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.send { width: 38px; height: 38px; flex: none; border: none; border-radius: 12px; background: var(--teal); color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.send:hover:not(:disabled) { background: var(--teal-dark); }
.send:disabled { opacity: 0.45; cursor: default; }

@media (max-width: 760px) {
  .assistant { right: 12px; bottom: 12px; }
  .panel { width: calc(100vw - 24px); height: min(620px, calc(100vh - 100px)); }
}
@media (prefers-reduced-motion: reduce) {
  .eye, .fab.thinking .pupil, .dots i { animation: none; }
  .fab, .pupil { transition: none; }
}
</style>
