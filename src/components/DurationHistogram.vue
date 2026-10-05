<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { Histogram } from '../api'
import { formatInt, formatMs, formatPercent } from '../format'
import { bimodal } from '../insights'

/**
 * Süre dağılımı: kaç istek hangi süre aralığında. Ortalamanın gizlediğini gösterir; iki tepe varsa
 * "çoğu hızlı ama bir grup çok yavaş" demektir. Eşiğin üstündeki aralıklar turuncu, hatalı kısım kırmızı.
 */
const props = defineProps<{
  data: Histogram | null
  thresholdMs: number
  /** Tek bir endpoint/görev seçiliyse iki küme "aynı işin iki yolu" demektir; değilse farklı endpoint'ler */
  singleOperation?: boolean
}>()
const groups = computed(() => bimodal(props.data))

const HEIGHT = 200
const PAD = { top: 30, bottom: 26, left: 8, right: 8 }

const root = ref<HTMLDivElement>()
const width = ref(600)
const hoverIndex = ref<number | null>(null)
let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(([entry]) => (width.value = Math.max(280, entry.contentRect.width)))
  if (root.value) observer.observe(root.value)
})
onUnmounted(() => observer?.disconnect())

const buckets = computed(() => props.data?.buckets ?? [])
const total = computed(() => buckets.value.reduce((sum, b) => sum + b.count, 0))
const slot = computed(() => (width.value - PAD.left - PAD.right) / Math.max(1, buckets.value.length))
const maxCount = computed(() => Math.max(1, ...buckets.value.map(b => b.count)))
const barH = (count: number) => (count / maxCount.value) * (HEIGHT - PAD.top - PAD.bottom)
const slotX = (i: number) => PAD.left + i * slot.value

/** Bir süre değerinin yatay konumu: bulunduğu aralığın içinde logaritmik oranla */
function xOf(ms: number): number | null {
  const list = buckets.value
  const i = list.findIndex(b => ms >= b.fromMs && (b.toMs === null || ms < b.toMs))
  if (i < 0) return ms < (list[0]?.fromMs ?? 0) ? PAD.left : null
  const b = list[i]
  const frac = b.toMs === null ? 0.5
    : b.fromMs > 0 ? (Math.log(ms) - Math.log(b.fromMs)) / (Math.log(b.toMs) - Math.log(b.fromMs))
    : ms / b.toMs
  return slotX(i) + slot.value * Math.min(1, Math.max(0, frac))
}

// Yüzdelik işaretleri; birbirine yakın etiketler üst üste binmesin diye bir satır yukarı alınır
const markers = computed(() => {
  const d = props.data
  if (!d || !d.count) return []
  const list = [
    { label: 'p50', ms: d.p50Ms },
    { label: 'p90', ms: d.p90Ms },
    { label: 'p99', ms: d.p99Ms }
  ].map(m => ({ ...m, x: xOf(m.ms) })).filter((m): m is { label: string; ms: number; x: number } => m.x !== null)
  let lastX = -Infinity
  let row = 0
  return list.map(m => {
    row = m.x - lastX < 56 ? (row + 1) % 2 : 0
    lastX = m.x
    return { ...m, y: PAD.top - 8 - row * 12 }
  })
})
const thresholdX = computed(() => (props.data?.count ? xOf(props.thresholdMs) : null))

// Eşik üstü oranı: alt sınırı eşiğe eşit ya da büyük aralıklar (eşik bir aralık sınırına denk gelmezse yaklaşık)
const overThreshold = computed(() => buckets.value.filter(b => b.fromMs >= props.thresholdMs).reduce((s, b) => s + b.count, 0))
const thresholdOnEdge = computed(() => buckets.value.some(b => b.fromMs === props.thresholdMs || b.toMs === props.thresholdMs))

// Aralık alt sınırları; sığmayanlar atlanır
const labelEvery = computed(() => Math.max(1, Math.ceil(44 / slot.value)))
const shortMs = (ms: number) => (ms === 0 ? '0' : ms >= 1000 ? `${(ms / 1000).toLocaleString('tr-TR')} s` : `${ms} ms`)

