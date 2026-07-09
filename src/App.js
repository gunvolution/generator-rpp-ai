import React, { useState, useEffect } from 'react';
import { 
  BookOpen, FileText, Calendar, Layout, User, Lock, 
  LogOut, Printer, Code, Loader2, AlertCircle, CheckCircle2,
  ChevronRight, Settings, Check, Download, AlertTriangle, Link as LinkIcon,
  Key, HelpCircle, ExternalLink, X
} from 'lucide-react';

// --- CONFIGURATION & API ---
// Retry logic for API calls
const fetchWithRetry = async (url, options, retries = 5) => {
  const delays = [1000, 2000, 4000, 8000, 16000];
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(res => setTimeout(res, delays[i]));
    }
  }
};

const generateWithAI = async (apiKey, systemPrompt, userQuery) => {
  if (!apiKey) throw new Error("API Key belum dikonfigurasi! Silakan masukkan API Key di menu Pengaturan API Key (kiri bawah).");
  
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{ parts: [{ text: userQuery }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
    }
  };
  
  const result = await fetchWithRetry(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  let text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
  // Clean markdown html blocks if AI adds them
  text = text.replace(/^```html\n/i, '').replace(/^```\n/i, '').replace(/```$/i, '');
  return text;
};

// --- PROMPT TEMPLATES ---
const COMMON_RULES = `
PENTING & WAJIB:
1. Hasilkan HANYA kode HTML murni tanpa dibungkus markdown \`\`\`html.
2. JANGAN sertakan penjelasan apa pun sebelum/sesudah kode HTML.
3. Dokumen ini akan diekspor ke Microsoft Word. Gunakan tabel HTML biasa (<table border="1" style="border-collapse: collapse; width: 100%;">).
4. Terapkan warna background sel sesuai instruksi menggunakan inline CSS (contoh: style="background-color: #1a3a5c; color: white;").
5. Untuk pindah halaman gunakan: <div style="page-break-before: always;"></div>
6. Tanda tangan Guru dan Kepsek diletakkan di akhir dokumen dalam tabel tanpa border (sejajar kiri-kanan).
`;

const getPromptAnalisisCP = (d) => `
Anda adalah ahli perangkat administrasi Kurikulum Merdeka. Buat dokumen **ANALISIS CP** secara UTUH dan LENGKAP tanpa ada bagian yang dipotong.
Data Identitas:
- Provinsi/Dinas: ${d.provinsiKota} / ${d.dinas}
- Sekolah: ${d.sekolah} (${d.alamat})
- Mapel/Singkatan: ${d.mapel} (${d.singkatan})
- Fase/Kelas: ${d.fase}
- Tahun Pelajaran: ${d.tahun}
- Guru: ${d.guru} (NIP: ${d.nipGuru})
- Kepsek: ${d.kepsek} (NIP: ${d.nipKepsek})
- TTD: ${d.kotaTanggal}

CP Umum: ${d.cpUmum}
CP Elemen: ${d.cpElemen}

INSTRUKSI STRUKTUR DOKUMEN (9 Bagian Wajib Harus Ada):
1. KOP SURAT & JUDUL: "ANALISIS CAPAIAN PEMBELAJARAN"
2. BAGIAN A — IDENTITAS: Tabel 2 kolom.
3. BAGIAN B — RASIONAL MATA PELAJARAN: Tabel 3 kolom (No | Uraian | Deskripsi).
4. BAGIAN C — TUJUAN MATA PELAJARAN: Tabel 3 kolom (No | Tujuan | Indikator Umum).
5. BAGIAN D — KARAKTERISTIK MATA PELAJARAN & ELEMEN CP: Tabel 4 kolom.
6. BAGIAN E — CAPAIAN PEMBELAJARAN FASE: Tabel 4 kolom.
7. BAGIAN F — PENJABARAN KATA KERJA OPERASIONAL (KKO) PER ELEMEN: Tabel 3 kolom.
8. BAGIAN G — KETERKAITAN DENGAN 8 DIMENSI PROFIL LULUSAN: Tabel 4 kolom.
9. PENUTUP: Tabel TTD Kepsek (Kiri) dan Guru (Kanan).

Pastikan tabel HTML menggunakan warna header Biru Tua (#1a3a5c) dengan teks putih.
${COMMON_RULES}
`;

const getPromptTP = (d) => `
Buat dokumen **TUJUAN PEMBELAJARAN (TP)** 1 Tahun Ajaran Penuh.
Identitas: ${d.sekolah} | ${d.mapel} | ${d.fase} | ${d.tahun} | Total Waktu: ${d.alokasiWaktu}.
Elemen CP:
${d.elemenList}
Referensi Buku Paket / Materi Pokok: ${d.bukuReferensi ? d.bukuReferensi : 'Gunakan materi pokok standar Kurikulum Merdeka sesuai CP.'}

Daftar TP Lengkap (Hasilkan dan uraikan TP yang terukur untuk 1 Tahun Ajaran penuh berdasarkan Elemen CP yang diberikan):
Buat kode TP terstruktur misal: ${d.singkatan}-${d.fase.split('/')[0].replace('Fase ','')}-ELMN-001.

INSTRUKSI FORMAT HTML:
- Judul: "TUJUAN PEMBELAJARAN"
- Bagian A: Identitas
- Bagian B: PANDUAN KODE TP
- Bagian C: DAFTAR TUJUAN PEMBELAJARAN (Tabel 6 kolom: No | Kode TP | Elemen CP | Tujuan Pembelajaran | Aspek | Alokasi JP).
  Kelompokkan berdasarkan Elemen dengan baris Header Elemen.
- Bagian D: REKAPITULASI ALOKASI WAKTU PER ELEMEN.
${COMMON_RULES}
`;

const getPromptATP = (d) => `
Buat dokumen **ALUR TUJUAN PEMBELAJARAN (ATP)** 1 Tahun.
Identitas: ${d.sekolah} | ${d.mapel} | ${d.fase}.
Daftar TP: ${d.dataSebelumnya}
Referensi Buku Paket / Materi Pokok: ${d.bukuReferensi ? d.bukuReferensi : 'Gunakan materi pokok standar Kurikulum Merdeka.'}
(Pastikan Materi Pokok pada tabel diselaraskan dengan referensi buku paket di atas jika dilampirkan).

INSTRUKSI FORMAT HTML:
- Judul: "ALUR TUJUAN PEMBELAJARAN"
- Bagian A: Identitas (6 kolom tabel 2 baris).
- Bagian B: DIAGRAM ALUR TP (Kotak berisi alur kode TP dengan tanda panah →).
- Bagian C: TABEL ATP (8 kolom: No | Kode TP | Elemen CP | Tujuan Pembelajaran | Materi Pokok | Kompetensi & Variasi | 8 Dimensi | Alokasi JP | Semester).
- Bagian D: REKAPITULASI (JP Sem 1, Sem 2, Total).
${COMMON_RULES}
`;

const getPromptProta = (d) => `
Buat dokumen **PROGRAM TAHUNAN (PROTA)**.
Identitas: ${d.sekolah} | ${d.mapel} | ${d.fase} | JP/Minggu: ${d.jpMinggu}.
Kalender Pendidikan: ${d.kalender}
Daftar TP: ${d.dataSebelumnya}

INSTRUKSI FORMAT HTML:
- Judul: "PROGRAM TAHUNAN"
- Bagian A: Identitas
- Bagian B: DISTRIBUSI MINGGU EFEKTIF (Tabel Kalender 7 Kolom: Sem | Bulan | Ming. Kalender | Tdk Efektif | Efektif | JP | Keterangan).
- Bagian C: RENCANA PROGRAM TAHUNAN (5 Kolom: No | Kode TP | Tujuan & Materi | Elemen | JP | Semester).
${COMMON_RULES}
`;

const getPromptProsem = (d, semester) => `
Buat dokumen **PROGRAM SEMESTER ${semester} (PROSEM)**.
Identitas: ${d.sekolah} | ${d.mapel} | ${d.fase}.
Kalender Pendidikan: ${d.kalender}
Daftar TP: ${d.dataSebelumnya}

INSTRUKSI FORMAT HTML:
- Judul: "PROGRAM SEMESTER ${semester}"
- Bagian Legenda Warna: Biru(Aktif), Merah(Libur), Kuning(PTS), Hijau(PAS).
- TABEL MATRIKS PROSEM: Kolom tetap (No, Kode TP, Tujuan & Materi, JP).
  Gunakan inline CSS background-color pada sel tabel matriks untuk membedakan JP (Biru #d0e4f7), Libur (Merah #ffd6d6), PTS (Kuning #fff3cd), PAS (Hijau #d4edda).
${COMMON_RULES}
`;

const getPromptKKTP = (d) => `
Buat dokumen **KRITERIA KETERCAPAIAN TUJUAN PEMBELAJARAN (KKTP)**.
Rentang Nilai: ${d.rentangNilai}
Daftar TP: ${d.dataSebelumnya}

INSTRUKSI FORMAT HTML:
- Judul: "KRITERIA KETERCAPAIAN TUJUAN PEMBELAJARAN"
- Bagian A: DESKRIPSI LEVEL CAPAIAN (Tabel dengan rentang nilai).
- Bagian B: RUBRIK KKTP PER TP.
  Untuk setiap TP, buat tabel 9 kolom: No | Kode TP | Tujuan | IKTP | Mulai Berkembang(1) | Layak(2) | Cakap(3) | Mahir(4).
  Buatkan IKTP dan deskriptor 4 level secara spesifik, logis, dan berjenjang!
${COMMON_RULES}
`;

const getPromptModul = (d, tpObj) => `
Anda adalah seorang Ahli Kurikulum Merdeka, Instruktur Nasional, dan Guru Penggerak yang ahli dalam merancang Desain Pembelajaran Presisi (Precision Teaching Module).

Tugas Anda adalah membuat Modul Ajar Presisi yang komprehensif, terstruktur, dan aplikatif berdasarkan Kurikulum Merdeka. Modul ajar ini harus terintegrasi dengan sintak dari model pembelajaran yang dipilih, mengadaptasi prinsip Deep Learning (Mindful, Meaningful, Joyful), dan mengintegrasikan prinsip kognitif (Understanding, Applying, Reflecting).

Gunakan informasi berikut sebagai dasar pembuatan modul:

Mata Pelajaran: ${d.mapel}
Fase / Kelas: ${d.fase}
Materi Pokok: ${tpObj.materi}
Referensi Tambahan Buku Paket: ${d.bukuReferensi ? d.bukuReferensi : '-'}
Tujuan Pembelajaran (TP): [${tpObj.kode}] ${tpObj.tujuan}
Model Pembelajaran: ${d.modelPembelajaran}
Alokasi Waktu: ${tpObj.pertemuan} Pertemuan x ${d.jpPertemuan}

Susunlah Modul Ajar Presisi tersebut dengan format dan kelengkapan persis seperti struktur di bawah ini. Gunakan tabel HTML murni untuk format tabel (bukan markdown).

STRUKTUR MODUL AJAR YANG HARUS DIBUAT:

BAGIAN A - INFORMASI UMUM
Identitas Modul: Buat tabel berisi Nama Penyusun (tulis "${d.guru}"), Satuan Pendidikan (${d.sekolah}), Mata Pelajaran, Fase/Kelas, Kode & Judul TP, Elemen CP, Alokasi Waktu, Model Pembelajaran, Moda, Tahun Pelajaran (${d.tahun}).
Identifikasi Kesiapan Peserta Didik: Jelaskan asumsi kemampuan awal siswa.
Karakteristik Materi Pelajaran: Jelaskan sifat materi (konseptual/faktual/prosedural) dan relevansinya.
Tujuan Pembelajaran: Tuliskan TP yang jelas mencakup kompetensi dan konten.
Kompetensi Awal (Prasyarat): Buat tabel berisi 3 kompetensi prasyarat beserta "Cara Mengeceknya".
Dimensi Profil Lulusan: Buat tabel berisi 3 dimensi dari 8 dimensi yang paling relevan dan "Deskripsi Perwujudan dalam Pembelajaran".
Sarana & Prasarana: Buat tabel (Kategori: Teknologi Digital, Media Pembelajaran, Sumber Belajar, Ruang Belajar) beserta rincian dan keterangannya.
Target Peserta Didik & Diferensiasi: Buat tabel untuk 3 kategori: Reguler/Tipikal, Kesulitan Belajar, Berbakat/Cepat, beserta perlakuan spesifiknya.

BAGIAN B - KOMPONEN INTI
Pemahaman Bermakna: Tuliskan inti pemahaman mengapa materi ini penting untuk kehidupan nyata siswa (bertahan hidup/skill abad 21).
Pertanyaan Pemantik: Buat 3 pertanyaan yang menggugah rasa ingin tahu.
Asesmen Diagnostik:
Diagnostik Non-Kognitif: 3 pertanyaan terkait kesiapan dan minat.
Diagnostik Kognitif: Buat tabel (Indikator, Bentuk Soal, Tindak Lanjut).
Berikan 5 Contoh Soal Asesmen Diagnostik Awal (PG, Isian, Terbuka).

KEGIATAN PEMBELAJARAN (Sangat Penting):
Bagi berdasarkan jumlah pertemuan yang diminta (${tpObj.pertemuan} pertemuan).
Setiap pertemuan harus mencakup: Alokasi Waktu, Sintak Model Pembelajaran, Fokus, dan Tujuan Pertemuan.
Tabel Pembuka (15 Menit): Aktivitas Guru dan Siswa. (Sertakan tag Prinsip: Mindful Learning, Joyful Learning).
Tabel Kegiatan Inti:
Wajib dipecah berdasarkan SINTAK model pembelajaran yang dipilih (Sintak 1, Sintak 2, dst).
Pada setiap langkah Sintak, wajib sertakan tag gabungan dari [Prinsip Deep Learning: Mindful / Meaningful / Joyful] DAN [Prinsip Kognitif: Understanding / Applying / Reflecting].
Buat tabel Aktivitas Guru dan Aktivitas Siswa secara detail, operasional, dan presisi.
Tabel Penutup (15 Menit): Aktivitas Guru dan Siswa. (Sertakan tag Prinsip: Reflecting).

Asesmen Formatif:
Buat Instrumen (Tabel: Teknik, Instrumen, Waktu Pelaksanaan, Aspek yang Dinilai).
Berikan 5 Contoh Soal Asesmen Proses Pembelajaran (misal: analisis visual, lisan, unjuk kerja).
Asesmen Sumatif:
Buat instrumen evaluasi akhir (Tabel: Komponen, Deskripsi Tugas, Bobot, Acuan KKTP).
Pengayaan & Remedial:
Buat tabel matriks untuk 3 level: Remedial (Mulai Berkembang), Reguler (Layak/Cakap), Pengayaan (Mahir). Berisi Kegiatan dan Waktu.
Refleksi Guru & Peserta Didik: Buat masing-masing 4 pertanyaan reflektif mendalam.

BAGIAN C - LAMPIRAN
Rubrik Penilaian Formatif: Buat tabel rubrik penilaian dengan skala 1-4 (Perlu Bimbingan, Mulai Berkembang, Berkembang Sesuai Harapan, Sangat Berkembang). Aspek A: Penilaian Proses/Kinerja. Aspek B: Penilaian Dimensi Profil Lulusan.
Rubrik Penilaian Sumatif: Buat rubrik skala penilaian untuk instrumen sumatif yang telah ditentukan di atas (Rentang skor dan kriteria jawaban/kinerja).
Lembar Kerja Peserta Didik (LKPD): Buat kerangka LKPD yang komprehensif (bukan sekadar soal). Mencakup: Pertanyaan Esensial (Stimulus), Perencanaan, Langkah Kerja (sesuai sintak), Tabel Pengamatan/Hasil, Evaluasi & Analisis Kritis, dan Refleksi.
Glosarium & Daftar Pustaka: Berikan 3-5 istilah kunci dan 2 contoh daftar pustaka (termasuk Buku Kurikulum Merdeka).

ATURAN TAMBAHAN UNTUK AI:
Gunakan bahasa Indonesia yang baku, profesional, namun mudah dipahami (bahasa pendidik).
Pastikan alur kegiatan logis dan benar-benar mencerminkan model pembelajaran yang dipilih.
Tunjukkan inovasi abad 21 (literasi digital, pemanfaatan AI/Tools web, kolaborasi) dalam kegiatan siswa.
Jangan berikan deskripsi pengantar, langsung hasilkan output Modul Ajar Presisi sesuai struktur.

${COMMON_RULES}
`;


// --- COMPONENTS ---

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  if (!isLoggedIn) {
    return <LoginScreen onLogin={() => setIsLoggedIn(true)} />;
  }

  return <Dashboard onLogout={() => setIsLoggedIn(false)} />;
}

// --- LOGIN SCREEN ---
function LoginScreen({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    if (password === 'KerinciBerbagi' || password === '') {
      onLogin();
    } else {
      setError('Password salah. Silakan coba lagi.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="h-16 w-16 bg-blue-900 rounded-2xl flex items-center justify-center shadow-lg">
            <BookOpen className="h-8 w-8 text-white" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900">
          Generator Perangkat Ajar
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          Kurikulum Merdeka - Deep Learning (Docx Ready)
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-blue-900/5 sm:rounded-2xl sm:px-10 border border-slate-100">
          <form className="space-y-6" onSubmit={handleLogin}>
            <div>
              <label className="block text-sm font-medium text-slate-700">Username</label>
              <input type="text" value="gunspentik" disabled className="mt-1 block w-full bg-slate-50 border border-slate-300 rounded-md py-3 px-3 text-slate-600 cursor-not-allowed" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 block w-full border border-slate-300 rounded-md py-3 px-3 focus:ring-blue-500 focus:border-blue-500" placeholder="Kosongkan atau isi password" />
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            </div>
            <button type="submit" className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-900 hover:bg-blue-800 transition-colors">
              Masuk
            </button>

            <div className="pt-6 border-t border-slate-200 text-center space-y-4">
               <div className="bg-red-600 py-3 px-3 rounded-md shadow-md flex items-center justify-center space-x-2 transform hover:scale-105 transition-transform">
                  <AlertTriangle className="h-6 w-6 text-white animate-pulse" />
                  <p className="text-sm font-black text-white uppercase tracking-widest">
                    Aplikasi Ini Tidak Diperjualbelikan
                  </p>
               </div>
               
               <div className="bg-blue-50/80 p-4 rounded-md border border-blue-200 shadow-inner">
                 <p className="text-xs text-slate-700 font-semibold mb-2 flex items-center justify-center">
                    <LinkIcon className="h-3 w-3 mr-1" /> Dapatkan Password dengan copy link di bawah ini:
                 </p>
                 <a 
                   href="[gunspentik](gunspentik)" 
                   target="_blank" 
                   rel="noreferrer" 
                   className="text-sm text-blue-800 hover:text-blue-600 hover:underline font-bold break-all"
                 >
                   gunspentik
                 </a>
               </div>

               <p className="text-xs text-slate-400 mt-4 font-medium uppercase tracking-wide">
                 Desain Oleh gunspentik - gunspentik
               </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// --- DASHBOARD ---
function Dashboard({ onLogout }) {
  const [activeTab, setActiveTab] = useState('identitas');
  const [apiKey, setApiKey] = useState('');
  const [showApiModal, setShowApiModal] = useState(false);
  
  // Shared State (Removed daftarTP from manual input)
  const [appData, setAppData] = useState({
    provinsiKota: 'Pemerintah Kabupaten Ketapang',
    dinas: 'Dinas Pendidikan',
    sekolah: 'SMP Negeri 3 Kendawangan',
    alamat: 'Jl. H. Rajali, Desa Kendawangan Kanan, Kec. Kendawangan, Kab. Ketapang',
    mapel: 'Bahasa Indonesia',
    singkatan: 'BINDO',
    fase: 'Fase D / Kelas IX',
    tahun: '2026/2027',
    alokasiWaktu: '222 JP / Tahun',
    jpMinggu: '6 JP/Minggu',
    jpPertemuan: '2 JP (80 Menit)',
    guru: 'Gunawan, S.Pd.',
    nipGuru: '198610252017081002',
    kepsek: 'Aliman Nuryadin,S.Pd.',
    nipKepsek: '198203012017081008',
    kotaTanggal: 'Kendawangan, 13 Juli 2026',
    
    elemenList: '1 | MNY | Menyimak\n2 | MBM | Membaca - Memirsa\n3 | BCP | Berbicara - Mempresentasikan\n4 | MNL | Menulis',
    cpUmum: 'Mata pelajaran Bahasa Indonesia pada Kurikulum Merdeka menuntut peserta didik memiliki kemampuan berbahasa untuk berkomunikasi dan bernalar sesuai tujuan, konteks sosial, dan akademis',
    cpElemen: 'Elemen Menyimak: Peserta didik mampu menganalisis dan memaknai informasi berupa gagasan, pikiran, perasaan, pandangan, arahan atau pesan yang tepat dari berbagai tipe teks audio visual dan aural dalam bentuk monolog, dialog, dan gelar wicara. Peserta didik mampu mengeksplorasi dan mengevaluasi berbagai informasi dari topik aktual yang didengar.\nElemen Membaca - Memirsa: Peserta didik mampu memahami informasi berupa gagasan, pikiran, pandangan, arahan atau pesan dari teks visual dan audiovisual untuk menemukan makna yang tersurat dan tersirat. Peserta didik mampu menginterpretasikan informasi untuk mengungkapkan kepedulian dan/atau pendapat pro/kontra dari teks visual dan audiovisual. Peserta didik mampu menggunakan sumber informasi lain untuk menilai akurasi (ketepatan) dan kualitas data serta membandingkan informasi pada teks; mengeksplorasi dan mengevaluasi berbagai topik aktual yang dibaca dan dipirsa.\nElemen Berbicara - Mempresentasikan: Peserta didik mampu menyampaikan gagasan, pikiran, pandangan, arahan atau pesan untuk tujuan pengajuan usul, pemecahan masalah, dan pemberian solusi secara lisan dalam bentuk monolog dan dialog logis, kritis, dan kreatif. Peserta didik mampu menggunakan dan memaknai kosakata baru yang memiliki makna denotatif, konotatif, dan kiasan untuk berbicara dan menyajikan gagasannya. Peserta didik mampu menggunakan ungkapan sesuai dengan norma kesopanan dalam berkomunikasi. Peserta didik mampu berdiskusi secara aktif, kontributif, efektif, dan santun. Peserta didik mampu menuturkan dan menyajikan ungkapan kepedulian dalam bentuk teks nonfiksi dan fiksi multimodal yang netral, ramah gender, dan/atau ramah keberagaman. Peserta didik mampu mengungkapkan dan mempresentasikan berbagai topik aktual secara kritis.\nElemen Menulis: Peserta didik mampu menulis gagasan, pikiran, pandangan, arahan atau pesan tertulis untuk berbagai tujuan secara logis, kritis, dan kreatif. Peserta didik mampu menuliskan hasil penelitian menggunakan metodologi sederhana dengan mengutip sumber rujukan secara etis. Peserta didik mampu menyampaikan ungkapan rasa kepedulian dan pendapat pro/kontra secara etis dalam memberikan penghargaan secara tertulis dalam teks multimodal yang disajikan melalui media cetak, elektronik, dan/atau digital. Peserta didik mampu menggunakan dan mengembangkan kosakata baru yang memiliki makna denotatif, konotatif, dan kiasan untuk menulis. Peserta didik mampu menyampaikan tulisan berdasarkan fakta, pengalaman, dan imajinasi secara indah dan menarik dalam bentuk karya sastra dengan penggunaan kosakata secara kreatif.',
    
    kalender: 'SEMESTER 1:\nJuli | 5 | 2 | MPLS\nAgustus | 4 | 0 | Efektif\nSeptember | 5 | 0 | Efektif\nOktober | 4 | 0 | Efektif\nNovember | 4 | 0 | Efektif\nDesember | 5 | 5 | PAS & Libur\n\nSEMESTER 2:\nJanuari | 4 | 0 | Efektif\nFebruari | 4 | 1 | Libur\nMaret | 5 | 2 | Idul Fitri\nApril | 4 | 0 | Efektif\nMei | 4 | 1 | Libur Mei\nJuni | 5 | 5 | PAT & Libur',
    rentangNilai: 'Level 1 (Mulai Berkembang): 0-54 | D\nLevel 2 (Layak): 55-69 | C\nLevel 3 (Cakap): 70-84 | B\nLevel 4 (Mahir): 85-100 | A',
    
    modelPembelajaran: 'Problem Based Learning (PBL)', // Default
    dataSebelumnya: '', 
    bukuReferensi: '',
  });

  const [generatedDocs, setGeneratedDocs] = useState({
    cp: '', tp: '', atp: '', prota: '', prosem1: '', prosem2: '', kktp: '', modul: ''
  });
  
  // State Khusus Modul Ajar Dropdown - Terisi otomatis dari ATP
  const [extractedTPs, setExtractedTPs] = useState([]);
  const [selectedTPIndex, setSelectedTPIndex] = useState(0);

  const [isGenerating, setIsGenerating] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setAppData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (evt) => {
       setAppData(prev => ({ ...prev, bukuReferensi: evt.target.result }));
    };
    reader.readAsText(file);
  };

  // Fungsi Parser HTML ATP untuk mengambil TP dan Materi secara otomatis
  const parseATPForModules = (atpHtmlString) => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(atpHtmlString, 'text/html');
      const tables = doc.querySelectorAll('table');
      let tps = [];
      
      // Cari tabel yang berisi Kode TP dan Tujuan
      tables.forEach(table => {
        const headerRow = table.querySelector('tr');
        if (headerRow && headerRow.textContent.toLowerCase().includes('kode tp')) {
          const rows = table.querySelectorAll('tr');
          rows.forEach((row, index) => {
             if(index === 0) return; // skip header
             const cells = row.querySelectorAll('td');
             if (cells.length >= 7) {
                 const kode = cells[1]?.textContent.trim();
                 const tujuan = cells[3]?.textContent.trim();
                 const materi = cells[4]?.textContent.trim();
                 const jpStr = cells[7]?.textContent.trim();
                 
                 if(kode && tujuan && kode.length > 3) {
                     const jpNum = parseInt(jpStr.match(/\d+/)?.[0] || 0);
                     // Menghitung JP Pertemuan dari string (misal: "2 JP (80 Menit)" -> 2)
                     const jpPerPertemuan = parseInt(appData.jpPertemuan.match(/\d+/)?.[0] || 2);
                     let pertemuanCalc = Math.max(1, Math.ceil(jpNum / jpPerPertemuan));
                     
                     tps.push({ 
                       kode, 
                       tujuan, 
                       materi: materi || 'Materi Umum', 
                       jp: jpNum, 
                       pertemuan: pertemuanCalc 
                     });
                 }
             }
          });
        }
      });
      
      // Hapus duplikasi jika ada (berdasarkan kode)
      const uniqueTPs = Array.from(new Map(tps.map(item => [item.kode, item])).values());
      
      if(uniqueTPs.length > 0) {
        setExtractedTPs(uniqueTPs);
        setSelectedTPIndex(0);
      }
    } catch(err) {
      console.error("Gagal mem-parsing ATP:", err);
    }
  };

  const handleGenerateGlobal = async () => {
    if (!apiKey) {
       setErrorMsg('API Key belum diisi. Silakan klik tombol "Pengaturan API Key" di menu kiri bawah terlebih dahulu.');
       setShowApiModal(true);
       return;
    }
    
    setIsGenerating(true);
    setErrorMsg('');
    
    let currentData = { ...appData };

    try {
      setProgressMsg('1/6: Menyusun Analisis CP...');
      const cp = await generateWithAI(apiKey, COMMON_RULES, getPromptAnalisisCP(currentData));
      setGeneratedDocs(prev => ({ ...prev, cp }));

      setProgressMsg('2/6: Merumuskan Tujuan Pembelajaran (TP)...');
      const tp = await generateWithAI(apiKey, COMMON_RULES, getPromptTP(currentData));
      setGeneratedDocs(prev => ({ ...prev, tp }));
      currentData.dataSebelumnya = tp;

      setProgressMsg('3/6: Menyusun Alur Tujuan Pembelajaran (ATP)...');
      const atp = await generateWithAI(apiKey, COMMON_RULES, getPromptATP(currentData));
      setGeneratedDocs(prev => ({ ...prev, atp }));
      currentData.dataSebelumnya = atp;
      
      // Otomatis Ekstrak TP dan Materi dari ATP
      parseATPForModules(atp);

      setProgressMsg('4/6: Menghitung Program Tahunan (Prota)...');
      const prota = await generateWithAI(apiKey, COMMON_RULES, getPromptProta(currentData));
      setGeneratedDocs(prev => ({ ...prev, prota }));
      currentData.dataSebelumnya = prota;

      setProgressMsg('5/6: Menyusun Program Semester 1 & 2...');
      const prosem1 = await generateWithAI(apiKey, COMMON_RULES, getPromptProsem(currentData, '1 (Ganjil)'));
      const prosem2 = await generateWithAI(apiKey, COMMON_RULES, getPromptProsem(currentData, '2 (Genap)'));
      setGeneratedDocs(prev => ({ ...prev, prosem1, prosem2 }));

      setProgressMsg('6/6: Merumuskan KKTP...');
      currentData.dataSebelumnya = atp;
      const kktp = await generateWithAI(apiKey, COMMON_RULES, getPromptKKTP(currentData));
      setGeneratedDocs(prev => ({ ...prev, kktp }));

      setProgressMsg('Selesai! Dokumen 1-6 dibuat. Daftar TP dan Materi telah otomatis dikirim ke Tab Modul Ajar.');
      setTimeout(() => {
         setProgressMsg('');
         setActiveTab('cp');
      }, 5000);
    } catch (err) {
      setErrorMsg(`Terjadi kegagalan pada proses: ${progressMsg}. Error: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateModul = async () => {
    if (!apiKey) {
       setErrorMsg('API Key belum diisi. Silakan klik tombol "Pengaturan API Key" di menu kiri bawah terlebih dahulu.');
       setShowApiModal(true);
       return;
    }
    if (extractedTPs.length === 0) return;
    setIsGenerating(true);
    setErrorMsg('');
    const targetTP = extractedTPs[selectedTPIndex];
    try {
      setProgressMsg(`Menyusun Modul Ajar Presisi untuk TP: ${targetTP.kode}...`);
      const modul = await generateWithAI(apiKey, COMMON_RULES, getPromptModul(appData, targetTP));
      setGeneratedDocs(prev => ({ ...prev, modul }));
      setProgressMsg('Modul Ajar Berhasil Dibuat! Silahkan geser ke bawah untuk melihat hasilnya.');
      setTimeout(() => setProgressMsg(''), 6000);
    } catch (err) {
      setErrorMsg(`Gagal membuat Modul Ajar: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadWord = () => {
    const isLandscape = ['prosem1', 'prosem2', 'atp', 'kktp'].includes(activeTab);
    
    // Injecting Microsoft Word XML namespaces and Page orientation CSS
    const header = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' 
            xmlns:w='urn:schemas-microsoft-com:office:word' 
            xmlns='[http://www.w3.org/TR/REC-html40](http://www.w3.org/TR/REC-html40)'>
      <head>
        <meta charset='utf-8'>
        <title>Export Doc</title>
        <style>
          body { font-family: 'Calibri', 'Arial', sans-serif; font-size: 11pt; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 12pt; border: 1pt solid windowtext; }
          th, td { border: 1pt solid windowtext; padding: 5pt; vertical-align: top; }
          th { background-color: #1a3a5c; color: white; }
          h1, h2, h3 { color: #1a3a5c; }
          
          /* Kertas A4 Portrait */
          @page WordSectionPortrait {
              size: 595.3pt 841.9pt; 
              margin: 72pt 72pt 72pt 72pt;
              mso-header-margin: 36pt;
              mso-footer-margin: 36pt;
              mso-paper-source: 0;
          }
          /* Kertas A4 Landscape */
          @page WordSectionLandscape {
              size: 841.9pt 595.3pt; 
              margin: 72pt 72pt 72pt 72pt;
              mso-header-margin: 36pt;
              mso-footer-margin: 36pt;
              mso-paper-source: 0;
          }
          div.WordSectionPortrait { page: WordSectionPortrait; }
          div.WordSectionLandscape { page: WordSectionLandscape; }
        </style>
      </head>
      <body>
        <div class="${isLandscape ? 'WordSectionLandscape' : 'WordSectionPortrait'}">
    `;
    const footer = "</div></body></html>";
    const htmlContent = header + generatedDocs[activeTab] + footer;
    
    const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ADM_${activeTab.toUpperCase()}_${appData.singkatan}_${appData.fase.split('/')[0].trim()}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadHTML = () => {
    const isLandscape = ['prosem1', 'prosem2', 'atp', 'kktp'].includes(activeTab);
    const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Dokumen_${activeTab}</title><style>body { font-family: Calibri, sans-serif; padding: 2cm; } table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; border: 1px solid black; } th, td { border: 1px solid black; padding: 0.5rem; text-align: left; vertical-align: top; } th { background-color: #1a3a5c !important; color: white !important; font-weight: bold; -webkit-print-color-adjust: exact; print-color-adjust: exact; } h1, h2, h3 { margin-top: 1.5rem; margin-bottom: 0.75rem; color: #1a3a5c; } @media print { @page { size: A4 ${isLandscape ? 'landscape' : 'portrait'}; margin: 1.5cm; } * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } } </style></head><body>${generatedDocs[activeTab]}</body></html>`;
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Dokumen_${activeTab}.html`;
    a.click();
  };

  const handlePrintHTML = () => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '100vw'; // Ensure full width for proper media query execution
    iframe.style.height = '100vh';
    iframe.style.border = '0';
    iframe.style.zIndex = '-9999'; // Hide it behind everything
    document.body.appendChild(iframe);

    const isLandscape = ['prosem1', 'prosem2', 'atp', 'kktp'].includes(activeTab);

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Cetak Dokumen - ${activeTab}</title>
        <style>
          body { font-family: 'Calibri', sans-serif; padding: 0; margin: 0; color: #000; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; border: 1pt solid black; }
          th, td { border: 1pt solid #000; padding: 0.5rem; text-align: left; vertical-align: top; }
          th { background-color: #1a3a5c !important; color: white !important; font-weight: bold; }
          h1, h2, h3 { margin-top: 1.5rem; margin-bottom: 0.75rem; color: #1a3a5c; }
          .header-kop { text-align: center; border-bottom: 3px solid black; padding-bottom: 1rem; margin-bottom: 2rem; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          
          /* Strict Print Styling */
          @media print {
             @page { 
               size: A4 ${isLandscape ? 'landscape' : 'portrait'}; 
               margin: 1.5cm; 
             }
             body { padding: 0 !important; }
          }
        </style>
      </head>
      <body>
        ${generatedDocs[activeTab]}
      </body>
      </html>
    `;
    
    iframe.contentWindow.document.open();
    iframe.contentWindow.document.write(htmlContent);
    iframe.contentWindow.document.close();
    
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 1500);
    }, 1000); // Give it a second to render CSS completely before printing
  };

  const tabs = [
    { id: 'identitas', icon: Settings, label: 'Data Global (Input)' },
    { id: 'cp', icon: FileText, label: '1. Analisis CP' },
    { id: 'tp', icon: Layout, label: '2. Tujuan Pemb. (TP)' },
    { id: 'atp', icon: ChevronRight, label: '3. Alur (ATP)' },
    { id: 'prota', icon: Calendar, label: '4. Prota' },
    { id: 'prosem1', icon: Calendar, label: '5a. Prosem Sem 1' },
    { id: 'prosem2', icon: Calendar, label: '5b. Prosem Sem 2' },
    { id: 'kktp', icon: CheckCircle2, label: '6. KKTP' },
    { id: 'modul', icon: BookOpen, label: '7. Modul Ajar' },
  ];

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900 flex flex-col md:flex-row">
      <aside className="w-full md:w-64 bg-white border-r border-slate-200 flex-shrink-0 flex flex-col print:hidden no-print">
        <div className="p-6 border-b border-slate-100 flex items-center space-x-3">
          <div className="h-8 w-8 bg-blue-900 rounded-lg flex items-center justify-center">
            <BookOpen className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-slate-800 text-sm">Generator AI</h1>
            <p className="text-[10px] text-slate-500">Perangkat Ajar 1 Tahun</p>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto custom-scrollbar">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id ? 'bg-blue-50 text-blue-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center space-x-3">
                <tab.icon className={`h-4 w-4 ${activeTab === tab.id ? 'text-blue-700' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </div>
              {generatedDocs[tab.id] && tab.id !== 'identitas' && <Check className="h-4 w-4 text-green-500" />}
            </button>
          ))}
        </nav>
        
        <div className="p-4 border-t border-slate-200 space-y-2">
          <button 
            onClick={() => setShowApiModal(true)} 
            className={`w-full flex items-center justify-center space-x-2 px-3 py-2 text-sm rounded-md transition-colors border ${
              apiKey ? 'bg-green-50 text-green-700 hover:bg-green-100 border-green-200' : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border-yellow-200 shadow-sm'
            }`}
          >
            <Key className="h-4 w-4" />
            <span className="font-medium">{apiKey ? 'API Key Aktif' : 'Pengaturan API Key'}</span>
          </button>
          <button onClick={onLogout} className="w-full flex items-center justify-center space-x-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors border border-transparent">
            <LogOut className="h-4 w-4" /><span>Keluar</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center print:hidden no-print z-10 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center">{tabs.find(t => t.id === activeTab)?.label}</h2>
        </header>

        <div className="flex-1 overflow-auto bg-slate-100/50 p-6 print:p-0 print:bg-white flex flex-col relative custom-scrollbar">
          
          {/* TAB 1: FORM DATA GLOBAL */}
          {}
          {activeTab === 'identitas' && (
            <div className="max-w-5xl mx-auto w-full bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col print:hidden no-print">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 rounded-t-xl">
                <h3 className="font-bold text-slate-800 text-lg">Input Data Global 1 Tahun</h3>
                <p className="text-sm text-slate-500 mt-1">Isi identitas dan komponen dasar (TP & Materi akan ditarik otomatis oleh AI saat Generate).</p>
              </div>
              
              <div className="p-6 overflow-y-auto space-y-8 flex-1">
                <section>
                   <h4 className="font-semibold text-blue-900 border-b border-slate-200 pb-2 mb-4">Blok 1: Identitas Sekolah & Guru</h4>
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Input name="provinsiKota" label="Provinsi / Kota" val={appData.provinsiKota} onChange={handleChange} />
                      <Input name="dinas" label="Dinas Pendidikan" val={appData.dinas} onChange={handleChange} />
                      <Input name="sekolah" label="Satuan Pendidikan" val={appData.sekolah} onChange={handleChange} />
                      <Input name="alamat" label="Alamat Sekolah" val={appData.alamat} onChange={handleChange} />
                      <Input name="mapel" label="Mata Pelajaran" val={appData.mapel} onChange={handleChange} />
                      <Input name="singkatan" label="Singkatan Mapel (Mis: BI)" val={appData.singkatan} onChange={handleChange} />
                      <Input name="fase" label="Fase / Kelas" val={appData.fase} onChange={handleChange} />
                      <Input name="tahun" label="Tahun Pelajaran" val={appData.tahun} onChange={handleChange} />
                      <Input name="alokasiWaktu" label="Alokasi Waktu Total" val={appData.alokasiWaktu} onChange={handleChange} />
                      <Input name="jpMinggu" label="JP per Minggu" val={appData.jpMinggu} onChange={handleChange} />
                      <Input name="jpPertemuan" label="Durasi 1x Pertemuan" val={appData.jpPertemuan} onChange={handleChange} placeholder="Contoh: 2 JP (80 Menit)" />
                      <Input name="guru" label="Nama Guru" val={appData.guru} onChange={handleChange} />
                      <Input name="nipGuru" label="NIP Guru" val={appData.nipGuru} onChange={handleChange} />
                      <Input name="kepsek" label="Nama Kepsek" val={appData.kepsek} onChange={handleChange} />
                      <Input name="nipKepsek" label="NIP Kepsek" val={appData.nipKepsek} onChange={handleChange} />
                      <Input name="kotaTanggal" label="Kota, Tanggal TTD" val={appData.kotaTanggal} onChange={handleChange} />
                   </div>
                </section>

                <section>
                   <h4 className="font-semibold text-blue-900 border-b border-slate-200 pb-2 mb-4">Blok 2 & 3: Capaian & Elemen</h4>
                   <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Daftar Elemen & Kode</label>
                        <textarea name="elemenList" rows={3} value={appData.elemenList} onChange={handleChange} className="w-full text-sm rounded-md border-slate-300 border p-2 bg-slate-50" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">CP Umum / Rasional Mapel</label>
                        <textarea name="cpUmum" rows={3} value={appData.cpUmum} onChange={handleChange} className="w-full text-sm rounded-md border-slate-300 border p-2" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Capaian Pembelajaran (CP) Per Elemen</label>
                        <textarea name="cpElemen" rows={5} value={appData.cpElemen} onChange={handleChange} className="w-full text-sm rounded-md border-slate-300 border p-2" />
                      </div>
                   </div>
                </section>

                <section>
                   <h4 className="font-semibold text-blue-900 border-b border-slate-200 pb-2 mb-4">Blok 4: Kalender Pendidikan & KKTP</h4>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                         <label className="block text-sm font-medium text-slate-700 mb-1">Kalender Pendidikan 1 Tahun</label>
                         <textarea name="kalender" rows={6} value={appData.kalender} onChange={handleChange} className="w-full text-sm font-mono rounded-md border-slate-300 border p-2 bg-slate-50" />
                      </div>
                      <div>
                         <label className="block text-sm font-medium text-slate-700 mb-1">Rentang Nilai & Predikat KKTP</label>
                         <textarea name="rentangNilai" rows={6} value={appData.rentangNilai} onChange={handleChange} className="w-full text-sm font-mono rounded-md border-slate-300 border p-2 bg-slate-50" />
                      </div>
                   </div>
                </section>

                {}
                <section>
                   <h4 className="font-semibold text-blue-900 border-b border-slate-200 pb-2 mb-4">Blok 5: Referensi Materi Pokok (Buku Paket Kemdikbud)</h4>
                   <div className="bg-blue-50/50 border border-blue-100 p-5 rounded-xl space-y-4 shadow-sm">
                      <div>
                         <label className="block text-sm font-medium text-slate-700 mb-2">Upload File Buku Paket (.txt) atau Paste Daftar Isi</label>
                         <p className="text-xs text-slate-500 mb-4">
                           Sertakan daftar isi atau ringkasan materi dari Buku Paket Kementerian agar AI dapat memetakan dan menyusun Materi Pokok secara presisi sesuai dengan buku pegangan. 
                           <i>Catatan: Konversi PDF ke Teks (.txt) terlebih dahulu sebelum diupload, atau langsung paste teks daftarnya di bawah ini.</i>
                         </p>
                         <input
                            type="file"
                            accept=".txt,.csv,.md"
                            onChange={handleFileUpload}
                            className="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-900 file:text-white hover:file:bg-blue-800 transition-colors mb-3 cursor-pointer"
                         />
                         <textarea 
                            name="bukuReferensi" 
                            rows={6} 
                            value={appData.bukuReferensi} 
                            onChange={handleChange} 
                            placeholder="Teks referensi akan otomatis muncul di sini setelah file diupload, atau Anda dapat mem-paste teks secara langsung..."
                            className="w-full text-sm rounded-md border-slate-300 border p-3 shadow-inner bg-white focus:ring-blue-500 focus:border-blue-500" 
                         />
                      </div>
                   </div>
                </section>
              </div>
              
              <div className="p-6 border-t border-slate-100 bg-slate-50/90 rounded-b-xl flex flex-col items-center sticky bottom-0 z-20 backdrop-blur-sm">
                {progressMsg && activeTab === 'identitas' && (
                  <div className="w-full mb-4 px-4 py-3 bg-blue-100 text-blue-900 rounded-md text-sm font-medium flex items-center justify-center space-x-2 animate-pulse border border-blue-200">
                     <Loader2 className="animate-spin h-5 w-5" /><span>{progressMsg}</span>
                  </div>
                )}
                {errorMsg && activeTab === 'identitas' && (
                  <div className="w-full mb-4 px-4 py-3 bg-red-100 text-red-900 rounded-md text-sm font-medium flex items-center justify-center space-x-2 border border-red-200">
                     <AlertCircle className="h-5 w-5" /><span>{errorMsg}</span>
                  </div>
                )}
                <button onClick={handleGenerateGlobal} disabled={isGenerating} className="w-full md:w-2/3 flex justify-center items-center py-4 px-6 border border-transparent rounded-lg shadow-lg text-lg font-bold text-white bg-blue-900 hover:bg-blue-800 focus:outline-none disabled:bg-slate-400 transition-all">
                  {isGenerating ? 'AI Sedang Memproses Dokumen 1-6...' : 'Generate Dokumen 1 s.d. 6 Sekaligus'}
                </button>
              </div>
            </div>
          )}

          {/* TAB MODUL AJAR (KHUSUS) */}
          {activeTab === 'modul' && (
             <div className="w-full flex flex-col items-center print:hidden no-print pb-12">
               
               {/* Konfigurasi Modul Ajar (Dropdown) */}
               <div className="w-full max-w-5xl bg-white border border-slate-200 rounded-xl shadow-sm mb-6 p-6 shrink-0">
                 <h3 className="font-bold text-slate-800 text-lg mb-1">Pengaturan Cepat Modul Ajar Presisi</h3>
                 <p className="text-sm text-slate-500 mb-6">Pilih Tujuan Pembelajaran. TP, Materi, dan Estimasi Pertemuan disinkronisasi otomatis dari hasil generate ATP sebelumnya.</p>
                 
                 {extractedTPs.length === 0 ? (
                    <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded-md text-sm flex items-start space-x-3 mb-6">
                       <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                       <p><strong>Perhatian:</strong> Anda belum melakukan Generate Dokumen (1-6) atau AI gagal membuat tabel ATP yang valid. Silakan kembali ke Tab Data Global dan jalankan <strong>"Generate Dokumen 1 s.d 6"</strong> terlebih dahulu agar pilihan TP dan Materi muncul otomatis di sini.</p>
                    </div>
                 ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                       <div className="md:col-span-2">
                          <label className="block text-sm font-bold text-blue-900 mb-2">Pilih Tujuan Pembelajaran (TP)</label>
                          <select 
                            value={selectedTPIndex} 
                            onChange={(e) => setSelectedTPIndex(Number(e.target.value))}
                            className="w-full text-sm rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3 border bg-slate-50 font-medium text-slate-700"
                          >
                            {extractedTPs.map((tp, idx) => (
                               <option key={idx} value={idx}>
                                  [{tp.kode}] {tp.tujuan}
                               </option>
                            ))}
                          </select>
                       </div>
                       
                       <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Materi Pokok (Otomatis dari ATP)</label>
                          <div className="w-full text-sm rounded-md border border-slate-200 p-3 bg-gray-100 text-slate-700 min-h-[46px]">
                             {extractedTPs[selectedTPIndex]?.materi}
                          </div>
                       </div>
                       
                       <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Alokasi Waktu (Otomatis)</label>
                          <div className="w-full text-sm rounded-md border border-slate-200 p-3 bg-gray-100 text-slate-700 min-h-[46px] flex items-center space-x-2">
                             <Calendar className="w-4 h-4 text-blue-600" />
                             <span>{extractedTPs[selectedTPIndex]?.pertemuan} Pertemuan (Total {extractedTPs[selectedTPIndex]?.jp} JP)</span>
                          </div>
                       </div>

                       <div className="md:col-span-2 mt-2">
                          <label className="block text-sm font-bold text-slate-700 mb-2">Model Pembelajaran</label>
                          <select 
                            name="modelPembelajaran"
                            value={appData.modelPembelajaran} 
                            onChange={handleChange}
                            className="w-full text-sm rounded-md border-slate-300 shadow-sm focus:border-blue-500 p-3 border bg-white"
                          >
                            <option value="Problem Based Learning (PBL)">Problem Based Learning (PBL)</option>
                            <option value="Project Based Learning (PjBL)">Project Based Learning (PjBL)</option>
                            <option value="Discovery Learning">Discovery Learning</option>
                            <option value="Inquiry Learning">Inquiry Learning</option>
                            <option value="Cooperative Learning (Jigsaw/STAD)">Cooperative Learning (Jigsaw/STAD)</option>
                            <option value="Direct Instruction (Pengajaran Langsung)">Direct Instruction (Pengajaran Langsung)</option>
                          </select>
                       </div>
                    </div>
                 )}

                 <div className="mt-8 flex flex-col items-center border-t border-slate-100 pt-6">
                    {progressMsg && (
                      <div className="w-full mb-4 px-4 py-3 bg-blue-100 text-blue-900 rounded-md text-sm font-medium flex items-center justify-center space-x-2 animate-pulse">
                         <Loader2 className="animate-spin h-5 w-5 flex-shrink-0" /><span className="text-center">{progressMsg}</span>
                      </div>
                    )}
                    {errorMsg && (
                      <div className="w-full mb-4 px-4 py-3 bg-red-100 text-red-900 rounded-md text-sm font-medium flex items-center justify-center space-x-2">
                         <AlertCircle className="h-5 w-5" /><span>{errorMsg}</span>
                      </div>
                    )}
                    <button 
                      onClick={handleGenerateModul} 
                      disabled={isGenerating || extractedTPs.length === 0} 
                      className="w-full md:w-2/3 flex justify-center items-center py-3 px-6 border border-transparent rounded-lg shadow-md text-base font-bold text-white bg-green-700 hover:bg-green-800 disabled:bg-slate-400 transition-colors"
                    >
                      {isGenerating ? 'AI Sedang Merancang Modul...' : `Generate Modul Ajar (${extractedTPs[selectedTPIndex]?.pertemuan || 1} Pertemuan)`}
                    </button>
                 </div>
               </div>
               
               {/* Efek Loading Visual dan Pratinjau Modul Ajar */}
               {isGenerating ? (
                  <div className="w-full max-w-5xl bg-white border border-blue-200 rounded-xl shadow-lg p-16 flex flex-col items-center justify-center space-y-6">
                     <div className="relative flex justify-center items-center">
                        <div className="absolute animate-ping w-24 h-24 rounded-full bg-blue-200 opacity-60"></div>
                        <div className="absolute animate-ping w-16 h-16 rounded-full bg-blue-400 opacity-60" style={{ animationDelay: '0.2s' }}></div>
                        <Loader2 className="animate-spin text-blue-900 h-12 w-12 relative z-10" />
                     </div>
                     <h3 className="text-xl font-bold text-blue-900 animate-pulse text-center">AI Sedang Menyusun Modul Ajar Presisi</h3>
                     <p className="text-sm text-slate-500 text-center max-w-md">Proses ini memakan waktu beberapa saat karena AI sedang menyesuaikan sintaks pembelajaran yang kompleks.</p>
                  </div>
               ) : generatedDocs.modul && (
                 <div className="w-full max-w-5xl flex flex-col items-center bg-[#525659] rounded-xl overflow-hidden shadow-xl border border-slate-400 custom-scrollbar print-container relative flex-1">
                    
                    {/* Header Notifikasi Berhasil */}
                    <div className="w-full bg-green-600 text-white px-6 py-4 flex flex-col sm:flex-row justify-between items-center print:hidden border-b border-green-700 shadow-md">
                       <div className="flex items-center space-x-2 mb-2 sm:mb-0">
                          <CheckCircle2 className="h-6 w-6" />
                          <span className="font-semibold text-lg">Modul Ajar Siap!</span>
                       </div>
                       <div className="bg-green-800/50 px-4 py-1.5 rounded-full">
                          <span className="text-sm font-medium animate-pulse">Silahkan geser/scroll ke bawah untuk membaca hasilnya &darr;</span>
                       </div>
                    </div>

                    {/* Preview Wrapper dengan scroll horizontal yang lebih baik jika layar kecil */}
                    <div className="w-full overflow-x-auto flex justify-center py-10 px-4 sm:px-8">
                       <div 
                         className="document-preview bg-white shadow-2xl p-6 sm:p-10 lg:p-14 text-black w-full"
                         style={{ maxWidth: '210mm', minHeight: '297mm' }}
                         dangerouslySetInnerHTML={{ __html: generatedDocs.modul }}
                       />
                    </div>
                    
                    {/* Tombol Aksi di Bawah Dokumen */}
                    <div className="w-full flex flex-wrap justify-center gap-4 p-6 bg-slate-800 border-t border-slate-700 print:hidden">
                      <button onClick={handleDownloadWord} className="inline-flex items-center space-x-2 px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-md text-white bg-blue-600 hover:bg-blue-700 transition-colors">
                        <Download className="h-5 w-5" /><span>Download Word (.doc)</span>
                      </button>
                      <button onClick={handlePrintHTML} className="inline-flex items-center space-x-2 px-6 py-3 border border-slate-500 shadow-sm text-base font-medium rounded-md text-white bg-slate-700 hover:bg-slate-600 transition-colors">
                        <Printer className="h-5 w-5" /><span>Cetak / PDF</span>
                      </button>
                    </div>
                 </div>
               )}
             </div>
          )}

          {/* TAB 2-6: DOCUMENT PREVIEW */}
          {activeTab !== 'identitas' && activeTab !== 'modul' && (
            <div className="flex-1 w-full flex flex-col items-center">
              {generatedDocs[activeTab] ? (
                <div className="w-full h-full overflow-auto bg-[#525659] print:bg-white custom-scrollbar print-container relative flex flex-col">
                  
                  <div 
                    className="document-preview bg-white mx-auto shadow-2xl p-10 lg:p-14 text-black shrink-0 mt-8 mb-4 print:mt-0 print:mb-0 print:p-0"
                    style={{ 
                       width: '100%', 
                       maxWidth: ['prosem1', 'prosem2', 'atp', 'kktp'].includes(activeTab) ? '297mm' : '210mm',
                       minHeight: ['prosem1', 'prosem2', 'atp', 'kktp'].includes(activeTab) ? '210mm' : '297mm'
                    }}
                    dangerouslySetInnerHTML={{ __html: generatedDocs[activeTab] }}
                  />
                  
                  <div className="w-full flex justify-center space-x-4 pb-12 pt-4 print:hidden no-print shrink-0">
                    <button onClick={handleDownloadWord} className="inline-flex items-center space-x-2 px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-md text-white bg-blue-700 hover:bg-blue-800 transition-colors">
                      <Download className="h-5 w-5" /><span>Download Word (.doc)</span>
                    </button>
                    <button onClick={handleDownloadHTML} className="inline-flex items-center space-x-2 px-6 py-3 border border-slate-300 shadow-sm text-base font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 transition-colors">
                      <Code className="h-5 w-5" /><span>Source HTML</span>
                    </button>
                    <button onClick={handlePrintHTML} className="inline-flex items-center space-x-2 px-6 py-3 border border-slate-300 shadow-sm text-base font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 transition-colors">
                      <Printer className="h-5 w-5" /><span>Cetak / PDF</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 print:hidden p-8 text-center w-full max-w-lg mx-auto">
                  <FileText className="h-20 w-20 mb-6 opacity-20 text-slate-500" />
                  <p className="text-xl font-medium text-slate-600 mb-2">Dokumen Belum Tersedia</p>
                  <p className="text-sm text-slate-500">Kembali ke tab <strong>Data Global</strong> dan klik "Generate Dokumen" terlebih dahulu.</p>
                  <button onClick={() => setActiveTab('identitas')} className="mt-6 px-4 py-2 bg-blue-100 text-blue-900 rounded-md font-medium hover:bg-blue-200 transition-colors">Ke Data Global</button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Global & Print CSS Injection */}
      <style dangerouslySetInnerHTML={{__html: `
        .document-preview table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; border: 1pt solid black; }
        .document-preview th, .document-preview td { border: 1pt solid black; padding: 0.6rem; text-align: left; vertical-align: top; }
        .document-preview th { background-color: #1a3a5c !important; color: white !important; font-weight: bold; }
        .document-preview h1, .document-preview h2, .document-preview h3 { margin-top: 1.5rem; margin-bottom: 0.75rem; color: #1a3a5c; }
        .document-preview p { margin-bottom: 0.5rem; }
        .document-preview .header-kop { text-align: center; border-bottom: 3px solid black; padding-bottom: 1rem; margin-bottom: 2rem; }
        
        .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.05); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.2); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.4); }
        
        @media print {
          @page { 
            size: A4 ${['prosem1', 'prosem2', 'atp', 'kktp'].includes(activeTab) ? 'landscape' : 'portrait'}; 
            margin: 1.5cm; 
          }
          body { background: white; }
          #root > div > aside { display: none !important; }
          #root > div > main > header { display: none !important; }
          
          .print-container { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; padding: 0 !important; margin: 0 !important; background: white !important; }
          .document-preview { box-shadow: none !important; padding: 0 !important; margin: 0 !important; width: 100% !important; max-width: 100% !important; }
          .no-print { display: none !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}} />

      {/* API KEY MODAL */}
      {showApiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 print:hidden">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center shadow-inner">
                  <Key className="h-5 w-5 text-blue-700" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">Pengaturan API Key Gemini</h3>
              </div>
              <button onClick={() => setShowApiModal(false)} className="text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Masukkan Google Gemini API Key Anda</label>
                <input 
                  type="password" 
                  value={apiKey} 
                  onChange={(e) => setApiKey(e.target.value)} 
                  placeholder="AIzaSy..." 
                  className="w-full text-base rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3 border bg-white font-mono"
                />
                <p className="text-xs text-slate-500 mt-2">API Key hanya disimpan secara lokal di browser selama sesi ini berlangsung demi keamanan Anda.</p>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 shadow-sm">
                <h4 className="font-semibold text-blue-900 flex items-center mb-3">
                  <HelpCircle className="h-4 w-4 mr-2" /> Cara Mendapatkan API Key (Gratis)
                </h4>
                <ol className="list-decimal list-inside text-sm text-slate-700 space-y-2">
                  <li>Buka situs <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-blue-700 font-bold hover:underline inline-flex items-center">Google AI Studio <ExternalLink className="h-3 w-3 ml-1" /></a>.</li>
                  <li>Login menggunakan akun Google (Gmail) Anda.</li>
                  <li>Di menu sebelah kiri, klik opsi <strong>"Get API key"</strong>.</li>
                  <li>Klik tombol biru <strong>"Create API key"</strong>.</li>
                  <li>Tunggu prosesnya, lalu klik <strong>"Copy"</strong> pada kode yang muncul (kode selalu diawali dengan huruf <em>AIzaSy...</em>).</li>
                  <li>Kembali ke aplikasi ini, dan <strong>Paste</strong> kode tersebut ke kolom di atas.</li>
                </ol>
              </div>
            </div>

            <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end space-x-3">
              <button onClick={() => setShowApiModal(false)} className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-lg transition-colors">
                Tutup
              </button>
              <button 
                onClick={() => setShowApiModal(false)} 
                className={`px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-colors shadow-sm ${apiKey ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-700 hover:bg-blue-800'}`}
              >
                {apiKey ? 'Simpan API Key' : 'Simpan & Lanjutkan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Utility Input Component
function Input({ name, label, val, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
      <input type="text" name={name} value={val} onChange={onChange} placeholder={placeholder} className="w-full text-sm rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border bg-white" />
    </div>
  );
}
