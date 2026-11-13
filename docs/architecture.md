# API Sentinel – Mimari

**Durum:** Faz 0 – Taslak (onay bekleniyor)
**İlgili:** `requirements.md`, `test-strategy.md`, `development-roadmap.md`

---

## 1. Genel bakış

```
┌──────────────────────┐   POST /api/requests/execute   ┌───────────────────────────┐        ┌──────────────┐
│  Browser (client)    │ ─────────────────────────────▶ │  Backend (server)         │ ─────▶ │  Target API  │
│  React + Vite        │ ◀───────────────────────────── │  Express + request-engine │ ◀───── │  (internet)  │
│  Request Builder     │   normalized response / error  │  validate → SSRF → send   │        └──────────────┘
│  Response Viewer     │                                │  → normalize              │
└──────────────────────┘                                └───────────────────────────┘
```

- **client:** Yalnızca arayüz ve arayüz durumu. Hedef API'ye **asla doğrudan** istek atmaz; sadece kendi backend'imizle konuşur.
- **server:** İsteği doğrular, güvenlik kontrollerinden geçirir, hedefe gönderir, cevabı standart bir formata çevirir.
- **shared:** client ve server'ın ortak kullandığı tipler ve Zod şemaları (tek doğruluk kaynağı).

Geliştirme ortamında Vite dev server'ı `/api` ile başlayan istekleri backend'e yönlendirir (**proxy**). Böylece tarayıcı açısından her şey aynı origin'dir ve kendi backend'imiz için CORS ayarı gerekmez.

---

## 2. Teknoloji seçimleri ve gerekçeleri

| Katman | Teknoloji | Neden | Alternatif / Not |
|---|---|---|---|
| Dil | **TypeScript** | Tip hataları derleme anında yakalanır; client-server sözleşmesi tiplerle korunur. | – |
| Runtime | **Node.js 24+ LTS** | JS'i sunucuda çalıştırır; yerleşik `fetch`/undici altyapısı. | Ortamda v26 kurulu. |
| Paket yönetimi | **npm workspaces** | Ek araç kurmadan tek repoda birden fazla paket. | pnpm / Turborepo gereksiz karmaşıklık. |
| Frontend | **React + Vite** | React: bileşen tabanlı UI. Vite: çok hızlı dev server ve build. | CRA artık önerilmiyor. |
| Stil | **Tailwind CSS** | Ayrı CSS dosyası yönetmeden tutarlı tasarım. | – |
| Routing | **Yok (MVP)** | MVP tek sayfa. React Router, collections/geçmiş sayfaları gelince (Faz 6). | – |
| Sunucu durumu | **Yok (MVP)** | Tek bir "gönder" işlemi var; basit bir `useSendRequest` hook yeterli. TanStack Query, listeleme/önbellek gerektiğinde (Faz 6). | – |
| Backend | **Express 5** | En yaygın, öğrenmesi kolay; v5 async hataları otomatik yakalar. | Fastify daha hızlı ama öğrenme kaynağı daha az. |
| Doğrulama | **Zod** | Hem çalışma zamanında doğrular hem TypeScript tipi üretir (`z.infer`). | – |
| HTTP client | **undici** | Node'un kendi `fetch`'inin altındaki kütüphane. `Agent` + özel DNS `lookup` ile **bağlanılan IP'yi kontrol edebiliriz** (SSRF için kritik), redirect ve stream üzerinde tam kontrol. | axios: bağlantı anındaki IP'yi kontrol etmek zor. |
| IP sınıflandırma | **ipaddr.js** (veya Node `net.BlockList`) | IPv4/IPv6, IPv4-mapped IPv6 (`::ffff:127.0.0.1`) gibi hileli biçimleri doğru sınıflandırmak. Faz 2'de ikisi karşılaştırılıp biri seçilecek. | Kendi regex'imizi yazmak hataya açık. |
| Veritabanı | **SQLite + Prisma** (Faz 6) | Kurulum gerektirmeyen dosya tabanlı DB; Prisma tip güvenli sorgular ve migration sağlar. **MVP'de yok.** | – |
| AI | **Anthropic Claude API** (Faz 5) | Gereksinim. Yalnızca backend'den çağrılır. | – |
| Unit test | **Vitest** | Vite ile aynı yapılandırma, hızlı, Jest uyumlu API. | – |
| Component test | **React Testing Library** (sınırlı) | Bileşeni kullanıcı gözünden test eder. | D-10 kararına bağlı. |
| Integration test | **Supertest** | Express uygulamasını port açmadan HTTP seviyesinde test eder. | – |
| E2E | **Playwright** | Gerçek tarayıcıda uçtan uca akış. | – |
| Kod kalitesi | **ESLint + Prettier** | Hata yakalama + tutarlı format. | – |
| Dev çalıştırma | **tsx** | TypeScript'i derlemeden çalıştırır, değişiklikte yeniden başlatır. | ts-node daha yavaş. |

