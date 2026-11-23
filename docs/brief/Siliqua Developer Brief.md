# Siliqua — Developer Brief

Nov 21, 2026 · @ronald

## Ringkasan produk

Siliqua menjadikan harga compute sebagai sesuatu yang bisa dilihat dan ditrading. Produk ini menerbitkan dua index on-chain, harga sewa GPU dan mindshare narasi compute, lalu menjalankan market prediksi mingguan di atas keduanya.

**Tagline:** The coin of compute. Trade the price of a GPU hour.

**Nama:** _siliqua_ adalah koin perak kecil Romawi kuno. Bunyinya mirip _silicon_, bahan chip GPU. Artinya sekaligus mata uang dan silikon.

### Dua index

| Index                   | Kode                                                       | Mengukur                                                                 | Satuan                           |
| ----------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------- |
| GPU Rent Index          | `GRI-H100`, `GRI-H200`, `GRI-B200`, `GRI-A100`, `GRI-4090` | Median harga sewa on-demand per kelas GPU dari banyak penyedia           | USD per GPU-jam                  |
| Compute Mindshare Index | `CMI-AGENTS`, `CMI-DEPIN`, `CMI-ZKPROVE`, `CMI-INFER`      | Porsi perhatian narasi compute di media sosial, dibobot kredibilitas KOL | Basis poin dari total (0–10.000) |

### Scope v1

**Masuk:**

- Index GRI per jam dan CMI per hari, dipublikasikan on-chain dan lewat API gratis
- Market prediksi mingguan: "Apakah GRI-H100 Jumat depan di atas $X?" dengan pool parimutuel
- Dashboard harga GPU historis dan heatmap narasi
- Index dipakai sebagai referensi harga oleh Velamen dan Stigmer

**Belum masuk v1:**

- Perpetual futures dan leverage
- Kontrak forward untuk mengunci harga sewa GPU
- Pembayaran atau penyelesaian dalam bentuk GPU-jam fisik

### Asumsi teknis

- Chain: Robinhood Chain (EVM), sama dengan Velamen, supaya index bisa langsung dibaca kontrak lain.
- Mesin CMI memakai ulang desain Narrative Token Index ($NTI): bobot kredibilitas KOL, engagement asli, time decay, dan multi-sumber.
- Market v1 sengaja parimutuel, bukan order book atau perp, supaya sederhana dan tidak butuh market maker.

## Arsitektur sistem

&#91;embedded content: arsitektur Siliqua · dari sumber data sampai market\]

Harga GPU dan post sosial dikumpulkan off-chain, lalu tiga operator menghitung ulang index secara mandiri. `SiliquaOracle` hanya menerima nilai yang ditandatangani minimal dua operator, dan market serta project lain membaca index dari kontrak itu.

## Rumus index

Kedua index memakai median dan filter outlier, bukan rata-rata, supaya satu sumber yang aneh atau dimanipulasi tidak menggeser angka.

### GPU Rent Index (GRI)

Untuk setiap kelas GPU _g_ dan jam _t_, kumpulkan harga on-demand per GPU-jam dari setiap sumber _s_. Buang harga yang menyimpang lebih dari 3 kali median absolute deviation (MAD), lalu ambil median berbobot:

```latex
\mathrm{GRI}_g(t) = \operatorname{wmedian}_{s \in S_g(t)} \left( p_{s,g}(t),\; w_s \right), \qquad S_g(t) = \{ s : |p_{s,g}(t) - \tilde{p}_g(t)| \le 3 \cdot \mathrm{MAD}_g(t) \}
```

- **p**: harga on-demand per GPU-jam dalam USD, tanpa diskon kontrak panjang
- **w**: bobot sumber = 1 + log10(1 + jumlah GPU yang tersedia di sumber itu), maksimal 3, supaya penyedia besar lebih berpengaruh tetapi tidak dominan
- Minimal 5 sumber valid per kelas GPU. Kalau kurang, index jam itu tidak dipublikasikan dan nilai sebelumnya diberi tanda "stale"
- Nilai settlement market = TWAP 24 jam dari GRI per jam, supaya lonjakan satu jam tidak menentukan hasil

**Sumber kandidat** (perlu dicek ketersediaan API dan izin datanya): penyedia GPU cloud dengan harga publik seperti Texel, RunPod, Lambda, Vast.ai, dan marketplace GPU terdesentralisasi.

### Compute Mindshare Index (CMI)

Memakai mesin $NTI. Untuk setiap narasi _n_ per hari _d_:

```latex
\mathrm{raw}_n(d) = \sum_{p \in P_n(d)} c_{k(p)} \cdot e_p \cdot e^{-\lambda \, \Delta t_p}, \qquad \mathrm{CMI}_n(d) = 10000 \cdot \frac{\mathrm{raw}_n(d)}{\sum_m \mathrm{raw}_m(d)}
```

