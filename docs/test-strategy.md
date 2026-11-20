# API Sentinel – Test Stratejisi

**Durum:** Onaylandı (2026-11-05). MVP senaryoları Faz 2 sonunda (2026-11-06) çalıştırıldı.

---

## 1. İlkeler

1. **Önce manuel, sonra otomasyon.** Her modülde manuel test senaryoları hazırlanır, kullanıcı tarafından çalıştırılır, sonuçlar birlikte değerlendirilir; ardından otomasyon yazılır.
2. **Her otomasyon testi bir davranışı doğrular** ve test adı bu davranışı anlatır (`it('returns TIMEOUT when target does not respond in time')`).
3. **İzlenebilirlik:** Her otomasyon testi ilgili manuel test ID'sine veya kabul kriterine (AC-xx) referans verir.
4. **Negatif senaryolar zorunludur** – sadece "mutlu yol" yetmez.
5. **Başarısız test gizlenmez.** `skip`, `only`, silme veya beklentiyi gevşetme ile test geçirilmez; kök neden araştırılır.
6. **Çalıştırılmayan test "geçti" olarak raporlanmaz.** Raporlarda gerçek komut çıktısı gösterilir.

---

## 2. Test piramidi

```
            ┌───────────┐
            │    E2E    │  Playwright – az sayıda, kritik kullanıcı akışları
            ├───────────┤
            │Integration│  Supertest – backend endpoint'leri + yerel hedef sunucu
            ├───────────┤
            │   Unit    │  Vitest – saf fonksiyonlar (SSRF, URL, auth, reducer...)
            └───────────┘
```

| Seviye | Araç | Neyi test eder | Örnek |
|---|---|---|---|
| Unit (server) | Vitest | `services/` içindeki saf fonksiyonlar | `ssrfGuard.isBlocked('10.0.0.1') === true` |
| Unit (client) | Vitest | reducer, `buildFinalUrl`, `validateJsonBody` | Geçersiz JSON → hata mesajı ve satır/konum |
| Component | Vitest + React Testing Library | Mantık içeren bileşenler | KeyValueEditor'da satır ekle/sil |
| Integration | Vitest + Supertest | `/api/*` endpoint'leri uçtan uca (port açmadan) | `POST /api/requests/execute` → hedef 500 → cevapta `status: 500` |
| E2E | Playwright | Tarayıcıda gerçek kullanıcı akışı | URL gir → Send → status 200 görünür |
| Statik kontroller | `tsc --noEmit`, ESLint | Tip ve kod kalitesi hataları | – |

---

## 3. Test hedefleri (test target'lar)

İnternetteki demo API'ler (jsonplaceholder, httpbin vb.) kapanabilir veya yavaşlayabilir; bu da testleri **kararsız (flaky)** yapar. Bu yüzden:

- **Otomasyon testleri** internete çıkmaz. Integration testleri, test başında rastgele bir portta açılan yerel bir **fixture sunucusuna** (`server/tests/fixtures/targetServer.ts`) istek atar. SSRF guard'a test için bu adres allowlist ile tanıtılır; SSRF testlerinde ise allowlist boş bırakılır.
- **Manuel testler** için `tools/mock-target/` altında küçük bir sahte API bulunur (`npm run mock`). `.env` içinde `SSRF_ALLOWLIST=localhost:4010` ile erişilir.
- İsteğe bağlı olarak internetteki genel API'lerle de manuel deneme yapılır (gerçek ağ davranışını görmek için).

Mock target endpoint taslağı:
| Endpoint | Davranış |
|---|---|
| `GET /json` | Örnek JSON nesnesi |
| `GET /text` | `text/plain` cevap |
| `GET /html` | `text/html` cevap |
| `GET /empty` | 204 No Content |
| `ANY /echo` | Gelen method, header, query ve body'yi JSON olarak geri döner |
| `GET /status/:code` | İstenen status kodunu döner |
| `GET /delay/:ms` | Belirtilen süre bekleyip cevap verir |
| `GET /large/:kb` | Belirtilen boyutta cevap |
| `GET /redirect/:n` | n kez redirect yapar |
| `GET /redirect-to?url=` | Verilen adrese yönlendirir (SSRF redirect testi) |
| `GET /auth/bearer`, `GET /auth/basic` | Doğru kimlik bilgisi yoksa 401 |
| `GET /malformed-json` | `application/json` diyen ama geçersiz JSON dönen cevap |

