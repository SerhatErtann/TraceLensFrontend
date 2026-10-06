// TraceLensService sözleşmesi. Backend'deki Models/Responses sınıflarıyla birebir eşleşir.
import type { TimeWindow } from './timeRange'

export type AppKind = 'service' | 'scheduler'

export interface Filters {
  range: string
  /** Verilirse range yerine bu aralık kullanılır (ISO). Önceki dönem karşılaştırması ve grafikten detaya inme için. */
  from?: string
  to?: string
  service?: string
  operation?: string
  minDurationMs?: number
  onlyErrors?: boolean
  onlySlow?: boolean
}

export interface OperationSummary {
  service: string
  operation: string
  count: number
  avgMs: number
  p95Ms: number
  maxMs: number
  slowCount: number
  errorCount: number
  thresholdMs: number
  lastSeen: string
  isAvgOverThreshold: boolean
  errorRate: number
}

export interface TimeBucket {
  time: string
  count: number
  avgMs: number
  p50Ms: number
  p90Ms: number
  p95Ms: number
  p99Ms: number
  slowCount: number
  errorCount: number
}

export interface RequestRow {
  timestamp: string
  traceId: string
  spanId: string
  service: string
  operation: string
  durationMs: number
  status: string
  statusMessage: string | null
  httpStatusCode: string | null
  requestBytes: number | null
  responseBytes: number | null
  jobStatus: string | null
}

export interface PagedResult<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

export interface SpanEvent {
  timestamp: string
  name: string
  attributes: Record<string, string>
}

export interface SpanNode {
  spanId: string
  parentSpanId: string | null
  service: string
  name: string
  kind: string
  timestamp: string
  startOffsetMs: number
  durationMs: number
  selfMs: number
  depth: number
  status: string
  statusMessage: string | null
  attributes: Record<string, string>
  events: SpanEvent[]
}

export interface TraceHint {
  type: 'slow-span' | 'n-plus-one' | 'large-payload' | 'error'
  severity: 'info' | 'warning' | 'error'
  message: string
  spanId: string | null
}

export interface TraceDetail {
  traceId: string
  startTime: string
  durationMs: number
  spanCount: number
  services: string[]
  spans: SpanNode[]
  hints: TraceHint[]
}

export interface Alert {
  id: string
  key: string
  app: 'Service' | 'Scheduler'
  service: string
  operation: string
  metric: string
  valueMs: number
  peakValueMs: number
  thresholdMs: number
  requestCount: number
  slowCount: number
  firedAt: string
  lastCheckedAt: string
  resolvedAt: string | null
  durationMinutes: number
  /** slow: süre eşiği aşıldı · error: hata oranı sınırı aşıldı */
  kind: 'slow' | 'error'
  errorCount: number
  errorRate: number
  peakErrorRate: number
  /** Hata alarmında en sık sonuç: "500", "502", görevlerde hata tipi */
  topStatus: string
}

export interface AlertFilters {
  days?: number
  from?: string
  to?: string
  app?: AppKind
  service?: string
  operation?: string
  kind?: 'slow' | 'error'
  minPeakMs?: number
  /** "500" gibi tam kod ya da "5xx" / "4xx" */
  status?: string
}

export interface AlertList {
  from: string
  to: string
  active: Alert[]
  history: Alert[]
  /** Filtre seçenekleri (aralıktaki alarmlardan) */
  services: string[]
  statuses: string[]
}

export interface Settings {
  defaultThresholdMs: number
  thresholdOverrides: Record<string, number>
  alertMetric: string
  alertWindowMinutes: number
  notificationsConfigured: boolean
  notificationFormat: string
}

export interface ThresholdOverride {
  service: string
  operation: string
  thresholdMs: number
  updatedAt: string
}

export interface ThresholdList {
  defaultMs: number
  overrides: ThresholdOverride[]
}

/** Özel eşik anahtarı; backend'deki "servis|operasyon" biçimiyle aynı. */
export const thresholdKey = (service: string, operation: string) => `${service}|${operation}`

// Backend tüm yanıtları CommonUtils sözleşmesiyle döner: { isSuccess, message, messageCode, data }.
interface BaseResponse {
  isSuccess: boolean
  message: string
  messageCode: number
}
interface DataResponse<T> extends BaseResponse {
  data: T
}

export interface ServiceCard {
  service: string
  app: 'Service' | 'Scheduler'
  status: 'ok' | 'slow' | 'error'
  count: number
  avgMs: number
  p95Ms: number
  errorCount: number
  errorRate: number
  slowOperationCount: number
  slowestOperation: string | null
  slowestOperationAvgMs: number | null
  slowestOperationThresholdMs: number | null
  thresholdMs: number
  /** Eşit aralıklı ortalama süreler; null = o aralıkta istek yok */
  trend: (number | null)[]
}

