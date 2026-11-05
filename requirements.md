# API Sentinel
## Gereksinim Analizi ve Claude Code Başlangıç Talimatları

**Belge türü:** Ürün gereksinimleri + teknik başlangıç talimatı  
**Sürüm:** 1.0  
**Proje adı:** API Sentinel  
**Ürün tanımı:** QA mühendislerinin REST API istekleri göndermesini, response'ları incelemesini, doğrulama kuralları çalıştırmasını ve AI desteğiyle test senaryoları üretmesini sağlayan web tabanlı API test platformu.

---

# 1. Proje amacı

API Sentinel, yazılım test uzmanlarının günlük API test süreçlerini kolaylaştırmak amacıyla geliştirilecektir.

Uygulama yalnızca HTTP isteği gönderen basit bir araç olmayacaktır. Kullanıcıların request oluşturabildiği, response detaylarını inceleyebildiği, belirlediği assertion kurallarını çalıştırabildiği ve sonraki aşamalarda AI yardımıyla test senaryoları üretebildiği modüler bir QA aracı olacaktır.

Proje aynı zamanda geliştiricisinin React, TypeScript, Node.js, REST API, backend mimarisi, yazılım güvenliği ve test otomasyonu konularındaki becerilerini gösterebileceği bir portfolio projesidir.

## 1.1 Temel hedefler

- REST API istekleri oluşturup gönderebilmek.
- Request ve response detaylarını anlaşılır şekilde görüntülemek.
- Response alanlarını ve veri tiplerini doğrulamak.
- Tekrar kullanılabilir assertion kuralları tanımlamak.
- Test sonuçlarını PASS / FAIL olarak raporlamak.
- AI ile test senaryosu ve edge case önerileri üretmek.
- Request koleksiyonları ve environment'lar yönetmek.
- Uygulamanın kendisini manuel ve otomasyon testleriyle doğrulamak.

## 1.2 Hedef kullanıcı

Birincil kullanıcı: Web servislerini test eden manual QA, API tester ve QA engineer.

İlk sürüm tek kullanıcıya yönelik, yerel ortamda çalıştırılabilen bir portfolio uygulaması olacaktır. Kullanıcı hesabı, çok kullanıcılı çalışma alanı ve abonelik sistemi MVP kapsamına dahil değildir.

---

# 2. Ürün kapsamı ve geliştirme öncelikleri

Geliştirme küçük ve doğrulanabilir aşamalara ayrılacaktır. Her aşama tamamlanmadan sonraki aşamaya geçilmeyecektir.

## MVP – İlk çalışan sürüm

MVP aşağıdaki özellikleri içermelidir:

1. Modern ve anlaşılır dashboard.
2. HTTP request oluşturma.
3. GET, POST, PUT, PATCH ve DELETE metotları.
4. URL, query parameters, headers ve request body düzenleme.
5. JSON body desteği.
6. Bearer Token ve Basic Authentication.
7. Request gönderme.
8. Response body, status code, headers ve response time görüntüleme.
9. JSON response formatlama.
10. Hata durumlarını anlaşılır gösterme.

MVP tamamlandığında kullanıcı, Postman benzeri temel bir akışla bir REST API'ye istek gönderebilmeli ve dönen response'u inceleyebilmelidir.

## Sonraki sürümler

**Sürüm 2 – Response Analyzer ve Assertion Engine**
- JSON alanının varlığını kontrol etme.
- JSON alanının değerini kontrol etme.
- JSON alanının veri tipini kontrol etme.
- Null / not null kontrolleri.
- Equals, not equals, contains, greater than, less than gibi operatörler.
- Status code assertion.
- Response time assertion.
- Header assertion.
- PASS / FAIL sonuçları ve hata açıklamaları.

**Sürüm 3 – AI özellikleri**
- Kullanıcının endpoint açıklamasından test senaryoları üretme.
- Positive, negative, boundary ve edge case önerileri.
- Test senaryolarını düzenleme ve kaydetme.
- Response içeriğini analiz edip şüpheli durumları açıklama.
- Ek test önerileri sunma.
- AI çıktısının kesin bug kararı değil, QA tarafından doğrulanması gereken öneri olduğunu açıkça belirtme.

