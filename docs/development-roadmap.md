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

## Faz 3 – Response Analyzer ✅ (2026-11-06 tamamlandı)
JSON ağaç görünümü, alan tipi gösterimi, JSON path kopyalama, response metadata detayları, büyük response optimizasyonu. Manuel + otomasyon testleri.

| Parça | Uygulama |
|---|---|
| JSON path (B-10) | `shared/src/json/jsonPath.ts`: `formatJsonPath` / `parseJsonPath` / `resolveJsonPath` — nokta notasyonu, tanımlayıcı olmayan anahtarlar `["first name"]`, yalnızca kendi özellikleri (prototip yok). Faz 4 assertion'ları aynı fonksiyonu kullanacak |
| Tree görünümü | `JsonTreeView`: tip rozetleri, aç/kapa, Expand/Collapse all, alan detayı (path, tip, boyut, Copy path/value) |
| Büyük response | Kapalı düğümün çocukları render edilmez; düğüm başına 100'lük sayfalama ("Show more"). 20 000 öğe ≈ 400 satır |
| Veri doğruluğu | 2^53 üzerindeki tam sayılar için uyarı; Raw görünüm bu durumda gövdeyi değiştirmeden gösterir; backend gövdeyi metin olarak aynen iletir |
| Metadata | Info sekmesi: status sınıfı, Content-Type/Encoding, çözülmüş vs. hat üstü boyut, Server/Date/Cache-Control, final URL, redirect zinciri |

**Durum (2026-11-06):** Plan kullanıcının isteğiyle ayrı onay beklenmeden uygulandı. Manuel testler AN-01…AN-18 kullanıcı tarafından çalıştırıldı, hepsi PASS. Otomasyon: 62 shared + 200 server + 143 client test, 9 Playwright testi geçiyor; mutasyon kontrolü (sayfalama, büyük sayı koruması, prototip koruması) testlerin hataları yakaladığını gösterdi. Yeni paket eklenmedi.

## Faz 4 – Assertion Engine ✅ (2026-11-06 tamamlandı)

| Parça | Uygulama |
|---|---|
| Model | `shared/src/assertions/schema.ts`: tür başına Zod discriminated union, en fazla 50 assertion |
| Motor | `evaluateAssertions` (saf, eval yok): status, response time, header, body text, JSON path (exists, equals, null, type, contains, büyük/küçük). FR-04'teki tüm kontroller |
| Sonuç | `pass` / `fail` / `error`; kontrol adı, beklenen, gerçekleşen, açıklama (FR-04). Tip uyuşmazlığı ve 2^53 üstü sayılar mesajda belirtilir |
| UI | Request'te Assertions sekmesi (canlı PASS/FAIL), Response'ta Tests sekmesi, JSON ağacından "Add assertion" |

**Durum (2026-11-06):** Plan kullanıcının isteğiyle ayrı onay beklenmeden uygulandı. Manuel testler AS-01…AS-24: kullanıcı bir kısmını çalıştırdı (hepsi doğru) ve kalanların kontrolünü bana bıraktı; kalan senaryoların tamamı Playwright ile gerçek tarayıcıda otomatikleştirildi ve geçiyor (`e2e/assertions.spec.ts`). Otomasyon: 210 shared + 203 server + 173 client test, 14 Playwright testi; mutasyon kontrolü (tip duyarlı eşitlik, sınır değer, devre dışı assertion, null/yok ayrımı) testlerin hataları yakaladığını gösterdi. Test yazarken sayı karşılaştırma mesajlarındaki dil hatası bulundu ve düzeltildi (`bd80b35`). Süreç notu: bir test commit'i typecheck/lint çalıştırılmadan atıldı, `8d5d49a` ile düzeltildi. Yeni paket eklenmedi.

Assertion modeli (shared şema), değerlendirme motoru (saf fonksiyonlar, **eval yok**), JSON path çözümleyici, operatörler, PASS/FAIL arayüzü. Manuel + unit + integration testleri.

## Faz 5 – AI özellikleri ✅ (2026-11-06 tamamlandı)