export interface RankedOperation {
  app: 'Service' | 'Scheduler'
  service: string
  operation: string
  count: number
  avgMs: number
  p95Ms: number
  thresholdMs: number
  errorCount: number
  errorRate: number
}

export interface RecentError {
  app: 'Service' | 'Scheduler'
  timestamp: string
  traceId: string
  service: string
  operation: string
  durationMs: number
  error: string
}

export interface PeriodTotals {
  from: string
  to: string
  requestCount: number
  avgMs: number
  p95Ms: number
  errorCount: number
  errorRate: number
  slowCount: number
  slowRate: number
}

export interface Histogram {
  count: number
  p50Ms: number
  p90Ms: number
  p99Ms: number
  /** Logaritmik aralıklar; ilk ve son dolu aralık arası boşluksuz. Son aralıkta toMs null. */
  buckets: { fromMs: number; toMs: number | null; count: number; errorCount: number }[]
}

export interface Outcome {
  count: number
  /** "200", "502"...; görevlerde "succeeded" / "failed" */
  statuses: { status: string; count: number; errorCount: number }[]
  errorTypes: { type: string; count: number; exampleMessage: string | null; topOperation: string; lastTraceId: string; lastSeen: string }[]
}

export interface Instance {
  instanceId: string
  host: string | null
  count: number
  avgMs: number
  p95Ms: number
  slowCount: number
  errorCount: number
  errorRate: number
  firstSeen: string
  lastSeen: string
}

export interface Anatomy {
  operation: string
  sampleCount: number
  avgDurationMs: number
  timeSplit: TimeSplit[]
  steps: { category: SpanCategory; name: string; target: string; callsPerRequest: number; msPerRequest: number; avgMs: number; share: number }[]
}

export interface ServiceMap {
  nodes: { id: string; name: string; kind: 'service' | 'scheduler' | 'database' | 'external'; count: number; avgMs: number; errorRate: number; status: 'ok' | 'slow' | 'error' }[]
  edges: { from: string; to: string; count: number; avgMs: number; p95Ms: number; errorCount: number; errorRate: number }[]
}

export type ReportPeriod = 'today' | 'yesterday' | '7d' | '30d' | 'custom'

export interface ReportTotals {
  requestCount: number
  avgMs: number
  p50Ms: number
  p95Ms: number
  errorCount: number
  errorRate: number
  /** Yaklaşık (süre dağılımı aralıklarından) */
  slowCount: number
  slowRate: number
  dayCount: number
}

export interface ReportOperation {
  app: 'Service' | 'Scheduler'
  service: string
  operation: string
  thresholdMs: number
  count: number
  avgMs: number
  p95Ms: number
  slowCount: number
  errorCount: number
  errorRate: number
  previousCount: number | null
  previousAvgMs: number | null
  previousErrorRate: number | null
}

export interface Report {
  period: ReportPeriod
  includesToday: boolean
  timeZone: string
  /** yyyy-MM-dd (rapor saat dilimindeki günler, ikisi dahil) */
  from: string
  to: string
  previousFrom: string
  previousTo: string
  fromUtc: string
  toUtc: string
  previousFromUtc: string
  dataSince: string | null
  totals: ReportTotals
  previousTotals: ReportTotals
  daily: TimeBucket[]
  previousDaily: TimeBucket[]
  operations: ReportOperation[]
  alerts: {
    count: number
    totalMinutes: number
    longest: { app: 'Service' | 'Scheduler'; service: string; operation: string; peakValueMs: number; thresholdMs: number; firedAt: string; resolvedAt: string | null; minutes: number }[]
  }
}

export interface AssistantMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AssistantReply {
  /** Markdown: **kalın**, madde listesi, /services/... gibi dashboard içi linkler */
  answer: string
  /** Cevap için bakılan veriler ("Sorunlar incelendi") */
  steps: string[]
  model: string
}

export interface LiveRow extends RequestRow {
  app: 'Service' | 'Scheduler'
}

export interface LiveStats {
  windowSeconds: number
  /** Veri servislerden toplu geldiği için pencere bu kadar saniye geriden biter */
  lagSeconds: number
  windowEnd: string
  count: number
  requestsPerSecond: number
  avgMs: number
  p95Ms: number
  slowCount: number
  errorCount: number
  topErrorService: string | null
  topErrorServiceCount: number
  /** Saniye başına, eskiden yeniye (windowSeconds eleman) */
  seconds: { time: string; count: number; slowCount: number; errorCount: number }[]
}

export interface Live {
  /** Sonraki sorguda since olarak gönderilir */
  cursor: string | null
  /** En yeni üstte; önceki sorgularla çakışabilir (spanId ile ayıklanır) */
  items: LiveRow[]
  stats: LiveStats
}

