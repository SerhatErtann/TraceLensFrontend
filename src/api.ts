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

// Backend tüm yanıtları CommonUtils sözleşmesiyle döner: { isSuccess, message, messageCode, data }.
interface BaseResponse {
  isSuccess: boolean
  message: string
  messageCode: number
}
interface DataResponse<T> extends BaseResponse {
  data: T
}

const BASE = '/api/v1'

type Params = Record<string, string | number | boolean | undefined | null>

async function request<R extends BaseResponse>(path: string, init?: RequestInit, params: Params = {}): Promise<R> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '' && value !== false) query.set(key, String(value))
  }
  const qs = query.toString()
  const response = await fetch(`${BASE}${path}${qs ? `?${qs}` : ''}`, init)
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} (${path})`)
  const body = (await response.json()) as R
  // İş hatası (ör. "Trace bulunamadı") 200 ile gelir; mesajı olduğu gibi kullanıcıya göster.
  if (!body.isSuccess) throw new Error(body.message)
  return body
}

const get = async <T>(path: string, params: Params = {}) => (await request<DataResponse<T>>(path, undefined, params)).data

const filterParams = (f: Filters): Params => ({ ...f })

export const api = {
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
  testNotification: async () => (await request<BaseResponse>('/alerts/test-notification', { method: 'POST' })).message
}