| Parça | Uygulama |
|---|---|
| Kararlar | Kullanıcı onayıyla `@anthropic-ai/sdk` (yalnızca server) eklendi; model kullanıcı seçimiyle **Claude Sonnet 5.5**; anahtar yokken AI kapalı, `AI_MODE=mock` ile anahtarsız deneme |
| Server | `ai-engine`: `AiClient` (SDK / mock), secret maskeleme, etiketli veri ile prompt injection önlemi, Zod + assertion şeması ile çıktı doğrulama, rate limit, hata eşleme; `GET /api/ai/status`, `POST /api/ai/test-cases`, `POST /api/ai/analyze` |
| Client | Response'ta AI sekmesi: düzenlenebilir test senaryoları (FR-05), Markdown dışa aktarma, analiz, tek tıkla önerilen assertion ekleme |

**Durum (2026-11-06):** Manuel testler AI-01…AI-15 kullanıcı tarafından çalıştırıldı, hepsi PASS. Kullanıcının bulduğu hata: response sekmesi değişince AI sonuçları siliniyordu (state sekme içinde tutuluyordu) → state `App`'e taşındı, regresyon E2E testi eklendi (`0508800`). Aynı turda ortak `Button` bileşeniyle buton stilleri birleştirildi. Düzeltme sonrası manuel tekrar yerine kullanıcının isteğiyle otomasyonla doğrulandı. Otomasyon: 210 shared + 257 server + 186 client test, 19 Playwright testi; mutasyon kontrolü (maskeleme, öneri filtresi, rate limit sınırı) testlerin hataları yakaladığını gösterdi. **Bilinen sınır:** gerçek Anthropic çağrısının başarılı yolu henüz anahtar olmadığı için manuel denenmedi (geçersiz anahtarla hata yolu denendi); SDK tipleriyle derlenip birim testlerle hata eşlemesi doğrulandı.

`ai-engine` servisi, Anthropic SDK, yapılandırılmış çıktı + Zod doğrulama, AI kapalıyken uygulamanın çalışmaya devam etmesi, "bu bir öneridir" uyarısı, rate limit. Manuel + otomasyon (AI istemcisi mock'lanarak).

## Faz 6 – Collections, Environments, Raporlama ✅ (2026-11-08 tamamlandı)

Kararlar (2026-11-07, kullanıcı): veritabanı **`node:sqlite`** (Prisma yerine, yeni paket yok); client'a **React Router / TanStack Query eklenmedi**; D-08: secret'lar **yerelde saklanır, her yerde maskelenir**. Alt modüller: 6.1 Collections, 6.2 Environments, 6.3 Çalıştırma ve raporlar.

**6.1 Collections ✅ (2026-11-08):** SQLite + sıralı migration'lar, collection/saved-request API'si, sol panel, Save / Save as, kaydedilmemiş değişiklik uyarısı, yerinde ad değiştirme. Manuel testler CO-01…CO-17 kullanıcı tarafından çalıştırıldı, hepsi PASS; sonradan eklenen yerinde ad değiştirme E2E ile doğrulandı. Klasörler bilinçli olarak eklenmedi (FR-06 gerektirmiyor; ihtiyaç doğarsa migration ile eklenebilir). Mutasyon kontrolünde yakalanmayan bir hata (ad değişirken özet sütununun bozulması) test boşluğunu gösterdi; test güçlendirildi (`076d417`).

**6.2 Environments ✅ (2026-11-08):** `{{değişken}}` çözümleme server'da; secret değerler yalnızca yazılır, API'den dönmez; hedef geri yankılarsa cevapta, hata mesajlarında ve loglarda maskelenir; SSRF guard çözülmüş değerlere de uygulanır. EN-01…EN-20 **kullanıcının isteğiyle elle değil otomasyonla** doğrulandı (`e2e/environments.spec.ts`, `server/tests/integration/environments.test.ts`). Bu sırada bulunan hata: formlar server'ın özel doğrulama mesajı yerine genel mesaj gösteriyordu (`eec0a16`). Mutasyon kontrolü (secret'ın dönmesi, secret'lığı kaldırınca açığa çıkması, devre dışı değişken, cevap maskeleme, maskeleme sırası) 5/5 yakalandı.

**6.3 Çalıştırma ve raporlar ✅ (2026-11-08):** Collection'daki kayıtlı istekler server'da sırayla çalışır; assertion'lar `shared` motorla değerlendirilir (Faz 4'te ertelenen server kullanımı). Geçmiş yalnızca sonuçları saklar (response gövdesi yok), collection başına son 100 çalıştırma. JSON/HTML rapor, iki çalıştırmayı karşılaştırma (`compareRuns`). RU-01…RU-17 **kullanıcının isteğiyle elle değil otomasyonla** doğrulandı (`e2e/runs.spec.ts`, `server/tests/integration/runs.test.ts`). Mutasyon kontrolü 6/6 yakalandı.

