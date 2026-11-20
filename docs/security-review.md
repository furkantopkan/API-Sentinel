# Güvenlik gözden geçirmesi (Faz 8.1)

Tarih: 2026-11-20 · Kapsam: `server`, `client`, `shared`, git geçmişi, bağımlılıklar.
Yöntem: kod okuma + çalışan uygulamaya karşı gerçek deneme. Her bulgu bir otomasyon testiyle korunur.

## Özet

| # | Konu | Sonuç |
|---|---|---|
| 1 | Git geçmişinde sır | Temiz: `.env`, veritabanı, anahtar dosyası hiç commit edilmemiş; geçmişte gerçek anahtar yok (yalnızca testteki `sk-ant-SECRET` örneği) |
| 2 | Bağımlılıklar | Çalışma zamanı: 0 açık. Geliştirme: `minimatch` (ESLint zinciri) için 9 orta uyarı, uygulamaya etkisi yok |
| 3 | SSRF | 14/14 deneme engellendi (aşağıda) |
| 4 | Sırların sızması | Loglar yalnızca yöntem, host, durum ve süre yazar; ortam sırları API'den okunamaz; çalıştırma sonuçlarında yakalanan token ve cookie değerleri maskelenir; AI'a giden kayıt maskelenir, cookie başlığı atılır |
| 5 | XSS | Yasaklı API yok (`eval`, `new Function`, `vm`, `dangerouslySetInnerHTML`, `innerHTML`); HTML raporunda her değer kaçışlanır ve rapor `default-src 'none'` ile sunulur |
| 6 | Kayıt tarayıcısı | Yalnızca sunucu yerelde dinliyorsa açık; boş profil; trafik yalnızca bellekte; bot koruması aşılmaya çalışılmaz |
| 7 | Güvenlik başlıkları | **Bulgu → düzeltildi** |
| 8 | CSRF | **Bulgu → düzeltildi** |
| 9 | DNS rebinding | **Bulgu → düzeltildi** |

## SSRF denemeleri (çalışan uygulamaya, `POST /api/requests/execute`)

`127.0.0.1:22`, `localhost:3000`, `169.254.169.254` (bulut meta verisi), `2130706433`, `0x7f000001`, `0177.0.0.1`, `[::1]`, `[::ffff:127.0.0.1]`, `0.0.0.0`, `192.168.1.1`, `10.0.0.1`, `localtest.me` (DNS ile 127.0.0.1) → hepsi `BLOCKED_TARGET`. `file://` ve `gopher://` → `INVALID_URL`. Yönlendirmeler her adımda yeniden denetlenir (`requestEngine.test.ts`).

## Düzeltilen bulgular

**7. Güvenlik başlıkları (orta).** Sayfa hiçbir güvenlik başlığı göndermiyordu; başka bir site uygulamayı görünmez bir çerçeveye alıp kullanıcıya tıklatabilirdi (clickjacking). Artık her yanıtta: CSP (`default-src 'self'`, `script-src 'self'`, `frame-ancestors 'none'` …), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`. Derlenmiş arayüz bu CSP ile denendi: ihlal yok.

**8. CSRF (düşük–orta).** Herhangi bir web sayfası tarayıcıya yerel API'ye gövdesiz bir POST attırabilir (ön izin sorulmaz, `Host` yine `localhost` görünür); örneğin süren bir kaydı bitirebilirdi. Artık başka bir sitenin `Origin` başlığını taşıyan değişiklik istekleri `403 FORBIDDEN_ORIGIN` alır. `Origin` göndermeyen araçlar (curl, testler) etkilenmez.

**9. DNS rebinding (düşük).** `Host` kontrolü yalnızca derlenmiş arayüz sunulurken tüm uçlara uygulanıyordu; geliştirme modunda yalnızca kayıt uçlarına. Artık sunucu yerel adreste dinlediği her modda uygulanır; bilerek ağa açılmış bir sunucuda (`HOST=0.0.0.0`) uygulanmaz.

Testler: `server/tests/integration/app.test.ts` (başlıklar, CSRF, host adı).

## Kabul edilen riskler

- **`minimatch` uyarısı:** yalnızca geliştirme aracı ESLint'i etkiler, kendi dosya kalıplarımızı işler. ESLint güncellendiğinde kapanır.
- **Bot koruması olan siteler:** bu siteler sayfa adımlarını engeller (`BLOCKED_BY_SITE`). Tarayıcı kimliğine bürünmek bilerek yapılmaz.
- **Yerel AI:** model kendi bilgisayarınızda çalışır; buluttaki modele (`AI_MODE=anthropic`) geçilirse kayıt maskelenmiş olarak dışarı gönderilir.
- **Tek kullanıcı:** uygulamada oturum açma yoktur; yalnızca bu bilgisayardan erişilebilir olması varsayılır. Ağa açmak (`HOST=0.0.0.0`) bu varsayımı bozar.
