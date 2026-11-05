# API Sentinel – Gereksinim Analizi

**Kaynak belge:** `/requirements.md` (v1.0, orijinal – değiştirilmez)
**Bu belge:** Orijinal gereksinimlerin analizi, netleştirilmiş MVP kapsamı, tespit edilen belirsizlikler ve karar bekleyen konular.
**Durum:** Faz 0 – Taslak (kullanıcı onayı bekleniyor)

---

## 1. Projenin amacı (özet)

API Sentinel, QA mühendislerinin REST API'leri test etmesi için geliştirilen web tabanlı bir araçtır. Kullanıcı tarayıcıda bir HTTP isteği hazırlar; istek **doğrudan tarayıcıdan değil, kendi backend'imiz üzerinden** hedef API'ye gönderilir. Backend dönen cevabı normalize ederek (status, header, body, süre, boyut) arayüze geri döner.

Neden backend üzerinden?
- Tarayıcıdan başka domain'lere yapılan isteklerde **CORS** engeline takılırız; backend bu kısıtlamaya tabi değildir.
- Süre ölçümü, boyut sınırı, timeout ve güvenlik kontrolleri merkezi olarak yapılabilir.
- İleride assertion, AI ve raporlama mantığı aynı yerde çalışır.

Bunun bedeli: backend, kullanıcının verdiği **her URL'ye** istek atan bir "proxy" haline gelir. Bu da **SSRF** riskini doğurur (bkz. `architecture.md` – Güvenlik).

Proje aynı zamanda bir **öğrenme ve portfolio** projesidir; bu yüzden kod kadar açıklama, test ve doküman da çıktının parçasıdır.

---

## 2. Netleştirilmiş MVP kapsamı

### 2.1 MVP'ye dahil
| # | Özellik | Not |
|---|---|---|
| M1 | Dashboard iskeleti (header, request builder, response viewer) | Tek sayfa |
| M2 | Metotlar: GET, POST, PUT, PATCH, DELETE | HEAD/OPTIONS yok |
| M3 | URL girişi | Yalnızca `http` ve `https` |
| M4 | Query parameter tablosu (ekle / sil / aktif-pasif) | |
| M5 | Header tablosu (ekle / sil / aktif-pasif) | Bazı header'lar yasak (bkz. 4.3) |
| M6 | JSON body (ham metin editörü + doğrulama) | form-data, x-www-form-urlencoded yok |
| M7 | Auth: No Auth, Bearer Token, Basic Auth | API key / OAuth yok |
| M8 | Send → backend → hedef API | |
| M9 | Response: status kodu + açıklama, süre, boyut, header'lar, body | |
| M10 | JSON response'u girintili göster; JSON olmayanı düz metin göster | |
| M11 | Response body'yi panoya kopyalama | Kullanıcı akışı 3.1 / adım 9 |
| M12 | Anlaşılır hata mesajları (geçersiz URL, JSON, DNS, bağlantı, timeout, engellenen hedef, backend hatası) | |
| M13 | SSRF koruması, boyut ve timeout sınırları | |
| M14 | Unit + integration testleri | AC-11 |

### 2.2 MVP'ye dahil değil (bilinçli olarak)
- Veritabanı, kayıtlı request'ler, geçmiş, collection, environment (Sürüm 4).
- Assertion Engine (Sürüm 2).
- AI özellikleri (Sürüm 3).
- Kullanıcı hesabı, çoklu kullanıcı.
- Cookie yönetimi (cookie jar), dosya yükleme, GraphQL, WebSocket.
- Syntax highlighting'li gelişmiş JSON editörü (ihtiyaç doğarsa sonra).

---

## 3. Gereksinim incelemesi

### 3.1 Fonksiyonel gereksinimler – değerlendirme
| ID | Durum | Yorum |
|---|---|---|
| FR-01 Request Builder | Net | Param/URL senkronizasyonu belirsiz (D-05). |
| FR-02 Response Viewer | Büyük ölçüde net | "Status açıklaması" kaynağı ve "response size" tanımı netleştirilmeli (B-06, B-07). |
| FR-03 Error Handling | Net, kapsamlı | Hata kodu sözlüğü `architecture.md` içinde tanımlandı. |
| FR-04 Assertions | Sürüm 2 | Operatör listesi yeterli; JSON path sözdizimi seçilmeli (B-10). |
| FR-05 AI | Sürüm 3 | Çıktı şeması tanımlanmalı; maliyet/limit konusu yok (B-11). |
| FR-06 Collections/Env | Sürüm 4 | Secret değerlerin DB'de nasıl saklanacağı belirsiz (D-08). |