**Sürüm 4 – Test yönetimi ve raporlama**
- Request collection oluşturma.
- Collection içinde klasör oluşturma.
- Request kaydetme ve tekrar açma.
- Environment oluşturma (ör. Dev, QA, Staging).
- Environment variable kullanımı.
- Test execution geçmişi.
- HTML veya JSON test raporu dışa aktarma.
- Önceki çalıştırmalarla sonuç karşılaştırma.

Bu sonraki sürümler MVP tamamlanıp doğrulanmadan geliştirilmeyecektir.

---

# 3. Kullanıcı akışları

## 3.1 API isteği gönderme

1. Kullanıcı uygulamayı açar.
2. Request Builder ekranına gider.
3. HTTP metodunu seçer.
4. API URL'sini girer.
5. Gerekirse Params, Headers, Authorization ve Body alanlarını doldurur.
6. Send butonuna basar.
7. Uygulama isteği backend üzerinden gönderir.
8. Response ekranında status code, süre, headers ve body görüntülenir.
9. Kullanıcı response içeriğini inceleyebilir ve kopyalayabilir.

## 3.2 Response doğrulama (Sürüm 2)

1. Kullanıcı bir request oluşturur.
2. Assertion ekler.
3. Beklenen değeri veya koşulu tanımlar.
4. Request'i gönderir.
5. Assertion Engine response üzerinde kontrolleri çalıştırır.
6. Her assertion için PASS veya FAIL sonucu ve açıklama gösterilir.

## 3.3 AI ile test senaryosu üretme (Sürüm 3)

1. Kullanıcı endpoint, HTTP metodu ve açıklamayı girer.
2. Varsa örnek request/response veya API şeması ekler.
3. Generate Test Cases işlemini başlatır.
4. AI pozitif, negatif ve sınır değer senaryoları önerir.
5. Kullanıcı sonuçları inceler ve düzenler.
6. Uygun senaryoları kaydeder veya dışa aktarır.

---

# 4. Fonksiyonel gereksinimler

## FR-01 – HTTP Request Builder

Sistem aşağıdaki HTTP metotlarını desteklemelidir:
- GET
- POST
- PUT
- PATCH
- DELETE

Kullanıcı:
- URL girebilmelidir.
- Query parameter ekleyip silebilmelidir.
- Header ekleyip silebilmelidir.
- JSON request body girebilmelidir.
- Authorization türünü seçebilmelidir.
- Request'i gönderebilmelidir.

İlk sürümde desteklenecek authentication:
- No Auth
- Bearer Token
- Basic Auth

API key authentication ve OAuth 2.0 ilk MVP kapsamına dahil değildir.

## FR-02 – Response Viewer

Response ekranında aşağıdakiler gösterilmelidir:
- HTTP status code.
- Status açıklaması.
- Response time.
- Response size (güvenilir biçimde hesaplanabiliyorsa).
- Response headers.
- Response body.

JSON response girintili ve okunabilir biçimde gösterilmelidir. JSON olmayan response'lar da metin olarak görüntülenebilmelidir.

## FR-03 – Error Handling

Aşağıdaki durumlar kullanıcıya anlaşılır mesajlarla gösterilmelidir:
- Geçersiz URL.
- Network bağlantı hatası.
- DNS veya bağlantı hatası.
- Timeout.
- Geçersiz JSON body.
- Desteklenmeyen veya engellenen hedef adres.
- Backend hatası.

Hata mesajları teknik ayrıntıları gerektiği ölçüde açıklamalı, gizli token veya secret değerlerini göstermemelidir.

## FR-04 – Response Assertions (Sürüm 2)

Assertion sistemi en az şu kontrolleri desteklemelidir:
- Status code equals.
- Response time less than.
- JSON path exists.
- JSON path equals.
- JSON path not equals.
- JSON path is null / is not null.
- JSON field type.
- String contains.
- Numeric greater than / less than.
- Header equals / exists.

Her assertion sonucu; kontrol adı, beklenen değer, gerçekleşen değer, sonuç ve açıklama içermelidir.

## FR-05 – AI Test Case Generator (Sürüm 3)

AI modülü endpoint açıklaması, method, request örneği, response örneği veya kullanıcının sağladığı API şeması üzerinden test senaryoları önermelidir.

AI çıktısı yapılandırılmış ve doğrulanabilir formatta olmalıdır. Üretilen senaryolar kullanıcı tarafından düzenlenebilmelidir.

AI API anahtarı yalnızca backend ortam değişkeninde tutulmalıdır. Anahtar frontend'e gönderilmemelidir.