> Tüm paket sürümleri Faz 1'de `npm view <paket> version` ile kontrol edilip güncel kararlı sürümler kullanılacaktır.

---

## 3. Klasör yapısı

```
APIProject/                      # Proje kökü (ürün adı: API Sentinel)
├── client/                      # React uygulaması
│   ├── src/
│   │   ├── app/                 # App.tsx, layout, global stiller
│   │   ├── components/          # Genel UI parçaları (Button, Tabs, Badge...)
│   │   ├── features/
│   │   │   ├── request-builder/ # MethodSelect, UrlBar, KeyValueEditor, AuthPanel, BodyEditor
│   │   │   │   ├── components/
│   │   │   │   ├── state/       # requestDraftReducer (saf fonksiyon → kolay unit test)
│   │   │   │   └── lib/         # buildFinalUrl, validateJsonBody (saf fonksiyonlar)
│   │   │   └── response-viewer/ # StatusBadge, ResponseMeta, HeadersTable, BodyView
│   │   ├── hooks/               # useSendRequest
│   │   ├── services/            # apiClient.ts (backend ile konuşan tek yer)
│   │   └── main.tsx
│   ├── index.html
│   └── vite.config.ts           # /api proxy ayarı
├── server/
│   ├── src/
│   │   ├── app.ts               # createApp(): Express uygulamasını kurar (listen YOK → test edilebilir)
│   │   ├── server.ts            # createApp() + listen()
│   │   ├── config/              # env okuma + Zod ile doğrulama
│   │   ├── routes/              # URL → controller eşlemesi
│   │   ├── controllers/         # HTTP katmanı: req/res, servis çağrısı
│   │   ├── services/
│   │   │   └── request-engine/
│   │   │       ├── urlBuilder.ts        # URL + query param birleştirme
│   │   │       ├── authApplier.ts       # Bearer/Basic → header
│   │   │       ├── headerPolicy.ts      # yasaklı header'lar
│   │   │       ├── ssrfGuard.ts         # adres sınıflandırma + engelleme
│   │   │       ├── safeDispatcher.ts    # undici Agent + doğrulanmış DNS lookup
│   │   │       ├── httpExecutor.ts      # gönderim, timeout, boyut limiti, redirect
│   │   │       ├── responseNormalizer.ts# body tipi, boyut, süre, header'lar
│   │   │       └── errorMapper.ts       # düşük seviye hata → ApiError kodu
│   │   ├── middleware/          # validateBody, errorHandler, notFound, requestId
│   │   ├── errors/              # AppError sınıfı
│   │   └── utils/               # redact (log maskeleme) vb.
│   └── tests/
│       ├── unit/
│       ├── integration/
│       └── fixtures/targetServer.ts   # testlerde hedef olarak kullanılan yerel sunucu
├── shared/
│   └── src/
│       ├── schemas/             # executeRequestSchema, executeResponseSchema (Zod)
│       └── types/               # z.infer ile üretilen tipler
├── tools/
│   └── mock-target/             # Manuel testler için yerel sahte API (/json, /text, /delay, /status...)
├── e2e/                         # Playwright testleri (Faz 2 sonu)
├── docs/
├── .env.example
├── .gitignore
├── CLAUDE.md
├── README.md
├── requirements.md              # orijinal gereksinim belgesi
└── package.json                 # workspaces tanımı + ortak script'ler
```