### 3.2 Fonksiyonel olmayan gereksinimler – değerlendirme
| ID | Yorum |
|---|---|
| NFR-01 Kullanılabilirlik | "Masaüstü" hedefi net; mobil hedef dışı. Arayüz dili belirtilmemiş (D-01). |
| NFR-02 Bakım | Katmanlı mimari ile karşılanacak. |
| NFR-03 Güvenlik | SSRF gereksinimi doğru ve kritik; ancak **yerel API test etme** ihtiyacıyla çelişiyor (Ç-01). |
| NFR-04 Performans | Sayısal limitler verilmemiş (D-04). |
| NFR-05 Test edilebilirlik | Playwright'ın MVP'de zorunlu olup olmadığı belirsiz (Ç-03). |

---

## 4. Belirsizlikler ve çelişkiler

### 4.1 Çelişkiler (Ç)
**Ç-01 – SSRF koruması vs. yerel API testi.**
NFR-03 loopback ve private adresleri engellemeyi istiyor. Ancak QA mühendisleri sıklıkla `http://localhost:8080` gibi yerel servisleri test eder. Ayrıca bizim kendi integration/E2E testlerimiz de yerel bir test sunucusuna istek atmak zorunda.
→ Öneri: Varsayılan **kapalı** (engelli); `.env` içinde açıkça tanımlanan bir **allowlist** (`SSRF_ALLOWLIST=localhost:4010`) ile yalnızca belirtilen host:port çiftlerine izin. (Karar: D-02)

**Ç-02 – "JSON formatlama" iki yerde.**
MVP madde 9 "JSON response formatlama" diyor; Faz 3 (Response Analyzer) de "JSON formatlama" içeriyor.
→ Öneri: MVP'de basit girintili gösterim (`JSON.stringify(data, null, 2)`). Faz 3'te ağaç görünümü, alan tipi gösterimi, JSON path kopyalama gibi **analiz** özellikleri.

**Ç-03 – Playwright'ın zamanlaması.**
NFR-05 temel akışların Playwright ile test edilmesini istiyor; AC-11 ise yalnızca unit ve integration testlerini şart koşuyor.
→ Öneri: Playwright kurulumu ve "GET isteği gönder → response gör" smoke testi Faz 2 sonunda (MVP kapanışı). Kapsamlı E2E Faz 7'de.

**Ç-04 – Sürüm ve faz numaraları farklı.**
"Sürüm 2" = Faz 3 + Faz 4; "Sürüm 3" = Faz 5; "Sürüm 4" = Faz 6. MVP = Faz 1 + Faz 2. Dokümanlarda bu eşleme `development-roadmap.md` içinde sabitlendi.

### 4.2 Belirsizlikler (B)
| ID | Konu | Önerilen yorum |
|---|---|---|
| B-01 | Kök klasör adı: `api-sentinel/` mı, mevcut `APIProject/` mi? | Mevcut klasör proje kökü olur; ürün adı "API Sentinel" kalır. |
| B-02 | Redirect davranışı ("güvenli biçimde sınırlandırılmalı") | Manuel takip, en fazla 5 adım, **her adımda SSRF kontrolü tekrar**; `Authorization` header'ı farklı host'a taşınmaz. |
| B-03 | Timeout "yapılandırılabilir" – kim tarafından? | Sunucu varsayılanı + üst sınır `.env`'de; kullanıcı arayüzde bu sınır içinde değiştirebilir. |
| B-04 | Response boyut üst sınırı | Varsayılan 5 MB; aşılırsa akış kesilir, `RESPONSE_TOO_LARGE` hatası. |
| B-05 | İstek (gelen) boyut sınırı | Backend'e gelen JSON en fazla 1 MB. |
| B-06 | "Status açıklaması" kaynağı | Sunucunun döndüğü reason phrase HTTP/2'de yoktur; Node'un standart `STATUS_CODES` tablosu kullanılır. |
| B-07 | "Response size" tanımı | Ağdan gelen sıkıştırılmış boyut güvenilir ölçülemeyebilir; **çözülmüş body'nin byte cinsinden boyutu** gösterilir ve arayüzde böyle etiketlenir. |
| B-08 | Hangi portlara izin var? | Tüm portlar serbest; engelleme IP aralığı üzerinden yapılır. (İsterseniz port kısıtlaması eklenebilir.) |
| B-09 | Kullanıcı `Host`, `Content-Length` gibi header'ları elle verebilir mi? | Hayır; bu "yasaklı header'lar" backend tarafından reddedilir/üzerine yazılır. |
| B-10 | Assertion JSON path sözdizimi | Sürüm 2'de karar: basit nokta notasyonu (`data.items[0].id`) önerilir; tam JSONPath gerekmez. |
| B-11 | AI maliyet / hız limiti | Sürüm 3'te karar; backend tarafında basit rate limit ve AI kapalıyken çalışmaya devam. |
| B-12 | Kopyalama, Ctrl+Enter ile gönderme gibi kısayollar | Kopyalama MVP'de; kısayollar opsiyonel. |
| B-13 | Cookie davranışı | Cookie saklanmaz; `Set-Cookie` sadece header listesinde gösterilir. |

