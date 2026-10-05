// ClickHouse zamanları UTC'dir ama JSON'da bazen "Z" olmadan gelir.
export function parseUtc(value: string): Date {
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`)
}

const timeFmt = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const dateTimeFmt = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
})
const intFmt = new Intl.NumberFormat('tr-TR')

export const formatTime = (v: string) => timeFmt.format(parseUtc(v))
export const formatDateTime = (v: string) => dateTimeFmt.format(parseUtc(v))
export const formatInt = (v: number) => intFmt.format(v)

export function formatMs(ms: number): string {
  if (ms === 0) return '0 ms'
  if (ms >= 10_000) return `${(ms / 1000).toFixed(1)} s`
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`
  if (ms >= 100) return `${Math.round(ms)} ms`
  if (ms >= 1) return `${ms.toFixed(1)} ms`
  return `${ms.toFixed(2)} ms`
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '-'
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

export function formatPercent(ratio: number): string {
  if (ratio === 0) return '%0'
  if (ratio < 0.001) return '<%0,1'
  return `%${(ratio * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`
}

export type DeltaTone = 'bad' | 'good' | 'neutral'
export interface Delta { text: string; tone: DeltaTone }

/**
 * Önceki döneme göre değişim: "▲ %12 · önceki 162 ms". %5'ten küçük değişim "≈" ve nötr.
 * higherIsWorse null ise (istek sayısı gibi) yön renklendirilmez.
 */
export function compare(current: number, previous: number, previousText: string, higherIsWorse: boolean | null): Delta {
  if (!previous) return { text: 'önceki dönemde veri yok', tone: 'neutral' }
  const change = (current - previous) / previous
  if (Math.abs(change) < 0.05) return { text: `≈ önceki ${previousText}`, tone: 'neutral' }
  const pct = `%${Math.round(Math.abs(change) * 100).toLocaleString('tr-TR')}`
  const worse = change > 0 === higherIsWorse
  return {
    text: `${change > 0 ? '▲' : '▼'} ${pct} · önceki ${previousText}`,
    tone: higherIsWorse === null ? 'neutral' : worse ? 'bad' : 'good'
  }
}

export function relativeTime(value: string): string {
  const seconds = Math.round((Date.now() - parseUtc(value).getTime()) / 1000)
  if (seconds < 60) return `${seconds} sn önce`
  if (seconds < 3600) return `${Math.round(seconds / 60)} dk önce`
  if (seconds < 86400) return `${Math.round(seconds / 3600)} sa önce`
  return `${Math.round(seconds / 86400)} gün önce`
}