---

## 4. MVP manuel test senaryoları

Ön koşul (tümü için): Backend ve frontend çalışıyor, mock target açık.

### 4.1 Fonksiyonel
| ID | Senaryo | Adımlar | Beklenen sonuç | AC |
|---|---|---|---|---|
| API-001 | Geçerli GET | GET `http://localhost:4010/json` → Send | 200 OK, süre, boyut, header'lar ve girintili JSON görünür | AC-01, 05, 06 |
| API-002 | POST JSON body | POST `/echo`, body `{"name":"Ada"}` | Echo cevabında body aynen ve `content-type: application/json` görünür | AC-02 |
| API-003 | Query parameter | `/echo` + param `page=2`, `q=a b` | Final URL önizlemesi ve echo cevabında `page=2`, `q=a b` (doğru encode) | AC-03 |
| API-004 | Custom header | Header `X-Trace: 123` | Echo cevabında header görünür | AC-03 |
| API-005 | Geçersiz URL | URL: `htp//abc`, sonra boş URL, sonra `ftp://x.com` | İstek gönderilmez veya `INVALID_URL` hata mesajı | AC-09 |
| API-006 | Geçersiz JSON body | Body: `{"a":1,}` | Send öncesi doğrulama hatası, ağ isteği yapılmaz | AC-09 |
| API-007 | Timeout | `/delay/20000`, timeout 3000 ms | ~3 sn sonra anlaşılır timeout mesajı | AC-08 |
| API-008 | JSON olmayan response | `/text` ve `/html` | Düz metin olarak görünür; HTML render edilmez | AC-07 |
| API-009 | 404 | `/status/404` | Status 404 kırmızı/turuncu rozetle gösterilir; uygulama hatası **değil** | – |
| API-010 | 500 | `/status/500` | Status 500 gösterilir | – |
| API-011 | Bearer Token | `/auth/bearer`, önce token'sız, sonra doğru token | 401 → 200 | AC-04 |
| API-012 | Basic Auth | `/auth/basic`, yanlış sonra doğru bilgi | 401 → 200 | AC-04 |
| API-013 | Bağlantı hatası | `http://localhost:4011/` (`.env` allowlist'inde ama kapalı port) | "Connection refused" türünde anlaşılır hata | AC-08 |
| API-014 | DNS hatası | `https://this-domain-does-not-exist-xyz.invalid` | `DNS_ERROR`. **Not:** Bazı modem/ISS'ler bulunamayan alan adlarını kendi IP'lerine (ör. `192.168.1.1`) yönlendirir; bu durumda `BLOCKED_TARGET (… → 192.168.1.1)` beklenen ve güvenli sonuçtur (PASS). | AC-08 |
| API-015 | Boş body | `/empty` | 204 ve "No content" boş durumu | AC-07 |
| API-016 | Bozuk JSON response | `/malformed-json` | Uygulama çökmez, metin olarak gösterilir + uyarı | AC-07 |
| API-017 | Büyük response | `/large/6000` (6 MB) | `RESPONSE_TOO_LARGE` mesajı, arayüz donmaz | – |
| API-018 | Kopyalama | Response body → Copy | Pano içeriği body ile aynı | – |
| API-019 | Param aktif/pasif | Param'ı pasif yap | Final URL'de görünmez | AC-03 |
| API-020 | Loading durumu | `/delay/3000` | Gönderim sırasında loading göstergesi, Send butonu devre dışı | – |

### 4.2 Güvenlik
(`SSRF_ALLOWLIST` boşken çalıştırılır.)

| ID | Hedef | Beklenen |
|---|---|---|
| SEC-001 | `http://127.0.0.1/` | `BLOCKED_TARGET` |
| SEC-002 | `http://localhost:3001/api/health` (kendi backend'imiz) | `BLOCKED_TARGET` |
| SEC-003 | `http://169.254.169.254/latest/meta-data/` | `BLOCKED_TARGET` |
| SEC-004 | `http://10.0.0.1/`, `http://192.168.1.1/`, `http://172.16.0.1/` | `BLOCKED_TARGET` |
| SEC-005 | `http://[::1]/`, `http://[::ffff:127.0.0.1]/` | `BLOCKED_TARGET` |
| SEC-006 | `http://2130706433/`, `http://0x7f.1/`, `http://0177.0.0.1/` | `BLOCKED_TARGET` |
| SEC-007 | `http://0.0.0.0/` | `BLOCKED_TARGET` |
| SEC-008 | Public bir adresten iç adrese redirect | Redirect adımında `BLOCKED_TARGET` |
| SEC-009 | `file:///etc/passwd`, `gopher://…` | `INVALID_URL` |
| SEC-010 | Header `Host: internal` veya değeri `a\r\nX-Evil: 1` | `FORBIDDEN_HEADER` / `VALIDATION_ERROR` |
| SEC-011 | Bearer token içeren isteği hatalı gönder | Sunucu logunda ve hata mesajında token **yok** |
| SEC-012 | Backend'e 2 MB'lık istek | `PAYLOAD_TOO_LARGE` |

---

### 4.3 Response Analyzer (Faz 3)
Ön koşul: `npm run mock` (yeni endpoint'ler: `/nested`, `/large-json/:n`, `/bigint`).

| ID | Senaryo | Beklenen |
|---|---|---|
| AN-01 | `/nested` | Tree görünümü; kök ve ilk seviye açık; tip rozetleri |
| AN-02 | Özet satırı | `24 values · depth 5 · 6 objects, 3 arrays, 6 strings, 6 numbers, 2 booleans, 1 null` |
| AN-03 / 04 | Düğüm aç/kapa; Expand all / Collapse all | Beklenen düğümler açılır/kapanır |
| AN-05 / 06 | `data.items[0].name` seç; Copy path | Path, tip `string`, 8 karakter; panoya path kopyalanır |
| AN-07 | `first name`, `request-id`, `version.major` | `meta["first name"]` vb. (tırnaklı anahtar) |
| AN-08 | `data` → Copy value | Girintili JSON |
| AN-09 | Boş dizi / nesne | `[0 items]`, `{0 keys}`, açma oku yok |
| AN-10 | Raw ↔ Tree | Görünüm değişir |
| AN-11 / 12 | `/bigint` | Uyarı + "⚠ precision"; Raw'da `12345678901234567890` aynen |
| AN-13 / 14 | `/large-json/20000`; Show more | Donma yok; 100'er öğe eklenir |
| AN-15 | `/gzip` → Info | `gzip`, çözülmüş vs. Content-Length boyutu |
| AN-16 | `/redirect/3` → Info | 3 redirect adımı |
| AN-17 | `/text`, `/html` | Tree/Raw yok, düz metin, script çalışmaz |
| AN-18 | Alan seç, yeniden Send | Seçim ve görünüm sıfırlanır |

---

### 4.4 Assertion Engine (Faz 4)
Ön koşul: `npm run mock`; URL `/nested`. Otomatik karşılıkları: `e2e/assertions.spec.ts`.

| ID | Senaryo | Beklenen |
|---|---|---|
| AS-01 / 02 | Status equals 200 ekle; Send | Önce sonuç yok + ipucu; sonra PASS, "Tests 1/1" |
| AS-03 / 04 | Beklenen `201`, sonra `abc` (yeniden göndermeden) | Anında FAIL ("200 does not equal 201."), sonra ERROR |
| AS-05 / 06 | `data.total` equals `2` / `"2"` | PASS / FAIL + "The types differ" |
| AS-07 | `meta["first name"]` equals `Ada` | PASS |
| AS-08 / 09 | `data.nextPage` is null; `data.items` is of type array | PASS; is null'da değer alanı yok |
| AS-10 / 11 | `tags` contains `usb`; `price` > 40 / 60 | PASS; PASS / FAIL |
| AS-12 / 13 | `data.yok` exists; `data.items[` | FAIL; ERROR (geçersiz path) |
| AS-14 / 15 | Header `Content-Type` contains json; `X-Yok` exists | PASS; FAIL |
| AS-16 / 17 | Body contains / not contains `Keyboard`; time < 5000 | PASS / FAIL; PASS |
| AS-18 / 19 | Satırı devre dışı bırak; sil | Sonuç kaybolur, toplam azalır; satır silinir |
| AS-20 | Tests sekmesi | Özet + Expected/Actual tablosu |
| AS-21 / 22 | Ağaçtan `price` ve `items` için Add assertion | `equals 49.9` ve `is of type array`, ikisi PASS |
| AS-23 | `/text` ile JSON path + status | JSON path ERROR ("not JSON"), status PASS |
| AS-24 | Satırın türünü değiştir | Operatör/değer yeni türün varsayılanına döner |

---

### 4.5 AI özellikleri (Faz 5)
Ön koşul: `.env` içinde `AI_MODE=mock` (anahtarsız, sabit cevaplar). Otomatik karşılıkları: `e2e/ai.spec.ts`, `server/tests/integration/ai.test.ts`.

| ID | Senaryo | Beklenen |
|---|---|---|
| AI-01 / 02 | `/nested` → AI → Generate test cases | Uyarı kutusu (mock), 5 senaryo kartı |
| AI-03 | Not satırı | "1 invalid suggested assertion(s) removed by the server" |
| AI-04 / 05 | Öneriyi Add / Add all | Assertion eklenir, "Added ✓"; 401 bekleyen senaryo FAIL verir |
| AI-06 / 07 | Edit → Done; ✕ | Değişiklik kalır; diğer kartların durumu bozulmaz |
| AI-08 | Copy as Markdown | Düzenlenmiş haliyle Markdown |
| AI-09 / 10 | Analyze response; Add all | Özet + gözlemler; öneriler PASS |
| AI-11 | Yeni Send | Analiz gizlenir, test senaryoları kalır |
| AI-12 | Token'lı istekle AI | Server logunda yalnızca `[ai] … -> ok` |
| AI-13 | Dakikada 11 istek | `RATE_LIMITED` |
| AI-14 / 15 | `AI_MODE=off` / tekrar `mock` | "AI features are not configured"; diğer özellikler çalışır |
| AI-16 | Response sekmeleri arasında geçiş (regresyon) | AI sonuçları kaybolmaz |

---

### 4.6 Collections (Faz 6.1)
Otomatik karşılıkları: `e2e/collections.spec.ts`, `server/tests/integration/collections.test.ts`.

| ID | Senaryo | Beklenen |
|---|---|---|
| CO-01 / 02 | Boş panel; + New | Boş durum yazısı; collection oluşur |
| CO-03…05 | Save as; düzenle; Save | Üst çubukta ad; "Unsaved changes"; işaret kaybolur |
| CO-06 | Kaydetmeden New request | Onay; İptal hiçbir şeyi değiştirmez |
| CO-07…09 | Aç; F5; server yeniden başlat | Alanlar aynen gelir, veriler kalır |
| CO-10 / 11 | Save as kopya; başka collection | Asıl değişmez; seçilen collection'a kaydolur |
| CO-12 | Collection adını değiştir | Liste alfabetik güncellenir |
| CO-13 / 14 | İstek / collection sil | Onay; collection içindekilerle silinir |
| CO-15 / 16 | Boş ad; değişiklikle sekme kapatma | OK pasif; tarayıcı uyarısı |
| CO-17 | Kayıtlı isteği gönder | Önceki fazların davranışı aynen |
| CO-18 | İsteği ✎ ile yeniden adlandır | Ad yerinde değişir, içerik ve kaydedilmemiş düzenlemeler etkilenmez |

---

### 4.7 Environments (Faz 6.2)
Otomatik karşılıkları: `e2e/environments.spec.ts`, `server/tests/integration/environments.test.ts`.

| ID | Senaryo | Beklenen |
|---|---|---|
| EN-01 / 10 | Ortamsız veya tanımsız `{{x}}` | Uyarı, istek gönderilmez |
| EN-02…04 | Ortam + secret oluştur, yeniden aç | Secret değeri tarayıcıya dönmez |
| EN-05 / 06 | `{{baseUrl}}`, Bearer `{{token}}` | Çözülür; 200 |
| EN-07 / 08 | Secret parametre, `/echo` | Önizlemede `***`, cevapta `[secret]` |
| EN-09 | Body `{"id": {{num}}}` | Geçerli; `"id": 5` |
| EN-11 / 12 | Secret'a dokunmadan kaydet; işareti kaldır | Değer korunur; değer silinir ve açığa çıkmaz (Bearer boş hatası) |
| EN-13…15 | Devre dışı değişken; aynı ad; kaydetmeden kapat | Tanımsız; "Duplicate variable"; onay |
| EN-16…18 | Kayıtlı istek; yenile; ortamı sil | Yer tutucu kalır; seçim hatırlanır; "No environment" |
| EN-19 / 20 | Server logu; AI | Secret yok; AI'a yalnızca `{{ad}}` gider |

---

### 4.8 Çalıştırma ve raporlar (Faz 6.3)
Otomatik karşılıkları: `e2e/runs.spec.ts`, `server/tests/integration/runs.test.ts`.

| ID | Senaryo | Beklenen |
|---|---|---|
| RU-01 / 02 | Geçen, kalan, hatalı istek | "1 of 3 passed · 1 failed · 1 error"; satırlar PASS/FAIL/ERROR |
| RU-03 / 04 | HTML / JSON indirme | Dosya iner, içerik doğru |
| RU-05…07 | Düzelt, boz, karşılaştır | "1 fixed"; "1 regression" |
| RU-08 | Kaydedilmemiş düzenleme | Kayıtlı hali çalışır |
| RU-09 | Cancel | Durur, geçmişe eklenmez |
| RU-10…12 | Ortamla / ortamsız; rapor | Çözülür; "Select an environment"; raporda secret yok |
| RU-13 / 14 | Boş collection; sil | Buton pasif; geçmişten silinir |
| RU-15…17 | Collection sil; F5; görünüm değiştir | Geçmiş kalır; editör korunur |
| RU-18 | Bot koruması olan bir sitenin sayfasını çalıştır (ör. Trendyol sayfa adımları) | Satır ERROR, kod `BLOCKED_BY_SITE`, mesaj sinyali (`proxy-reason`, `cf-mitigated`…) adıyla söyler; API'nin kendi 403'ü normal FAIL kalır |
| TH-01 | Sağ üstteki Dark / Light butonu; sayfayı yenile; sistem koyu temadayken ilk açılış | Bütün ekran koyu/açık olur, metinler okunur; seçim yenilemede korunur; seçim yoksa sistem ayarı uygulanır |

### 4.9 AI Collection Builder (Faz 7)

| ID | Senaryo | Beklenen |
|---|---|---|
| RE-01 | Siteyi kaydet, Finish, hedefsiz taslak, collection, çalıştır | İstekler yakalanır; adımlar geçer |
| RE-02 | Finish yerine pencereyi kapat | Kayıt kendiliğinden toplanır |
| RE-03 | Kayıt sırasında Cancel | Pencere kapanır, liste oluşmaz |
| RE-04 | `http://192.168.1.1` | Pencere açılmadan hata |
| RE-08 | Bir mağazada kategori, filtre, sepete ekle, sepetten sil; taslağı çalıştır | Yalnızca bu eylemler, düzgün adlarla; silme adımı kimliği sepete ekleme cevabından alır (`{{basketItemId}}`) ve geçer |
| RE-07 | Sayfası kendi kendine istek atan bir sitede birkaç tıklama yap | Taslakta yalnızca açtığınız sayfalar ve tıklamalarınızın istekleri; notta "Left out N step(s)…" |
| RE-06 | Çok sayıda arka plan isteği olan uzun bir akış kaydet | Sayfalar ve değişiklikler taslakta eksiksiz ve sırasında; atılan arka plan istekleri notta adıyla |
| RE-09 | Çerezleri kabul et, sepete ekle, sepette adedi artır, azalt, sil | Reklam servisleri (criteo, adtrafficquality…) ve bot koruma sensörü (`sensor_data`) taslakta yok; iki adet değişikliği ayrı adım; adlar tıklanan metinle: `Click "Sepete ekle"`, `Click "Ürünü Arttır"` |
| RE-10 | Farklı türde sitelerde kısa bir akış: tek sayfa uygulama + ayrı API alan adı (demoblaze), Angular + REST (practicesoftwaretesting), klasik sayfalar (books.toscrape), tıklamaya metin dönen jQuery (automationexercise), takip isteği gönderen site (LinkedIn) | Her tıklama bir adım; sitenin kendi takip istekleri (`/track`, `…tag-load`) yok; sayfa kontrolleri değişen sayılara bağlı değil; bot koruması olan sayfa `BLOCKED_BY_SITE` |
| RE-11 | Aynı sitede iki ayrı akış kaydet ve collection oluştur; sağ üstte başka bir ortam seçiliyken ikisini de çalıştır; bir isteği aç | Tek ortam (site adıyla, ör. `hepsiburada.com`); ikinci akışın yeni değişkenleri ona eklenir, farklı değerli olan `_2` alır, doldurulmuş gizli değerler korunur; çalıştırma ve açılan istek collection'ın kendi ortamını kullanır |
| RE-12 | Bershka: ana sayfa, "Moda bölümüne git", Pantolon, bir ürün; taslağı çalıştır | Ürün açılınca yüklenen onlarca benzer ürün ayrıntısı tek adım; ana sayfa yönlendirmesi cookie'lerle geçer, bot koruması kendine yönlendirirse `BLOCKED_BY_SITE` (TOO_MANY_REDIRECTS değil) |
| RE-05 | Bir mağazada ürün aç, sepete ekle, sepete git, sil; taslağı çalıştır | Sayfalar ve sepet istekleri taslakta; sepet sayfası eklenen ürünü gösterir (cookie taşındı) |

Otomasyon: `parseHar`, `checkDraft`, `fitRecording`, `ollamaClient`, `recorderService` (sahte tarayıcıyla), `/api/recordings`, `/api/ai/build-collection`, `/api/collections/import`, `draftToImport`, `siteUrl`, `formBody`, `pageText`, `readJsonBody`, `cookieJar`, cookie'li collection çalıştırması (mock `/shop`) ve `e2e/builder.spec.ts` (AB-01…06, gerçek kayıt tarayıcısı + yerel mock site).

---

## 5. Otomasyon kapsamı (MVP)

**Unit – server**
- `ssrfGuard`: her yasaklı aralık için en az bir örnek + sınır değerler (`172.15.255.255` serbest, `172.16.0.0` engelli, `172.31.255.255` engelli, `172.32.0.0` serbest); mapped IPv6; allowlist.
- `urlBuilder`: param ekleme, encode, var olan query ile birleştirme, pasif param, geçersiz protokol.
- `authApplier`: Bearer, Basic (UTF-8 karakterli şifre), none.
- `headerPolicy`: yasaklı header'lar, büyük/küçük harf duyarsızlığı.
- `responseNormalizer`: JSON / text / empty / binary / bozuk JSON ayrımı.
- `errorMapper`: undici hata kodları → `ApiError` kodları.

**Unit / component – client**
- `requestDraftReducer`, `buildFinalUrl`, `validateJsonBody`.
- KeyValueEditor, BodyEditor (geçersiz JSON uyarısı), StatusBadge (renk sınıfları).

**Integration – server (Supertest)**
- `/api/health` 200.
- API-001…API-017 ve SEC-001…SEC-012'nin otomatik karşılıkları (mümkün olanlar).
- Zod doğrulama hataları (eksik alan, yanlış method).

**İzlenebilirlik (Faz 8.2)**
Bölüm 4'teki her senaryo kimliği (`API-001`, `CO-03…05` …) en az bir otomasyon testinin adında geçer; geçmiyorsa aşağıda gerekçesiyle "yalnızca manuel" olarak listelenir. `npm run traceability` bunu denetler ve eksik varsa hata verir. Gerçek sitelerdeki kayıt senaryolarının (RE-…) otomasyonu, aynı davranışı yerel mock sitede veya kayıttan alınmış örnek veriyle sınar.

**Yalnızca manuel:** CO-09 (sunucuyu yeniden başlatıp verinin korunduğunu görmek; otomasyon testleri gerçek veritabanı dosyasına dokunmaz, `:memory:` kullanır).

**E2E (Faz 2 sonu, smoke)**
- GET → 200 görünür; geçersiz JSON → Send engellenir; engellenen hedef → hata mesajı.

---

## 6. Komutlar

| Komut | Amaç |
|---|---|
| `npm run typecheck` | Tüm workspace'lerde `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Tüm unit + integration + component testleri (internete çıkmaz) |
| `npm run test:e2e` | Playwright smoke (kendi sunucularını 4998/3998/5998 portlarında açar ve kapatır) |
| `npm run test:coverage` | *Henüz yok* (ayrı paket gerektirir; ihtiyaç olursa sonraki fazlarda). Hedef: `services/` için %80+, yol gösterici |

---

## 7. Manuel test raporlama şablonu

```
Test ID   :
Tarih     :
Ortam     : (OS, tarayıcı, commit)
Sonuç     : PASS / FAIL / BLOCKED
Gerçekleşen:
Ekran görüntüsü / not:
```

## 8. Hata (bug) raporu şablonu

```
Başlık          :
Önem (Severity) : Critical / Major / Minor / Trivial
Adımlar         :
Beklenen        :
Gerçekleşen     :
İlgili Test ID  :
Ortam           :
```
