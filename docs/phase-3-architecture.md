# Duevia — Faz 3 teknik mimari

## 1. Ürün sınırı

Duevia, herhangi bir ülkeyi varsayılan kabul etmeyen global bir hizmet işi
akışıdır. İki taraf kapsamı ve kilometre taşlarını kabul eder; müşteri toplam
tutarı Arc üzerinde USDC ile fonlar; sağlayıcı işi aşamalar hâlinde teslim eder;
onaylanan tutar serbest bırakılır.

MVP dört fiil üzerine kuruludur:

1. **Agree:** taraflar, tutar, teslim tarihi, inceleme süresi ve revizyon sınırı.
2. **Fund:** toplam anlaşma tutarının Arc üzerindeki escrow’a aktarılması.
3. **Deliver:** yalnız aktif kilometre taşına teslim ve içerik kanıtı eklenmesi.
4. **Settle:** onay, süre aşımı veya iade kuralına göre USDC’nin çözülmesi.

Uyuşmazlık hakemliği, itibari para dönüşümü, vergi mevzuatı ve otomatik hukuki
fatura geçerliliği MVP kapsamında değildir.

## 2. Mimari karar

Duevia hibrit bir model kullanır:

| Katman | Sorumluluk | Veri |
| --- | --- | --- |
| Tarayıcı | Cüzdan bağlantısı, imza, işlem onayı | Geçici kullanıcı durumu |
| Uygulama/API | Yetki, doğrulama, idempotency, zaman çizelgesi | D1 kayıtları |
| Dosya depolama | Korumalı teslimler | R2 nesneleri |
| Duevia escrow | Fon, kilometre taşı durumu, serbest bırakma/iade | Arc onchain |
| Circle App Kit | Başka zincirden Arc’a USDC hazırlama | Bridge / Unified Balance |
| İndeksleyici | Onchain olayları doğrulayıp uygulamaya yansıtma | `chain_events` |

İş tanımı, mesajlar, gerçek dosya adları ve teslim dosyaları zincire yazılmaz.
Zincirde yalnız referans hash’leri, roller, tutarlar, süreler ve settlement
olayları bulunur.

## 3. Arc ve Circle entegrasyonu

- Ağ: Arc Testnet
- Chain ID: `5042002`
- Birincil RPC: `https://rpc.testnet.arc.network`
- Yedek RPC: `https://arc-testnet.drpc.org`
- Explorer: `https://testnet.arcscan.app`
- USDC ERC-20: `0x3600000000000000000000000000000000000000`
- CCTP domain: `26`

Circle App Kit içinde Arc Testnet hem Bridge hem Unified Balance için programatik
olarak doğrulanmıştır. MVP’de zincirler arası fonlama iki açık adımdır:

1. kullanıcı App Kit ile USDC’yi Arc’a getirir veya Arc Unified Balance kullanır;
2. Arc bakiyesi kesinleşince Duevia escrow sözleşmesini fonlar.

Bu iki adımı tek ve geri alınamaz bir uygulama işlemi gibi göstermemek bilinçli
bir güvenlik kararıdır. Köprü kesinleşmeden escrow fonlandı görünmez.

Arc üzerindeki tipik USDC hareketi hem altı ondalıklı ERC-20 `Transfer`, hem de
18 ondalıklı native sistem transferi üretebilir. Duevia iş muhasebesinde escrow
domain olayları esas alınır. Genel USDC olaylarında aynı işlem, taraflar ve
ölçeklenmiş tutar eşleşiyorsa native ayna olayı düşürülür.

## 4. Escrow durum makinesi

### Anlaşma

`AwaitingFunding → Active ↔ CancelPending → Completed | Cancelled | Refunded`

- `AwaitingFunding`: henüz para kilitlenmemiştir.
- `Active`: fonlanmış, mevcut kilometre taşı çalışabilir.
- `CancelPending`: taraflardan biri ortak iptali onaylamıştır; normal teslim ve
  ödeme yolları kapanmaz.
