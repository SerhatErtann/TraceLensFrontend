import type { RouteLocationRaw } from 'vue-router'
import type { Histogram, OperationSummary, Outcome, Overview, Report, ReportOperation, ServiceBreakdown } from './api'
import { formatInt, formatMs, formatPercent } from './format'

/**
 * Sayfaların "Kısaca" kutusu: veriden düz cümleler. Amaç grafiğe bakmadan da ne olduğunu anlatmak.
 * Türkçe ek uyumu sayıya göre değiştiği için sayıların arkasına ek getirilmez ("%82'si" yerine "%82 ile").
 */
export interface Insight {
  tone: 'ok' | 'slow' | 'error' | 'info'
  text: string
  to?: RouteLocationRaw
  linkText?: string
}

type Kind = 'duration' | 'count' | 'rate'

/** Önceki döneme göre değişimi cümleye çevirir; önceki dönemde veri yoksa null. */
export function changePhrase(current: number, previous: number, kind: Kind): { text: string; tone: Insight['tone'] } | null {
  if (!previous) return null
  const change = (current - previous) / previous
  const pct = `%${Math.round(Math.abs(change) * 100).toLocaleString('tr-TR')}`
  if (Math.abs(change) < 0.05) return { text: 'önceki dönemle hemen hemen aynı', tone: 'ok' }
  if (kind === 'duration') return change > 0 ? { text: `önceki döneme göre ${pct} daha yavaş`, tone: 'slow' } : { text: `önceki döneme göre ${pct} daha hızlı`, tone: 'ok' }
  if (kind === 'count') return { text: `önceki döneme göre ${pct} daha ${change > 0 ? 'fazla' : 'az'}`, tone: 'info' }
  return change > 0 ? { text: `önceki döneme göre ${pct} arttı`, tone: 'error' } : { text: `önceki döneme göre ${pct} azaldı`, tone: 'ok' }
}

/** Trafik + hız cümlesi: "Son 1 sa: 6.235 istek, ortalama 126 ms — önceki döneme göre %11 daha hızlı." */
export function trafficInsight(label: string, count: number, avgMs: number, prevCount: number, prevAvgMs: number, noun: string): Insight {
  if (!count) return { tone: 'info', text: `${label} içinde hiç ${noun} yok.` }
  const speed = changePhrase(avgMs, prevAvgMs, 'duration')
  const volume = changePhrase(count, prevCount, 'count')
  const parts = [`${label}: ${formatInt(count)} ${noun}${volume && volume.text !== 'önceki dönemle hemen hemen aynı' ? ` (${volume.text})` : ''}`,
    `ortalama süre ${formatMs(avgMs)}${speed ? `, ${speed.text}` : ''}`]
  return { tone: speed?.tone === 'slow' ? 'slow' : 'ok', text: `${parts.join('; ')}.` }
}

/** Süre dağılımını kelimelerle: "İsteklerin yarısı 75 ms'den kısa sürüyor; en yavaş yüzde beşlik dilim 386 ms'yi geçiyor." */
export function distributionInsight(p50: number, p95: number, thresholdMs: number, noun: string): Insight {
  const slowTail = p95 > thresholdMs
  return {
    tone: slowTail ? 'slow' : 'ok',
    text: `${noun === 'istek' ? 'İsteklerin' : 'Çalışmaların'} yarısı ${formatMs(p50)} içinde bitiyor; en yavaş yüzde beşlik dilim ${formatMs(p95)} ve üstü sürüyor` +
      (slowTail ? ` (eşik ${formatMs(thresholdMs)} — en yavaşlar eşiği aşıyor).` : ` (eşik ${formatMs(thresholdMs)} — en yavaşlar bile eşiğin altında).`)
  }
}

