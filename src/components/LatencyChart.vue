<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { TimeBucket } from '../api'
import { formatInt, formatMs, formatPercent, formatTime, parseUtc } from '../format'

/**
 * Yanıt süresi grafiği. Üstte süre çizgileri (ortalama ve seçilebilir p50/p90/p95/p99, eşik, önceki dönem),
 * altta aynı zaman ekseninde istek sayısı ve hatalı istek çubukları: "yük artınca mı yavaşlıyor?" tek bakışta görünür.
 */
const props = defineProps<{
  buckets: TimeBucket[]
  thresholdMs: number
  /** Önceki dönem, seçili döneme kaydırılmış (ranges.shiftBuckets); ortalaması kesikli çizilir */
  previous?: TimeBucket[]
  /** Tıklanınca o aralığın istekleri istenir */
  drillable?: boolean
}>()
const emit = defineEmits<{ select: [window: { from: string; to: string }] }>()

const HEIGHT = 300
const PAD = { top: 16, right: 64, left: 56 }
const MAIN_BOTTOM = 206
const VOL_TOP = 224
const VOL_BOTTOM = 270
const X_LABEL_Y = 290

type SeriesKey = 'avgMs' | 'p50Ms' | 'p90Ms' | 'p95Ms' | 'p99Ms'
const SERIES: { key: SeriesKey; label: string; color: string }[] = [
  { key: 'avgMs', label: 'Ortalama', color: 'var(--series-1)' },
  { key: 'p50Ms', label: 'p50', color: 'var(--series-3)' },
  { key: 'p90Ms', label: 'p90', color: 'var(--series-4)' },
  { key: 'p95Ms', label: 'p95', color: 'var(--series-2)' },
  { key: 'p99Ms', label: 'p99', color: 'var(--series-5)' }
]

// Seçilen çizgiler tarayıcıda hatırlanır (tüm sayfalarda aynı)
const STORAGE_KEY = 'tracelens.chartSeries'
function loadVisible(): Set<SeriesKey> {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as SeriesKey[] | null
    if (Array.isArray(saved) && saved.length) return new Set(saved.filter(k => SERIES.some(s => s.key === k)))
  } catch { /* yoksa varsayılan */ }
  return new Set<SeriesKey>(['avgMs', 'p95Ms'])
}
const visible = ref(loadVisible())
const showPrevious = ref(true)

function toggle(key: SeriesKey) {
  const next = new Set(visible.value)
  if (next.has(key)) {
    if (next.size === 1) return // en az bir çizgi kalsın
    next.delete(key)
  } else next.add(key)
  visible.value = next
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...next])) } catch { /* depolama kapalı */ }
}
const shownSeries = computed(() => SERIES.filter(s => visible.value.has(s.key)))

const root = ref<HTMLDivElement>()
const width = ref(800)
const hoverIndex = ref<number | null>(null)
let observer: ResizeObserver | undefined

onMounted(() => {
  observer = new ResizeObserver(([entry]) => (width.value = Math.max(320, entry.contentRect.width)))
  if (root.value) observer.observe(root.value)
})
onUnmounted(() => observer?.disconnect())

const points = computed(() => props.buckets.map(b => ({ ...b, t: parseUtc(b.time).getTime() })))

// Ardışık bucket'lar arasındaki en küçük fark = bucket boyu. Bundan büyük boşlukta çizgi kesilir.
const bucketMs = computed(() => {
  const pts = points.value
  let min = Infinity
  for (let i = 1; i < pts.length; i++) min = Math.min(min, pts[i].t - pts[i - 1].t)
  return Number.isFinite(min) ? min : 60_000
})

const previousPoints = computed(() => {
  const pts = points.value
  if (!props.previous?.length || !pts.length) return []
  const tMin = pts[0].t - bucketMs.value / 2
  const tMax = pts[pts.length - 1].t + bucketMs.value / 2
  return props.previous.map(b => ({ ...b, t: parseUtc(b.time).getTime() })).filter(p => p.t >= tMin && p.t <= tMax)
})
const previousShown = computed(() => showPrevious.value && previousPoints.value.length > 0)