### 4.3 Eksik gereksinimler (E)
- **E-01:** Hata cevaplarının ortak formatı tanımlı değil → `architecture.md` içinde `ApiError` sözleşmesi tanımlandı.
- **E-02:** Upstream 4xx/5xx ile backend hatasının ayrımı belirtilmemiş. Hedef API'nin 404 dönmesi **bizim backend'imiz için hata değildir**; başarılı bir proxy işlemidir. → Sözleşmede ayrıldı.
- **E-03:** Logging politikası (ne loglanır, ne loglanmaz) yok → `architecture.md` güvenlik bölümünde tanımlandı.
- **E-04:** Manuel test için kararlı bir hedef API yok (internetteki demo API'ler kapalı olabilir) → Yerel **mock target server** önerildi (`test-strategy.md`).
- **E-05:** Desteklenen Node.js sürümü belirtilmemiş → Node 24 LTS veya üzeri (geliştirme ortamında 26 mevcut).
- **E-06:** Tarayıcı desteği belirtilmemiş → Güncel Chrome/Edge/Firefox masaüstü.

---

## 5. Karar vermeniz gereken konular

**Durum: 2026-11-05 tarihinde tüm öneriler kullanıcı tarafından onaylandı.** (D-08 Faz 6'da yeniden ele alınacak.)

| ID | Soru | Öneri |
|---|---|---|
| D-01 | Arayüz dili Türkçe mi İngilizce mi? | **İngilizce** (portfolio, uluslararası okunabilirlik). Dokümanlar Türkçe kalır. |
| D-02 | Yerel adreslere istek (Ç-01) | **Varsayılan engelli + `.env` allowlist** |
| D-03 | Proje yapısı | **npm workspaces**: `client/`, `server/`, `shared/` (ortak tip + Zod şemaları) |
| D-04 | Limitler | Timeout varsayılan 15 sn / üst sınır 60 sn; response 5 MB; gelen istek 1 MB; redirect 5 |
| D-05 | Query param ↔ URL senkronizasyonu | **Tek yönlü**: param tablosu gönderimde URL'ye eklenir, "final URL" önizlemesi gösterilir. İki yönlü senkron sonraya. |
| D-06 | Redirect takibi | **Takip et (max 5, her adımda SSRF kontrolü)** + arayüzde "Follow redirects" anahtarı |
| D-07 | JSON görüntüleme kütüphanesi | MVP'de **kütüphane yok** (`<pre>` + `JSON.stringify`). Faz 3'te ihtiyaca göre seçilir. |
| D-08 | (Sürüm 4) Secret değerlerin DB'de saklanması | Yerel uygulama için düz metin + açık uyarı; ya da secret'ları hiç kalıcı saklamamak. Faz 6'da karar. |
| D-09 | Express sürümü | **Express 5** (async hata yakalama yerleşik). |
| D-10 | Frontend component testleri (React Testing Library) MVP'de olsun mu? | **Evet, sınırlı**: KeyValueEditor ve BodyEditor gibi mantık içeren bileşenler. |

---

## 6. MVP kabul kriterleri – izlenebilirlik

| AC | Doğrulama yöntemi | İlgili manuel test |
|---|---|---|
| AC-01 GET | Manuel + integration | API-001 |
| AC-02 POST JSON | Manuel + integration | API-002 |
| AC-03 Params & headers | Manuel + unit (urlBuilder) + integration | API-003, API-004 |
| AC-04 Bearer & Basic | Manuel + unit (authApplier) + integration | API-011, API-012 |
| AC-05 Status, headers, body, süre | Manuel + integration | API-001 |
| AC-06 JSON format | Manuel + component test | API-001 |
| AC-07 JSON olmayan response | Manuel + integration | API-008 |
| AC-08 Timeout & bağlantı hatası | Manuel + integration | API-007, API-013 |
| AC-09 Geçersiz URL & JSON | Manuel + unit + integration | API-005, API-006 |
| AC-10 Engellenen hedefler | Unit (ssrfGuard) + integration | SEC-001…SEC-010 |
| AC-11 Testler geçer | CI/komut çıktısı | – |
| AC-12 README ile kurulum | Temiz klonda manuel deneme | – |

Test ID'lerinin tam listesi `test-strategy.md` içindedir.