/** Eşiğini aşan operasyonlar (ortalamaya göre) */
export function slowOperationsInsight(ops: OperationSummary[], noun: string, link: (o: OperationSummary) => RouteLocationRaw): Insight {
  const over = ops.filter(o => o.count >= 3 && o.avgMs > o.thresholdMs).sort((a, b) => b.avgMs / b.thresholdMs - a.avgMs / a.thresholdMs)
  if (!over.length) return { tone: 'ok', text: `Hiçbir ${noun} ortalamada eşiğini aşmıyor.` }
  const top = over[0]
  return {
    tone: 'slow',
    text: `Ortalamada eşiğini aşan ${noun} sayısı: ${over.length}. En çok aşan: ${top.operation} — ortalama ${formatMs(top.avgMs)}, eşik ${formatMs(top.thresholdMs)}.`,
    to: link(top),
    linkText: 'incele'
  }
}

/** Hata cümlesi: oran ve en sık hata türü */
export function errorInsight(count: number, errorCount: number, outcome: Outcome | null, noun: string): Insight {
  if (!errorCount) return { tone: 'ok', text: `Hatalı ${noun} yok.` }
  const rate = errorCount / (count || 1)
  const top = outcome?.errorTypes[0]
  const typeText = top ? ` En sık hata: ${shortType(top.type)} (${formatInt(top.count)} kez), en çok ${top.topOperation} içinde.` : ''
  return {
    tone: rate >= 0.05 ? 'error' : 'slow',
    text: `Hatalı ${noun}: ${formatInt(errorCount)} (oran ${formatPercent(rate)}${rate >= 0.05 ? ', %5 sınırının üstünde' : ''}).${typeText}`,
    to: top ? `/traces/${top.lastTraceId}` : undefined,
    linkText: top ? 'son örneği aç' : undefined
  }
}

export const shortType = (type: string) => {
  const i = type.lastIndexOf('.')
  return /^[\w.]+$/.test(type) && i > 0 ? type.slice(i + 1) : type
}

/** Genel Bakış */
export function overviewInsights(o: Overview, label: string, query: Record<string, string>): Insight[] {
  const t = o.totals
  const p = o.previousTotals
  const list: Insight[] = [trafficInsight(label, t.requestCount, t.avgMs, p.requestCount, p.avgMs, 'istek ve çalışma')]

  const errorApps = o.services.filter(s => s.status === 'error').map(s => s.service)
  const slowApps = o.services.filter(s => s.status === 'slow').map(s => s.service)
  if (!errorApps.length && !slowApps.length) {
    list.push({ tone: 'ok', text: `Tüm uygulamalar normal çalışıyor (${o.services.length} uygulama).` })
  } else {
    const parts = []
    if (errorApps.length) parts.push(`hata oranı yüksek olan: ${errorApps.join(', ')}`)
    if (slowApps.length) parts.push(`eşiğini aşan endpoint/görevi olan: ${slowApps.join(', ')}`)
    list.push({ tone: errorApps.length ? 'error' : 'slow', text: `Dikkat isteyen uygulamalar — ${parts.join('; ')}.`, to: { path: '/issues', query }, linkText: 'sorunlara git' })
  }

  const over = o.slowestOperations.find(s => s.avgMs > s.thresholdMs)
  list.push(over
    ? { tone: 'slow', text: `Eşiğini aşan: ${over.operation} (${over.service}) — ortalama ${formatMs(over.avgMs)}, eşik ${formatMs(over.thresholdMs)}.`,
        to: { path: `/${over.app === 'Service' ? 'services' : 'schedulers'}/${encodeURIComponent(over.service)}`, query }, linkText: 'incele' }
    : { tone: 'ok', text: 'Hiçbir endpoint veya görev ortalamada eşiğini aşmıyor.' })

  const err = o.mostErrors[0]
  if (t.errorCount && err) {
    list.push({
      tone: t.errorRate >= 0.05 || err.errorRate >= 0.05 ? 'error' : 'slow',
      text: `Hatalı istek: ${formatInt(t.errorCount)} (oran ${formatPercent(t.errorRate)}). En çok hata veren: ${err.operation} (${err.service}) — ${formatInt(err.errorCount)} hata, oran ${formatPercent(err.errorRate)}.`,
      to: { path: `/${err.app === 'Service' ? 'services' : 'schedulers'}`, query: { ...query, service: err.service, operation: err.operation, only: 'errors' }, hash: '#istekler' },
      linkText: 'hatalı istekleri gör'
    })
  } else {
    list.push({ tone: 'ok', text: 'Hatalı istek yok.' })
  }

  if (t.activeAlertCount) list.push({ tone: 'error', text: `Açık alarm: ${t.activeAlertCount}.`, to: '/alerts', linkText: 'alarmlara git' })
  return list
}

