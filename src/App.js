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
        throw new Error(`HTTP error! status: ${response.status} - ${errorData.error?.message || 'Tidak ditemukan'}`);
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
    cpUmum: 'Mata pelajaran Bahasa Indonesia menuntut peserta didik memiliki kemampuan berbahasa untuk berkomunikasi...',
    cpElemen: 'Elemen Menyimak: Peserta didik mampu menganalisis dan memaknai informasi...',
    kalender: 'SEMESTER 1:\nJuli | 5 | 2 | MPLS\nSEMESTER 2:\nJanuari | 4 | 0 | Efektif',
    rentangNilai: 'Level 1: 0-54 | D\nLevel 2: 55-69 | C\nLevel 3: 70-84 | B\nLevel 4: 85-100 | A',
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
      
      let cleanText = text.replace(/^```html\n/i, '').replace(/^