**Sadeleştirme notu:** Orijinal öneride `pages/`, `types/`, `validators/` klasörleri vardı. MVP tek sayfa olduğu için `pages/` gerekmiyor; tipler ve doğrulama şemaları client ile paylaşıldığı için `shared/` altına taşındı. `assertions/`, `ai-assistant/`, `collections/` klasörleri ilgili faz gelince açılacak (boş klasör oluşturulmayacak).

---

## 4. Backend katmanları

```
HTTP isteği
   │
   ▼
routes/            → hangi URL hangi controller'a gidecek
   │
middleware/        → JSON boyut limiti, Zod ile body doğrulama
   │
controllers/       → req'den veriyi alır, servisi çağırır, res'e yazar (iş mantığı YOK)
   │
services/          → asıl iş mantığı (Express'ten bağımsız, saf TypeScript)
   │
errorHandler       → fırlatılan her hatayı standart ApiError cevabına çevirir
```

**Neden bu ayrım?** `services/` Express'i hiç bilmez. Bu sayede `ssrfGuard` veya `urlBuilder` gibi fonksiyonları sunucu açmadan, saniyeler içinde unit test edebiliriz. Controller ince kalır, test edilmesi kolaylaşır.

### 4.1 Request engine akışı
1. **Doğrula (Zod):** method, URL biçimi, header/param dizileri, body string'i, timeout aralığı.
2. **Header politikası:** yasaklı header'ları (`Host`, `Content-Length`, `Transfer-Encoding`, `Connection`…) reddet.
3. **Auth uygula:** Bearer → `Authorization: Bearer <token>`; Basic → `Authorization: Basic base64(user:pass)`.
4. **URL oluştur:** aktif query param'ları `URLSearchParams` ile ekle; protokol `http/https` değilse reddet.
5. **SSRF ön kontrolü:** host bir IP ise doğrudan sınıflandır; isim ise DNS ile çöz ve **tüm** IP'leri kontrol et.
6. **Gönder:** undici `Agent`'ın `connect.lookup` fonksiyonu, bağlantı anında çözülen IP'yi tekrar kontrol eder (DNS rebinding koruması). Timeout `AbortSignal` ile.
7. **Redirect:** otomatik takip kapalı; 3xx gelirse `Location` çözülür, 1–6. adımlar yeni URL için tekrarlanır (max 5). Farklı host'a geçişte `Authorization` silinir.
8. **Body oku:** stream olarak okunur, toplam byte limit aşılırsa bağlantı kesilir.
9. **Normalize et:** status, statusText, header'lar, body (JSON parse denenir), byte boyutu, süre (ms).

---

## 5. API sözleşmesi

### 5.1 MVP endpoint'leri

| Method | Path | Amaç |
|---|---|---|
| GET | `/api/health` | Backend ayakta mı? `{ status: "ok", uptimeSeconds, version }` |
| POST | `/api/requests/execute` | Kullanıcının isteğini hedefe gönderir, normalize sonuç döner |

**İstek (`ExecuteRequest`):**
```json
{
  "method": "POST",
  "url": "https://api.example.com/users",
  "queryParams": [{ "key": "page", "value": "1", "enabled": true }],
  "headers":     [{ "key": "X-Trace", "value": "abc", "enabled": true }],
  "auth": { "type": "bearer", "token": "..." },
  "body": "{\"name\":\"Ada\"}",
  "options": { "timeoutMs": 15000, "followRedirects": true }
}
```
`auth` biçimleri: `{ "type": "none" }`, `{ "type": "bearer", "token" }`, `{ "type": "basic", "username", "password" }`.