function rangeText(b: Histogram['buckets'][number]) {
  return b.toMs === null ? `${shortMs(b.fromMs)} ve üstü` : `${shortMs(b.fromMs)} – ${shortMs(b.toMs)}`
}

const hovered = computed(() => (hoverIndex.value === null ? null : buckets.value[hoverIndex.value] ?? null))
const tooltipLeft = computed(() => {
  if (hoverIndex.value === null) return 0
  const x = slotX(hoverIndex.value) + slot.value / 2
  return x > width.value - 190 ? x - 178 : x + 10
})

function onMove(event: MouseEvent) {
  const rect = (event.currentTarget as SVGElement).getBoundingClientRect()
  const x = (event.clientX - rect.left) * (width.value / (rect.width || width.value))
  const i = Math.floor((x - PAD.left) / slot.value)
  hoverIndex.value = i >= 0 && i < buckets.value.length ? i : null
}
</script>

<template>
  <div ref="root" class="histogram">
    <div v-if="data && data.count" class="summary">
      <p>
        Yarısı <b>{{ formatMs(data.p50Ms) }}</b> içinde bitiyor · onda dokuzu <b>{{ formatMs(data.p90Ms) }}</b> içinde ·
        en yavaş yüzde birlik dilim <b>{{ formatMs(data.p99Ms) }}</b> ve üstü ·
        eşiği ({{ formatMs(thresholdMs) }}) aşanların payı <b :class="{ over: overThreshold > 0 }">{{ thresholdOnEdge ? '' : '≈' }}{{ formatPercent(overThreshold / (total || 1)) }}</b>
      </p>
      <p v-if="groups" class="groups">
        İstekler iki ayrı grupta toplanıyor: <b>{{ formatPercent(1 - groups.slowShare) }}</b> kadarı {{ shortMs(groups.fast[0]) }}–{{ shortMs(groups.fast[1] ?? 0) }},
        <b>{{ formatPercent(groups.slowShare) }}</b> kadarı {{ shortMs(groups.slow[0]) }}{{ groups.slow[1] ? `–${shortMs(groups.slow[1])}` : ' ve üstü' }} arasında.
        <template v-if="singleOperation">Aynı endpoint'in bazı istekleri farklı ve daha yavaş bir yoldan geçiyor olabilir; yavaş gruptaki istekleri incelemek gerekir.</template>
        <template v-else>Bu genelde farklı hızda çalışan endpoint'lerden gelir; tek bir endpoint seçince o endpoint'in kendi dağılımı görünür.</template>
      </p>
    </div>

    <div v-if="!data" class="empty">Yükleniyor…</div>
    <div v-else-if="!data.count" class="empty">Bu aralıkta veri yok</div>

    <svg v-else :width="width" :height="HEIGHT" :viewBox="`0 0 ${width} ${HEIGHT}`" role="img"
         :aria-label="`Süre dağılımı: p50 ${formatMs(data.p50Ms)}, p90 ${formatMs(data.p90Ms)}, p99 ${formatMs(data.p99Ms)}`"
         @mousemove="onMove" @mouseleave="hoverIndex = null">
      <line class="base" :x1="PAD.left" :x2="width - PAD.right" :y1="HEIGHT - PAD.bottom" :y2="HEIGHT - PAD.bottom" />
      <g v-for="(b, i) in buckets" :key="b.fromMs">
        <rect class="hit" :x="slotX(i)" :y="PAD.top" :width="slot" :height="HEIGHT - PAD.top - PAD.bottom" :class="{ hover: hoverIndex === i }" />
        <rect v-if="b.count" class="bar" :class="{ over: b.fromMs >= thresholdMs }"
              :x="slotX(i) + slot * 0.09" :y="HEIGHT - PAD.bottom - barH(b.count)" :width="slot * 0.82" :height="barH(b.count)" />
        <rect v-if="b.errorCount" class="bar error"
              :x="slotX(i) + slot * 0.09" :y="HEIGHT - PAD.bottom - Math.max(1, barH(b.errorCount))" :width="slot * 0.82"
              :height="Math.max(1, barH(b.errorCount))" />
        <text v-if="i % labelEvery === 0" class="axis" :x="slotX(i)" :y="HEIGHT - 8" text-anchor="middle">{{ shortMs(b.fromMs) }}</text>
      </g>

      <g v-if="thresholdX !== null">
        <line class="threshold" :x1="thresholdX" :x2="thresholdX" :y1="PAD.top - 4" :y2="HEIGHT - PAD.bottom" />
      </g>
      <g v-for="m in markers" :key="m.label">
        <line class="marker" :x1="m.x" :x2="m.x" :y1="m.y + 3" :y2="HEIGHT - PAD.bottom" />
        <text class="marker-label" :x="m.x" :y="m.y" text-anchor="middle">{{ m.label }}</text>
      </g>
    </svg>

    <div v-if="hovered" class="tooltip" :style="{ left: `${tooltipLeft}px` }">
      <div class="tt-time">{{ rangeText(hovered) }}</div>
      <div class="tt-row">İstek <b>{{ formatInt(hovered.count) }}</b></div>
      <div class="tt-row muted">Toplamın <b>{{ formatPercent(hovered.count / (total || 1)) }}</b></div>
      <div class="tt-row muted">Hatalı <b>{{ formatInt(hovered.errorCount) }}</b></div>
    </div>

    <p v-if="data && data.count" class="how">
      Nasıl okunur: her çubuk bir süre aralığı (solda hızlı, sağda yavaş); yüksekliği o aralıktaki istek sayısı.
      Turuncu çubuklar eşiğin üstünde; kesikli çizgiler isteklerin yarısının (p50), onda dokuzunun (p90) ve yüzde doksan dokuzunun (p99) bittiği süre.
    </p>
    <div v-if="data && data.count" class="legend">
      <span><i class="sw" />Eşik altı</span>
      <span><i class="sw over" />Eşik üstü</span>
      <span><i class="sw error" />Hatalı</span>
      <span><i class="ln" />Eşik</span>
      <span><i class="ln dashed" />p50 / p90 / p99</span>
    </div>
  </div>
