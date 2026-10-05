<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RANGES } from '../ranges'
import { RAW_RETENTION_DAYS, useTimeRange } from '../timeRange'

/**
 * Zaman aralığı seçimi: hazır aralıklar (15 dk … 7 gün) ve "Özel": başlangıç ve bitiş tarih/saati.
 * Tüm sayfalarda aynı; seçim adres çubuğuna yazılır.
 */
const { win, isCustom, label, setPreset, setCustom } = useTimeRange()

const open = ref(false)
const fromInput = ref('')
const toInput = ref('')
const error = ref<string | null>(null)

// <input type="datetime-local"> yerel saat ister: "2026-10-05T14:30"
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
const minInput = computed(() => toLocalInput(new Date(Date.now() - RAW_RETENTION_DAYS * 86_400_000)))
const maxInput = computed(() => toLocalInput(new Date()))

function openCustom() {
  const w = win.value
  const to = w.to ? new Date(w.to) : new Date()
  const from = w.from ? new Date(w.from) : new Date(to.getTime() - 3_600_000)
  fromInput.value = toLocalInput(from)
  toInput.value = toLocalInput(to)
  error.value = null
  open.value = true
}

function apply() {
  const from = new Date(fromInput.value)
  const to = new Date(toInput.value)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) { error.value = 'Başlangıç ve bitişi seçin'; return }
  if (to <= from) { error.value = 'Bitiş başlangıçtan sonra olmalı'; return }
  setCustom(from.toISOString(), to.toISOString())
  open.value = false
}

watch(() => win.value.range, () => { open.value = false })
</script>

<template>
  <div class="range-picker">
    <div class="segmented" role="group" aria-label="Zaman aralığı">
      <button v-for="r in RANGES" :key="r.value" type="button" :class="{ active: !isCustom && win.range === r.value }"
              @click="setPreset(r.value)">{{ r.label }}</button>
      <button type="button" :class="{ active: isCustom }" :aria-expanded="open" @click="open ? (open = false) : openCustom()">
        {{ isCustom ? label : 'Özel aralık' }}
      </button>
    </div>
    <form v-if="open" class="card panel" @submit.prevent="apply">
      <label>Başlangıç <input v-model="fromInput" type="datetime-local" :min="minInput" :max="maxInput" required /></label>
      <label>Bitiş <input v-model="toInput" type="datetime-local" :min="minInput" :max="maxInput" required /></label>
      <div class="actions">
        <button class="btn primary" type="submit">Uygula</button>
        <button class="btn" type="button" @click="open = false">Vazgeç</button>
      </div>
      <p v-if="error" class="err">{{ error }}</p>
      <p class="muted note">Ayrıntılı istekler son {{ RAW_RETENTION_DAYS }} gün saklanır; daha eski dönemler için Raporlar sayfası.</p>
    </form>
  </div>
</template>

<style scoped>
.range-picker { position: relative; }
.segmented { display: inline-flex; flex-wrap: wrap; border: 1px solid var(--border-strong); border-radius: 6px; overflow: hidden; background: var(--surface-1); }
.segmented button { border: none; background: transparent; padding: 5px 12px; cursor: pointer; border-right: 1px solid var(--border); white-space: nowrap; }
.segmented button:last-child { border-right: none; }
.segmented button.active { background: var(--accent); color: #fff; }
.panel {
  position: absolute;
  z-index: 20;
  top: calc(100% + 6px);
  right: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  width: 300px;
  max-width: calc(100vw - 32px);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.14);
}
.panel label { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--text-secondary); }
.panel input {
  font: inherit;
  color: inherit;
  background: var(--surface-1);
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  padding: 5px 8px;
}
.actions { display: flex; gap: 8px; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.err { margin: 0; color: var(--status-critical); font-size: 12.5px; }
.note { margin: 0; font-size: 11.5px; }
@media (max-width: 760px) { .panel { left: 0; right: auto; } }
</style>