const scales = computed(() => {
  const pts = points.value
  const innerW = width.value - PAD.left - PAD.right
  const tMin = pts.length ? pts[0].t : 0
  const tMax = pts.length > 1 ? pts[pts.length - 1].t : tMin + 1
  const values = pts.flatMap(p => shownSeries.value.map(s => p[s.key]))
  if (previousShown.value) values.push(...previousPoints.value.map(p => p.avgMs))
  const yTicks = niceTicks(Math.max(props.thresholdMs * 1.2, ...values, 1), 4)
  const yMax = yTicks[yTicks.length - 1]
  const countMax = Math.max(1, ...pts.map(p => p.count))
  return {
    x: (t: number) => PAD.left + ((t - tMin) / (tMax - tMin || 1)) * innerW,
    y: (v: number) => MAIN_BOTTOM - (v / yMax) * (MAIN_BOTTOM - PAD.top),
    vy: (count: number) => (count / countMax) * (VOL_BOTTOM - VOL_TOP),
    yTicks,
    countMax,
    innerW,
    tMin,
    tMax
  }
})

function niceTicks(max: number, count: number): number[] {
  const rawStep = max / count
  const mag = 10 ** Math.floor(Math.log10(rawStep))
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= rawStep) ?? rawStep
  const ticks: number[] = []
  for (let v = 0; v <= max + step * 0.999; v += step) ticks.push(Math.round(v * 1000) / 1000)
  return ticks
}

// Zaman ekseni düzenli aralıklara oturur (1, 2, 5, 10, 15, 30 dk, 1 sa ...).
const TICK_MINUTES = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440, 2880]
const xTicks = computed(() => {
  const { tMin, tMax, innerW } = scales.value
  if (points.value.length < 2) return points.value.map(p => ({ t: p.t, label: formatTime(p.time).slice(0, 5) }))
  const target = Math.max(2, Math.floor(innerW / 90))
  const minutes = TICK_MINUTES.find(m => (tMax - tMin) / (m * 60_000) <= target) ?? 2880
  const step = minutes * 60_000
  const ticks: { t: number; label: string }[] = []
  for (let t = Math.ceil(tMin / step) * step; t <= tMax; t += step) {
    const d = new Date(t)
    const label = minutes >= 1440
      ? d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })
      : d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    ticks.push({ t, label })
  }
  return ticks
})

function linePath(pts: { t: number; v: number }[]) {
  return pts
    .map((p, i) => {
      const gap = i > 0 && p.t - pts[i - 1].t > bucketMs.value * 1.5
      return `${i === 0 || gap ? 'M' : 'L'}${scales.value.x(p.t).toFixed(1)},${scales.value.y(p.v).toFixed(1)}`
    })
    .join(' ')
}

const paths = computed(() =>
  shownSeries.value.map(s => ({
    ...s,
    d: linePath(points.value.map(p => ({ t: p.t, v: p[s.key] }))),
    last: points.value[points.value.length - 1]
  }))
)
const previousPath = computed(() =>
  previousShown.value ? linePath(previousPoints.value.map(p => ({ t: p.t, v: p.avgMs }))) : '')

// Hacim çubukları: aralık genişliğinin %70'i, en az 1.5px
const barWidth = computed(() => {
  const { tMin, tMax, innerW } = scales.value
  const slots = Math.max(1, (tMax - tMin) / bucketMs.value + 1)
  return Math.max(1.5, Math.min(14, (innerW / slots) * 0.7))
})

// Sağ uçtaki etiketler çakışmasın diye en az 14px aralık bırakılır.
const endLabels = computed(() => {
  const labels = paths.value
    .filter(p => p.last)
    .map(p => ({ label: p.label, color: p.color, y: scales.value.y(p.last![p.key]) }))
    .sort((a, b) => a.y - b.y)
  for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 14)
  return labels
})