export interface LiveParams {
  since?: string | null
  app?: AppKind
  service?: string
  onlySlow?: boolean
  onlyErrors?: boolean
}

export interface Overview {
  totals: {
    serviceCount: number
    schedulerCount: number
    requestCount: number
    requestsPerSecond: number
    avgMs: number
    p95Ms: number
    errorCount: number
    errorRate: number
    slowCount: number
    slowRate: number
    openIssueCount: number
    activeAlertCount: number
  }
  /** Bir önceki eşit uzunluktaki dönem */
  previousTotals: PeriodTotals
  previousTimeline: TimeBucket[]
  services: ServiceCard[]
  timeline: TimeBucket[]
  timelineThresholdMs: number
  slowestOperations: RankedOperation[]
  mostErrors: RankedOperation[]
  recentErrors: RecentError[]
  from: string
  to: string
  trendBucketSeconds: number
}

export interface Issue {
  app: 'Service' | 'Scheduler'
  service: string
  operation: string
  kind: 'error' | 'slow'
  isSlow: boolean
  hasErrors: boolean
  count: number
  avgMs: number
  p95Ms: number
  thresholdMs: number
  errorCount: number
  errorRate: number
  topError: string | null
  alarmActive: boolean
  alarmSince: string | null
  lastSeen: string
}

/** Servis içindeki span grubu türü: metod (Internal span), DB sorgusu, dış HTTP çağrısı */
export type SpanCategory = 'method' | 'db' | 'call'

export interface SpanGroup {
  category: SpanCategory
  name: string
  /** Dış çağrıda çağrılan servis (span'i yoksa host:port); diğerlerinde boş */
  target: string
  count: number
  avgMs: number
  p95Ms: number
  maxMs: number
  errorCount: number
  errorRate: number
  totalMs: number
  thresholdMs: number
  callsPerRequest: number
  /** İsteklerin toplam süresine oranı (0–1) */
  share: number
  suspectedNPlusOne: boolean
}

/** Bir span grubunun tablo/seçim anahtarı (aynı route farklı servislere çağrılabilir) */
export const spanGroupKey = (g: Pick<SpanGroup, 'category' | 'name' | 'target'>) => `${g.category}|${g.target}|${g.name}`

export interface TimeSplit {
  category: 'own' | 'call' | 'db' | 'other'
  totalMs: number
  share: number
}

export interface ServiceBreakdown {
  service: string
  from: string
  to: string
  requestCount: number
  requestTotalMs: number
  timeSplit: TimeSplit[]
  methods: SpanGroup[]
  database: SpanGroup[]
  calls: SpanGroup[]
}

export interface AuthStatus {
  authenticated: boolean
  username: string | null
  /** Hiç kullanıcı yok: giriş sayfası "ilk hesabı oluştur" ekranını gösterir */
  setupRequired: boolean
  /** Giriş sayfasında "Kayıt ol" seçeneği var mı */
  registrationOpen: boolean
}

export interface DashboardUser {
  username: string
  createdAt: string
  isMe: boolean
}

const BASE = '/api/v1'

type Params = Record<string, string | number | boolean | undefined | null>

// Oturum düştüğünde (401) çağrılır; main.ts giriş sayfasına yönlendirir. Döngüsel import olmasın diye burada tutulur.
let unauthorizedHandler: (() => void) | null = null
export const onUnauthorized = (handler: () => void) => { unauthorizedHandler = handler }

async function request<R extends BaseResponse>(path: string, init?: RequestInit, params: Params = {}): Promise<R> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '' && value !== false) query.set(key, String(value))
  }
  const qs = query.toString()
  const response = await fetch(`${BASE}${path}${qs ? `?${qs}` : ''}`, init)
  if (response.status === 401) unauthorizedHandler?.()
  if (!response.ok) {
    // 401/429 gibi yanıtlar da { isSuccess, message } gövdesiyle gelir; varsa o mesajı göster
    const failure = (await response.json().catch(() => null)) as BaseResponse | null
    throw new Error(failure?.message ?? `${response.status} ${response.statusText} (${path})`)
  }
  const body = (await response.json()) as R
  // İş hatası (ör. "Trace bulunamadı") 200 ile gelir; mesajı olduğu gibi kullanıcıya göster.
  if (!body.isSuccess) throw new Error(body.message)
  return body
}

const get = async <T>(path: string, params: Params = {}) => (await request<DataResponse<T>>(path, undefined, params)).data

const send = async <T>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown, params: Params = {}) =>
  (await request<DataResponse<T>>(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  }, params)).data

const filterParams = (f: Filters): Params => ({ ...f })

