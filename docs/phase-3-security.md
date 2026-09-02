# Duevia — Faz 3 güvenlik ve risk çerçevesi

## Durum

Bu aşamadaki `DueviaEscrow.sol` test edilmiş bir teknik temeldir; bağımsız
denetimden geçmemiştir ve gerçek fonlarla kullanıma hazır değildir. Testnet
dağıtımından önce aşağıdaki kontroller tamamlanmalıdır.

## Tehdit modeli

Korunan varlıklar:

- escrow’daki USDC;
- özel anlaşma ve teslim dosyaları;
- taraf rollerinin bütünlüğü;
- kilometre taşı zaman çizelgesi;
- zincir ve uygulama kayıtlarının tutarlılığı;
- oturum ve dağıtım sırları.

Başlıca tehditler:

- yetkisiz release veya refund;
- aynı işlem/olayın iki kez muhasebeleştirilmesi;
- müşteri ya da sağlayıcının fonları süresiz kilitlemesi;
- sahte cüzdan oturumu ve yeniden oynatma;
- özel R2 nesnelerinin sızması;
- RPC yanlış ağı veya geçici hız sınırlaması;
- zincir olayı kesinleşmeden UI’ın final durum göstermesi;
- bağımlılık ve tedarik zinciri açıkları.

## Sözleşme korumaları

- rol kontrollü fonlama, teslim, onay ve iade;
- `SafeERC20` ile standart dışı token dönüşlerinin güvenli ele alınması;
- fon hareketlerinde `ReentrancyGuard`;
- state değişiklikleri token transferinden önce uygulanır;
- tek seferlik tam fonlama ve transfer sonrası gerçek bakiye kontrolü;
- yalnız mevcut kilometre taşının işlenmesi;
- sınırlı revizyon;
- inceleme süresi aşımında sağlayıcı release yolu;
- teslim son tarihi + ek sürede müşteri refund yolu;
- işe başlamadan iptal ve iki taraflı iptal;
- zincirde özel içerik yerine `bytes32` referanslar.

## Sözleşme öncesi zorunlu kontroller

1. Slither veya eşdeğer statik analiz.
2. Fuzz ve invariant testleri:
   `contractBalance == total - released - refunded`.
3. Adversarial ERC-20 ve reentrancy test sözleşmeleri.
4. Timestamp sınırları ve maksimum 50 kilometre taşı için gas ölçümü.
5. Arc Testnet üzerinde gerçek USDC adresiyle fork/integration testi.
6. En az bir bağımsız Solidity incelemesi.
7. Deployment bytecode, constructor argümanları ve explorer verification.
8. Ana ağ kararı öncesi profesyonel güvenlik denetimi.

## Uygulama güvenliği

- Cüzdan oturum nonce’u tek kullanımlık ve kısa ömürlüdür.
- İmzalanan mesaj domain, URI, chain ID, issued-at ve expiration içerir.
- Her mutasyonda client/provider rolü sunucuda tekrar doğrulanır.
- SameSite, HTTP-only oturum çerezi ve tek kullanımlık challenge kullanılır.
- Cüzdan challenge ve imza doğrulama rotaları D1 tabanlı hız sınırı uygular.
- API mutasyonları idempotency key kabul eder.
- D1 kayıtları doğrulanmış Arc receipt’i olmadan final olarak işaretlenmez.
- R2 bucket public değildir; indirme yetkisi agreement rolüyle doğrulanır.
- Dosya tipi uzantı yerine içerik imzasıyla kontrol edilir ve boyut sınırlıdır.
- Loglarda imza, private key, nonce, dosya URL’si veya özel iş metni tutulmaz.
- `frame-ancestors`, MIME sniffing, referrer ve tarayıcı izin başlıkları eklenmiştir.
- Zararlı içerik taraması production öncesi açık kalan zorunlu kontroldür.

## Arc’a özgü kontroller

- Her RPC sonucu chain ID `5042002` ile doğrulanır.
- Birincil RPC `.network`, dRPC yalnız yedektir; public endpoint hız sınırlaması
  için kontrollü retry ve sağlık kontrolü uygulanır.
- İş muhasebesinde Duevia escrow olayları kaynak kabul edilir.
- Genel USDC indeksleyicide altı ondalıklı ERC-20 olayı ile 18 ondalıklı native
  ayna olayı tek ekonomik hareket olarak işlenir.
- App Kit Bridge tamamlanması, escrow fonlamasından ayrı bir durumdur.
- Memo wrapper smart contract wallet kimliğinin kanıtı olarak kullanılmaz.

## Sır yönetimi

- Private key yalnız deployment ortamında tutulur.
- `NEXT_PUBLIC_*` değişkenlerinde hiçbir sır bulunmaz.
- `.env*` git tarafından yok sayılır; yalnız `.env.example` commit edilir.
- Production deployment için tek kullanımlık deployer veya multisig tercih edilir.
- Testnet ve production anahtarları, D1 veritabanları ve R2 bucket’ları ayrılır.

## Açık riskler

| Risk | Mevcut durum | Faz 4/5 aksiyonu |
| --- | --- | --- |
| Sözleşme denetimsiz | Yüksek | Audit öncesi yalnız testnet |
| İnsan uyuşmazlığı | Ürün sınırı | MVP’de otomatik hakem yok; açıkça anlat |
| Public RPC rate limit | Gözlendi | Retry, yedek ve sağlık izlemesi |
| Paket açıkları | Upstream uyarılar mevcut | Kilitli sürümleri izlemeye devam et; kırıcı zorlamadan kaçın |
| Zararlı dosya taraması yok | Testnet boyut/MIME/hash koruması var | Production upload pipeline’ına tarama ekle |
| Harici alarm ve yedek politikası | Runbook hazır | Production ortamında servisleri ve saklama süresini etkinleştir |
| İki cüzdanlı nihai kabul | Kullanıcı doğrulaması bekliyor | `docs/two-wallet-checklist.md` tamamlanmadan PR’ı hazır yapma |

## 25 Temmuz 2026 bağımlılık taraması

- Uygulama çalışma zamanı: `0 critical`, `0 high`, `15 moderate`, `7 low`.
- Sözleşme çalışma zamanı: `0` bilinen uyarı.
- Uygulama geliştirme zinciri dâhil: `0 critical`, `9 high`,
  `19 moderate`, `7 low`.
- Sözleşme geliştirme zinciri dâhil: `0 critical`, `13 high`,
  `2 moderate`, `7 low`.

Çalışma zamanındaki yüksek PostCSS ve Sharp uyarıları, test edilen yamalı sürüm
override’ları ile kapatıldı. Kalan yüksek uyarılar ESLint veya Hardhat araç
zincirindedir. `--force` veya işlev kıran geriye sürüm düşürme uygulanmadı.
Circle App Kit için audit aracının sunduğu çözüm `1.10.0` sürümünden `1.0.0`
sürümüne dönmekti; işlev kaybı ve uyumsuzluk riski nedeniyle reddedildi. Circle
bağımlılıklarındaki moderate uyarılar upstream çözüm bekliyor.

Bu sayılar 25 Temmuz 2026 tarihli taramanın kaydıdır. Yeni bir dış tarama,
bağımlılık adları ve sürümlerini seçilen danışma servisine göndermek için açık
onay alınmadan çalıştırılmaz.
