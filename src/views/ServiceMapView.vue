<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api, type ServiceMap } from '../api'
import { formatInt, formatMs, formatPercent } from '../format'
import { useTimeRange } from '../timeRange'
import type { Insight } from '../insights'
import RangePicker from '../components/RangePicker.vue'
import InsightList from '../components/InsightList.vue'

/**
 * Servis haritası: görevler, servisler, veritabanları ve aralarındaki çağrılar. Soldan sağa çağrı yönünde dizilir;
 * okun kalınlığı çağrı sayısı, kırmızı ok hata oranı %5 ve üstü.
 */
type MapNode = ServiceMap['nodes'][number]
type MapEdge = ServiceMap['edges'][number]

const router = useRouter()
// Zaman aralığı: hazır aralık ya da özel tarih/saat (RangePicker)
const time = useTimeRange()
const data = ref<ServiceMap | null>(null)
const error = ref<string | null>(null)
const loading = ref(false)
const lastLoaded = ref<Date | null>(null)
const hoverEdge = ref<string | null>(null)

const NODE_W = 220
const NODE_H = 70
const COL_GAP = 180
const ROW_GAP = 30
const PAD = 24

const KIND_LABEL: Record<MapNode['kind'], string> = { service: 'Servis', scheduler: 'Görev uygulaması', database: 'Veritabanı', external: 'Dış hedef (span yok)' }
const KIND_ORDER: Record<MapNode['kind'], number> = { scheduler: 0, service: 1, database: 2, external: 3 }
const STATUS_COLOR: Record<MapNode['status'], string> = { ok: 'var(--status-good)', slow: 'var(--status-serious)', error: 'var(--status-critical)' }

const edgeKey = (e: MapEdge) => `${e.from}→${e.to}`

// Katman = en uzun çağrı yolu (döngü varsa düğüm sayısı kadar turdan sonra durur)
const layout = computed(() => {
  const d = data.value
  if (!d) return null
  const depth = new Map(d.nodes.map(n => [n.id, 0]))
  for (let i = 0; i < d.nodes.length; i++) {
    let changed = false
    for (const e of d.edges) {
      const next = (depth.get(e.from) ?? 0) + 1
      if (e.from !== e.to && next > (depth.get(e.to) ?? 0) && next < d.nodes.length) {
        depth.set(e.to, next)
        changed = true
      }
    }
    if (!changed) break
  }
  const columns: MapNode[][] = []
  for (const n of d.nodes) (columns[depth.get(n.id) ?? 0] ??= []).push(n)
  for (const col of columns) col?.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name))

  const tallest = Math.max(...columns.map(c => c?.length ?? 0))
  const height = PAD * 2 + tallest * NODE_H + (tallest - 1) * ROW_GAP
  const pos = new Map<string, { x: number; y: number }>()
  columns.forEach((col, ci) => {
    if (!col) return
    const colHeight = col.length * NODE_H + (col.length - 1) * ROW_GAP
    col.forEach((n, ri) => pos.set(n.id, { x: PAD + ci * (NODE_W + COL_GAP), y: (height - colHeight) / 2 + ri * (NODE_H + ROW_GAP) }))
  })
  return { pos, width: PAD * 2 + columns.length * NODE_W + (columns.length - 1) * COL_GAP, height }
})

