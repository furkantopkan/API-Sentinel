# API Sentinel – Geliştirme Yol Haritası

**Durum:** Faz 0 – Taslak (onay bekleniyor)

## Sürüm ↔ Faz eşlemesi

| Ürün sürümü | Fazlar |
|---|---|
| MVP | Faz 1 + Faz 2 |
| Sürüm 2 – Response Analyzer & Assertions | Faz 3 + Faz 4 |
| Sürüm 3 – AI | Faz 5 |
| Sürüm 4 – Collections & Raporlama | Faz 6 |
| Portfolio | Faz 7 |

## Her modülde uygulanan döngü

1. Amaç açıklaması → 2. Plan → 3. **Onay** → 4. Geliştirme → 5. Kod açıklaması → 6. typecheck / lint / test → 7. Manuel test senaryoları → 8. **Kullanıcı manuel test yapar** → 9. Birlikte değerlendirme → 10. Otomasyon testleri → 11. Testleri çalıştırma ve açıklama → 12. Kod incelemesi → 13. Commit mesajı önerisi → 14. **Commit onayı**

Bir adımın "tamamlandı" sayılması için **Bitti Tanımı (DoD)** maddeleri karşılanmalıdır.

---

## Faz 0 – Analiz ve planlama ✅ (2026-11-05 onaylandı)
Çıktılar: `docs/requirements.md`, `docs/architecture.md`, `docs/test-strategy.md`, `docs/development-roadmap.md`, `CLAUDE.md`.
DoD: Kullanıcı karar listesini (D-01…D-10) yanıtlamış ve dokümanları onaylamış olmalı.

---

## Faz 1 – Proje altyapısı ve arayüz iskeleti ✅ (2026-11-06 tamamlandı)

Amaç: Çalışan ama henüz istek göndermeyen bir uygulama. Altyapı, komutlar ve Request Builder arayüzü hazır olur.

| Adım | Görev | Öğrenilecek kavramlar | Doğrulama | Önerilen commit |
|---|---|---|---|---|
| 1.1 | `git init`, `.gitignore`, `.editorconfig`, `.env.example`, kök `package.json` (workspaces) | Git temel akışı, npm workspaces, `.env` mantığı | `git status` temiz; `npm install` hatasız | `chore: initialize repository and workspace structure` |
| 1.2 | `shared/` paketi: TypeScript yapılandırması, boş şema dosyası | tsconfig, paketler arası import | `npm run typecheck` geçer | `chore(shared): add shared package skeleton` |
| 1.3 | `server/`: TypeScript + Express 5 + tsx; `config/` (Zod ile env doğrulama); `createApp()` / `server.ts` ayrımı | Express, middleware, fail-fast config | `npm run dev:server` çalışır | `feat(server): bootstrap express app with validated config` |
| 1.4 | `GET /api/health` + merkezi `errorHandler` + `notFound` + `AppError` | Route/controller, hata yönetimi | Tarayıcıda `/api/health` → `{status:"ok"}`; olmayan yol → 404 JSON | `feat(server): add health endpoint and central error handling` |
| 1.5 | `client/`: Vite + React + TS + Tailwind | Vite, JSX, bileşen | `npm run dev:client` açılır | `chore(client): scaffold vite react app with tailwind` |
| 1.6 | Vite `/api` proxy + header'da backend bağlantı göstergesi | Proxy, CORS, `fetch`, `useEffect` | Backend kapalıyken "Offline", açıkken "Online" | `feat(client): show backend health status` |
| 1.7 | ESLint + Prettier; kök script'ler: `dev`, `build`, `typecheck`, `lint`, `test` | Lint, format, script'ler | Tüm komutlar hatasız | `chore: add lint, format and root scripts` |
| 1.8 | Dashboard layout: header, sol panel (yer tutucu), Request alanı, Response alanı | Layout, Tailwind grid/flex | Görsel kontrol (masaüstü genişlikleri) | `feat(client): add dashboard layout` |
| 1.9 | Request Builder UI: MethodSelect, UrlBar, sekmeler (Params / Headers / Auth / Body) | Kontrollü bileşen, props, `useState` | Görsel + etkileşim kontrolü | `feat(request-builder): add method, url and tab controls` |
| 1.10 | KeyValueEditor (params/headers ortak bileşen) + `requestDraftReducer` | `useReducer`, saf fonksiyon, yeniden kullanılabilir bileşen | Satır ekle/sil/aktif-pasif | `feat(request-builder): add key-value editor with reducer state` |
| 1.11 | AuthPanel (None/Bearer/Basic) + BodyEditor (JSON doğrulama) + final URL önizlemesi | Discriminated union, `JSON.parse` hata yakalama | Geçersiz JSON uyarısı; şifre alanı maskeli | `feat(request-builder): add auth panel, json body editor and url preview` |
| 1.12 | Response Viewer boş durumu ("Send a request to see the response") | Empty state tasarımı | Görsel kontrol | `feat(response-viewer): add empty state` |
| 1.13 | Faz 1 manuel testleri → değerlendirme → otomasyon (health integration testi, reducer + `buildFinalUrl` + `validateJsonBody` unit testleri) | Vitest, Supertest, test yazımı | `npm test` geçer | `test: add phase 1 unit and integration tests` |
| 1.14 | README: kurulum ve çalıştırma komutları | – | Komutlar README'deki gibi çalışır | `docs: add setup instructions` |

**Durum (2026-11-06):** 1.1–1.14 geliştirildi ve commit'lendi; otomatik kontroller (typecheck, lint, format, 94 test, build) geçiyor. Arayüz manuel testleri UI-01…UI-13 kullanıcı tarafından çalıştırıldı, hepsi PASS. Notlar: 1.3+1.4 tek commit'te birleşti; component testleri (D-10) Faz 2'ye ertelendi.