## FR-06 – Collections ve Environments (Sürüm 4)

Kullanıcı request'leri collection içinde kaydedebilmelidir. Environment variable değerleri request URL, header ve body içinde kullanılabilmelidir.

Secret olarak işaretlenen environment değerleri arayüzde maskelenmeli ve loglara yazılmamalıdır.

---

# 5. Fonksiyonel olmayan gereksinimler

## NFR-01 – Kullanılabilirlik
- Arayüz sade, modern ve QA araçlarına uygun olmalıdır.
- Request oluşturma ve response inceleme akışı kolay anlaşılmalıdır.
- Loading, empty, success ve error durumları tasarlanmalıdır.
- Temel masaüstü ekran boyutlarında düzgün çalışmalıdır.

## NFR-02 – Bakım yapılabilirlik
- TypeScript kullanılmalıdır.
- Frontend ve backend sorumlulukları ayrılmalıdır.
- İş mantığı UI bileşenlerinin içine yığılmamalıdır.
- Tekrarlanan kodlar ortak servis ve bileşenlerde toplanmalıdır.
- Kritik kararlar ve karmaşık fonksiyonlar açıklanmalıdır.

## NFR-03 – Güvenlik
- API anahtarları frontend koduna gömülmemelidir.
- Secret değerler loglanmamalıdır.
- Backend'e gelen kullanıcı girdileri doğrulanmalıdır.
- İstek boyutu ve timeout sınırları uygulanmalıdır.
- Kullanıcının verdiği URL'lere backend üzerinden istek gönderildiği için SSRF koruması uygulanmalıdır.
- Loopback, private, link-local, metadata ve diğer yasaklı adres aralıklarına erişim engellenmelidir.
- DNS çözümleme ve yönlendirme (redirect) kontrolleriyle SSRF atlatmaları önlenmelidir.
- Redirect davranışı güvenli biçimde sınırlandırılmalıdır.
- Kullanıcı tarafından girilen kod çalıştırılmamalıdır. eval veya Function kullanılmamalıdır.
- Hassas request/response verileri gereksiz yere kalıcı olarak saklanmamalıdır.

Not: Bu uygulama ilk etapta yerel geliştirme ve portfolio amacıyla kullanılacaktır. Gerçek kullanıcıların erişimine açılmadan önce güvenlik incelemesi yapılmalıdır.

## NFR-04 – Performans
- Request timeout değeri yapılandırılabilir olmalıdır.
- Response boyutu için makul bir üst sınır bulunmalıdır.
- Büyük response'lar arayüzü kilitlememelidir.
- Loading durumu kullanıcıya gösterilmelidir.

## NFR-05 – Test edilebilirlik
- Önemli iş mantığı unit testlerle doğrulanmalıdır.
- Backend endpoint'leri integration testlerle doğrulanmalıdır.
- Temel kullanıcı akışları Playwright ile E2E test edilmelidir.
- Hatalı girdiler ve negatif senaryolar da test edilmelidir.

---

# 6. Önerilen teknik mimari

İlk aşama için aşağıdaki teknoloji seti önerilir. Claude Code, geliştirmeye başlamadan önce güncel ve uyumlu sürümleri kontrol etmeli; gereksiz teknoloji veya bağımlılık eklememelidir.

## Frontend
- React
- TypeScript
- Vite
- Tailwind CSS
- İhtiyaç varsa React Router
- İhtiyaç varsa TanStack Query
- JSON görüntüleme/editör bileşeni (uygun, bakımı süren bir paket seçilmeli)

## Backend
- Node.js
- TypeScript
- Express
- Zod
- HTTP isteklerini göndermek için uygun HTTP client
- Merkezi error handling

## Veri tabanı
- SQLite
- Prisma ORM

MVP'de veri tabanı zorunlu değilse ilk çalışan request akışı tamamlanana kadar eklenmesi ertelenebilir. Gereksiz erken karmaşıklıktan kaçınılmalıdır.

## AI
- Anthropic Claude API
- AI çağrıları yalnızca backend üzerinden yapılmalıdır.
- AI servisi diğer uygulama modüllerinden ayrılmış bir service katmanında bulunmalıdır.
- AI yanıtları Zod veya benzeri bir şema ile doğrulanmalıdır.
- AI kullanılamadığında temel API test özellikleri çalışmaya devam etmelidir.

## Test araçları
- Vitest: unit test.
- Supertest veya eşdeğeri: backend integration test.
- Playwright: E2E test.