- `Completed`: tüm kilometre taşları serbest bırakılmıştır.
- `Cancelled`: işe başlamadan iptal veya iki taraflı iptal tamamlanmıştır.
- `Refunded`: teslim süresi ve ek süre aşılmış, kalan tutar müşteriye dönmüştür.

### Kilometre taşı

`Pending → InProgress → Submitted → Released`

`Submitted → ChangesRequested → Submitted`

`Pending | InProgress | ChangesRequested → Refunded`

Kilometre taşları sıralıdır. Bir sonraki aşama ancak mevcut aşama
serbest bırakıldıktan sonra başlayabilir.

### Fonların kilitli kalmaması

- Müşteri zamanında onaylarsa normal release.
- Müşteri inceleme süresinde yanıt vermezse sağlayıcı timeout release.
- Sağlayıcı teslim etmezse son tarih + ek süreden sonra müşteri remaining refund.
- İş başlamadıysa müşteri pre-start cancel.
- İş kısmen tamamlandıysa iki taraf mutual cancel; serbest bırakılmış tutar
  sağlayıcıda kalır, kalan tutar müşteriye döner.
- Revizyon sayısı sözleşmede sınırlıdır; sınırsız ret döngüsü yoktur.

## 5. Uygulama veri modeli

D1 tabloları:

- `wallets`: normalize edilmiş cüzdan kimliği ve zincir.
- `agreements`: taraflar, hash, tutar, kontrat ve uygulama durumu.
- `milestones`: sıralı iş tanımı, süre, tutar, revizyon ve durum.
- `submissions`: teslim hash’i, not ve işlem bağlantısı.
- `deliverables`: R2 anahtarı, içerik hash’i, tür ve boyut.
- `activities`: kullanıcıya gösterilen zaman çizelgesi.
- `chain_events`: zincir kimliği + tx hash + log index ile tekilleştirilmiş olay.
- `idempotency_keys`: çift form gönderimi ve tekrar işlem koruması.

USDC tutarları D1’de metin olarak saklanır. Böylece JavaScript sayı sınırları
nedeniyle hassasiyet kaybı oluşmaz. Uygulama içinde `bigint`, ekranda altı
ondalık USDC dönüşümü kullanılır.

## 6. Kimlik ve yetki

Duevia dış kullanıcıya açık bir cüzdan uygulamasıdır; çalışma alanı hesabına
dayalı giriş kullanılmaz. Planlanan oturum akışı:

1. sunucu tek kullanımlık, kısa ömürlü nonce üretir;
2. kullanıcı domain, URI, chain ID, nonce ve süre içeren mesajı imzalar;
3. sunucu imzayı kurtarıp nonce’u tüketir;
4. HttpOnly, Secure, SameSite oturum çerezi verilir;
5. her yazma işleminde oturum cüzdanı ile anlaşma rolü yeniden kontrol edilir.

İlk MVP için tarayıcı EOA cüzdanları hedeflenir. Arc Memo wrapper doğrudan smart
contract wallet çağrılarını desteklemediği için memo, kimlik veya zorunlu ödeme
bağımlılığı değildir.

## 7. Dosya ve hash akışı

1. API dosya türü, boyutu ve rol yetkisini doğrular.
2. Dosya tahmin edilemeyen bir R2 nesne anahtarına yüklenir.
3. İçerik hash’i hesaplanıp D1 teslim kaydına bağlanır.
4. Submission referansı, özel içeriği açığa çıkarmayan birleşik hash’tir.
5. İndirme yalnız kısa ömürlü ve yetkili bir sunucu rotası üzerinden yapılır.

R2 nesneleri public bucket olarak sunulmaz.

## 8. Faz 4’e aktarılacak uygulama yüzeyleri

- cüzdan bağlama ve imzalı oturum;
- anlaşma oluşturma formu;
- davet kabulü;
- fon hazırlama (Bridge / Unified Balance) ve Arc escrow fonlama;
- Agreement Detail ekranı;
- teslim yükleme ve içerik hash’i;
- onay, revizyon, timeout, iade ve ortak iptal aksiyonları;
- transaction receipt ve explorer bağlantısı;
- indeksleyici senkronizasyonu ve finality göstergesi.