function onMove(event: MouseEvent) {
  const pts = points.value
  if (!pts.length) return
  const rect = (event.currentTarget as SVGElement).getBoundingClientRect()
  // Grafik kutuya sığdırmak için küçültülmüşse fare konumunu çizim koordinatına çevir
  const x = (event.clientX - rect.left) * (width.value / (rect.width || width.value))
  let best = 0
  for (let i = 1; i < pts.length; i++) {
    if (Math.abs(scales.value.x(pts[i].t) - x) < Math.abs(scales.value.x(pts[best].t) - x)) best = i
  }
  hoverIndex.value = best
}

const hovered = computed(() => (hoverIndex.value === null ? null : points.value[hoverIndex.value]))
const hoveredPrevious = computed(() => {
  const h = hovered.value
  if (!h || !previousShown.value) return null
  return previousPoints.value.find(p => Math.abs(p.t - h.t) < bucketMs.value / 2) ?? null
})
const tooltipLeft = computed(() => {
  if (!hovered.value) return 0
  const x = scales.value.x(hovered.value.t)
  return x > width.value - 210 ? x - 198 : x + 12
})

// Grafiğin altındaki düz cümleler: en yavaş an, eşiğin üstünde kalınan süre, en yoğun an, önceki dönemle fark
const daily = computed(() => bucketMs.value >= 86_400_000)
const when = (p: { time: string }) =>
  daily.value ? parseUtc(p.time).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', weekday: 'short' }) : formatTime(p.time).slice(0, 5)

const facts = computed(() => {
  const pts = points.value.filter(p => p.count > 0)
  if (!pts.length) return []
  const list: string[] = []
  const peak = pts.reduce((a, b) => (b.avgMs > a.avgMs ? b : a))
  list.push(`En yavaş ${daily.value ? 'gün' : 'an'}: ${when(peak)} — ortalama ${formatMs(peak.avgMs)}.`)
  const over = pts.filter(p => p.avgMs > props.thresholdMs).length
  list.push(over === 0
    ? 'Ortalama hiç eşiği aşmadı.'
    : over === pts.length ? 'Ortalama baştan sona eşiğin üstündeydi.'
    : `Ortalama, ${daily.value ? 'günlerin' : 'sürenin'} ${formatPercent(over / pts.length)} kadarında eşiğin üstündeydi.`)
  const busiest = pts.reduce((a, b) => (b.count > a.count ? b : a))
  list.push(`En yoğun ${daily.value ? 'gün' : 'an'}: ${when(busiest)} — ${formatInt(busiest.count)} istek${busiest.errorCount ? `, ${formatInt(busiest.errorCount)} hatalı` : ''}.`)
  if (previousShown.value) {
    const avg = (list: TimeBucket[]) => {
      const n = list.reduce((s, p) => s + p.count, 0)
      return n ? list.reduce((s, p) => s + p.avgMs * p.count, 0) / n : 0
    }
    const prev = avg(previousPoints.value)
    const cur = avg(pts)
    if (prev) {
      const change = (cur - prev) / prev
      list.push(Math.abs(change) < 0.05
        ? 'Önceki dönemle (kesikli çizgi) ortalama hemen hemen aynı.'
        : `Önceki döneme (kesikli çizgi) göre ortalama %${Math.round(Math.abs(change) * 100)} daha ${change > 0 ? 'yavaş' : 'hızlı'}.`)
    }
  }
  return list
})

function onClick() {
  if (!props.drillable || !hovered.value) return
  const from = hovered.value.t
  emit('select', { from: new Date(from).toISOString(), to: new Date(from + bucketMs.value).toISOString() })
}
</script>