**Faz 6 sonu:** 243 shared + 350 server + 223 client test, 50 Playwright testi geçiyor. Mimari plandan bilinçli farklar: Prisma yerine `node:sqlite`; React Router / TanStack Query yok; klasörler yok; karşılaştırma ayrı endpoint yerine `shared` saf fonksiyonu; test senaryolarının kalıcı saklanması (`/api/test-cases`) yapılmadı (FR-06 kapsamında değil, AI senaryoları Markdown olarak dışa aktarılıyor).

Prisma + SQLite, migration, CRUD endpoint'leri, React Router, TanStack Query, `{{variable}}` çözümleme, secret maskeleme, test geçmişi, JSON/HTML rapor, çalıştırma karşılaştırma.

## Faz 7 – AI Collection Builder (devam ediyor)

Kullanıcı kararı (2026-11-08): portfolio hazırlığından önce yapılır. Kapsam: kullanıcının gösterdiği akış + isteğe bağlı hedef → AI taslağı → kullanıcı onayı → çalıştırılabilir collection. AI'ın kendisi istek atmaz ve ajan modu kapsam dışıdır. Kullanıcı kararı (2026-11-09): F12/HAR yerine uygulama içinden tek tıkla kayıt; HAR gelişmiş seçenek olarak kalır.

| Parça | Uygulama |
|---|---|
| Akış motoru | İstek sırası (`sort_order`) ve cevaptan değer yakalama (`captures`); `secret` yakalamalar maskelenir |
| HAR okuyucu | `shared/har/parseHar`, tarayıcıda çalışır: API çağrıları (yanlış etiketli JSON dahil), değişiklik istekleri ve sitenin sayfaları; tekilleştirme, çerez ve tarayıcı header'ları atılır |
| AI kurucu | `POST /api/ai/build-collection`: maskelenmiş kayıt modele gider; `checkDraft` her adımı kayıttaki isteğe ve sunucuya bağlar, tanımsız değişkenli adımları atar |
| Akış kaydı | `POST /api/recordings`: Playwright ile ayrı, boş profilli tarayıcı; trafik bellekte tutulur ve HAR ile aynı filtreden geçer; başlangıç adresi SSRF kontrolünden geçer |
| Yerel AI | Ollama (`qwen3:8b`), düşünme kapalı (ölçüm: 79 sn → 15 sn); uzun kayıtlar `fitRecording` ile modelin bağlamına sığdırılır, atılan istekler kullanıcıya bildirilir |
| Klasik siteler | Form gövdesi (urlencoded), collection çalıştırmasında cookie taşıma, kayıttaki cevapta tutmayan doğrulamaların atılması (kitapyurdu sepet akışı, 2026-11-10) |
| Tıklama takibi | Kayıt penceresi tıklamaları bildirir; sitenin kendi istekleri taslağa girmez (2026-11-12) |
| Eksiksiz akış | Eylem öncelikli kısaltma, atlanan eylemlerin kayıttan eklenmesi, AI başarısız olursa kayıttan taslak, en fazla 20 adım (2026-11-10) |
| Onay | Taslak ekranı; veri değiştiren istekler işaretli ve uyarılı (2026-11-10 kullanıcı kararı: varsayılan açık); `POST /api/collections/import` tek işlemde kaydeder |

**Durum:** Geliştirme, gerçek Ollama ile uçtan uca deneme, kullanıcının manuel testleri (RE-01…04) ve otomasyon testleri tamam. Bekleyen: kullanıcının hız iyileştirmesini uzun bir akışla doğrulaması.

## Faz 8 – Portfolio hazırlığı
README, mimari diyagram, ekran görüntüleri, demo senaryosu, test raporu, kapsamlı E2E, GitHub düzeni, güvenlik gözden geçirmesi.