/** Servisler / Görevler sayfası ve Servis Detayı */
export function listInsights(args: {
  label: string
  noun: string
  opNoun: string
  totals: OperationSummary | null
  previous: OperationSummary | null
  operations: OperationSummary[]
  outcome: Outcome | null
  histogram: Histogram | null
  thresholdMs: number
  opLink: (o: OperationSummary) => RouteLocationRaw
}): Insight[] {
  const t = args.totals
  if (!t || !t.count) return [{ tone: 'info', text: `${args.label} içinde hiç ${args.noun} yok.` }]
  const list = [trafficInsight(args.label, t.count, t.avgMs, args.previous?.count ?? 0, args.previous?.avgMs ?? 0, args.noun)]
  if (args.histogram?.count) list.push(distributionInsight(args.histogram.p50Ms, t.p95Ms, args.thresholdMs, args.noun))
  list.push(slowOperationsInsight(args.operations, args.opNoun, args.opLink), errorInsight(t.count, t.errorCount, args.outcome, args.noun))
  return list
}

/** Servis Detayı'na özel: süre nereye gidiyor, N+1 şüphesi */
export function breakdownInsights(b: ServiceBreakdown | null): Insight[] {
  if (!b || !b.requestCount) return []
  const list: Insight[] = []
  const own = b.timeSplit.find(p => p.category === 'own')?.share ?? 0
  const call = b.calls.slice().sort((a, c) => c.share - a.share)[0]
  if (call && call.share >= 0.3) {
    list.push({ tone: 'info', text: `Sürenin en büyük kısmı (${formatPercent(call.share)}) başka bir servise yapılan çağrıda geçiyor: ${call.target} · ${call.name}. Bu servisi hızlandırmak için önce o çağrıya bakılmalı.` })
  } else if (own >= 0.5) {
    list.push({ tone: 'info', text: `Sürenin çoğu (${formatPercent(own)}) servisin kendi kodunda geçiyor; yavaşlık dış çağrı ya da veritabanından değil.` })
  }
  for (const q of b.database.filter(d => d.suspectedNPlusOne).slice(0, 2)) {
    list.push({ tone: 'slow', text: `${q.name} sorgusu istek başına ortalama ${q.callsPerRequest.toLocaleString('tr-TR')} kez çalışıyor: döngü içinde sorgu (N+1) olabilir.` })
  }
  return list
}