**Faz 1 DoD:** Uygulama tek komutla çalışır; health göstergesi doğru; Request Builder'da tüm alanlar doldurulabilir; Send butonu henüz istek göndermez (yalnızca hazırlanan istek nesnesini geliştirici konsolunda gösterir); typecheck/lint/test geçer.

---

## Faz 2 – API Request Engine (MVP tamamlanır) ✅ (2026-11-06 tamamlandı)

| Adım | Görev |
|---|---|
| 2.1 | `shared` içinde `executeRequestSchema` ve `executeResponseSchema` (Zod) |
| 2.2 | `tools/mock-target` sahte API'si (manuel test için) |
| 2.3 | `urlBuilder`, `authApplier`, `headerPolicy` |
| 2.4 | `ssrfGuard` (IP sınıflandırma + allowlist) – ipaddr.js / BlockList karşılaştırması |
| 2.5 | `safeDispatcher` (undici Agent + doğrulanmış lookup) |
| 2.6 | `httpExecutor`: timeout, boyut limiti, manuel redirect |
| 2.7 | `responseNormalizer` + `errorMapper` |
| 2.8 | `POST /api/requests/execute` route/controller |
| 2.9 | Client: `apiClient`, `useSendRequest`, loading/error durumları |
| 2.10 | Response Viewer: StatusBadge, süre/boyut, HeadersTable, BodyView (JSON/text/empty), Copy |
| 2.11 | Manuel testler (API-001…020, SEC-001…012) → değerlendirme |
| 2.12 | Unit + integration testleri; Playwright smoke |
| 2.13 | MVP kabul kriterleri kontrolü (AC-01…AC-12), README güncellemesi |

**Durum (2026-11-06):** 2.1–2.13 geliştirildi ve commit'lendi. Manuel testler API-001…020 ve SEC-001…012 kullanıcı tarafından çalıştırıldı, hepsi PASS (API-014: ağ NXDOMAIN'i 192.168.1.1'e yönlendirdiği için `BLOCKED_TARGET` görüldü; beklenen davranış). Otomasyon: 18 shared + 199 server + 82 client test ve 5 Playwright smoke testi geçiyor; mutasyon kontrolüyle (SSRF aralığı, redirect'te credential silme, log hijyeni) testlerin hataları yakaladığı doğrulandı.

Notlar: Adımlar tek bir `feat` commit'inde (2.1–2.10) ve iki `test` commit'inde toplandı. 2.4'te ek paket yerine Node'un yerleşik `net.BlockList`'i seçildi. Faz 1'den ertelenen component testleri (D-10) bu fazda yazıldı. Bilinen açık: `minimatch` moderate advisory (yalnızca dev/lint); düzeltmesi ESLint'i düşürdüğü için ESLint güncellemesi beklenecek.

**MVP kabul kriterleri:**

| AC | Durum | Kanıt |
|---|---|---|
| AC-01 GET | ✅ | API-001; integration `GET returns status, headers, JSON body…`; E2E |
| AC-02 POST JSON | ✅ | API-002; integration `POST sends query params, headers and the JSON body` |
| AC-03 Params & headers | ✅ | API-003/004/019; `buildFinalUrl` + `headerPolicy` unit; integration echo |
| AC-04 Bearer & Basic | ✅ | API-011/012; `authApplier` unit; integration auth |
| AC-05 Status, headers, body, süre | ✅ | API-001; integration; `StatusBadge` component |
| AC-06 JSON format | ✅ | API-001; `bodyText`/`BodyEditor` testleri |
| AC-07 JSON olmayan response | ✅ | API-008/015/016; `responseNormalizer` unit; integration; E2E (HTML çalıştırılmaz) |
| AC-08 Timeout & bağlantı hatası | ✅ | API-007/013/014; `errorMapper` unit; integration TIMEOUT/CONNECTION_ERROR |
| AC-09 Geçersiz URL & JSON | ✅ | API-005/006; `validateDraft` unit; integration INVALID_URL/INVALID_JSON_BODY; E2E |
| AC-10 Engellenen hedefler | ✅ | SEC-001…012; `ssrfGuard` unit (sınır değerler); integration (redirect yeniden kontrolü dahil); E2E |
| AC-11 Testler geçer | ✅ | `npm test`, `npm run test:e2e` çıktıları |
| AC-12 README ile kurulum | ✅ | Temiz klonda `npm ci` → typecheck/test/build denendi |

---

## Faz 3 – Response Analyzer
JSON ağaç görünümü, alan tipi gösterimi, JSON path kopyalama, response metadata detayları, büyük response optimizasyonu. Manuel + otomasyon testleri.

## Faz 4 – Assertion Engine
Assertion modeli (shared şema), değerlendirme motoru (saf fonksiyonlar, **eval yok**), JSON path çözümleyici, operatörler, PASS/FAIL arayüzü. Manuel + unit + integration testleri.

## Faz 5 – AI özellikleri
`ai-engine` servisi, Anthropic SDK, yapılandırılmış çıktı + Zod doğrulama, AI kapalıyken uygulamanın çalışmaya devam etmesi, "bu bir öneridir" uyarısı, rate limit. Manuel + otomasyon (AI istemcisi mock'lanarak).

## Faz 6 – Collections, Environments, Raporlama
Prisma + SQLite, migration, CRUD endpoint'leri, React Router, TanStack Query, `{{variable}}` çözümleme, secret maskeleme, test geçmişi, JSON/HTML rapor, çalıştırma karşılaştırma.

## Faz 7 – Portfolio hazırlığı
README, mimari diyagram, ekran görüntüleri, demo senaryosu, test raporu, kapsamlı E2E, GitHub düzeni, güvenlik gözden geçirmesi.
