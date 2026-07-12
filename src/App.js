import React, { useState, useEffect } from 'react';
import { 
  BookOpen, FileText, Calendar, Layout, User, Lock, 
  LogOut, Printer, Code, Loader2, AlertCircle, CheckCircle2,
  ChevronRight, Settings, Check, Download, AlertTriangle, Link as LinkIcon,
  Key, HelpCircle, ExternalLink, X, RefreshCw, Play, Copy, ClipboardPaste, ArrowLeft, Save, FolderOpen, Trash2
} from 'lucide-react';

// --- CONFIGURATION & API ---
const fetchWithRetry = async (url, options, retries = 5) => {
  const delays = [1000, 2000, 4000, 8000, 16000];
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`HTTP error! status: ${response.status} -${errorData.error?.message || 'Tidak ditemukan'}`);
      }
      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(res => setTimeout(res, delays[i]));
    }
  }
};

const generateWithAI = async (apiKey, systemPrompt, userQuery) => {
  if (!apiKey) throw new Error("API Key belum dikonfigurasi! Silakan masukkan API Key di menu Pengaturan API Key.");
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: userQuery }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
  };
  const result = await fetchWithRetry(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  let text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return text.replace(/^```html\n/i, '').replace(/^```\n/i, '').replace(/```$/i, '');
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

const getPromptAnalisisCP = (d) => `Buat dokumen **ANALISIS CP** secara UTUH dan LENGKAP tanpa ada bagian yang dipotong.\nData Identitas:\n- Provinsi/Dinas: ${d.provinsiKota} / ${d.dinas}\n- Sekolah: ${d.sekolah} (${d.alamat})\n- Mapel/Singkatan: ${d.mapel} (${d.singkatan})\n- Fase/Kelas: ${d.fase}\n- Tahun Pelajaran: ${d.tahun}\n- Guru: ${d.guru} (NIP: ${d.nipGuru})\n- Kepsek: ${d.kepsek} (NIP: ${d.nipKepsek})\n- TTD: ${d.kotaTanggal}\n\nCP Umum: ${d.cpUmum}\nCP Elemen: ${d.cpElemen}\n\nINSTRUKSI STRUKTUR DOKUMEN (9 Bagian Wajib Harus Ada):\n1. KOP SURAT & JUDUL: "ANALISIS CAPAIAN PEMBELAJARAN"\n2. BAGIAN A — IDENTITAS: Tabel 2 kolom.\n3. BAGIAN B — RASIONAL MATA PELAJARAN: Tabel 3 kolom (No | Uraian | Deskripsi).\n4. BAGIAN C — TUJUAN MATA PELAJARAN: Tabel 3 kolom (No | Tujuan | Indikator Umum).\n5. BAGIAN D — KARAKTERISTIK MATA PELAJARAN & ELEMEN CP: Tabel 4 kolom.\n6. BAGIAN E — CAPAIAN PEMBELAJARAN FASE: Tabel 4 kolom.\n7. BAGIAN F — PENJABARAN KATA KERJA OPERASIONAL (KKO) PER ELEMEN: Tabel 3 kolom.\n8. BAGIAN G — KETERKAITAN DENGAN 8 DIMENSI PROFIL LULUSAN: Tabel 4 kolom.\n9. PENUTUP: Tabel TTD Kepsek (Kiri) dan Guru (Kanan).\nPastikan tabel HTML menggunakan warna header Biru Tua (#1a3a5c) dengan teks putih.\n${COMMON_RULES}`;
const getPromptTP = (d) => `Buat dokumen **TUJUAN PEMBELAJARAN (TP)** 1 Tahun Ajaran Penuh.\nIdentitas: ${d.sekolah} | ${d.mapel} | ${d.fase} | ${d.tahun} | Total Waktu: ${d.alokasiWaktu}.\nElemen CP:\n${d.elemenList}\nReferensi Buku Paket / Materi Pokok: ${d.bukuReferensi ? d.bukuReferensi : 'Gunakan materi pokok standar Kurikulum Merdeka.'}\n\nDaftar TP Lengkap:\nBuat kode TP terstruktur misal: ${d.singkatan}-${d.fase.split('/')[0].replace('Fase ','')}-ELMN-001.\n\nINSTRUKSI FORMAT HTML:\n- Judul: "TUJUAN PEMBELAJARAN"\n- Bagian A: Identitas\n- Bagian B: PANDUAN KODE TP\n- Bagian C: DAFTAR TUJUAN PEMBELAJARAN (Tabel 6 kolom: No | Kode TP | Elemen CP | Tujuan Pembelajaran | Aspek | Alokasi JP).\n- Bagian D: REKAPITULASI ALOKASI WAKTU PER ELEMEN.\n${COMMON_RULES}`;
const getPromptATP = (d) => `Buat dokumen **ALUR TUJUAN PEMBELAJARAN (ATP)** 1 Tahun.\nIdentitas: ${d.sekolah} | ${d.mapel} | ${d.fase}.\nDaftar TP yang menjadi acuan:\n${d.dataSebelumnya}\nReferensi Materi Pokok:\n${d.bukuReferensi ? d.bukuReferensi : 'Materi standar Kurikulum Merdeka.'}\n\nINSTRUKSI FORMAT HTML:\n- Judul: "ALUR TUJUAN PEMBELAJARAN"\n- Bagian A: Identitas\n- Bagian B: DIAGRAM ALUR TP (Kotak berisi alur kode TP dengan tanda panah →).\n- Bagian C: TABEL ATP (8 kolom: No | Kode TP | Elemen CP | Tujuan Pembelajaran | Materi Pokok | Kompetensi & Variasi | 8 Dimensi | Alokasi JP | Semester).\n- Bagian D: REKAPITULASI (JP Sem 1, Sem 2, Total).\n${COMMON_RULES}`;
const getPromptProta = (d) => `Buat dokumen **PROGRAM TAHUNAN (PROTA)**.\nIdentitas: ${d.sekolah} | ${d.mapel} | ${d.fase} | JP/Minggu: ${d.jpMinggu}.\nKalender Pendidikan:\n${d.kalender}\nDaftar ATP acuan:\n${d.dataSebelumnya}\n\nINSTRUKSI FORMAT HTML:\n- Judul: "PROGRAM TAHUNAN"\n- Bagian A: Identitas\n- Bagian B: DISTRIBUSI MINGGU EFEKTIF (Tabel Kalender 7 Kolom).\n- Bagian C: RENCANA PROGRAM TAHUNAN (5 Kolom: No | Kode TP | Tujuan & Materi | Elemen | JP | Semester).\n${COMMON_RULES}`;
const getPromptProsem = (d, semester) => `Buat dokumen **PROGRAM SEMESTER ${semester} (PROSEM)**.\nIdentitas: ${d.sekolah} | ${d.mapel} | ${d.fase}.\nKalender Pendidikan:\n${d.kalender}\nDaftar ATP acuan:\n${d.dataSebelumnya}\n\nINSTRUKSI FORMAT HTML:\n- Judul: "PROGRAM SEMESTER ${semester}"\n- Bagian Legenda Warna: Biru(Aktif), Merah(Libur), Kuning(PTS), Hijau(PAS).\n- TABEL MATRIKS PROSEM: Kolom tetap (No, Kode TP, Tujuan & Materi, JP). Gunakan inline CSS background-color pada sel tabel matriks (Biru #d0e4f7, Merah #ffd6d6, Kuning #fff3cd, Hijau #d4edda).\n${COMMON_RULES}`;
const getPromptKKTP = (d) => `Buat dokumen **KRITERIA KETERCAPAIAN TUJUAN PEMBELAJARAN (KKTP)**.\nRentang Nilai: ${d.rentangNilai}\nDaftar ATP acuan:\n${d.dataSebelumnya}\n\nINSTRUKSI FORMAT HTML:\n- Judul: "KRITERIA KETERCAPAIAN TUJUAN PEMBELAJARAN"\n- Bagian A: DESKRIPSI LEVEL CAPAIAN\n- Bagian B: RUBRIK KKTP PER TP (Tabel 9 kolom: No | Kode TP | Tujuan | IKTP | Mulai Berkembang(1) | Layak(2) | Cakap(3) | Mahir(4)).\n${COMMON_RULES}`;
const getPromptModul = (d, tpObj) => `Tugas Anda adalah membuat Modul Ajar Presisi berdasarkan Kurikulum Merdeka.\nMata Pelajaran: ${d.mapel}\nFase / Kelas: ${d.fase}\nMateri Pokok: ${tpObj.materi}\nReferensi Tambahan: ${d.bukuReferensi ? d.bukuReferensi : '-'}\nTujuan Pembelajaran (TP): [${tpObj.kode}] ${tpObj.tujuan}\nModel Pembelajaran: ${d.modelPembelajaran}\nAlokasi Waktu: ${tpObj.pertemuan} Pertemuan x ${d.jpPertemuan}\n\nSTRUKTUR MODUL AJAR YANG HARUS DIBUAT:\nBAGIAN A - INFORMASI UMUM (Identitas Modul, Kesiapan Siswa, Prasyarat, Dimensi Profil Lulusan, Sarpras, Target Siswa).\nBAGIAN B - KOMPONEN INTI (Pemahaman Bermakna, Pertanyaan Pemantik, Asesmen Diagnostik).\nKEGIATAN PEMBELAJARAN (Dibagi berdasarkan SINTAK model ${d.modelPembelajaran} untuk ${tpObj.pertemuan} pertemuan. Terdapat Pembuka, Inti, Penutup).\nAsesmen Formatif, Sumatif, Pengayaan, Refleksi.\nBAGIAN C - LAMPIRAN (Rubrik Penilaian, LKPD, Glosarium, Daftar Pustaka).\n${COMMON_RULES}`;

// --- COMPONENTS ---
export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  if (!isLoggedIn) return <LoginScreen onLogin={() => setIsLoggedIn(true)} />;
  return <Dashboard onLogout={() => setIsLoggedIn(false)} />;
}

// --- LOGIN SCREEN ---
function LoginScreen({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    // Validasi Password Baru 'Pisang1*'
    if (password.trim() === '') {
      setError('Password wajib diisi, tidak boleh kosong.');
    } else if (password === 'Pisang1*') {
      onLogin();
    } else {
      setError('Password salah. Silakan coba lagi.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="h-16 w-16 bg-blue-900 rounded-2xl flex items-center justify-center shadow-lg"><BookOpen className="h-8 w-8 text-white" /></div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900">Generator Perangkat Ajar</h2>
      </div>
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-blue-900/5 sm:rounded-2xl sm:px-10 border border-slate-100">
          <form className="space-y-6" onSubmit={handleLogin}>
            <div>
              <label className="block text-sm font-medium text-slate-700">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 block w-full border border-slate-300 rounded-md py-3 px-3 focus:ring-blue-500 focus:border-blue-500" placeholder="Masukkan password" />
              {error && <p className="mt-2 text-sm text-red-600 font-medium">{error}</p>}
            </div>
            <button type="submit" className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-900 hover:bg-blue-800 transition-colors">Masuk</button>
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
  
  // Data Global
  const [appData, setAppData] = useState({
    provinsiKota: 'Pemerintah Kabupaten Ketapang', dinas: 'Dinas Pendidikan', sekolah: 'SMP Negeri 3 Kendawangan',
    alamat: 'Jl. H. Rajali, Desa Kendawangan Kanan, Kec. Kendawangan', mapel: 'Bahasa Indonesia', singkatan: 'BINDO',
    fase: 'Fase D / Kelas IX', tahun: '2026/2027', alokasiWaktu: '222 JP / Tahun', jpMinggu: '6 JP/Minggu', jpPertemuan: '2 JP (80 Menit)',
    guru: 'Gunawan, S.Pd.', nipGuru: '198610252017081002', kepsek: 'Aliman Nuryadin,S.Pd.', nipKepsek: '198203012017081008',
    kotaTanggal: 'Kendawangan, 13 Juli 2026',
    elemenList: '1 | MNY | Menyimak\n2 | MBM | Membaca - Memirsa\n3 | BCP | Berbicara - Mempresentasikan\n4 | MNL | Menulis',
    cpUmum: 'Mata pelajaran Bahasa Indonesia pada Kurikulum Merdeka menuntut peserta didik memiliki kemampuan berbahasa untuk berkomunikasi dan bernalar sesuai tujuan, konteks sosial, dan akademis',
    cpElemen: 'Elemen Menyimak: Peserta didik mampu menganalisis dan memaknai informasi berupa gagasan, pikiran, perasaan, pandangan, arahan atau pesan yang tepat dari berbagai tipe teks audio visual dan aural dalam bentuk monolog, dialog, dan gelar wicara. Peserta didik mampu mengeksplorasi dan mengevaluasi berbagai informasi dari topik aktual yang didengar.\nElemen Membaca - Memirsa: Peserta didik mampu memahami informasi berupa gagasan, pikiran, pandangan, arahan atau pesan dari teks visual dan audiovisual untuk menemukan makna yang tersurat dan tersirat. Peserta didik mampu menginterpretasikan informasi untuk mengungkapkan kepedulian dan/atau pendapat pro/kontra dari teks visual dan audiovisual. Peserta didik mampu menggunakan sumber informasi lain untuk menilai akurasi (ketepatan) dan kualitas data serta membandingkan informasi pada teks; mengeksplorasi dan mengevaluasi berbagai topik aktual yang dibaca dan dipirsa.\nElemen Berbicara - Mempresentasikan: Peserta didik mampu menyampaikan gagasan, pikiran, pandangan, arahan atau pesan untuk tujuan pengajuan usul, pemecahan masalah, dan pemberian solusi secara lisan dalam bentuk monolog dan dialog logis, kritis, dan kreatif. Peserta didik mampu menggunakan dan memaknai kosakata baru yang memiliki makna denotatif, konotatif, dan kiasan untuk berbicara dan menyajikan gagasannya. Peserta didik mampu menggunakan ungkapan sesuai dengan norma kesopanan dalam berkomunikasi. Peserta didik mampu berdiskusi secara aktif, kontributif, efektif, dan santun. Peserta didik mampu menuturkan dan menyajikan ungkapan kepedulian dalam bentuk teks nonfiksi dan fiksi multimodal yang netral, ramah gender, dan/atau ramah keberagaman. Peserta didik mampu mengungkapkan dan mempresentasikan berbagai topik aktual secara kritis.\nElemen Menulis: Peserta didik mampu menulis gagasan, pikiran, pandangan, arahan atau pesan tertulis untuk berbagai tujuan secara logis, kritis, dan kreatif. Peserta didik mampu menuliskan hasil penelitian menggunakan metodologi sederhana dengan mengutip sumber rujukan secara etis. Peserta didik mampu menyampaikan ungkapan rasa kepedulian dan pendapat pro/kontra secara etis dalam memberikan penghargaan secara tertulis dalam teks multimodal yang disajikan melalui media cetak, elektronik, dan/atau digital. Peserta didik mampu menggunakan dan mengembangkan kosakata baru yang memiliki makna denotatif, konotatif, dan kiasan untuk menulis. Peserta didik mampu menyampaikan tulisan berdasarkan fakta, pengalaman, dan imajinasi secara indah dan menarik dalam bentuk karya sastra dengan penggunaan kosakata secara kreatif.',
    kalender: 'SEMESTER 1:\nJuli | 5 | 2 | MPLS\nAgustus | 4 | 0 | Efektif\nSeptember | 5 | 0 | Efektif\nOktober | 4 | 0 | Efektif\nNovember | 4 | 0 | Efektif\nDesember | 5 | 5 | PAS & Libur\n\nSEMESTER 2:\nJanuari | 4 | 0 | Efektif\nFebruari | 4 | 1 | Libur\nMaret | 5 | 2 | Idul Fitri\nApril | 4 | 0 | Efektif\nMei | 4 | 1 | Libur Mei\nJuni | 5 | 5 | PAT & Libur',
    rentangNilai: 'Level 1 (Mulai Berkembang): 0-54 | D\nLevel 2 (Layak): 55-69 | C\nLevel 3 (Cakap): 70-84 | B\nLevel 4 (Mahir): 85-100 | A',
    modelPembelajaran: 'Problem Based Learning (PBL)', dataSebelumnya: '', bukuReferensi: '',
  });

  const [generatedDocs, setGeneratedDocs] = useState({ cp: '', tp: '', atp: '', prota: '', prosem1: '', prosem2: '', kktp: '', modul: '' });
  
  const [extractedTPs, setExtractedTPs] = useState([]);
  const [selectedTPIndex, setSelectedTPIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // --- PROJECT MANAGEMENT STATE ---
  const [savedProjectsList, setSavedProjectsList] = useState({});
  const [currentProjectName, setCurrentProjectName] = useState('');

  // Load Saved Projects on mount
  useEffect(() => {
    const localProjects = localStorage.getItem('generator_projects');
    if (localProjects) {
      setSavedProjectsList(JSON.parse(localProjects));
    }
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setAppData(prev => ({ ...prev, [name]: value }));
  };

  const parseATPForModules = (atpHtmlString) => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(atpHtmlString, 'text/html');
      const tables = doc.querySelectorAll('table');
      let tps = [];
      tables.forEach(table => {
        const headerRow = table.querySelector('tr');
        if (headerRow && headerRow.textContent.toLowerCase().includes('kode tp')) {
          const rows = table.querySelectorAll('tr');
          rows.forEach((row, index) => {
             if(index === 0) return; 
             const cells = row.querySelectorAll('td');
             if (cells.length >= 7) {
                 const kode = cells[1]?.textContent.trim();
                 const tujuan = cells[3]?.textContent.trim();
                 const materi = cells[4]?.textContent.trim();
                 const jpStr = cells[7]?.textContent.trim();
                 if(kode && tujuan && kode.length > 3) {
                     const jpNum = parseInt(jpStr.match(/\d+/)?.[0] || 0);
                     const jpPerPertemuan = parseInt(appData.jpPertemuan.match(/\d+/)?.[0] || 2);
                     let pertemuanCalc = Math.max(1, Math.ceil(jpNum / jpPerPertemuan));
                     tps.push({ kode, tujuan, materi: materi || 'Materi Umum', jp: jpNum, pertemuan: pertemuanCalc });
                 }
             }
          });
        }
      });
      const uniqueTPs = Array.from(new Map(tps.map(item => [item.kode, item])).values());
      if(uniqueTPs.length > 0) {
        setExtractedTPs(uniqueTPs);
        setSelectedTPIndex(0);
      }
    } catch(err) { console.error("Gagal mem-parsing ATP:", err); }
  };

  // --- PROJECT MANAGEMENT FUNCTIONS ---
  const handleSaveProject = () => {
    if (!currentProjectName.trim()) {
      alert("Silakan ketik nama proyek terlebih dahulu (Misal: Kelas 8 Ganjil).");
      return;
    }
    const projectData = { appData, generatedDocs };
    const updatedList = { ...savedProjectsList, [currentProjectName]: projectData };
    setSavedProjectsList(updatedList);
    localStorage.setItem('generator_projects', JSON.stringify(updatedList));
    alert(`Proyek "${currentProjectName}" berhasil disimpan ke browser!`);
  };

  const handleLoadProject = (e) => {
    const projName = e.target.value;
    if (!projName) return;
    const confirmLoad = window.confirm(`Muat proyek "${projName}"? Data yang belum disimpan saat ini akan tertimpa.`);
    if (confirmLoad && savedProjectsList[projName]) {
      setAppData(savedProjectsList[projName].appData);
      setGeneratedDocs(savedProjectsList[projName].generatedDocs);
      setCurrentProjectName(projName);
      
      // Re-parse ATP if it exists in the loaded project
      if (savedProjectsList[projName].generatedDocs.atp) {
         parseATPForModules(savedProjectsList[projName].generatedDocs.atp);
      } else {
         setExtractedTPs([]);
      }
      alert(`Proyek "${projName}" berhasil dimuat!`);
    }
  };

  const handleDeleteProject = (projName) => {
    if(window.confirm(`Yakin ingin MENGHAPUS proyek "${projName}" dari browser?`)){
       const updatedList = { ...savedProjectsList };
       delete updatedList[projName];
       setSavedProjectsList(updatedList);
       localStorage.setItem('generator_projects', JSON.stringify(updatedList));
       if (currentProjectName === projName) setCurrentProjectName('');
       alert('Proyek berhasil dihapus.');
    }
  };

  // --- GENERATE OTOMATIS (API KEY) ---
  const handleGenerateSingleTab = async (docType) => {
    if (!apiKey) {
       setErrorMsg('API Key belum diisi.'); setShowApiModal(true); return;
    }
    setIsGenerating(true); setErrorMsg('');
    let currentData = { ...appData };
    try {
      let result = '';
      setProgressMsg(`AI Sedang Merumuskan...`);
      if (docType === 'cp') result = await generateWithAI(apiKey, COMMON_RULES, getPromptAnalisisCP(currentData));
      else if (docType === 'tp') result = await generateWithAI(apiKey, COMMON_RULES, getPromptTP(currentData));
      else if (docType === 'atp') {
        if (!generatedDocs.tp) throw new Error("Gagal! Generate dokumen TP dulu.");
        currentData.dataSebelumnya = generatedDocs.tp;
        result = await generateWithAI(apiKey, COMMON_RULES, getPromptATP(currentData));
        parseATPForModules(result);
      } 
      else if (docType === 'prota') {
        if (!generatedDocs.atp) throw new Error("Gagal! Generate dokumen ATP dulu.");
        currentData.dataSebelumnya = generatedDocs.atp;
        result = await generateWithAI(apiKey, COMMON_RULES, getPromptProta(currentData));
      } 
      else if (docType === 'prosem1' || docType === 'prosem2') {
        if (!generatedDocs.atp) throw new Error("Gagal! Generate dokumen ATP dulu.");
        currentData.dataSebelumnya = generatedDocs.atp;
        result = await generateWithAI(apiKey, COMMON_RULES, getPromptProsem(currentData, docType === 'prosem1' ? '1 (Ganjil)' : '2 (Genap)'));
      } 
      else if (docType === 'kktp') {
        if (!generatedDocs.atp) throw new Error("Gagal! Generate dokumen ATP dulu.");
        currentData.dataSebelumnya = generatedDocs.atp;
        result = await generateWithAI(apiKey, COMMON_RULES, getPromptKKTP(currentData));
      }
      setGeneratedDocs(prev => ({ ...prev, [docType]: result }));
      setProgressMsg('');
    } catch (err) { setErrorMsg(`Error: ${err.message}`); setProgressMsg(''); } 
    finally { setIsGenerating(false); }
  };

  const handleGenerateModul = async () => {
    if (!apiKey) { setErrorMsg('API Key belum diisi.'); setShowApiModal(true); return; }
    if (extractedTPs.length === 0) return;
    setIsGenerating(true); setErrorMsg('');
    try {
      const targetTP = extractedTPs[selectedTPIndex];
      setProgressMsg(`Menyusun Modul Ajar untuk TP: ${targetTP.kode}...`);
      const modul = await generateWithAI(apiKey, COMMON_RULES, getPromptModul(appData, targetTP));
      setGeneratedDocs(prev => ({ ...prev, modul }));
      setProgressMsg('');
    } catch (err) { setErrorMsg(`Gagal: ${err.message}`); } 
    finally { setIsGenerating(false); }
  };

  // --- MANUAL COPY PASTE FUNCTIONS ---
  const handleCopyPrompt = async (docType) => {
    try {
      let currentData = { ...appData };
      let promptText = '';
      if (docType === 'cp') promptText = getPromptAnalisisCP(currentData);
      else if (docType === 'tp') promptText = getPromptTP(currentData);
      else if (docType === 'atp') {
          if (!generatedDocs.tp) return alert("Anda harus membuat dan mem-paste dokumen TP terlebih dahulu!");
          currentData.dataSebelumnya = generatedDocs.tp;
          promptText = getPromptATP(currentData);
      }
      else if (docType === 'prota') {
          if (!generatedDocs.atp) return alert("Buat dokumen ATP terlebih dahulu!");
          currentData.dataSebelumnya = generatedDocs.atp;
          promptText = getPromptProta(currentData);
      }
      else if (docType === 'prosem1' || docType === 'prosem2') {
          if (!generatedDocs.atp) return alert("Buat dokumen ATP terlebih dahulu!");
          currentData.dataSebelumnya = generatedDocs.atp;
          promptText = getPromptProsem(currentData, docType === 'prosem1' ? '1 (Ganjil)' : '2 (Genap)');
      }
      else if (docType === 'kktp') {
          if (!generatedDocs.atp) return alert("Buat dokumen ATP terlebih dahulu!");
          currentData.dataSebelumnya = generatedDocs.atp;
          promptText = getPromptKKTP(currentData);
      }
      else if (docType === 'modul') {
          if (extractedTPs.length === 0) return alert("Buat dokumen ATP terlebih dahulu agar TP tersedia!");
          promptText = getPromptModul(currentData, extractedTPs[selectedTPIndex]);
      }

      const prefix = "Tolong buatkan dokumen HTML sesuai instruksi di bawah ini secara langsung di dalam teks balasan Anda (jangan gunakan eksekusi kode Python):\n\n";
      await navigator.clipboard.writeText(prefix + promptText);
      alert("Prompt berhasil disalin! Silakan Buka Web ChatGPT atau Gemini, lalu PASTE di sana.");
    } catch (err) {
      alert("Gagal menyalin text. Browser Anda mungkin tidak mengizinkan akses Clipboard.");
    }
  };

  const handlePasteResult = async (docType) => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || text.trim() === '') return alert("Clipboard kosong. Pastikan Anda sudah meng-copy hasil dari AI.");
      
      let cleanText = text.replace(/^```html\n/i, '').replace(/^```\n/i, '').replace(/```$/i, '');
      setGeneratedDocs(prev => ({ ...prev, [docType]: cleanText }));
      
      if(docType === 'atp') {
         parseATPForModules(cleanText);
      }
      alert("HTML berhasil dipaste dan dirender!");
    } catch (err) {
      alert("Gagal mem-paste. Coba izinkan akses Clipboard di browser Anda.");
    }
  };

  // --- DOWNLOAD FUNCTIONS ---
  const handleDownloadWord = () => {
    const isLandscape = ['prosem1', 'prosem2', 'atp', 'kktp'].includes(activeTab);
    const htmlContent = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Export Doc</title><style>body { font-family: 'Calibri', sans-serif; font-size: 11pt; } table { width: 100%; border-collapse: collapse; margin-bottom: 12pt; border: 1pt solid windowtext; } th, td { border: 1pt solid windowtext; padding: 5pt; vertical-align: top; } th { background-color: #1a3a5c; color: white; } @page WordSectionPortrait { size: 595.3pt 841.9pt; margin: 72pt; } @page WordSectionLandscape { size: 841.9pt 595.3pt; margin: 72pt; } div.WordSectionPortrait { page: WordSectionPortrait; } div.WordSectionLandscape { page: WordSectionLandscape; } </style></head><body><div class="${isLandscape ? 'WordSectionLandscape' : 'WordSectionPortrait'}">${generatedDocs[activeTab]}</div></body></html>`;
    const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `ADM_${activeTab.toUpperCase()}.doc`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handlePrintHTML = () => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed'; iframe.style.right = '0'; iframe.style.bottom = '0'; iframe.style.width = '100vw'; iframe.style.height = '100vh'; iframe.style.border = '0'; iframe.style.zIndex = '-9999'; 
    document.body.appendChild(iframe);
    const isLandscape = ['prosem1', 'prosem2', 'atp', 'kktp'].includes(activeTab);
    const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cetak</title><style>body { font-family: 'Calibri', sans-serif; } table { width: 100%; border-collapse: collapse; border: 1pt solid black; } th, td { border: 1pt solid black; padding: 0.5rem; text-align: left; vertical-align: top; } th { background-color: #1a3a5c !important; color: white !important; font-weight: bold; } @media print { @page { size: A4 ${isLandscape ? 'landscape' : 'portrait'}; margin: 1.5cm; } * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }</style></head><body>${generatedDocs[activeTab]}</body></html>`;
    iframe.contentWindow.document.open(); iframe.contentWindow.document.write(htmlContent); iframe.contentWindow.document.close();
    setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print(); setTimeout(() => document.body.removeChild(iframe), 1500); }, 1000);
  };

  const tabs = [
    { id: 'identitas', icon: Settings, label: 'Data Global (Input)' }, { id: 'cp', icon: FileText, label: '1. Analisis CP' },
    { id: 'tp', icon: Layout, label: '2. Tujuan Pemb. (TP)' }, { id: 'atp', icon: ChevronRight, label: '3. Alur (ATP)' },
    { id: 'prota', icon: Calendar, label: '4. Prota' }, { id: 'prosem1', icon: Calendar, label: '5a. Prosem Sem 1' },
    { id: 'prosem2', icon: Calendar, label: '5b. Prosem Sem 2' }, { id: 'kktp', icon: CheckCircle2, label: '6. KKTP' },
    { id: 'modul', icon: BookOpen, label: '7. Modul Ajar' },
  ];

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900 flex flex-col md:flex-row">
      <aside className="w-full md:w-64 bg-white border-r border-slate-200 flex-shrink-0 flex flex-col print:hidden no-print">
        <div className="p-6 border-b border-slate-100 flex items-center space-x-3">
          <div className="h-8 w-8 bg-blue-900 rounded-lg flex items-center justify-center"><BookOpen className="h-4 w-4 text-white" /></div>
          <div><h1 className="font-bold text-slate-800 text-sm">Generator AI</h1><p className="text-[10px] text-slate-500">Perangkat Ajar 1 Tahun</p></div>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto custom-scrollbar">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); setErrorMsg(''); }} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-blue-50 text-blue-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
              <div className="flex items-center space-x-3"><tab.icon className={`h-4 w-4 ${activeTab === tab.id ? 'text-blue-700' : 'text-slate-400'}`} /><span>{tab.label}</span></div>
              {generatedDocs[tab.id] && tab.id !== 'identitas' && <Check className="h-4 w-4 text-green-500" />}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center print:hidden no-print z-10 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center">{tabs.find(t => t.id === activeTab)?.label}</h2>
          {activeTab !== 'identitas' && activeTab !== 'modul' && generatedDocs[activeTab] && (
            <div className="flex space-x-2">
               <button onClick={() => handlePasteResult(activeTab)} className="inline-flex items-center text-sm space-x-1.5 px-3 py-1.5 border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 rounded-md font-medium"><ClipboardPaste className="h-4 w-4" /><span>Paste Ulang Manual</span></button>
               <button onClick={() => handleGenerateSingleTab(activeTab)} disabled={isGenerating} className="inline-flex items-center text-sm space-x-1.5 px-3 py-1.5 border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md font-medium">
                 {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}<span>Generate Ulang (API)</span>
               </button>
            </div>
          )}
        </header>

        <div className="flex-1 overflow-auto bg-slate-100/50 p-6 print:p-0 print:bg-white flex flex-col relative custom-scrollbar">
          
          {/* TAB 1: FORM DATA GLOBAL + PROJECT MANAGEMENT */}
          {activeTab === 'identitas' && (
            <div className="max-w-5xl mx-auto w-full bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col print:hidden no-print">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 rounded-t-xl">
                <h3 className="font-bold text-slate-800 text-lg">Input Data Global 1 Tahun</h3>
                <p className="text-sm text-slate-500 mt-1">Simpan dan Muat Proyek Anda di bawah ini agar tidak mengulang dari awal.</p>
              </div>
              
              <div className="p-6 overflow-y-auto space-y-8 flex-1">
                {/* BLOK MANAJEMEN PROYEK */}
                <section className="bg-blue-50/80 p-5 rounded-xl border border-blue-200 shadow-inner">
                   <h4 className="font-bold text-blue-900 mb-4 flex items-center"><FolderOpen className="w-5 h-5 mr-2" /> Manajemen Proyek Tersimpan</h4>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Form Simpan */}
                      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                         <label className="block text-sm font-semibold text-slate-700 mb-2">Simpan Proyek Saat Ini</label>
                         <div className="flex space-x-2">
                           <input type="text" value={currentProjectName} onChange={(e) => setCurrentProjectName(e.target.value)} placeholder="Misal: B.Indo Kelas 8" className="flex-1 text-sm rounded-md border-slate-300 p-2 border focus:outline-none focus:ring-1 focus:ring-blue-500" />
                           <button onClick={handleSaveProject} className="bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center transition-colors"><Save className="w-4 h-4 mr-1" /> Simpan</button>
                         </div>
                      </div>
                      
                      {/* Form Muat */}
                      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                         <label className="block text-sm font-semibold text-slate-700 mb-2">Muat Proyek Sebelumnya</label>
                         <div className="flex space-x-2">
                           <select onChange={handleLoadProject} className="flex-1 text-sm rounded-md border-slate-300 p-2 border bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500" value="">
                             <option value="" disabled>-- Pilih Proyek --</option>
                             {Object.keys(savedProjectsList).map(proj => <option key={proj} value={proj}>{proj}</option>)}
                           </select>
                         </div>
                         {/* Daftar List Proyek untuk Dihapus */}
                         <div className="mt-3 space-y-1">
                            {Object.keys(savedProjectsList).map(proj => (
                              <div key={proj} className="flex justify-between items-center text-xs bg-slate-100 px-3 py-2 rounded-md border border-slate-200">
                                <span className="font-medium text-slate-700">{proj}</span>
                                <button onClick={() => handleDeleteProject(proj)} className="text-red-500 hover:text-red-700 flex items-center"><Trash2 className="w-3.5 h-3.5 mr-1" /> Hapus</button>
                              </div>
                            ))}
                         </div>
                      </div>
                   </div>
                </section>

                <section><h4 className="font-semibold text-blue-900 border-b pb-2 mb-4">Blok 1: Identitas Sekolah & Guru</h4>
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {['provinsiKota','dinas','sekolah','alamat','mapel','singkatan','fase','tahun','alokasiWaktu','jpMinggu','jpPertemuan','guru','nipGuru','kepsek','nipKepsek','kotaTanggal'].map(key => (
                         <div key={key}>
                           <label className="block text-xs font-medium text-slate-700 mb-1">{key.replace(/([A-Z])/g, ' $1').toUpperCase()}</label>
                           <input type="text" name={key} value={appData[key]} onChange={handleChange} className="w-full text-sm rounded-md border-slate-300 p-2 border focus:outline-none focus:ring-1 focus:ring-blue-500" />
                         </div>
                      ))}
                   </div>
                </section>
                <section><h4 className="font-semibold text-blue-900 border-b pb-2 mb-4">Blok 2 & 3: Capaian & Elemen</h4>
                   <div className="space-y-4">
                      <textarea name="elemenList" rows={3} value={appData.elemenList} onChange={handleChange} className="w-full text-sm rounded-md border-slate-300 border p-2 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <textarea name="cpUmum" rows={3} value={appData.cpUmum} onChange={handleChange} className="w-full text-sm rounded-md border-slate-300 border p-2 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <textarea name="cpElemen" rows={4} value={appData.cpElemen} onChange={handleChange} className="w-full text-sm rounded-md border-slate-300 border p-2 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                   </div>
                </section>
                <section><h4 className="font-semibold text-blue-900 border-b pb-2 mb-4">Blok 4: Kalender & KKTP</h4>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <textarea name="kalender" rows={5} value={appData.kalender} onChange={handleChange} className="w-full text-sm border rounded-md border-slate-300 p-2 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <textarea name="rentangNilai" rows={5} value={appData.rentangNilai} onChange={handleChange} className="w-full text-sm border rounded-md border-slate-300 p-2 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                   </div>
                </section>
                <section><h4 className="font-semibold text-blue-900 border-b pb-2 mb-4">Blok 5: Referensi Materi Pokok</h4>
                   <textarea name="bukuReferensi" rows={4} value={appData.bukuReferensi} onChange={handleChange} placeholder="Ringkasan bab buku paket..." className="w-full text-sm border rounded-md border-slate-300 p-2 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </section>
              </div>
            </div>
          )}

          {/* TAB MODUL AJAR (KHUSUS) */}
          {activeTab === 'modul' && (
             <div className="w-full flex flex-col items-center print:hidden no-print pb-12">
               {!generatedDocs.modul ? (
                 <div className="w-full max-w-5xl bg-white border border-slate-200 rounded-xl shadow-sm mb-6 p-6">
                   <h3 className="font-bold text-slate-800 text-lg mb-1">Pengaturan Cepat Modul Ajar Presisi</h3>
                   {extractedTPs.length === 0 ? (
                      <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-md text-sm text-yellow-800 flex items-center">
                        <AlertCircle className="w-5 h-5 mr-2" />
                        <span>Buat dokumen ATP terlebih dahulu di Tab 3, agar pilihan Tujuan Pembelajaran muncul di sini.</span>
                      </div>
                   ) : (
                      <div className="space-y-4 mt-4">
                         <label className="block text-sm font-semibold text-slate-700">Pilih Tujuan Pembelajaran:</label>
                         <select value={selectedTPIndex} onChange={(e) => setSelectedTPIndex(Number(e.target.value))} className="w-full border p-3 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm font-medium">
                            {extractedTPs.map((tp, idx) => <option key={idx} value={idx}>[{tp.kode}] {tp.tujuan}</option>)}
                         </select>
                         <div className="flex space-x-4 pt-4">
                            <button onClick={() => handleCopyPrompt('modul')} className="flex-1 bg-slate-800 hover:bg-slate-900 text-white py-3 rounded-md font-bold flex items-center justify-center transition-colors"><Copy className="w-5 h-5 mr-2"/> 1. Salin Prompt ke ChatGPT</button>
                            <button onClick={() => handlePasteResult('modul')} className="flex-1 bg-green-700 hover:bg-green-800 text-white py-3 rounded-md font-bold flex items-center justify-center transition-colors"><ClipboardPaste className="w-5 h-5 mr-2"/> 2. Paste Hasil HTML</button>
                         </div>
                      </div>
                   )}
                 </div>
               ) : (
                 <div className="w-full max-w-5xl flex flex-col items-center bg-[#525659] rounded-xl overflow-hidden shadow-xl border border-slate-400">
                    <div className="w-full bg-green-600 text-white px-6 py-4 flex justify-between items-center"><span className="font-bold flex items-center"><CheckCircle2 className="w-5 h-5 mr-2" /> Modul Ajar Siap!</span></div>
                    <div className="w-full overflow-x-auto flex justify-center py-10 px-4"><div className="document-preview bg-white shadow-2xl p-10 text-black w-full" style={{ maxWidth: '210mm', minHeight: '297mm' }} dangerouslySetInnerHTML={{ __html: generatedDocs.modul }} /></div>
                    <div className="w-full flex flex-wrap justify-center gap-4 p-6 bg-slate-800">
                      <button onClick={handleDownloadWord} className="flex items-center px-6 py-3 rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors"><Download className="h-5 w-5 mr-2" />Download Word</button>
                      <button onClick={handlePrintHTML} className="flex items-center px-6 py-3 rounded-md text-white bg-slate-700 hover:bg-slate-600 transition-colors"><Printer className="h-5 w-5 mr-2" />Cetak / PDF</button>
                      <button onClick={() => setGeneratedDocs(prev => ({...prev, modul: ''}))} className="flex items-center px-6 py-3 rounded-md text-white bg-orange-600 hover:bg-orange-700 font-bold transition-colors shadow-lg"><ArrowLeft className="h-5 w-5 mr-2"/> Kembali & Pilih TP Lain</button>
                    </div>
                 </div>
               )}
             </div>
          )}

          {/* TAB 2-6: GENERATE DOCUMENTS */}
          {activeTab !== 'identitas' && activeTab !== 'modul' && (
            <div className="flex-1 w-full flex flex-col items-center">
              {!generatedDocs[activeTab] && !isGenerating && (
                <div className="flex-1 flex flex-col items-center justify-center text-center w-full max-w-3xl mx-auto space-y-6">
                  <h3 className="text-2xl font-bold text-slate-700">Mulai {tabs.find(t => t.id === activeTab)?.label}</h3>
                  <div className="grid grid-cols-2 gap-4 w-full">
                     <button onClick={() => handleCopyPrompt(activeTab)} className="py-4 px-6 border-2 border-slate-300 rounded-lg text-lg font-bold text-slate-700 hover:bg-slate-50 flex flex-col items-center transition-colors"><Copy className="w-8 h-8 mb-2 text-slate-600"/> 1. Salin Prompt (Manual)</button>
                     <button onClick={() => handlePasteResult(activeTab)} className="py-4 px-6 bg-green-700 text-white rounded-lg text-lg font-bold hover:bg-green-800 flex flex-col items-center transition-colors"><ClipboardPaste className="w-8 h-8 mb-2 opacity-90"/> 2. Paste Hasil (Manual)</button>
                  </div>
                  <div className="w-full flex items-center my-4"><div className="flex-1 border-t border-slate-300"></div><span className="px-4 text-slate-400 font-medium">ATAU JIKA PUNYA API KEY</span><div className="flex-1 border-t border-slate-300"></div></div>
                  <button onClick={() => handleGenerateSingleTab(activeTab)} className="w-full py-4 px-8 rounded-lg shadow-lg text-lg font-bold text-white bg-blue-900 hover:bg-blue-800 transition-colors">Generate Otomatis via API Key</button>
                </div>
              )}
              {generatedDocs[activeTab] && (
                <div className="w-full flex flex-col items-center bg-[#525659] py-8 rounded-lg">
                  <div className="document-preview bg-white shadow-2xl p-10 text-black mb-6" style={{ width: '100%', maxWidth: ['prosem1', 'prosem2', 'atp', 'kktp'].includes(activeTab) ? '297mm' : '210mm', minHeight: ['prosem1', 'prosem2', 'atp', 'kktp'].includes(activeTab) ? '210mm' : '297mm' }} dangerouslySetInnerHTML={{ __html: generatedDocs[activeTab] }} />
                  <div className="flex space-x-4">
                     <button onClick={handleDownloadWord} className="px-6 py-3 rounded-md font-medium text-white bg-blue-700 hover:bg-blue-800 transition-colors shadow-md flex items-center"><Download className="h-5 w-5 mr-2"/> Download Word (.doc)</button>
                     <button onClick={handlePrintHTML} className="px-6 py-3 rounded-md font-medium text-white bg-slate-700 hover:bg-slate-600 transition-colors shadow-md flex items-center"><Printer className="h-5 w-5 mr-2"/> Cetak / PDF</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Global CSS */}
      <style dangerouslySetInnerHTML={{__html: `
        .document-preview table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; border: 1pt solid black; } 
        .document-preview th, .document-preview td { border: 1pt solid black; padding: 0.6rem; text-align: left; vertical-align: top; } 
        .document-preview th { background-color: #1a3a5c !important; color: white !important; font-weight: bold; } 
        @media print { 
          body { background: white; } 
          aside, header { display: none !important; } 
          .document-preview { box-shadow: none !important; margin: 0 !important; padding: 0 !important; }
        }
      `}} />
    </div>
  );
}