---

# 7. Önerilen başlangıç klasör yapısı

Claude Code, ihtiyaçları değerlendirdikten sonra yapıyı sadeleştirebilir; ancak frontend ve backend ayrımı korunmalıdır.

api-sentinel/
- client/
  - src/
    - components/
    - features/
      - request-builder/
      - response-viewer/
      - assertions/
      - ai-assistant/
      - collections/
    - pages/
    - services/
    - hooks/
    - types/
- server/
  - src/
    - routes/
    - controllers/
    - services/
      - request-engine/
      - assertion-engine/
      - ai-engine/
    - middleware/
    - validators/
    - utils/
- docs/
  - requirements.md
  - architecture.md
  - test-strategy.md
- .env.example
- .gitignore
- README.md

---

# 8. MVP kabul kriterleri

MVP tamamlandı sayılmadan önce aşağıdaki kriterlerin tümü doğrulanmalıdır.

**AC-01:** Kullanıcı GET isteği gönderebilmeli ve başarılı response'u görebilmelidir.

**AC-02:** Kullanıcı POST isteği gönderebilmeli ve JSON body iletebilmelidir.

**AC-03:** Kullanıcı query parameter ve header ekleyebilmelidir.

**AC-04:** Bearer Token ve Basic Auth çalışmalıdır.

**AC-05:** Response status code, headers, body ve response time gösterilmelidir.

**AC-06:** JSON response okunabilir biçimde formatlanmalıdır.

**AC-07:** JSON olmayan response uygulamayı bozmadan görüntülenebilmelidir.

**AC-08:** Timeout ve bağlantı hataları anlaşılır biçimde gösterilmelidir.

**AC-09:** Geçersiz URL ve geçersiz JSON body uygun şekilde ele alınmalıdır.

**AC-10:** Güvenlik kontrolleriyle engellenmesi gereken hedeflere istek gönderilememelidir.

**AC-11:** İlgili unit ve integration testleri başarılı olmalıdır.

**AC-12:** Uygulama README'de açıklanan komutlarla başka bir geliştirici tarafından kurulup çalıştırılabilmelidir.

---

# 9. Manuel test ve otomasyon stratejisi

Her modül için önce manuel test yapılacak, ardından otomasyon testleri yazılacaktır.

Örnek MVP manuel test senaryoları:

| ID | Senaryo | Beklenen sonuç |
|---|---|---|
| API-001 | Geçerli GET isteği gönder | Response görüntülenir |
| API-002 | Geçerli POST JSON body gönder | İstek doğru body ile iletilir |
| API-003 | Query parameter ekle | Parametre URL'ye doğru eklenir |
| API-004 | Custom header ekle | Header request'e eklenir |
| API-005 | Geçersiz URL gönder | Anlaşılır hata gösterilir |
| API-006 | Geçersiz JSON body gönder | İstek gönderilmeden doğrulama hatası gösterilir |
| API-007 | Timeout oluşturan endpoint kullan | Timeout hatası gösterilir |
| API-008 | JSON olmayan response al | Response metin olarak gösterilir |
| API-009 | 404 dönen endpoint çağır | HTTP 404 response'u gösterilir |
| API-010 | 500 dönen endpoint çağır | HTTP 500 response'u gösterilir |

Otomasyon testleri manuel doğrulama sonrasında yazılmalıdır. Testlerin hangi davranışı doğruladığı açıklanmalıdır.

---

# 10. Geliştirme yöntemi ve çalışma kuralları

Bu proje AI tarafından tek seferde üretilmeyecek. Geliştirici öğrenerek ve her aşamayı doğrulayarak ilerleyecektir.

Claude Code aşağıdaki kurallara kesinlikle uymalıdır:

