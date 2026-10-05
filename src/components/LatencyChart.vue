<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { TimeBucket } from '../api'
import { formatInt, formatMs, formatTime, parseUtc } from '../format'

const props = defineProps<{ buckets: TimeBucket[]; thresholdMs: number }>()

const HEIGHT = 240
const PAD = { top: 16, right: 64, bottom: 28, left: 56 }

const root = ref<HTMLDivElement>()
const width = ref(800)
const hoverIndex = ref<number | null>(null)
let observer: ResizeObserver | undefined

onMounted(() => {
  observer = new ResizeObserver(([entry]) => (width.value = Math.max(320, entry.contentRect.width)))
  if (root.value) observer.observe(root.value)
})
onUnmounted(() => observer?.disconnect())

const series = [
  { key: 'avgMs' as const, label: 'Ortalama', color: 'var(--series-1)' },
  { key: 'p95Ms' as const, label: 'p95', color: 'var(--series-2)' }
]

const points = computed(() => props.buckets.map(b => ({ ...b, t: parseUtc(b.time).getTime() })))

const scales = computed(() => {
  const pts = points.value
  const innerW = width.value - PAD.left - PAD.right
  const innerH = HEIGHT - PAD.top - PAD.bottom
  const tMin = pts.length ? pts[0].t : 0
  const tMax = pts.length > 1 ? pts[pts.length - 1].t : tMin + 1
  const yMaxRaw = Math.max(props.thresholdMs * 1.2, ...pts.map(p => p.p95Ms), 1)
  const yTicks = niceTicks(yMaxRaw, 4)
  const yMax = yTicks[yTicks.length - 1]
  return {
    x: (t: number) => PAD.left + ((t - tMin) / (tMax - tMin || 1)) * innerW,
    y: (v: number) => PAD.top + innerH - (v / yMax) * innerH,
    yTicks,
    innerW,
    innerH,
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

// Ardışık bucket'lar arasındaki en küçük fark = bucket boyu. Bundan büyük boşlukta çizgi kesilir.
const bucketMs = computed(() => {
  const pts = points.value
  let min = Infinity
  for (let i = 1; i < pts.length; i++) min = Math.min(min, pts[i].t - pts[i - 1].t)
  return min
})

const paths = computed(() =>
  series.map(s => ({
    ...s,
    d: points.value
      .map((p, i) => {
        const gap = i > 0 && p.t - points.value[i - 1].t > bucketMs.value * 1.5
        return `${i === 0 || gap ? 'M' : 'L'}${scales.value.x(p.t).toFixed(1)},${scales.value.y(p[s.key]).toFixed(1)}`
      })
      .join(' '),
    last: points.value[points.value.length - 1]
  }))
)

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
const tooltipLeft = computed(() => {
  if (!hovered.value) return 0
  const x = scales.value.x(hovered.value.t)
  return x > width.value - 200 ? x - 188 : x + 12
})
</script>

<template>
  <div ref="root" class="chart">
    <div class="legend">
      <span v-for="s in series" :key="s.key" class="legend-item">
        <span class="swatch" :style="{ background: s.color }" />{{ s.label }}
      </span>
      <span class="legend-item"><span class="swatch dashed" />Eşik ({{ formatMs(thresholdMs) }})</span>
    </div>

    <div v-if="!buckets.length" class="empty">Bu aralıkta veri yok</div>

    <svg v-else :width="width" :height="HEIGHT" :viewBox="`0 0 ${width} ${HEIGHT}`" role="img" aria-label="Yanıt süresi zaman grafiği"
         @mousemove="onMove" @mouseleave="hoverIndex = null">
      <g class="grid">
        <line v-for="t in scales.yTicks" :key="t" :x1="PAD.left" :x2="width - PAD.right"
              :y1="scales.y(t)" :y2="scales.y(t)" />
      </g>
      <g class="axis">
        <text v-for="t in scales.yTicks" :key="`y${t}`" :x="PAD.left - 8" :y="scales.y(t) + 4" text-anchor="end">
          {{ formatMs(t) }}
        </text>
        <text v-for="p in xTicks" :key="`x${p.t}`" :x="scales.x(p.t)" :y="HEIGHT - 8" text-anchor="middle">
          {{ p.label }}
        </text>
      </g>

      <line class="threshold" :x1="PAD.left" :x2="width - PAD.right"
            :y1="scales.y(thresholdMs)" :y2="scales.y(thresholdMs)" />

      <path v-for="p in paths" :key="p.key" :d="p.d" class="line" :style="{ stroke: p.color }" />

      <text v-for="l in endLabels" :key="l.label" class="end-label" :x="width - PAD.right + 8" :y="l.y + 4">
        {{ l.label }}
      </text>

      <g v-if="hovered">
        <line class="crosshair" :x1="scales.x(hovered.t)" :x2="scales.x(hovered.t)"
              :y1="PAD.top" :y2="HEIGHT - PAD.bottom" />
        <circle v-for="s in series" :key="s.key" :cx="scales.x(hovered.t)" :cy="scales.y(hovered[s.key])"
                r="4.5" class="dot" :style="{ fill: s.color }" />
      </g>
    </svg>

    <div v-if="hovered" class="tooltip" :style="{ left: `${tooltipLeft}px` }">
      <div class="tt-time">{{ formatTime(hovered.time) }}</div>
      <div v-for="s in series" :key="s.key" class="tt-row">
        <span class="swatch" :style="{ background: s.color }" />{{ s.label }}
        <b>{{ formatMs(hovered[s.key]) }}</b>
      </div>
      <div class="tt-row muted">İstek <b>{{ formatInt(hovered.count) }}</b></div>
      <div class="tt-row muted">Eşiği aşan <b>{{ formatInt(hovered.slowCount) }}</b></div>
      <div class="tt-row muted">Hatalı <b>{{ formatInt(hovered.errorCount) }}</b></div>
    </div>
  </div>
</template>

<style scoped>
.chart { position: relative; padding: 0 8px 8px; }
.legend {
  display: flex;
  gap: 16px;
  padding: 0 8px 8px;
  font-size: 12px;
  color: var(--text-secondary);
}
.legend-item { display: inline-flex; align-items: center; gap: 6px; }
.swatch { width: 12px; height: 3px; border-radius: 2px; display: inline-block; }
.swatch.dashed {
  background: repeating-linear-gradient(90deg, var(--text-secondary) 0 4px, transparent 4px 7px);
}
/* Genişlik ölçülene kadar (ilk çizim, gizli sekme) kutusundan taşmasın; viewBox ile orantılı küçülür */
svg { display: block; max-width: 100%; height: auto; }
.grid line { stroke: var(--grid); stroke-width: 1; }
.axis text { fill: var(--text-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.threshold { stroke: var(--text-secondary); stroke-width: 1.5; stroke-dasharray: 5 4; }
.line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.end-label { fill: var(--text-secondary); font-size: 11px; font-weight: 500; }
.crosshair { stroke: var(--border-strong); stroke-width: 1; }
.dot { stroke: var(--surface-1); stroke-width: 2; }
.tooltip {
  position: absolute;
  top: 36px;
  width: 176px;
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
