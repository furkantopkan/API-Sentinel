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
