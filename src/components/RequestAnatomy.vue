<script setup lang="ts">
import { computed } from 'vue'
import type { Anatomy, AppKind } from '../api'
import { formatInt, formatMs, formatPercent } from '../format'
import TimeSplitBar from './TimeSplitBar.vue'

/**
 * Bir endpoint'in (görevin) ortalama isteği: son N istekte her adımın istek başına kaç kez çalıştığı ve ne kadar sürdüğü.
 * Waterfall tek bir isteği gösterir; bu, yüzlerce isteğin ortalamasını.
 */
const props = defineProps<{ data: Anatomy | null; app: AppKind }>()

const noun = computed(() => (props.app === 'service' ? 'istek' : 'çalışma'))
const CATEGORY_LABEL = { call: 'Dış çağrı', db: 'Veritabanı', method: 'Metod' } as const

// Tek cümlelik özet: "Ortalama bir istek 116 ms: 3 ms kendi kodu, 112 ms payment-service çağrısı (1×), 0,7 ms veritabanı (10 sorgu)"
const sentence = computed(() => {
  const d = props.data
  if (!d || !d.sampleCount) return ''
  const own = d.timeSplit.find(p => p.category === 'own')?.totalMs ?? 0
  const parts = [`${formatMs(own)} kendi kodu`]
  for (const s of d.steps.filter(s => s.category === 'call').slice(0, 3)) {
    parts.push(`${formatMs(s.msPerRequest)} ${s.target ? `${s.target} ` : ''}çağrısı (${s.callsPerRequest.toLocaleString('tr-TR')}×)`)
  }
  const db = d.steps.filter(s => s.category === 'db')
  if (db.length) {
    const queries = db.reduce((sum, s) => sum + s.callsPerRequest, 0)
    const ms = db.reduce((sum, s) => sum + s.msPerRequest, 0)
    parts.push(`${formatMs(ms)} veritabanı (${Math.round(queries).toLocaleString('tr-TR')} sorgu)`)
  }
  return `Ortalama bir ${noun.value} ${formatMs(d.avgDurationMs)}: ${parts.join(', ')}`
})
const maxShare = computed(() => Math.max(0.0001, ...(props.data?.steps.map(s => s.share) ?? [])))
</script>

<template>
  <div v-if="!data" class="empty">Yükleniyor…</div>
  <div v-else-if="!data.sampleCount" class="empty">Bu aralıkta {{ noun }} yok</div>
  <template v-else>
    <div class="body">
      <p class="sentence">{{ sentence }}</p>
      <TimeSplitBar :parts="data.timeSplit" :ms-suffix="` / ${noun}`" />
    </div>
    <div class="table-wrap">
      <table v-if="data.steps.length" class="data">
        <thead>
          <tr>
            <th>Adım</th>
            <th class="num">{{ noun === 'istek' ? 'İstek' : 'Çalışma' }} başına</th>
            <th class="num">Bir çalışması</th>
            <th class="num">{{ noun === 'istek' ? 'İstek' : 'Çalışma' }} başına süre</th>
            <th>Süredeki payı</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in data.steps" :key="`${s.category}|${s.target}|${s.name}`">
            <td>
              <div class="mono">{{ s.name }}</div>
              <div class="muted tiny">{{ CATEGORY_LABEL[s.category] }}{{ s.target ? ` · ${s.target}` : '' }}</div>
            </td>
            <td class="num">{{ s.callsPerRequest.toLocaleString('tr-TR') }}×</td>
            <td class="num">{{ formatMs(s.avgMs) }}</td>
            <td class="num"><b>{{ formatMs(s.msPerRequest) }}</b></td>
            <td class="share-cell">
              <div class="share">
                <div class="bar"><i :style="{ width: `${Math.max((s.share / maxShare) * 100, 1.5)}%` }" /></div>
                <span class="num">{{ formatPercent(s.share) }}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">Bu {{ noun }} başka adım içermiyor; sürenin tamamı kendi kodunda</div>
    </div>
    <p class="muted tiny foot">Son {{ formatInt(data.sampleCount) }} {{ noun }} incelendi. İç içe metodlar aynı süreyi paylaşabildiği için paylar toplamı %100'ü geçebilir.</p>
  </template>
</template>

<style scoped>
.body { padding: 0 16px 12px; }
.sentence { margin: 0 0 12px; font-size: 13.5px; }
.tiny { font-size: 11.5px; }
.foot { margin: 0; padding: 8px 16px 12px; }
.share-cell { min-width: 150px; }
.share { display: flex; align-items: center; gap: 8px; }
.share .bar { flex: 1; height: 8px; border-radius: 4px; background: var(--surface-2); overflow: hidden; }
.share .bar i { display: block; height: 100%; border-radius: 4px; background: var(--accent); }
.share .num { min-width: 44px; }
</style>