**Başarılı cevap (HTTP 200)** – hedef API 404 veya 500 dönse bile:
```json
{
  "ok": true,
  "response": {
    "status": 404,
    "statusText": "Not Found",
    "headers": [["content-type", "application/json"]],
    "body": { "kind": "json", "data": { "error": "not found" } },
    "sizeBytes": 23,
    "durationMs": 142,
    "finalUrl": "https://api.example.com/users?page=1",
    "redirects": []
  }
}
```
`body.kind`: `"json"` | `"text"` | `"empty"` | `"binary"` (binary içerik gösterilmez, sadece boyut).
Header'lar dizi olarak tutulur çünkü aynı isimde birden fazla header (ör. `set-cookie`) olabilir.

**Hata cevabı (`ApiError`):**
```json
{ "ok": false, "error": { "code": "TIMEOUT", "message": "Target did not respond within 15000 ms.", "details": {} } }
```

| code | HTTP | Anlam |
|---|---|---|
| `VALIDATION_ERROR` | 400 | İstek gövdesi şemaya uymuyor (detaylarda alan listesi) |
| `INVALID_URL` | 400 | URL ayrıştırılamadı veya protokol desteklenmiyor |
| `INVALID_JSON_BODY` | 400 | Body geçerli JSON değil |
| `FORBIDDEN_HEADER` | 400 | Yasaklı header kullanıldı |
| `BLOCKED_TARGET` | 403 | SSRF politikası hedefi engelledi |
| `DNS_ERROR` | 502 | Host adı çözülemedi |
| `CONNECTION_ERROR` | 502 | Bağlantı reddedildi / sıfırlandı / TLS hatası |
| `TOO_MANY_REDIRECTS` | 502 | Redirect limiti aşıldı |
| `RESPONSE_TOO_LARGE` | 502 | Response boyut limiti aşıldı |
| `TIMEOUT` | 504 | Süre aşıldı |
| `PAYLOAD_TOO_LARGE` | 413 | Backend'e gelen istek çok büyük |
| `NOT_FOUND` | 404 | Backend'de böyle bir endpoint yok |
| `INTERNAL_ERROR` | 500 | Beklenmeyen hata (detay loglanır, kullanıcıya gösterilmez) |

### 5.2 Sonraki fazların endpoint taslakları

**Faz 4 – Assertions**
- `POST /api/requests/execute` → isteğe `assertions[]` eklenebilir; cevapta `assertionResults[]` döner.
- `POST /api/assertions/evaluate` → kaydedilmiş bir response üzerinde assertion'ları yeniden çalıştırır (gönderim yapmadan).

> **Faz 4 uygulama kararı (2026-11-06):** Assertion motoru `shared/src/assertions/` içinde saf fonksiyon olarak yazıldı ve şimdilik **tarayıcıda** çalışıyor (assertion düzenlenirken sonuç anında, ağ isteği olmadan güncellenir). Yukarıdaki iki endpoint'e henüz ihtiyaç yok; aynı fonksiyon Faz 6'da (collection runner, test geçmişi) server tarafında kullanılacak ve endpoint'ler o zaman eklenecek. Model: `kind` (status / responseTime / header / body / jsonPath) + `target` + `operator` + `expected` (ham metin; mümkünse JSON olarak yorumlanır). Sonuç: `pass` / `fail` / `error` (error = assertion'ın kendisi geçersiz).

**Faz 5 – AI**
- `GET /api/ai/status` → AI yapılandırılmış mı (anahtarın kendisi asla dönmez).
- `POST /api/ai/test-cases` → endpoint açıklamasından senaryo üretir.
- `POST /api/ai/analyze` → response'u yorumlar, şüpheli durumları listeler.