- **c**: skor kredibilitas KOL pembuat post (umur akun, akurasi call sebelumnya, skor anti-bot), 0 sampai 1
- **e**: engagement asli setelah membuang reply spam dan akun bot
- **λ**: laju decay, usulan half-life 48 jam
- Klasifikasi post ke narasi memakai daftar kata kunci + model klasifikasi, dengan daftar yang dipublikasikan
- Minimal tiga platform sumber (misalnya X, Farcaster, Telegram) supaya index tidak mati kalau satu platform memblokir akses

### Aturan publikasi

- Metodologi, daftar sumber, dan bobot dipublikasikan. Perubahan diumumkan 14 hari sebelum berlaku.
- Data mentah per jam disimpan dan bisa diunduh, sehingga siapa pun bisa menghitung ulang index.

## Oracle dan smart contract

Index dihitung off-chain oleh tiga operator oracle yang masing-masing menandatangani hasilnya. Kontrak hanya menerima nilai kalau minimal 2 dari 3 tanda tangan cocok dalam batas toleransi, lalu menyimpan median-nya.

| Kontrak         | Fungsi utama                                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `SiliquaOracle` | Menerima laporan bertanda tangan, menyimpan nilai index per jam/hari, menyediakan `latest()` dan `twap()` untuk kontrak lain |
| `MarketFactory` | Membuat market mingguan dari template (index, ambang, waktu tutup, waktu settle)                                             |
| `RangeMarket`   | Pool parimutuel YES/NO dalam USDG, settle dari `SiliquaOracle.twap()`                                                        |
| `FeeRouter`     | Membagi fee market ke buyback $SILQ, treasury, dan operator oracle                                                           |

### Antarmuka inti

```solidity
interface ISiliquaOracle {
    struct Report { bytes32 indexId; uint64 timestamp; int256 value; uint16 sources; }
    function submit(Report calldata r, bytes[] calldata sigs) external; // >= 2 dari 3 operator
    function latest(bytes32 indexId) external view returns (int256 value, uint64 ts, bool stale);
    function twap(bytes32 indexId, uint64 from, uint64 to) external view returns (int256);
    event IndexUpdated(bytes32 indexed indexId, uint64 timestamp, int256 value, uint16 sources);
}

interface IRangeMarket {
    function buy(bool yes, uint256 amount) external;      // sebelum closeTime
    function settle() external;                          // setelah settleTime, siapa pun boleh memanggil
    function claim() external;                           // pemenang mengambil bagian pool
    function refundIfVoid() external;                    // kalau oracle stale saat settle
    event Settled(int256 twapValue, bool yesWins);
}
```

### Aturan market

- Market ditutup 24 jam sebelum periode TWAP dimulai, supaya tidak ada yang membeli saat hasil hampir pasti.
- Kalau oracle berstatus stale lebih dari 6 jam dalam periode TWAP, market dibatalkan dan semua dana dikembalikan.
- Fee market 2% dari pool kalah, hanya diambil saat settle.
- Batas taruhan per alamat per market di fase awal, misalnya 1.000 USDG.
- Nilai `int256` disimpan dengan 6 desimal (USD) untuk GRI dan tanpa desimal (basis poin) untuk CMI.

## Backend, API, dan frontend

Stack yang disarankan: Python untuk pengumpul data dan perhitungan index, TypeScript untuk API dan indexer, TimescaleDB (Postgres) untuk data deret waktu, Next.js untuk frontend.

| Service             | Tugas                                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `price-collectors`  | Satu kolektor per sumber harga GPU, menarik harga tiap 10 menit, menyimpan mentah                                 |
| `social-collectors` | Kolektor post per platform untuk CMI, dengan filter bot                                                           |
| `index-engine`      | Menghitung GRI per jam dan CMI per hari sesuai rumus, menyimpan hasil dan input                                   |
| `oracle-node`       | Dijalankan oleh tiap operator: menghitung ulang index secara mandiri, menandatangani, mengirim ke `SiliquaOracle` |
| `market-keeper`     | Membuat market mingguan, memanggil `settle` tepat waktu                                                           |
| `api`               | Menyajikan index dan market ke publik dan ke Velamen/Stigmer                                                      |

### Endpoint v1

| Method | Path                                      | Fungsi                                                           |
| ------ | ----------------------------------------- | ---------------------------------------------------------------- |
| `GET`  | `/v1/index`                               | Daftar index dan nilai terbaru                                   |
| `GET`  | `/v1/index/{id}/history?from&to&interval` | Riwayat nilai                                                    |
| `GET`  | `/v1/index/{id}/sources?at`               | Harga mentah per sumber yang membentuk nilai pada waktu tertentu |
| `GET`  | `/v1/markets`                             | Market aktif dan selesai                                         |
| `GET`  | `/v1/markets/{address}`                   | Detail pool, peluang implisit, status                            |
| `GET`  | `/v1/methodology`                         | Versi metodologi yang berlaku, bobot, daftar sumber              |

API index gratis dengan rate limit. Ini sekaligus alat distribusi: makin banyak yang memakai GRI sebagai referensi harga GPU, makin kuat posisinya.

### Halaman frontend