<template>
  <div ref="root" class="chart">
    <div class="legend">
      <button v-for="s in SERIES" :key="s.key" type="button" class="legend-item toggle" :aria-pressed="visible.has(s.key)"
              :title="visible.has(s.key) ? `${s.label} çizgisini gizle` : `${s.label} çizgisini göster`" @click="toggle(s.key)">
        <span class="swatch" :style="{ background: s.color }" />{{ s.label }}
      </button>
      <button v-if="previous?.length" type="button" class="legend-item toggle" :aria-pressed="showPrevious"
              title="Bir önceki eşit uzunluktaki dönemin ortalaması" @click="showPrevious = !showPrevious">
        <span class="swatch dashed prev" />Önceki dönem (ort.)
      </button>
      <span class="legend-item"><span class="swatch dashed" />Eşik ({{ formatMs(thresholdMs) }})</span>
      <span class="legend-item"><span class="block" />İstek sayısı</span>
      <span class="legend-item"><span class="block error" />Hatalı</span>
      <span v-if="drillable && buckets.length" class="legend-hint muted">Bir noktaya tıklayınca o aralığın istekleri listelenir</span>
    </div>

    <div v-if="!buckets.length" class="empty">Bu aralıkta veri yok</div>

    <svg v-else :width="width" :height="HEIGHT" :viewBox="`0 0 ${width} ${HEIGHT}`" role="img"
         aria-label="Yanıt süresi ve istek sayısı zaman grafiği" :class="{ drillable }"
         @mousemove="onMove" @mouseleave="hoverIndex = null" @click="onClick">
      <g class="grid">
        <line v-for="t in scales.yTicks" :key="t" :x1="PAD.left" :x2="width - PAD.right"
              :y1="scales.y(t)" :y2="scales.y(t)" />
        <line :x1="PAD.left" :x2="width - PAD.right" :y1="VOL_BOTTOM" :y2="VOL_BOTTOM" />
      </g>
      <g class="axis">
        <text v-for="t in scales.yTicks" :key="`y${t}`" :x="PAD.left - 8" :y="scales.y(t) + 4" text-anchor="end">
          {{ formatMs(t) }}
        </text>
        <text :x="PAD.left - 8" :y="VOL_TOP + 8" text-anchor="end">{{ formatInt(scales.countMax) }}</text>
        <text :x="PAD.left - 8" :y="VOL_BOTTOM" text-anchor="end">0</text>
        <text v-for="p in xTicks" :key="`x${p.t}`" :x="scales.x(p.t)" :y="X_LABEL_Y" text-anchor="middle">
          {{ p.label }}
        </text>
      </g>

      <!-- Hacim: istek sayısı, altında hatalı kısmı kırmızı -->
      <g class="volume">
        <g v-for="p in points" :key="`v${p.t}`">
          <rect class="bar" :x="scales.x(p.t) - barWidth / 2" :y="VOL_BOTTOM - scales.vy(p.count)" :width="barWidth" :height="scales.vy(p.count)" />
          <rect v-if="p.errorCount" class="bar error" :x="scales.x(p.t) - barWidth / 2" :y="VOL_BOTTOM - scales.vy(p.errorCount)"
                :width="barWidth" :height="Math.max(1, scales.vy(p.errorCount))" />
        </g>
      </g>

      <line class="threshold" :x1="PAD.left" :x2="width - PAD.right"
            :y1="scales.y(thresholdMs)" :y2="scales.y(thresholdMs)" />

      <path v-if="previousPath" :d="previousPath" class="line previous" />
      <path v-for="p in paths" :key="p.key" :d="p.d" class="line" :style="{ stroke: p.color }" />

      <text v-for="l in endLabels" :key="l.label" class="end-label" :x="width - PAD.right + 8" :y="l.y + 4">
        {{ l.label }}
      </text>

      <g v-if="hovered">
        <line class="crosshair" :x1="scales.x(hovered.t)" :x2="scales.x(hovered.t)" :y1="PAD.top" :y2="VOL_BOTTOM" />
        <circle v-for="s in shownSeries" :key="s.key" :cx="scales.x(hovered.t)" :cy="scales.y(hovered[s.key])"
                r="4.5" class="dot" :style="{ fill: s.color }" />
      </g>
    </svg>

    <div v-if="hovered" class="tooltip" :style="{ left: `${tooltipLeft}px` }">
      <div class="tt-time">{{ formatTime(hovered.time) }}</div>
      <div v-for="s in shownSeries" :key="s.key" class="tt-row">
        <span class="swatch" :style="{ background: s.color }" />{{ s.label }}
        <b>{{ formatMs(hovered[s.key]) }}</b>
      </div>
      <div v-if="hoveredPrevious" class="tt-row muted"><span class="swatch dashed prev" />Önceki dönem <b>{{ formatMs(hoveredPrevious.avgMs) }}</b></div>
      <div class="tt-row muted">İstek <b>{{ formatInt(hovered.count) }}</b></div>
      <div class="tt-row muted">Eşiği aşan <b>{{ formatInt(hovered.slowCount) }}</b></div>
      <div class="tt-row muted">Hatalı <b>{{ formatInt(hovered.errorCount) }}</b></div>
      <div v-if="drillable" class="tt-hint">Tıkla: bu aralığın istekleri →</div>
    </div>

    <div v-if="buckets.length" class="notes">
      <p class="how">
        Nasıl okunur: çizgiler isteklerin ne kadar sürdüğünü, alttaki çubuklar {{ daily ? 'o gün' : 'o anda' }} kaç istek geldiğini gösterir.
        Kesikli yatay çizgi eşik: çizgi onun üstündeyse istekler yavaş.
      </p>
      <p class="facts">{{ facts.join(' ') }}</p>
    </div>
  </div>
