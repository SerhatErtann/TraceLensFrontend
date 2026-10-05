import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { formatDateTime } from './format'
import { rangeLabel, rangeMs } from './ranges'

/** Sorgulara giden zaman aralığı: hazır aralık (range) ya da tarih/saat aralığı (from/to, ISO). */
export interface TimeWindow {
  range: string
  from?: string
  to?: string
}

/** Ham istekler 7 gün tutulduğu için özel aralık en fazla bu kadar geriye gidebilir. */
export const RAW_RETENTION_DAYS = 7

/**
 * Sayfaların ortak zaman aralığı. Adres çubuğunda ?range=1h ya da ?range=custom&from=...&to=... olarak durur;
 * link paylaşılınca aynı aralık açılır.
 */
export function useTimeRange() {
  const route = useRoute()
  const router = useRouter()

  const isCustom = computed(() => route.query.range === 'custom' && !!route.query.from && !!route.query.to)
  const win = computed<TimeWindow>(() =>
    isCustom.value
      ? { range: 'custom', from: route.query.from as string, to: route.query.to as string }
      : { range: (route.query.range as string) || '1h' })

  const durationMs = computed(() =>
    isCustom.value
      ? Math.max(60_000, new Date(win.value.to!).getTime() - new Date(win.value.from!).getTime())
      : rangeMs(win.value.range))

  /** "1 sa" ya da "05/10 14:00 – 05/10 15:30" */
  const label = computed(() =>
    isCustom.value ? `${formatDateTime(win.value.from!).slice(0, -3)} – ${formatDateTime(win.value.to!).slice(0, -3)}` : rangeLabel(win.value.range))

  /** Cümle içinde: "Son 1 sa" ya da "05/10 14:00 – 05/10 15:30" */
  const phrase = computed(() => (isCustom.value ? label.value : `Son ${label.value}`))

  /** Hemen önceki eşit uzunluktaki dönem (karşılaştırma için) */
  function previous(): { from: string; to: string } {
    const end = isCustom.value ? new Date(win.value.from!).getTime() : Date.now() - durationMs.value
    return { from: new Date(end - durationMs.value).toISOString(), to: new Date(end).toISOString() }
  }

  /** Başka sayfaya giden linklerde aynı aralığı taşımak için */
  const query = computed<Record<string, string>>(() => {
    const w = win.value
    const q: Record<string, string> = w.from && w.to ? { range: 'custom', from: w.from, to: w.to } : { range: w.range }
    return q
  })

  function setPreset(range: string) {
    const { from: _f, to: _t, ...rest } = route.query
    router.replace({ query: { ...rest, range } })
  }
  function setCustom(from: string, to: string) {
    router.replace({ query: { ...route.query, range: 'custom', from, to } })
  }

  return { win, isCustom, durationMs, label, phrase, previous, query, setPreset, setCustom }
}