> **Faz 5 uygulama notu (2026-11-06):** `server/src/services/ai-engine/`. `AiClient` arayüzünün iki uygulaması var: Anthropic SDK (`claude-sonnet-5-5`, structured outputs + Zod, `fallbacks: "default"`, timeout, 1 retry) ve deterministik mock (`AI_MODE=mock`; anahtarsız deneme ve E2E). Gönderilmeden önce secret'lar maskelenir (`redact.ts`); request/response prompt'a etiketli **veri** olarak girer (prompt injection önlemi); çıktı şema + assertion şemasıyla yeniden doğrulanır; süreç başına dakikalık rate limit; loglar içerik içermez. Client tarafında AI durumu `App` seviyesinde tutulur (`useAiAssistant`), sekme değişiminde kaybolmaz.

**Faz 6 – Collections / Environments / Runs**

> **Uygulama notu (2026-11-08):** Depolama `node:sqlite` (`server/src/db`), sıralı migration'lar. Aşağıdaki liste ilk plandır; gerçekleşen uçlar: `GET|POST /api/collections`, `PATCH|DELETE /api/collections/:id`, `POST /api/saved-requests`, `GET|PUT|PATCH|DELETE /api/saved-requests/:id`, `GET|POST /api/environments`, `PUT|DELETE /api/environments/:id`, `POST /api/collections/:id/runs`, `GET /api/runs`, `GET|DELETE /api/runs/:id`, `GET /api/runs/:id/report?format=json|html`. Tüm istekler tek yoldan geçer (`executionService`: değişken çözümleme → SSRF korumalı engine → secret maskeleme). Secret değerler yalnızca yazılır, API'den dönmez. Klasörler ve `/api/test-cases` yapılmadı; karşılaştırma `shared/runs/compareRuns`.
- `GET|POST /api/collections`, `GET|PATCH|DELETE /api/collections/:id`
- `POST /api/collections/:id/folders`, `PATCH|DELETE /api/folders/:id`
- `GET|POST /api/saved-requests`, `GET|PATCH|DELETE /api/saved-requests/:id`
- `GET|POST /api/environments`, `PATCH|DELETE /api/environments/:id`
- `PUT /api/environments/:id/variables`
- `GET /api/runs?requestId=`, `GET /api/runs/:id`
- `GET /api/runs/:id/report?format=json|html`
- `GET /api/runs/compare?base=:id&target=:id`
- `GET|POST /api/test-cases`, `PATCH|DELETE /api/test-cases/:id`

---

## 6. Veritabanı tasarımı (Faz 6 – öneri)

MVP'de veritabanı **yoktur**. Aşağıdaki model Sürüm 3–4 için önerilir.

```
Collection 1───* Folder (self-relation: parentId)
Collection 1───* SavedRequest *───0..1 Folder
SavedRequest 1───* Assertion
SavedRequest 1───* TestRun 1───* AssertionResult
SavedRequest 0..1───* TestCase
Environment 1───* EnvironmentVariable
TestRun *───0..1 Environment
```

