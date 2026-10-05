<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SpanNode } from '../api'
import { formatMs } from '../format'

const props = defineProps<{
  spans: SpanNode[]
  totalMs: number
  colorOf: (service: string) => string
  selectedId: string | null
}>()
const emit = defineEmits<{ select: [spanId: string] }>()

const collapsed = ref(new Set<string>())

const childCount = computed(() => {
  const counts = new Map<string, number>()
  for (const s of props.spans) if (s.parentSpanId) counts.set(s.parentSpanId, (counts.get(s.parentSpanId) ?? 0) + 1)
  return counts
})

// Span'ler API'den DFS sırasıyla gelir; kapalı bir span'in altındakiler derinliğe bakılarak atlanır.
const visible = computed(() => {
  const result: SpanNode[] = []
  let hideDeeperThan: number | null = null
  for (const span of props.spans) {
    if (hideDeeperThan !== null) {
      if (span.depth > hideDeeperThan) continue
      hideDeeperThan = null
    }
    result.push(span)
    if (collapsed.value.has(span.spanId)) hideDeeperThan = span.depth
  }
  return result
})

const slowestSelf = computed(() => props.spans.reduce((m, s) => Math.max(m, s.selfMs), 0))

function toggle(spanId: string) {
  const next = new Set(collapsed.value)
  if (next.has(spanId)) next.delete(spanId)
  else next.add(spanId)
  collapsed.value = next
}

const ticks = computed(() => [0, 0.25, 0.5, 0.75, 1].map(f => ({ f, label: formatMs(props.totalMs * f) })))

const pct = (ms: number) => `${(ms / (props.totalMs || 1)) * 100}%`
const barWidth = (ms: number) => `max(${(ms / (props.totalMs || 1)) * 100}%, 2px)`
const labelOnLeft = (s: SpanNode) => (s.startOffsetMs + s.durationMs) / (props.totalMs || 1) > 0.82
</script>

<template>
  <div class="waterfall">
    <div class="row head">
      <div class="name-col muted">Span</div>
      <div class="timeline">
        <span v-for="t in ticks" :key="t.f" class="tick" :style="{ left: `${t.f * 100}%` }">{{ t.label }}</span>
      </div>
    </div>

    <div v-for="span in visible" :key="span.spanId" :id="`span-${span.spanId}`" class="row span-row"
         :class="{ selected: span.spanId === selectedId, error: span.status === 'Error' }"
         @click="emit('select', span.spanId)">
      <div class="name-col" :style="{ paddingLeft: `${8 + span.depth * 16}px` }">
        <button v-if="childCount.get(span.spanId)" class="twisty"
                :aria-label="collapsed.has(span.spanId) ? 'Aç' : 'Kapat'" @click.stop="toggle(span.spanId)">
          {{ collapsed.has(span.spanId) ? '▸' : '▾' }}
        </button>
        <span v-else class="twisty-space" />
        <span class="svc-dot" :style="{ background: colorOf(span.service) }" :title="span.service" />
        <span class="span-name mono" :title="span.name">{{ span.name }}</span>
        <span v-if="span.status === 'Error'" class="err-flag" title="Hata">⚠</span>
        <span v-if="collapsed.has(span.spanId)" class="muted collapsed-count">+{{ childCount.get(span.spanId) }}</span>
      </div>
      <div class="timeline">
        <div v-for="t in ticks" :key="t.f" class="gridline" :style="{ left: `${t.f * 100}%` }" />
        <div class="bar" :style="{ left: pct(span.startOffsetMs), width: barWidth(span.durationMs),
                                    background: colorOf(span.service) }"
             :title="`${span.name}\n${formatMs(span.durationMs)} (kendi: ${formatMs(span.selfMs)})\n+${formatMs(span.startOffsetMs)}`" />
        <span class="bar-label" :class="{ hot: span.selfMs === slowestSelf && slowestSelf > 0 }"
              :style="labelOnLeft(span)
                ? { right: `calc(${100 - ((span.startOffsetMs) / (totalMs || 1)) * 100}% + 6px)` }
                : { left: `calc(${pct(span.startOffsetMs + span.durationMs)} + 6px)` }">
          {{ formatMs(span.durationMs) }}
          <template v-if="span.selfMs < span.durationMs - 0.5"> · kendi {{ formatMs(span.selfMs) }}</template>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.waterfall { font-size: 12.5px; }
.row {
  display: grid;
  grid-template-columns: minmax(260px, 38%) 1fr;
  align-items: center;
  min-height: 28px;
  border-bottom: 1px solid var(--border);
}
.row.head { min-height: 26px; font-size: 11px; }
.span-row { cursor: pointer; }
.span-row:hover { background: var(--surface-2); }
.span-row.selected { background: var(--accent-soft); }
.name-col {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding-right: 8px;
  border-right: 1px solid var(--border);
  align-self: stretch;
}
.twisty {
  width: 16px;
  height: 16px;
  border: none;
  background: none;
  cursor: pointer;
  padding: 0;
  color: var(--text-secondary);
  font-size: 11px;
  flex: none;
}
.twisty-space { width: 16px; flex: none; }
.svc-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.span-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.err-flag { color: var(--status-critical); font-size: 12px; }
.collapsed-count { font-size: 11px; }
.timeline { position: relative; height: 100%; min-height: 26px; margin: 0 12px; }
.tick {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  color: var(--text-muted);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.tick:first-child { transform: translate(0, -50%); }
.tick:last-child { transform: translate(-100%, -50%); }
.gridline { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--grid); }
.bar {
  position: absolute;
  top: 50%;
  height: 12px;
  transform: translateY(-50%);
  border-radius: 3px;
  box-shadow: 0 0 0 1px var(--surface-1);
}
.error .bar { outline: 2px solid var(--status-critical); outline-offset: 1px; }
.bar-label {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  white-space: nowrap;
  color: var(--text-secondary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.bar-label.hot { color: var(--status-critical); font-weight: 600; }
</style>
