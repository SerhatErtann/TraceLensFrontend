import type { TimeBucket } from './api'
import { parseUtc } from './format'

// Tüm sayfalarda ortak zaman aralığı seçenekleri (backend "range" parametresi)
export const RANGES = [
  { value: '15m', label: '15 dk' },
  { value: '1h', label: '1 sa' },
  { value: '6h', label: '6 sa' },
  { value: '24h', label: '24 sa' },
  { value: '7d', label: '7 gün' }
]

export const rangeLabel = (value: string) => RANGES.find(r => r.value === value)?.label ?? value

/** "15m", "1h", "7d" → milisaniye (backend'deki ParseRange ile aynı; bilinmeyen → 1 sa) */
export function rangeMs(value: string): number {
  const n = Number(value.slice(0, -1))
  const unit = { m: 60_000, h: 3_600_000, d: 86_400_000 }[value.slice(-1)]
  return Number.isFinite(n) && n > 0 && unit ? n * unit : 3_600_000
}

/** Seçili aralıktan hemen önceki eşit uzunluktaki dönem (karşılaştırma için) */
export function previousWindow(range: string): { from: string; to: string } {
  const to = Date.now() - rangeMs(range)
  return { from: new Date(to - rangeMs(range)).toISOString(), to: new Date(to).toISOString() }
}

/** Önceki dönemin grafiğini seçili döneme kaydırır: aynı x konumunda "bir önceki dönemin aynı anı" çizilir */
export const shiftBuckets = (buckets: TimeBucket[], ms: number): TimeBucket[] =>
  buckets.map(b => ({ ...b, time: new Date(parseUtc(b.time).getTime() + ms).toISOString() }))
