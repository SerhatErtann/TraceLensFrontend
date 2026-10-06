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
| Canlı | `/live` | Şu an gelen istekler ve görev çalışmaları: 2 sn'de bir sadece yeniler gelir, en yeni üstte (en fazla 100), yeni satır kısa süre parlar (eşiği aşan/hatalı kırmızı-turuncu). Son 1 dk özeti (istek/sn, ortalama, eşiği aşan, hatalı), son 60 sn çubukları, Duraklat/Devam et (bekleyen sayısıyla), uygulama ve "sadece eşiği aşanlar / hatalılar" filtreleri. Veri birkaç saniye gecikmeli |
| Raporlar | `/reports` | Bugün / Dün / Son 7 gün / Son 30 gün / özel gün aralığı; hemen önceki eşit dönemle karşılaştırma. "Kısaca" cümleleri, özet kutuları, saat saat (tek gün) ya da gün gün grafik, yavaşlayan/hızlananlar, en çok hata verenler, en yavaş 10, alarmlar, tüm endpoint/görevler; CSV indir, Yazdır / PDF |
| Servis haritası | `/map` | Kim kimi çağırıyor: görevler → servisler → veritabanları; oklarda çağrı sayısı, ortalama süre, hata oranı. Altta bağlantı tablosu |
| Servisler | `/services` | Gelen HTTP istekleri: özet kutuları (önceki döneme göre değişim), süre grafiği (ortalama ve seçilebilir p50/p90/p95/p99, önceki dönem kesikli, altta istek/hata çubukları; noktaya tıklayınca o aralığın istekleri), süre dağılımı histogramı, durum kodları ve hata türleri, endpoint tablosu (eşik ✎ ile yerinde düzenlenir), istek listesi (hatalı satırlar kırmızı, eşiği aşanlar turuncu şeritli) |
| Görevler | `/schedulers` | Aynı ekran, zamanlanmış görev (scheduler) çalışmaları için |
| Servis Detayı | `/services/:service`, `/schedulers/:service` | Genel Bakış kartından açılır. Özet kutuları, "Süre nereye gidiyor?" (kendi kodu / başka servislere çağrılar / veritabanı), süre grafiği; sekmeler: Endpoint'ler (Görevler), Metodlar, DB sorguları (N+1 şüphesi işaretli), Dış çağrılar. Endpoint seçilince isteğin anatomisi (ortalama bir istekte her adım kaç kez, ne kadar). Satıra tıklayınca en yavaş 10 örnek ve trace linkleri. Süre dağılımı, sonuçlar ve instance'lar |
| Trace detayı | `/traces/:traceId` | Waterfall (servis renkleri, kendi süresi, aç/kapa), "Nereye bakmalı?" ipuçları, attribute'lar, exception stack trace |
| Alarmlar | `/alerts` | Yavaşlık ve hata alarmları (açık / kapanan). Filtreler: dönem (24 sa … 90 gün ya da özel tarih-saat), servis/görev, uygulama, alarm türü, hata kodu (500, 5xx…), en yüksek süre ≥ X ms, operasyon arama. "Kısaca" özeti; satıra tıklayınca alarmın açık olduğu aralığın istekleri açılır. Test bildirimi butonu |
| Ayarlar | `/settings` | Varsayılan eşik, özel eşiklerin listesi (düzenle/kaldır), alarm ayarlarının özeti |
| AI asistanı | (her sayfada sağ altta) | Gözlü buton; Türkçe soru sorulur, Claude veriye bakıp cevaplar. Öneri soruları, cevapta hangi verilere bakıldığı, dashboard linkleri (sayfayı açar). Sohbet sekme kapanana kadar kalır; "+" yeni sohbet. API anahtarı yoksa nasıl açılacağını söyler (bkz. tracelens-service README "AI asistanı") |
| Giriş | `/login` | TraceLensService'te şifre tanımlıysa açılır; girişten sonra istenen sayfaya döner. Menüde kullanıcı adı ve Çıkış |

Oturum düşerse (API 401 döner) bulunulan sayfaya geri dönecek şekilde giriş ekranı açılır (`src/auth.ts`, `router.ts`).

Filtreler URL'de tutulur; bir görünümün linkini kopyalayıp paylaşabilirsiniz. Zaman aralığı her sayfada aynı seçiciyle (15 dk … 7 gün ya da "Özel aralık": başlangıç ve bitiş tarih/saati) seçilir.

Her sayfanın başında "Kısaca" kutusu veriyi düz cümlelerle özetler (insights.ts); grafiklerin altında "Nasıl okunur" ve grafikten çıkan cümleler bulunur.

## Klasörler

```
src/
├─ api.ts            Backend sözleşmesi (tipler + fetch). Yanıtlar { isSuccess, message, data } formatında
├─ format.ts         ms / byte / tarih biçimlendirme
├─ markdown.ts       Asistan cevapları için güvenli, küçük markdown (HTML kaçışlanır; yalnızca dashboard içi linkler)
├─ router.ts
├─ styles.css        Renk token'ları (açık/koyu tema)
├─ ranges.ts         Ortak zaman aralığı seçenekleri
├─ views/            HomeView (Genel Bakış), IssuesView (Sorunlar), OverviewView (Services + Schedulers), ServiceDetailView, ServiceMapView, LiveView, ReportsView,
│                    TraceView, AlertsView, SettingsView, LoginView
└─ components/       KpiTile, TrendSpark, LatencyChart, OperationsTable, SpanGroupsTable, RequestsTable, StatTiles, DurationHistogram,
                     OutcomeBreakdown, InstancesTable, RequestAnatomy, TimeSplitBar,
                     StatusBadge, ThresholdCell, Waterfall, AssistantWidget (sağ alttaki AI asistanı)
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