</template>

<style scoped>
.chart { position: relative; padding: 0 8px 8px; }
.legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 14px;
  padding: 0 8px 8px;
  font-size: 12px;
  color: var(--text-secondary);
}
.legend-item { display: inline-flex; align-items: center; gap: 6px; }
.legend-hint { margin-left: auto; font-size: 11.5px; }
/* Çizgi seçimi: açıkken normal, kapalıyken soluk */
.toggle { border: none; background: none; padding: 2px 0; font: inherit; color: inherit; cursor: pointer; }
.toggle[aria-pressed="false"] { opacity: 0.45; }
.toggle:hover { color: var(--text-primary); }
.swatch { width: 12px; height: 3px; border-radius: 2px; display: inline-block; }
.swatch.dashed {
  background: repeating-linear-gradient(90deg, var(--text-secondary) 0 4px, transparent 4px 7px);
}
.swatch.dashed.prev {
  background: repeating-linear-gradient(90deg, var(--text-muted) 0 2px, transparent 2px 4px);
}
.block { width: 10px; height: 10px; border-radius: 2px; display: inline-block; background: var(--accent); opacity: 0.3; }
.block.error { background: var(--status-critical); opacity: 1; }
/* Genişlik ölçülene kadar (ilk çizim, gizli sekme) kutusundan taşmasın; viewBox ile orantılı küçülür */
svg { display: block; max-width: 100%; height: auto; }
svg.drillable { cursor: pointer; }
.grid line { stroke: var(--grid); stroke-width: 1; }
.axis text { fill: var(--text-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.threshold { stroke: var(--text-secondary); stroke-width: 1.5; stroke-dasharray: 5 4; }
.line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.line.previous { stroke: var(--text-muted); stroke-width: 1.5; stroke-dasharray: 2 3; }
.bar { fill: var(--accent); opacity: 0.3; }
.bar.error { fill: var(--status-critical); opacity: 1; }
.end-label { fill: var(--text-secondary); font-size: 11px; font-weight: 500; }
.crosshair { stroke: var(--border-strong); stroke-width: 1; }
.dot { stroke: var(--surface-1); stroke-width: 2; }
.tooltip {
  position: absolute;
  top: 36px;
  width: 186px;
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
.tt-hint { margin-top: 4px; color: var(--accent); font-size: 11.5px; }
.notes { padding: 4px 8px 6px; display: flex; flex-direction: column; gap: 4px; }
.notes p { margin: 0; }
.how { font-size: 12px; color: var(--text-muted); }
.facts { font-size: 13px; color: var(--text-secondary); }
</style>