const maxCount = computed(() => Math.max(2, ...(data.value?.edges.map(e => e.count) ?? [])))
const edgeShapes = computed(() => {
  const l = layout.value
  if (!l || !data.value) return []
  return data.value.edges.flatMap(e => {
    const a = l.pos.get(e.from)
    const b = l.pos.get(e.to)
    if (!a || !b) return []
    const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2, x2 = b.x, y2 = b.y + NODE_H / 2
    const dx = Math.max(40, (x2 - x1) / 2)
    return [{
      ...e,
      key: edgeKey(e),
      d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2 - 6},${y2}`,
      mx: (x1 + x2) / 2,
      my: (y1 + y2) / 2,
      width: 1.5 + 3.5 * (Math.log(Math.max(1, e.count)) / Math.log(maxCount.value)),
      bad: e.errorRate >= 0.05
    }]
  })
})

const nodeStats = (n: MapNode) =>
  `${formatInt(n.count)} ${n.kind === 'scheduler' ? 'çalışma' : n.kind === 'service' ? 'istek' : 'çağrı'} · ort ${formatMs(n.avgMs)}${n.errorRate > 0 ? ` · ${formatPercent(n.errorRate)} hata` : ''}`
const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)
const isLink = (n: MapNode) => n.kind === 'service' || n.kind === 'scheduler'
const nodeName = (id: string) => data.value?.nodes.find(n => n.id === id)?.name ?? id

function openNode(n: MapNode) {
  if (!isLink(n)) return
  router.push({ path: `/${n.kind === 'service' ? 'services' : 'schedulers'}/${encodeURIComponent(n.id)}`, query: time.query.value })
}

// Bağlantı satırı: çağıran servisin detayında ilgili sekme (dış çağrılar / DB sorguları)
function openEdge(e: MapEdge) {
  const caller = data.value?.nodes.find(n => n.id === e.from)
  if (!caller || !isLink(caller)) return
  const target = data.value?.nodes.find(n => n.id === e.to)
  router.push({
    path: `/${caller.kind === 'service' ? 'services' : 'schedulers'}/${encodeURIComponent(caller.id)}`,
    query: { ...time.query.value, tab: target?.kind === 'database' ? 'db' : 'call' }
  })
}

const sortedEdges = computed(() => [...(data.value?.edges ?? [])].sort((a, b) => b.count - a.count))

// "Kısaca": en yoğun, en yavaş ve en hatalı bağlantı; sorunlu uygulamalar
const insights = computed<Insight[]>(() => {
  const d = data.value
  if (!d || !d.edges.length) return []
  const edgeName = (e: MapEdge) => `${nodeName(e.from)} → ${nodeName(e.to)}`
  const list: Insight[] = []
  const busiest = sortedEdges.value[0]
  list.push({ tone: 'info', text: `En yoğun bağlantı: ${edgeName(busiest)} — ${formatInt(busiest.count)} çağrı, ortalama ${formatMs(busiest.avgMs)}.` })
  const slowest = [...d.edges].sort((a, b) => b.avgMs - a.avgMs)[0]
  if (slowest !== busiest) list.push({ tone: 'info', text: `En yavaş bağlantı: ${edgeName(slowest)} — ortalama ${formatMs(slowest.avgMs)}, en yavaş yüzde 5 için ${formatMs(slowest.p95Ms)} ve üstü.` })
  const failing = [...d.edges].filter(e => e.errorCount > 0).sort((a, b) => b.errorRate - a.errorRate)[0]
  list.push(failing
    ? { tone: failing.errorRate >= 0.05 ? 'error' : 'slow', text: `Hata oranı en yüksek bağlantı: ${edgeName(failing)} — ${formatInt(failing.errorCount)} hatalı çağrı (oran ${formatPercent(failing.errorRate)}).`, to: undefined }
    : { tone: 'ok', text: 'Hiçbir bağlantıda hata yok.' })
  const bad = d.nodes.filter(n => n.status !== 'ok')
  if (bad.length) list.push({ tone: bad.some(n => n.status === 'error') ? 'error' : 'slow', text: `Dikkat isteyen: ${bad.map(n => `${n.name} (${n.status === 'error' ? 'hata oranı yüksek' : 'yavaş'})`).join(', ')}.`, to: { path: '/issues', query: time.query.value }, linkText: 'sorunlara git' })
  return list
})

async function load() {
  loading.value = true
  try {
    data.value = await api.serviceMap(time.win.value)
    error.value = null
    lastLoaded.value = new Date()
  } catch (e) {
    error.value = `Veriler alınamadı: ${(e as Error).message}`
  } finally {
    loading.value = false
  }
}

watch(() => JSON.stringify(time.win.value), load)
let timer: number | undefined
onMounted(() => {
  load()
  timer = window.setInterval(() => { if (!loading.value) load() }, 30_000)
})
onUnmounted(() => window.clearInterval(timer))
</script>

<template>
  <header class="page-header">
    <div>
      <h1>Servis haritası</h1>
      <p class="muted sub">Kim kimi çağırıyor: okun kalınlığı çağrı sayısı, kırmızı ok hata oranı %5 ve üstü. Bir servise tıklayınca detayı açılır.</p>
    </div>
    <div class="head-right">
      <RangePicker />
      <span v-if="lastLoaded" class="muted small">{{ lastLoaded.toLocaleTimeString('tr-TR') }}</span>
    </div>
  </header>

  <div v-if="error" class="error-box">{{ error }}</div>

  <InsightList :items="insights" />

  <section class="card">
    <div class="legend">
      <span><i class="dot" style="background: var(--status-good)" />Normal</span>
      <span><i class="dot" style="background: var(--status-serious)" />Yavaş</span>
      <span><i class="dot" style="background: var(--status-critical)" />Hatalı</span>
      <span><i class="ln" />Çağrı (kalınlık = sayı)</span>
      <span><i class="ln bad" />Hata oranı %5+</span>
    </div>
    <div v-if="!data" class="empty">Yükleniyor…</div>
    <div v-else-if="!data.nodes.length" class="empty">Bu aralıkta veri yok</div>
    <div v-else-if="layout" class="map-wrap">
      <svg :width="layout.width" :height="layout.height" :viewBox="`0 0 ${layout.width} ${layout.height}`" role="img"
           aria-label="Servis haritası; bağlantıların listesi aşağıdaki tabloda">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" class="arrow-head" />
          </marker>
          <marker id="arrow-bad" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" class="arrow-head bad" />
          </marker>
        </defs>

        <g v-for="e in edgeShapes" :key="e.key" class="edge" :class="{ bad: e.bad, hover: hoverEdge === e.key }"
           @mouseenter="hoverEdge = e.key" @mouseleave="hoverEdge = null">
          <path :d="e.d" class="edge-hit" />
          <path :d="e.d" class="edge-line" :style="{ strokeWidth: e.width }" :marker-end="`url(#${e.bad ? 'arrow-bad' : 'arrow'})`" />
          <text :x="e.mx" :y="e.my - 6" text-anchor="middle" class="edge-label">{{ formatInt(e.count) }} · {{ formatMs(e.avgMs) }}</text>
          <text v-if="e.errorCount" :x="e.mx" :y="e.my + 8" text-anchor="middle" class="edge-label err">{{ formatPercent(e.errorRate) }} hata</text>
        </g>

        <g v-for="n in data.nodes" :key="n.id" class="node" :class="{ link: isLink(n) }"
           :transform="`translate(${layout.pos.get(n.id)!.x},${layout.pos.get(n.id)!.y})`"
           :role="isLink(n) ? 'link' : undefined" :tabindex="isLink(n) ? 0 : undefined"
           :aria-label="isLink(n) ? `${n.name} detayına git` : undefined"
           @click="openNode(n)" @keydown.enter="openNode(n)">
          <title>{{ n.name }}</title>
          <rect class="box" :width="NODE_W" :height="NODE_H" rx="8" />
          <rect class="stripe" width="4" :height="NODE_H" rx="2" :style="{ fill: STATUS_COLOR[n.status] }" />
          <text x="16" y="24" class="name">{{ truncate(n.name, 24) }}</text>
          <text x="16" y="42" class="kind">{{ KIND_LABEL[n.kind] }}</text>
          <text x="16" y="59" class="stats">{{ nodeStats(n) }}</text>
        </g>
      </svg>
    </div>
  </section>

  <section v-if="data && data.edges.length" class="card section">
    <div class="card-header">
      <h2>Bağlantılar <span class="muted count">{{ data.edges.length }}</span></h2>
      <span class="muted small">satıra tıklayınca çağıran servisin ilgili sekmesi açılır</span>
    </div>
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            <th>Çağıran</th>
            <th>Çağrılan</th>
            <th class="num">Çağrı</th>
            <th class="num">Ortalama</th>
            <th class="num">p95</th>
            <th class="num">Hata</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in sortedEdges" :key="edgeKey(e)" class="clickable" @click="openEdge(e)">
            <td class="mono">{{ nodeName(e.from) }}</td>
            <td class="mono">{{ nodeName(e.to) }}</td>
            <td class="num">{{ formatInt(e.count) }}</td>
            <td class="num">{{ formatMs(e.avgMs) }}</td>
            <td class="num">{{ formatMs(e.p95Ms) }}</td>
            <td class="num" :class="{ over: e.errorRate >= 0.05 }">
              {{ formatInt(e.errorCount) }} <span class="muted pct">{{ formatPercent(e.errorRate) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
.sub { margin: 2px 0 0; }
.head-right { display: flex; align-items: center; gap: 10px; }
.small { font-size: 12px; }
.count { font-weight: 400; font-size: 13px; margin-left: 6px; }
.section { margin-top: 16px; scroll-margin-top: 16px; }
.over { color: var(--status-critical); font-weight: 600; }
.pct { font-size: 11px; margin-left: 4px; }

.legend { display: flex; flex-wrap: wrap; gap: 4px 16px; padding: 14px 16px 4px; font-size: 12px; color: var(--text-secondary); }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.ln { width: 16px; height: 0; border-top: 2px solid var(--border-strong); display: inline-block; }
.ln.bad { border-top-color: var(--status-critical); }
.map-wrap { overflow-x: auto; padding: 0 0 8px; }
svg { display: block; margin: 0 auto; }

.edge-hit { fill: none; stroke: transparent; stroke-width: 14; }
.edge-line { fill: none; stroke: var(--border-strong); }
.edge.bad .edge-line { stroke: var(--status-critical); }
.edge.hover .edge-line { stroke: var(--accent); }
.arrow-head { fill: var(--border-strong); }
.arrow-head.bad { fill: var(--status-critical); }
.edge-label {
  font-size: 11px;
  fill: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  paint-order: stroke;
  stroke: var(--surface-1);
  stroke-width: 4px;
  stroke-linejoin: round;
}
.edge-label.err { fill: var(--status-critical); font-weight: 600; }

.box { fill: var(--surface-1); stroke: var(--border-strong); stroke-width: 1; }
.node.link { cursor: pointer; }
.node.link:hover .box, .node.link:focus-visible .box { fill: var(--surface-2); stroke: var(--accent); }
.node:focus { outline: none; }
.name { font-family: var(--mono); font-size: 13px; font-weight: 600; fill: var(--text-primary); }
.kind { font-size: 11px; fill: var(--text-muted); }
.stats { font-size: 11px; fill: var(--text-secondary); font-variant-numeric: tabular-nums; }
</style>