| Model | Alanlar |
|---|---|
| **Collection** | id, name, description?, createdAt, updatedAt |
| **Folder** | id, collectionId, parentId?, name, sortOrder |
| **SavedRequest** | id, collectionId, folderId?, name, method, url, queryParams (JSON), headers (JSON), authType, authConfig (JSON, `{{variable}}` referansları önerilir), body?, timeoutMs, createdAt, updatedAt |
| **Assertion** | id, savedRequestId, type, target? (JSON path / header adı), operator, expected (JSON), enabled, sortOrder |
| **Environment** | id, name (Dev/QA/Staging), createdAt |
| **EnvironmentVariable** | id, environmentId, key, value, isSecret, enabled — `@@unique([environmentId, key])` |
| **TestRun** | id, savedRequestId?, environmentId?, startedAt, durationMs, httpStatus?, errorCode?, passedCount, failedCount, responseSnapshot? (kısaltılmış, secret'lar maskelenmiş) |
| **AssertionResult** | id, testRunId, assertionId?, name, expected, actual, passed, message |
| **TestCase** | id, savedRequestId?, title, category (positive/negative/boundary/edge), preconditions?, steps (JSON), expectedResult, source (ai/manual), createdAt, updatedAt |

Notlar:
- SQLite'ta enum/JSON desteği Prisma sürümüne bağlıdır; gerekirse `String` olarak saklanıp Zod ile doğrulanır.
- `TestRun` içine tam response yazmak "gereksiz kalıcı saklama" kuralıyla çelişebilir → yalnızca kısaltılmış ve maskelenmiş özet.
- Secret değerlerin saklanma şekli D-08 kararına bağlıdır.

---

## 7. Güvenlik

### 7.1 Tehdit: SSRF (Server-Side Request Forgery)
**Nedir?** Saldırgan, sunucumuzu kendi adına istek atmaya yönlendirir. Sunucu iç ağın içinde olduğu için normalde dışarıdan erişilemeyen adreslere ulaşabilir.
**Örnek:** `http://169.254.169.254/latest/meta-data/` → bulut ortamında sunucunun kimlik bilgilerini döner. `http://localhost:6379` → iç Redis'e erişim.

**Engellenecek aralıklar:**
| Aralık | Açıklama |
|---|---|
| `0.0.0.0/8`, `::/128` | "Bu ağ" / belirsiz adres |
| `127.0.0.0/8`, `::1/128` | Loopback (localhost) |
| `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` | Private IPv4 |
| `100.64.0.0/10` | Carrier-grade NAT |
| `169.254.0.0/16`, `fe80::/10` | Link-local (bulut metadata dahil) |
| `fc00::/7` | IPv6 unique local |
| `224.0.0.0/4`, `ff00::/8` | Multicast |
| `240.0.0.0/4`, `255.255.255.255` | Rezerve / broadcast |
| `::ffff:0:0/96` | IPv4-mapped IPv6 → içindeki IPv4 adresine göre değerlendirilir |
| `198.18.0.0/15`, `192.0.0.0/24`, `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`, `2001:db8::/32` | Test/dokümantasyon/benchmark aralıkları |

**Atlatma teknikleri ve önlemleri:**
| Teknik | Önlem |
|---|---|
| Ondalık/oktal IP (`http://2130706433`, `http://0177.0.0.1`) | WHATWG `URL` ayrıştırıcısı bunları normal IPv4'e çevirir; kontrol ayrıştırma **sonrası** yapılır. |
| `localhost.` / `foo.localtest.me` gibi loopback'e çözülen isimler | İsim değil **çözülen IP** kontrol edilir. |
| DNS rebinding (ilk çözümde public, bağlanırken private) | Kontrol, undici'nin `connect.lookup` aşamasında, **bağlanılan IP** üzerinde yapılır. |
| Redirect ile iç adrese yönlendirme | Otomatik redirect kapalı; her adım yeniden doğrulanır. |
| IPv6 / mapped adresler | ipaddr.js / BlockList ile normalize edilerek sınıflandırma. |
| HTTP proxy ortam değişkenleri | Kendi dispatcher'ımız kullanılır; sistem proxy'si devre dışı. |

**Allowlist (D-02):** `SSRF_ALLOWLIST` env değişkeni (örn. `localhost:4010`) yalnızca açıkça listelenen host:port çiftlerine izin verir. Varsayılan değer boştur. Production'da kullanılmamalıdır.

### 7.2 Diğer riskler
| Risk | Önlem |
|---|---|
| Secret sızıntısı (token, şifre) | Request/response body ve `Authorization` header'ı **loglanmaz**; hata mesajlarında token gösterilmez; `redact()` yardımcı fonksiyonu. |
| AI API anahtarının sızması | Yalnızca `server/.env`; `.env` git'e girmez; `.env.example` sadece anahtar adlarını içerir. |
| Büyük payload ile kaynak tüketimi | `express.json({ limit: '1mb' })`, response stream limiti 5 MB, timeout üst sınırı. |
| Header injection (CRLF) | Header ad/değerleri Zod + undici tarafından doğrulanır; `\r\n` reddedilir. |
| Kod çalıştırma | `eval`, `new Function`, `vm` kullanılmaz; ESLint kuralı ile yasaklanır. |
| XSS (response içeriği) | Response body React ile **metin** olarak basılır; `dangerouslySetInnerHTML` kullanılmaz. HTML response render edilmez. |
| Backend'in dışarıya açılması | Sunucu varsayılan olarak `127.0.0.1`'e bind olur. |
| Bağımlılık açıkları | `npm audit` düzenli çalıştırılır; az bağımlılık prensibi. |
| Hata detaylarının sızması | `INTERNAL_ERROR` kullanıcıya genel mesaj döner; stack trace yalnızca sunucu logunda. |

### 7.2.1 Akış kaydı (Faz 7)

Kayıt, backend'in bilgisayarda tarayıcı açmasını gerektirir. Bu yüzden yalnızca backend loopback adresinde dinliyorsa açıktır, uçlar `localHostOnly` arkasındadır (DNS rebinding) ve durum değiştiren uçlar JSON gövde ister (başka site CORS ön kontrolü olmadan gönderemez). Başlangıç adresi SSRF kontrolünden geçer. Sonraki gezinmeyi kullanıcı kendi yapar; üretilen istekler çalıştırılırken yine SSRF guard'dan geçer. Trafik yalnızca bellekte tutulur, toplanmazsa 5 dakika sonra silinir; her kayıt boş profille başlar.

Kayıt API çağrılarını, JSON olsun olmasın sayfanın gönderdiği değişiklikleri (POST/PUT/PATCH/DELETE) ve ana pencerede açılan sayfaları (metne indirgenmiş olarak) tutar. `text/html` etiketli JSON, JSON olarak kalır. Multipart form, aynı alanlarla urlencoded forma çevrilir (dosya içeren form çevrilmez).

**Tıklama takibi (2026-11-12).** Kayıt penceresine eklenen küçük bir betik tıklama, form gönderme ve Enter anlarını (tıklamanın kendi zamanıyla) kaydediciye bildirir. Bir istek, böyle bir andan sonraki 2 saniye içinde ve yeni bir sayfa yüklenmeye başlamadan başladıysa kullanıcınındır (`trigger: 'user'`); ana pencerede açılan sayfalar da kullanıcınındır. Geri kalanı sitenin kendi trafiğidir (`trigger: 'page'`): model bunu görür ve taslağa ancak sonraki bir adıma değer aktarıyorsa girer. Betik sitenin kendi fonksiyonlarını çağırarak sahte tıklama bildirebilir; bunun tek etkisi sınıflandırmadır. HAR dosyalarında tıklama bilgisi olmadığından eski sezgisel kural geçerlidir. Başka sitelere giden istekler (reklam, izleme) tıklamaya tepki olarak da gittiği için ayrıca süzülür: yalnızca adresinde izleme kelimesi (pixel, collect, track, sdk, ads…) olmayan JSON okumaları kalır, başka siteye giden bir değişiklik hiçbir zaman kullanıcının sayılmaz. "Aynı site" alt alan adlarını kapsar (`www.` ve `img.` aynı sitedir; `.com.tr` gibi ülke uzantıları dikkate alınır).

**Kullanıcı eylemleri kaybolmaz (2026-11-10).** Açılan sayfalar ve gönderilen değişiklikler "kullanıcı eylemi"dir (`isUserAction`). Kayıt kısaltılırken önce aynı uç noktaya giden tekrarlı arka plan istekleri, sonra cevap örnekleri, sonra en son arka plan istekleri atılır; eylemlere en son dokunulur (40 istek sınırı da aynı kurala uyar). Model bir eylemi atlarsa veya hiç görmezse `checkDraft` onu kayıttan kurup sırasına ekler; maskeli değerler (şifre, token) boş gizli değişkene çevrilir. Model zaman aşımına uğrar, cevabı kesilir veya Ollama erişilemezse hata yerine kayıttan kurulmuş taslak döner. Değişiklik adımları taslakta varsayılan olarak seçilidir ve uyarıyla işaretlenir.

### 7.2.2 Collection çalıştırmasında cookie'ler
`server/services/cookieJar.ts`: her çalıştırma boş bir kutuyla başlar ve yalnızca bellekte yaşar. Bir cookie yalnızca onu gönderen **tam host'a** geri gönderilir (alt alan adı yok, `Domain`/`Path` yok sayılır); `Secure` olanlar yalnızca https'te gider; `Max-Age`/`Expires` uygulanır; host başına en fazla 50 cookie. Kullanıcının yazdığı `Cookie` header'ı önceliklidir. Çalıştırma sonuçlarında cookie değerleri maskelenir. Tek tek gönderilen istekler cookie taşımaz. Yönlendirme ara adımlarındaki `Set-Cookie` saklanmaz (yalnızca son cevap).

### 7.3 Loglama politikası
- Loglanır: zaman, requestId, method, hedef **host** (path ve query hariç), sonuç kodu, süre.
- Loglanmaz: header değerleri, body, query string, auth bilgileri.

---

## 8. Frontend durum yönetimi

- **Request taslağı:** `useReducer` + saf `requestDraftReducer` (action'lar: `setMethod`, `setUrl`, `addParam`, `updateParam`, `removeParam`, …). Saf fonksiyon olduğu için unit test edilebilir.
- **Gönderim durumu:** `useSendRequest` hook → `idle | loading | success | error` durumları. Her durum için ayrı UI (NFR-01: loading/empty/success/error).
- **Backend iletişimi:** yalnızca `services/apiClient.ts`. Bileşenler `fetch` çağırmaz.
- **Büyük response:** 1 MB üzeri metin gösterilirken ilk kısım gösterilir + "Show full" seçeneği (arayüz kilitlenmesin – NFR-04).

---

## 9. Yapılandırma (`.env`)

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `PORT` | `3001` | Backend portu |
| `HOST` | `127.0.0.1` | Bind adresi |
| `REQUEST_TIMEOUT_DEFAULT_MS` | `15000` | Varsayılan timeout |
| `REQUEST_TIMEOUT_MAX_MS` | `60000` | Kullanıcının seçebileceği üst sınır |
| `RESPONSE_MAX_BYTES` | `5242880` | 5 MB |
| `REQUEST_BODY_LIMIT` | `1mb` | Backend'e gelen istek limiti |
| `MAX_REDIRECTS` | `5` | |
| `SSRF_ALLOWLIST` | (boş) | Virgülle ayrılmış `host:port` listesi |
| `ANTHROPIC_API_KEY` | (boş) | Faz 5. Yalnızca backend; loglanmaz |
| `AI_MODE` | `auto` | `auto` (anahtar varsa Anthropic, yoksa kapalı) / `off` / `mock` |
| `AI_MODEL` | `claude-sonnet-5-5` | |
| `AI_EFFORT` | `medium` | `low` / `medium` / `high` |
| `AI_TIMEOUT_MS` | `90000` | |
| `AI_RATE_LIMIT_PER_MINUTE` | `10` | Süreç başına AI isteği sınırı |

Uygulama başlarken bu değerler Zod ile doğrulanır; hatalıysa sunucu açıklayıcı mesajla **başlamaz** (fail fast).