/** Belirgin değişen operasyonlar: iki dönemde de en az 10 istek, ortalama en az %10 değişmiş */
export function changedOperations(ops: ReportOperation[]) {
  const comparable = ops.filter(o => o.count >= 10 && (o.previousCount ?? 0) >= 10 && o.previousAvgMs)
    .map(o => ({ ...o, change: (o.avgMs - o.previousAvgMs!) / o.previousAvgMs! }))
  return {
    slower: comparable.filter(o => o.change >= 0.1).sort((a, b) => b.change - a.change),
    faster: comparable.filter(o => o.change <= -0.1).sort((a, b) => a.change - b.change)
  }
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${Math.round(min)} dk`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m ? `${h} sa ${m} dk` : `${h} sa`
}

/** Raporlar sayfası */
export function reportInsights(r: Report, periodText: string): Insight[] {
  const t = r.totals
  const p = r.previousTotals
  if (!t.requestCount) return [{ tone: 'info', text: `${periodText} içinde hiç istek yok.` }]
  const list: Insight[] = []
  const hasPrevious = p.requestCount > 0

  const speed = changePhrase(t.avgMs, p.avgMs, 'duration')
  const volume = r.includesToday ? null : changePhrase(t.requestCount, p.requestCount, 'count')
  list.push({
    tone: speed?.tone === 'slow' ? 'slow' : 'ok',
    text: `${periodText}: ${formatInt(t.requestCount)} istek ve çalışma${volume ? ` (${volume.text})` : ''}; ortalama süre ${formatMs(t.avgMs)}${speed ? `, ${speed.text}` : ''}.` +
      (r.includesToday && hasPrevious ? ' Bugün henüz bitmediği için istek sayısı karşılaştırılmadı.' : '')
  })

  const errors = changePhrase(t.errorRate, p.errorRate, 'rate')
  list.push({
    tone: t.errorRate >= 0.05 ? 'error' : errors?.tone === 'error' ? 'slow' : 'ok',
    text: t.errorCount
      ? `Hata oranı ${formatPercent(t.errorRate)} (${formatInt(t.errorCount)} hatalı)${errors ? `, ${errors.text}` : ''}.`
      : 'Hiç hatalı istek yok.'
  })

  const slow = changePhrase(t.slowRate, p.slowRate, 'rate')
  list.push({
    tone: slow?.tone === 'error' ? 'slow' : 'ok',
    text: `Eşiği aşan isteklerin payı yaklaşık ${formatPercent(t.slowRate)}${slow ? `, ${slow.text}` : ''}.`
  })

  if (hasPrevious) {
    const { slower } = changedOperations(r.operations)
    list.push(slower.length
      ? { tone: 'slow', text: `Belirgin yavaşlayan endpoint/görev sayısı: ${slower.length}. En çok yavaşlayan: ${slower[0].operation} (${slower[0].service}) — ${formatMs(slower[0].previousAvgMs!)} → ${formatMs(slower[0].avgMs)}.` }
      : { tone: 'ok', text: 'Önceki döneme göre belirgin yavaşlayan endpoint veya görev yok.' })
  }

  const topError = [...r.operations].sort((a, b) => b.errorCount - a.errorCount)[0]
  if (topError?.errorCount) list.push({ tone: topError.errorRate >= 0.05 ? 'error' : 'slow', text: `En çok hata veren: ${topError.operation} (${topError.service}) — ${formatInt(topError.errorCount)} hata, oran ${formatPercent(topError.errorRate)}.` })

  list.push(r.alerts.count
    ? { tone: 'error', text: `Açılan alarm: ${r.alerts.count}, toplam açık kalma süresi ${formatMinutes(r.alerts.totalMinutes)}. En uzunu: ${r.alerts.longest[0].operation} (${r.alerts.longest[0].service}) — ${formatMinutes(r.alerts.longest[0].minutes)}.` }
    : { tone: 'ok', text: 'Bu dönemde hiç alarm açılmadı.' })

  if (!hasPrevious) list.push({ tone: 'info', text: 'Önceki dönemde veri olmadığı için karşılaştırma yapılamadı.' })
  return list
}

/** Süre dağılımında iki ayrı küme var mı? (aralarında belirgin bir çukur olan iki tepe) */
export function bimodal(h: Histogram | null): { fast: [number, number | null]; slow: [number, number | null]; slowShare: number } | null {
  if (!h || h.count < 30) return null
  const b = h.buckets
  const peaks: number[] = []
  for (let i = 0; i < b.length; i++) {
    const left = i > 0 ? b[i - 1].count : 0
    const right = i < b.length - 1 ? b[i + 1].count : 0
    if (b[i].count >= left && b[i].count > right && b[i].count >= h.count * 0.05) peaks.push(i)
  }
  if (peaks.length < 2) return null
  const [a, c] = [peaks[0], peaks[peaks.length - 1]]
  const valley = Math.min(...b.slice(a + 1, c).map(x => x.count), Infinity)
  if (!(valley < Math.min(b[a].count, b[c].count) * 0.35)) return null
  const split = b.findIndex((x, i) => i > a && i < c && x.count === valley)
  const slowCount = b.slice(split + 1).reduce((s, x) => s + x.count, 0)
  return {
    fast: [b[0].fromMs, b[split].fromMs],
    slow: [b[split + 1]?.fromMs ?? b[c].fromMs, b[b.length - 1].toMs],
    slowShare: slowCount / h.count
  }
}
