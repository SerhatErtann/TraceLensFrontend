# tracelens-frontend

TraceLens dashboard'u (Vue 3 + Vite + TypeScript). Veriyi **tracelens-service** reposundaki TraceLensService'ten alır.

## Çalıştırma

Önce tracelens-service'i çalıştırın (Docker + TraceLensService, port 5100). Sonra bu klasörü VS Code ile açıp terminalde:

```
npm install
npm run dev
```

http://localhost:5180 adresini açın. Geliştirmede `/api` istekleri Vite proxy'si ile `http://localhost:5100`'e gider (bkz. `vite.config.ts`).

Durdurmak için terminalde Ctrl+C.

## Sayfalar

| Sayfa | Yol | İçerik |
|---|---|---|
| Services | `/services` | Gelen HTTP istekleri: KPI kartları, ortalama/p95 grafiği (eşik çizgisiyle), endpoint tablosu (eşik ✎ ile yerinde düzenlenir), istek listesi |
| Schedulers | `/schedulers` | Aynı ekran, job çalıştırmaları için |
| Trace detayı | `/traces/:traceId` | Waterfall (servis renkleri, kendi süresi, aç/kapa), "Nereye bakmalı?" ipuçları, attribute'lar, exception stack trace |
| Alarmlar | `/alerts` | Açık ve kapanan alarmlar, test bildirimi butonu |
| Ayarlar | `/settings` | Varsayılan eşik, özel eşiklerin listesi (düzenle/kaldır), alarm ayarlarının özeti |

Filtreler URL'de tutulur; bir görünümün linkini kopyalayıp paylaşabilirsiniz.

## Klasörler

```
src/
├─ api.ts            Backend sözleşmesi (tipler + fetch). Yanıtlar { isSuccess, message, data } formatında
├─ format.ts         ms / byte / tarih biçimlendirme
├─ router.ts
├─ styles.css        Renk token'ları (açık/koyu tema)
├─ views/            OverviewView (Services + Schedulers), TraceView, AlertsView, SettingsView
└─ components/       LatencyChart, OperationsTable, RequestsTable, StatTiles, StatusBadge, ThresholdCell, Waterfall
```

## Komutlar

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Geliştirme sunucusu (5180) |
| `npm run typecheck` | TypeScript kontrolü |
| `npm run build` | Prod derlemesi (`dist/`) |