| Halaman        | Isi                                                                          |
| -------------- | ---------------------------------------------------------------------------- |
| `/`            | Nilai GRI semua kelas GPU hari ini, perubahan 7 hari, narasi compute teratas |
| `/gpu/{class}` | Grafik harga historis, sebaran harga antar sumber, jumlah sumber valid       |
| `/narratives`  | Heatmap CMI, post berbobot tertinggi per narasi                              |
| `/markets`     | Market mingguan: ambang, pool YES/NO, peluang implisit, waktu tutup          |
| `/methodology` | Rumus, sumber, riwayat perubahan metodologi                                  |
| `/oracle`      | Operator, tanda tangan per laporan, laporan yang ditolak                     |

## Tokenomics $SILQ

Market memakai USDG. $SILQ mendapat nilai dari fee market lewat buyback, dan dipakai untuk staking operator oracle. Angka di bawah adalah usulan.

| Parameter          | Usulan                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| Total supply       | 1.000.000.000, tetap, tanpa mint                                                                |
| Fee market         | 2% dari pool kalah saat settle                                                                  |
| Pembagian fee      | 50% buyback dan burn $SILQ, 30% treasury, 20% operator oracle                                   |
| Stake operator     | Setiap operator oracle wajib stake $SILQ. Laporan yang terbukti salah memotong stake (slashing) |
| Akses data premium | Opsional nanti: data per jam real-time untuk pengguna API besar, dibayar USDG                   |

### Kenapa bukan $NTI

$NTI dirancang untuk semua narasi crypto. Siliqua fokus pada compute dan punya index harga nyata. Kalau $NTI sudah live, opsinya adalah menjadikan Siliqua produk di bawah ekosistem $NTI dan memakai $NTI untuk staking, bukan meluncurkan token baru. Keputusan ini perlu diambil owner sebelum launch.

### Yang sengaja tidak dilakukan

- Tidak ada leverage di v1.
- Tidak ada market untuk index yang sumber validnya kurang dari minimum.
- Tidak ada imbal hasil untuk holder di luar buyback.

## Roadmap

Index dulu, market belakangan. Index yang dipercaya adalah fondasinya, dan bisa berjalan tanpa token sekalipun.

1. **Fase 0: Data**
   - Kolektor untuk minimal 5 sumber harga GPU, data mentah tersimpan
   - Dashboard GRI publik (off-chain), metodologi dipublikasikan
   - Gerbang: 30 hari data tanpa celah lebih dari 6 jam
2. **Fase 1: Oracle on-chain**
   - `SiliquaOracle` di testnet lalu mainnet, 3 operator
   - API gratis, Velamen memakai GRI sebagai referensi harga
   - Gerbang: 14 hari laporan on-chain, selisih antar operator di bawah 0,5%
3. **Fase 2: CMI**
   - Kolektor sosial tiga platform, CMI harian di dashboard dan on-chain
   - Gerbang: metodologi klasifikasi dipublikasikan, uji manual pada 500 post
4. **Fase 3: Market**
   - Launch $SILQ, `MarketFactory` dan `RangeMarket`, market mingguan GRI-H100 dulu
   - Gerbang: review hukum soal market prediksi selesai, audit kontrak market, batas taruhan aktif

### Go / No-Go sebelum market dibuka

- [ ] Review hukum menyatakan struktur market boleh dijalankan di yurisdiksi target
- [ ] Geoblock untuk yurisdiksi yang melarang
- [ ] Operator oracle tidak boleh ikut bertaruh di market yang mereka laporkan, dan wallet operator diumumkan

## Risiko manipulasi dan regulasi

Risiko terbesar Siliqua ada di dua tempat: oracle yang bisa dimainkan, dan status hukum market prediksi. Keduanya harus beres sebelum ada uang di market.

| Risiko                                                                    | Mitigasi                                                                                                        |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Penyedia GPU menurunkan atau menaikkan harga sesaat untuk menggeser index | Median berbobot, filter MAD, TWAP 24 jam untuk settlement, bobot per sumber dibatasi maksimal 3                 |
| Satu penyedia ikut bertaruh di market                                     | Penyedia yang menjadi sumber harga dilarang ikut market, wallet yang terkait dipantau                           |
| KOL atau bot memompa narasi untuk menggeser CMI                           | Bobot kredibilitas, filter bot, decay cepat, dan belum ada market CMI di v1                                     |
| Sumber data menutup API atau melarang pemakaian data                      | Minimal 5 sumber GRI dan 3 platform CMI, cek syarat pemakaian data tiap sumber                                  |
| Operator oracle berkolusi                                                 | Stake dan slashing, data mentah publik sehingga siapa pun bisa menghitung ulang, rencana menambah operator luar |
| Market dianggap derivatif atau judi                                       | Review hukum sebelum Fase 3, geoblock, batas taruhan, tanpa leverage                                            |
| Likuiditas market rendah                                                  | Mulai dari satu market mingguan GRI-H100, bukan banyak market sekaligus                                         |

Saya bukan penasihat hukum. Struktur market prediksi perlu dicek oleh lawyer di yurisdiksi tempat tim dan pengguna berada.