1. Büyük bir geliştirme görevine başlamadan önce yapılacakları kısa bir plan halinde sun.
2. Kullanıcı onayı olmadan bir sonraki faza geçme.
3. Önemli kod parçalarını ve mimari kararları Türkçe açıkla.
4. Yeni bir teknoloji, kütüphane veya tasarım kalıbı kullanmadan önce ne işe yaradığını ve neden gerektiğini açıkla.
5. Kullanıcı anlamadığı bir konu olduğunu belirttiğinde o konuyu örneklerle öğret; açıklama tamamlanmadan sonraki aşamaya geçme.
6. Gereksiz bağımlılık ve karmaşıklık ekleme.
7. Kod yazdıktan sonra ilgili testleri, lint ve type-check komutlarını çalıştır.
8. Test başarısızsa hatayı gizleme veya testi geçici olarak etkisizleştirme; nedenini araştır ve açıkla.
9. Claude tarafından üretilen kodun doğru olduğu varsayılmamalıdır. Kullanıcı kodu ve test sonuçlarını inceleyebilmelidir.
10. Her modül için önce manuel test senaryolarını ve beklenen sonuçları hazırla.
11. Kullanıcı manuel testleri gerçekleştirdikten ve sonuçları değerlendirdikten sonra otomasyon testlerini yaz.
12. Her tamamlanan faz sonunda değişiklikleri özetle ve uygun Git commit mesajı öner.
13. Kullanıcı onaylamadan Git commit oluşturma.
14. Var olan kullanıcı değişikliklerini izinsiz silme veya üzerine yazma.
15. Çalışan özellikleri gereksiz yere yeniden yazma.
16. Gerçek API anahtarlarını, token'ları veya şifreleri kaynak koda ekleme.
17. Yapılmayan testleri yapılmış gibi gösterme.
18. Bir fazın kabul kriterleri karşılanmadan tamamlandı olarak işaretleme.

Açıklamalar Türkçe, kod ve değişken isimleri İngilizce olmalıdır.

---

# 11. Faz bazlı geliştirme planı

## Faz 0 – Analiz ve proje planı
- Gereksinimleri incele.
- Belirsizlikleri listele.
- Mimari önerisini hazırla.
- Teknoloji kararlarını gerekçelendir.
- Güvenlik risklerini belirle.
- MVP görevlerini küçük parçalara ayır.
- Henüz kod yazma.

Çıktı: requirements.md, architecture.md, test-strategy.md ve geliştirme planı.

## Faz 1 – Proje altyapısı ve arayüz
- Frontend ve backend kurulumu.
- TypeScript yapılandırması.
- Temel dashboard.
- Request Builder arayüzü.
- Backend health-check endpoint'i.
- Geliştirme komutları.
- Manuel kontrol.

## Faz 2 – API Request Engine
- HTTP method desteği.
- URL ve query parameters.
- Headers.
- JSON body.
- Authorization.
- Backend üzerinden request gönderme.
- Response Viewer.
- Hata yönetimi.
- Önce manuel test, sonra unit ve integration test.

## Faz 3 – Response Analyzer
- JSON formatlama.
- Response metadata gösterimi.
- JSON alanı ve veri tipi inceleme.
- Manuel test.
- Otomasyon testleri.

## Faz 4 – Assertion Engine
- Assertion oluşturma.
- Assertion çalıştırma.
- PASS / FAIL sonuçları.
- Manuel test.
- Unit ve integration test.

## Faz 5 – AI özellikleri
- Anthropic API entegrasyonu.
- Test case üretimi.
- Response analizi.
- AI çıktısı doğrulama.
- Manuel test.
- Otomasyon testleri.

## Faz 6 – Collections ve raporlama
- Request kaydetme.
- Collection yönetimi.
- Environment yönetimi.
- Test geçmişi.
- Rapor oluşturma.
- Manuel ve otomasyon testleri.

## Faz 7 – Portfolio hazırlığı
- README.
- Mimari diyagram.
- Ekran görüntüleri.
- Demo senaryosu.
- Test raporu.
- Kurulum dokümantasyonu.
- GitHub repository düzeni.

---

# 12. İlk geliştirme oturumunun talimatı

İlk oturumda senden beklenenler:

1. Bu belgeyi tamamen oku.
2. Gereksinimleri anladığını kendi cümlelerinle özetle.
3. Belirsiz veya çelişkili gereksinimleri listele.
4. MVP kapsamını netleştir.
5. Önerilen mimariyi ve klasör yapısını sun.
6. Teknoloji seçimlerini kısa ve anlaşılır şekilde açıkla.
7. Güvenlik risklerini ve bunlara karşı alınacak önlemleri açıkla.
8. Faz 0 için oluşturulacak dokümanları belirt.
9. İlk kodlama fazının görevlerini küçük ve doğrulanabilir adımlara böl.
10. Kullanıcı onayı olmadan kod yazmaya başlama.

**İlk aşamada yalnızca analiz ve planlama yap. Henüz uygulama kodu üretme.**