export const api = {
  overview: (w: TimeWindow) => get<Overview>('/overview', { ...w }),
  issues: (w: TimeWindow, service?: string) => get<Issue[]>('/issues', { ...w, service }),
  services: (app: AppKind) => get<string[]>(`/${app}/services`),
  summary: (app: AppKind, f: Filters) => get<OperationSummary[]>(`/${app}/summary`, filterParams(f)),
  totals: (app: AppKind, f: Filters) => get<OperationSummary>(`/${app}/totals`, filterParams(f)),
  timeseries: (app: AppKind, f: Filters) => get<TimeBucket[]>(`/${app}/timeseries`, filterParams(f)),
  requests: (app: AppKind, f: Filters, sort: 'time' | 'duration', limit: number, offset: number) =>
    get<PagedResult<RequestRow>>(`/${app}/requests`, { ...filterParams(f), sort, limit, offset }),
  // Dağılımlar (ortak filtrelerle)
  histogram: (app: AppKind, f: Filters) => get<Histogram>(`/${app}/histogram`, filterParams(f)),
  outcomes: (app: AppKind, f: Filters) => get<Outcome>(`/${app}/outcomes`, filterParams(f)),
  instances: (app: AppKind, f: Filters) => get<Instance[]>(`/${app}/instances`, filterParams(f)),
  serviceMap: (w: TimeWindow) => get<ServiceMap>('/service-map', { ...w }),
  live: (params: LiveParams) => get<Live>('/live', { ...params }),
  report: (period: ReportPeriod, from?: string, to?: string) => get<Report>('/reports', { period, from, to }),

  // AI asistanı (Claude); sohbet istemcide tutulur, her soruda tamamı gönderilir
  assistantStatus: () => get<{ enabled: boolean; model: string }>('/assistant/status'),
  assistantChat: (messages: AssistantMessage[]) => send<AssistantReply>('POST', '/assistant/chat', { messages }),

  // Servis Detayı
  anatomy: (app: AppKind, service: string, operation: string, w: TimeWindow) =>
    get<Anatomy>(`/${app}/services/${encodeURIComponent(service)}/anatomy`, { ...w, operation }),
  breakdown: (app: AppKind, service: string, w: TimeWindow) =>
    get<ServiceBreakdown>(`/${app}/services/${encodeURIComponent(service)}/breakdown`, { ...w }),
  /** Bir grubun en yavaş çağrıları; operation alanı çağrının yapıldığı istektir (endpoint/görev) */
  spanSamples: (app: AppKind, service: string, group: Pick<SpanGroup, 'category' | 'name' | 'target'>, w: TimeWindow) =>
    get<RequestRow[]>(`/${app}/services/${encodeURIComponent(service)}/spans`,
      { ...w, category: group.category, name: group.name, target: group.target }),
  trace: (traceId: string) => get<TraceDetail>(`/traces/${encodeURIComponent(traceId)}`),
  alerts: (filters: AlertFilters = {}) => get<AlertList>('/alerts', { ...filters }),
  settings: () => get<Settings>('/settings'),
  /** Başarılıysa backend'in mesajını döner; başarısızsa Error fırlatır (mesajı hatanın nedeni). */
  testNotification: async () => (await request<BaseResponse>('/alerts/test-notification', { method: 'POST' })).message,

  // Eşikler: her işlem güncel listenin tamamını döner
  thresholds: () => get<ThresholdList>('/thresholds'),
  setDefaultThreshold: (thresholdMs: number) => send<ThresholdList>('PUT', '/thresholds/default', { thresholdMs }),
  setThreshold: (service: string, operation: string, thresholdMs: number) =>
    send<ThresholdList>('PUT', '/thresholds', { service, operation, thresholdMs }),
  deleteThreshold: (service: string, operation: string) =>
    send<ThresholdList>('DELETE', '/thresholds', undefined, { service, operation }),

  // Giriş
  authStatus: () => get<AuthStatus>('/auth/me'),
  login: (username: string, password: string) => send<AuthStatus>('POST', '/auth/login', { username, password }),
  register: (username: string, password: string) => send<AuthStatus>('POST', '/auth/register', { username, password }),
  logout: async () => { await request<BaseResponse>('/auth/logout', { method: 'POST' }) },
  changePassword: async (currentPassword: string, newPassword: string) => {
    await send<null>('PUT', '/auth/password', { currentPassword, newPassword })
  },

  // Kullanıcılar: her işlem güncel listenin tamamını döner
  users: () => get<DashboardUser[]>('/users'),
  addUser: (username: string, password: string) => send<DashboardUser[]>('POST', '/users', { username, password }),
  deleteUser: (username: string) => send<DashboardUser[]>('DELETE', `/users/${encodeURIComponent(username)}`)
}