</template>

<style scoped>
.histogram { position: relative; padding: 0 16px 14px; }
.summary { font-size: 13px; color: var(--text-secondary); display: flex; flex-direction: column; gap: 6px; }
.summary p { margin: 0; }
.summary b { color: var(--text-primary); font-variant-numeric: tabular-nums; }
.summary b.over { color: var(--status-critical); }
.groups { padding: 6px 10px; border-radius: 6px; background: var(--status-warning-soft); color: var(--text-primary); }
.how { margin: 6px 0 0; font-size: 12px; color: var(--text-muted); }
svg { display: block; max-width: 100%; height: auto; }
.base { stroke: var(--border-strong); stroke-width: 1; }
.hit { fill: transparent; }
.hit.hover { fill: var(--surface-2); }
.bar { fill: var(--accent); }
.bar.over { fill: var(--status-serious); }
.bar.error { fill: var(--status-critical); }
.axis { fill: var(--text-muted); font-size: 10.5px; font-variant-numeric: tabular-nums; }
.threshold { stroke: var(--status-serious); stroke-width: 1.5; }
.marker { stroke: var(--text-secondary); stroke-width: 1; stroke-dasharray: 3 3; }
.marker-label { fill: var(--text-secondary); font-size: 10.5px; font-weight: 600; }
.legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; color: var(--text-secondary); margin-top: 4px; }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.sw { width: 10px; height: 10px; border-radius: 2px; display: inline-block; background: var(--accent); }
.sw.over { background: var(--status-serious); }
.sw.error { background: var(--status-critical); }
.ln { width: 12px; height: 0; border-top: 2px solid var(--status-serious); display: inline-block; }
.ln.dashed { border-top: 1px dashed var(--text-secondary); }
.tooltip {
  position: absolute;
  top: 40px;
  width: 168px;
  pointer-events: none;
  background: var(--surface-1);
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 12px;
  box-shadow: 0 4px 14px rgb(0 0 0 / 0.12);
}
.tt-time { font-weight: 600; margin-bottom: 4px; }
.tt-row { display: flex; align-items: center; gap: 6px; }
.tt-row b { margin-left: auto; font-variant-numeric: tabular-nums; color: var(--text-primary); }
</style>
