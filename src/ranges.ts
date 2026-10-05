// Tüm sayfalarda ortak zaman aralığı seçenekleri (backend "range" parametresi)
export const RANGES = [
  { value: '15m', label: '15 dk' },
  { value: '1h', label: '1 sa' },
  { value: '6h', label: '6 sa' },
  { value: '24h', label: '24 sa' },
  { value: '7d', label: '7 gün' }
]

export const rangeLabel = (value: string) => RANGES.find(r => r.value === value)?.label ?? value
