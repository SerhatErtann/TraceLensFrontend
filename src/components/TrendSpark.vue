<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { formatMs, formatTime } from '../format'

/**
 * Servis kartındaki küçük süre grafiği. Sadece "inip çıkıyor" demesin diye:
 * kesikli eşik çizgisi (üstü kırmızı), en yüksek değer, zaman etiketleri ve üzerine gelince değer.
 */
const props = defineProps<{
  values: (number | null)[]
  thresholdMs: number
  from: string
  bucketSeconds: number
  rangeLabel: string
}>()

const W = 260
const H = 64
const PAD = { top: 12, bottom: 14, left: 2, right: 2 }
const clipId = `over-${useId()}`
const hover = ref<number | null>(null)

const present = computed(() => props.values.filter((v): v is number => v !== null))
const maxVal = computed(() => (present.value.length ? Math.max(...present.value) : 0))
const yMax = computed(() => Math.max(maxVal.value, props.thresholdMs) * 1.15 || 1)

const x = (i: number) => PAD.left + (i / Math.max(1, props.values.length - 1)) * (W - PAD.left - PAD.right)
const y = (v: number) => PAD.top + (1 - v / yMax.value) * (H - PAD.top - PAD.bottom)
const baseline = H - PAD.bottom
const thresholdY = computed(() => y(props.thresholdMs))

// Boş aralıklarda çizgi kesilir
const segments = computed(() => {
  const segs: { line: string; area: string }[] = []
  let pts: [number, number][] = []
  const flush = () => {
    if (pts.length) {
      const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
      const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${baseline} L${pts[0][0].toFixed(1)},${baseline} Z`
      segs.push({ line, area })
    }
    pts = []
  }
  props.values.forEach((v, i) => (v === null ? flush() : pts.push([x(i), y(v)])))
  flush()
  return segs
})

const peakIndex = computed(() => props.values.findIndex(v => v === maxVal.value))
const lastIndex = computed(() => {
  for (let i = props.values.length - 1; i >= 0; i--) if (props.values[i] !== null) return i
  return -1
})

function onMove(e: PointerEvent) {
  const rect = (e.currentTarget as SVGElement).getBoundingClientRect()
  const rel = ((e.clientX - rect.left) / rect.width) * W
  const i = Math.round(((rel - PAD.left) / (W - PAD.left - PAD.right)) * (props.values.length - 1))
  hover.value = Math.min(props.values.length - 1, Math.max(0, i))
}

const hoverTime = computed(() => {
  if (hover.value === null) return ''
  const start = new Date(new Date(props.from).getTime() + hover.value * props.bucketSeconds * 1000)
  return formatTime(start.toISOString()).slice(0, 5)
})
const hoverValue = computed(() => (hover.value === null ? null : props.values[hover.value]))
const tooltipLeft = computed(() => (hover.value === null ? 0 : Math.min(78, Math.max(0, (x(hover.value) / W) * 100 - 11))))
</script>

<template>
  <div class="trend">
    <div class="caption">
      <span>Ortalama süre · {{ rangeLabel }}</span>
      <span v-if="present.length" class="peak" :class="{ over: maxVal > thresholdMs }">en yüksek {{ formatMs(maxVal) }}</span>
    </div>
    <div class="plot">
      <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" role="img"
           :aria-label="`Ortalama süre grafiği, en yüksek ${formatMs(maxVal)}, eşik ${formatMs(thresholdMs)}`"
           @pointermove="onMove" @pointerleave="hover = null">
        <defs>
          <clipPath :id="clipId"><rect x="0" y="0" :width="W" :height="Math.max(0, thresholdY)" /></clipPath>
        </defs>
        <line class="base" :x1="0" :x2="W" :y1="baseline" :y2="baseline" />
        <g v-for="(s, i) in segments" :key="i">
          <path :d="s.area" class="area" />
          <path :d="s.line" class="line" />
          <!-- Eşiğin üstünde kalan kısım kırmızı -->
          <path :d="s.line" class="line over" :clip-path="`url(#${clipId})`" />
        </g>
        <line class="threshold" :x1="0" :x2="W" :y1="thresholdY" :y2="thresholdY" />
        <circle v-if="peakIndex >= 0" :cx="x(peakIndex)" :cy="y(maxVal)" r="2.6"
                :class="maxVal > thresholdMs ? 'dot-over' : 'dot'" />
        <circle v-if="lastIndex >= 0" :cx="x(lastIndex)" :cy="y(values[lastIndex]!)" r="3"
                :class="values[lastIndex]! > thresholdMs ? 'dot-over' : 'dot'" />
        <g v-if="hover !== null">
          <line class="cross" :x1="x(hover)" :x2="x(hover)" :y1="PAD.top - 4" :y2="baseline" />
          <circle v-if="hoverValue !== null" :cx="x(hover)" :cy="y(hoverValue)" r="3.4" class="dot-hover" />
        </g>
      </svg>
      <span class="thr-label" :style="{ top: `${(thresholdY / H) * 100}%` }">eşik {{ formatMs(thresholdMs) }}</span>
      <div v-if="hover !== null" class="tip" :style="{ left: `${tooltipLeft}%` }">
        {{ hoverTime }} · <b>{{ hoverValue === null ? 'istek yok' : formatMs(hoverValue) }}</b>
      </div>
    </div>
    <div class="axis"><span>{{ rangeLabel }} önce</span><span>şimdi</span></div>
  </div>
</template>

<style scoped>
.trend { display: flex; flex-direction: column; gap: 2px; }
.caption { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; color: var(--text-muted); }
.peak { font-variant-numeric: tabular-nums; }
.peak.over { color: var(--status-critical); font-weight: 600; }
.plot { position: relative; }
svg { display: block; width: 100%; height: 64px; overflow: visible; touch-action: none; }
.base { stroke: var(--grid); stroke-width: 1; vector-effect: non-scaling-stroke; }
.area { fill: var(--accent); opacity: 0.1; }
.line { fill: none; stroke: var(--accent); stroke-width: 2; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
.line.over { stroke: var(--status-critical); }
.threshold { stroke: var(--text-secondary); stroke-width: 1; stroke-dasharray: 4 3; vector-effect: non-scaling-stroke; }
.dot { fill: var(--accent); }
.dot-over { fill: var(--status-critical); }
.dot-hover { fill: var(--surface-1); stroke: var(--text-primary); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.cross { stroke: var(--border-strong); stroke-width: 1; vector-effect: non-scaling-stroke; }
.thr-label {
  position: absolute;
  right: 0;
  transform: translateY(-115%);
  font-size: 10px;
  color: var(--text-secondary);
  background: var(--surface-1);
  padding: 0 3px;
  border-radius: 3px;
  pointer-events: none;
}
.tip {
  position: absolute;
  top: -24px;
  white-space: nowrap;
  font-size: 11.5px;
  background: var(--text-primary);
  color: var(--surface-1);
  padding: 2px 7px;
  border-radius: 4px;
  pointer-events: none;
}
.axis { display: flex; justify-content: space-between; font-size: 10.5px; color: var(--text-muted); }
</style>
