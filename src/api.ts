// TraceLensService sözleşmesi. Backend'deki Models/Responses sınıflarıyla birebir eşleşir.

export type AppKind = 'service' | 'scheduler'

export interface Filters {
  range: string
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
  p95Ms: number
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
  thresholdMs: number
  /** Eşit aralıklı ortalama süreler; null = o aralıkta istek yok */
  trend: (number | null)[]
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
    openIssueCount: number
    activeAlertCount: number
  }
  services: ServiceCard[]
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

export interface AuthStatus {
  authEnabled: boolean
  authenticated: boolean
  username: string | null
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
  overview: (range: string) => get<Overview>('/overview', { range }),
  issues: (range: string, service?: string) => get<Issue[]>('/issues', { range, service }),
  services: (app: AppKind) => get<string[]>(`/${app}/services`),
  summary: (app: AppKind, f: Filters) => get<OperationSummary[]>(`/${app}/summary`, filterParams(f)),
  totals: (app: AppKind, f: Filters) => get<OperationSummary>(`/${app}/totals`, filterParams(f)),
  timeseries: (app: AppKind, f: Filters) => get<TimeBucket[]>(`/${app}/timeseries`, filterParams(f)),
  requests: (app: AppKind, f: Filters, sort: 'time' | 'duration', limit: number, offset: number) =>
    get<PagedResult<RequestRow>>(`/${app}/requests`, { ...filterParams(f), sort, limit, offset }),
  trace: (traceId: string) => get<TraceDetail>(`/traces/${encodeURIComponent(traceId)}`),
  alerts: (days = 7) => get<{ active: Alert[]; history: Alert[] }>('/alerts', { days }),
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
  logout: async () => { await request<BaseResponse>('/auth/logout', { method: 'POST' }) }
}
