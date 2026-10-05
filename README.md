# tracelens-frontend

TraceLens dashboard'u (Vue 3 + Vite + TypeScript). Veriyi **tracelens-service** reposundaki TraceLensService'ten alır.

## Çalıştırma

Önce tracelens-service'i çalıştırın (Docker + TraceLensService, port 5100). Sonra bu klasörü VS Code ile açıp terminalde:

```
npm install
npm run dev
```

http://localhost:5180 adresini açın. Geliştirmede `/api` istekleri Vite proxy'si ile `http://localhost:5100`'e gider (bkz. `vite.config.ts`).
Başka bir API'ye bağlanmak için `TRACELENS_API_URL` ortam değişkenini verin, ikinci bir kopya için `npm run dev -- --port 5181`.

Durdurmak için terminalde Ctrl+C.

## Sayfalar

| Sayfa | Yol | İçerik |
|---|---|---|
| Genel Bakış | `/overview` | Girişte açılan sayfa. Tıklanabilir özet kutuları (uygulama, istek, süre, eşiği aşan, hatalı, alarm); Servisler ve Görevler kartları (her bölümde en fazla 5, fazlası için "Tümünü gör"): durum, eşik çizgili süre grafiği, ortalama/p95/hata, en yavaş endpoint. Altta tüm uygulamaların süre grafiği, en yavaş / en çok hata veren 5 ve son hatalar |
| Sorunlar | `/issues` | Sadece ortalaması eşiği aşanlar ve hata oranı %5'i geçenler, nedeniyle (en sık hata dahil). Filtre: alarm açık / yavaş / hatalı / servis. Satıra tıklayınca en kötü örneğin trace'i açılır |
| Servisler | `/services` | Gelen HTTP istekleri: özet kutuları, ortalama/p95 grafiği (eşik çizgisiyle), endpoint tablosu (eşik ✎ ile yerinde düzenlenir), istek listesi (hatalı satırlar kırmızı, eşiği aşanlar turuncu şeritli) |
| Görevler | `/schedulers` | Aynı ekran, zamanlanmış görev (scheduler) çalışmaları için |
| Trace detayı | `/traces/:traceId` | Waterfall (servis renkleri, kendi süresi, aç/kapa), "Nereye bakmalı?" ipuçları, attribute'lar, exception stack trace |
| Alarmlar | `/alerts` | Açık ve kapanan alarmlar, test bildirimi butonu |
| Ayarlar | `/settings` | Varsayılan eşik, özel eşiklerin listesi (düzenle/kaldır), alarm ayarlarının özeti |
| Giriş | `/login` | TraceLensService'te şifre tanımlıysa açılır; girişten sonra istenen sayfaya döner. Menüde kullanıcı adı ve Çıkış |

Oturum düşerse (API 401 döner) bulunulan sayfaya geri dönecek şekilde giriş ekranı açılır (`src/auth.ts`, `router.ts`).

Filtreler URL'de tutulur; bir görünümün linkini kopyalayıp paylaşabilirsiniz.

## Klasörler

```
src/
├─ api.ts            Backend sözleşmesi (tipler + fetch). Yanıtlar { isSuccess, message, data } formatında
├─ format.ts         ms / byte / tarih biçimlendirme
├─ router.ts
├─ styles.css        Renk token'ları (açık/koyu tema)
├─ ranges.ts         Ortak zaman aralığı seçenekleri
├─ views/            HomeView (Genel Bakış), IssuesView (Sorunlar), OverviewView (Services + Schedulers),
│                    TraceView, AlertsView, SettingsView, LoginView
└─ components/       KpiTile, TrendSpark, LatencyChart, OperationsTable, RequestsTable, StatTiles,
                     StatusBadge, ThresholdCell, Waterfall
```

## Komutlar

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Geliştirme sunucusu (5180) |
| `npm run typecheck` | TypeScript kontrolü |
| `npm run build` | Prod derlemesi (`dist/`) |

## Docker

Sunucu kurulumu **tracelens-service** reposundaki `docker compose --profile app up -d --build` ile yapılır; bu repo oradan derlenir (iki repo yan yana klonlanmalı). Tek başına çalıştırmak için:

```
docker build -t tracelens-dashboard .
docker run -p 8080:8080 -e TRACELENS_API_URL=http://<api-adresi>:8080 tracelens-dashboard
```

Image, dashboard'u derleyip **nginx** ile sunar (`nginx/default.conf.template`):
- `/api/*` istekleri `TRACELENS_API_URL` adresindeki TraceLensService'e yönlendirilir.
- `/services`, `/traces/...` gibi adresler doğrudan açıldığında da sayfa bulunur.
- nginx root olmayan kullanıcıyla 8080'de çalışır.
