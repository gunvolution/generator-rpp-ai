import React, { useState, useEffect } from 'react';
import { 
  BookOpen, FileText, Calendar, Layout, Lock, 
  LogOut, Printer, Loader2, AlertCircle, CheckCircle2,
  ChevronRight, Settings, Check, Download,
  Key, Cloud, CloudOff, RefreshCw, Play, Copy, ClipboardPaste, 
  ArrowLeft, Save, FolderOpen, Trash2, Upload, File
} from 'lucide-react';

// ============================================================================
// KONFIGURASI FIREBASE (WAJIB DIISI)
// ============================================================================
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, getDocs, deleteDoc, getDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getBlob, deleteObject } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCY78LOarTVPKSJh2Rh-w0dPAcO5lHHvXU",
  authDomain: "generator-perangkat-ajar.firebaseapp.com",
  projectId: "generator-perangkat-ajar",
  storageBucket: "generator-perangkat-ajar.firebasestorage.app",
  messagingSenderId: "1010604347571",
  appId: "1:1010604347571:web:8debee3c1d1e0d121d60c6"
};

let app, db, storage;
let isFirebaseConfigured = false;
try {
  if (!firebaseConfig.apiKey.includes("GANTI_DENGAN")) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    storage = getStorage(app);
    isFirebaseConfigured = true;
  }
} catch (error) {
  console.error("Gagal menginisialisasi Firebase:", error);
}

// --- CONFIGURATION & API GEMINI ---
const fetchWithRetry = async (url, options, retries = 3) => {
  const delays = [1000, 2000, 4000];
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

const generateWithAI = async (apiKey, systemPrompt, userQuery, pdfBase64 = null) => {
  if (!apiKey) throw new Error("API Key belum dikonfigurasi! Silakan masukkan API Key di menu Pengaturan.");
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const parts = [{ text: userQuery }];
  if (pdfBase64) {
    parts.push({
      inlineData: {
        mimeType: "application/pdf",
        data: pdfBase64
      }
    });
  }

  const payload = {
    contents: [{ parts: parts }],
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
const getPromptModul = (d, tpObj) => `Tugas Anda adalah membuat Modul Ajar Presisi berdasarkan Kurikulum Merdeka.\nMata Pelajaran: ${d.mapel}\nFase / Kelas: ${d.fase}\nMateri Pokok: ${tpObj.materi}\nReferensi Tambahan: ${d.bukuReferensi ? d.bukuReferensi : '-'}\n${(d.pdfName || d.pdfStoragePath) ? 'PERHATIAN PENTING: Sebuah dokumen PDF materi telah dilampirkan. Anda diwajibkan untuk menganalisis isi dokumen PDF tersebut secara mendalam dan menjadikannya sebagai SUMBER MATERI UTAMA untuk merumuskan Pemahaman Bermakna, Pertanyaan Pemantik, Kegiatan Pembelajaran Inti, dan Asesmen pada modul ini.\n' : ''}Tujuan Pembelajaran (TP): [${tpObj.kode}] ${tpObj.tujuan}\nModel Pembelajaran: ${d.modelPembelajaran}\nAlokasi Waktu: ${tpObj.pertemuan} Pertemuan x ${d.jpPertemuan}\n\nSTRUKTUR MODUL AJAR YANG HARUS DIBUAT:\nBAGIAN A - INFORMASI UMUM (Identitas Modul, Kesiapan Siswa, Prasyarat, Dimensi Profil Lulusan, Sarpras, Target Siswa).\nBAGIAN B - KOMPONEN INTI (Pemahaman Bermakna, Pertanyaan Pemantik, Asesmen Diagnostik).\nKEGIATAN PEMBELAJARAN (Dibagi berdasarkan SINTAK model ${d.modelPembelajaran} untuk ${tpObj.pertemuan} pertemuan. Terdapat Pembuka, Inti, Penutup).\nAsesmen Formatif, Sumatif, Pengayaan, Refleksi.\nBAGIAN C - LAMPIRAN (Rubrik Penilaian, LKPD, Glosarium, Daftar Pustaka).\n${COMMON_RULES}`;

const DEFAULT_APP_DATA = {
  provinsiKota: 'PEMERINTAH KABUPATEN KETAPANG', dinas: 'DINAS PENDIDIKAN', sekolah: 'SMP NEGERI 3 KENDAWANGAN',
  alamat: 'Jl. H. Rajali, Desa Kendawangan Kanan, Kec. Kendawangan', mapel: 'Bahasa Indonesia', singkatan: 'BINDO',
  fase: 'Fase D / Kelas IX', tahun: '2026/2027', alokasiWaktu: '222 JP / Tahun', jpMinggu: '6 JP/Minggu', jpPertemuan: '2 JP (80 Menit)',
  guru: 'Gunawan, S.Pd.', nipGuru: '198610252017081002', kepsek: 'Aliman Nuryadin,S.Pd.', nipKepsek: '198203012010011008',
  kotaTanggal: 'Kendawangan, 13 Juli 2026',
    elemenList: '1 | MNY | Menyimak\n2 | MBM | Membaca - Memirsa\n3 | BCP | Berbicara - Mempresentasikan\n4 | MNL | Menulis',
    cpUmum: 'Mata pelajaran Bahasa Indonesia pada Kurikulum Merdeka menuntut peserta didik memiliki kemampuan berbahasa untuk berkomunikasi dan bernalar sesuai tujuan, konteks sosial, dan akademis',
    cpElemen: 'Elemen Menyimak: Peserta didik mampu menganalisis dan memaknai informasi berupa gagasan, pikiran, perasaan, pandangan, arahan atau pesan yang tepat dari berbagai tipe teks audio visual dan aural dalam bentuk monolog, dialog, dan gelar wicara. Peserta didik mampu mengeksplorasi dan mengevaluasi berbagai informasi dari topik aktual yang didengar.\nElemen Membaca - Memirsa: Peserta didik mampu memahami informasi berupa gagasan, pikiran, pandangan, arahan atau pesan dari teks visual dan audiovisual untuk menemukan makna yang tersurat dan tersirat. Peserta didik mampu menginterpretasikan informasi untuk mengungkapkan kepedulian dan/atau pendapat pro/kontra dari teks visual dan audiovisual. Peserta didik mampu menggunakan sumber informasi lain untuk menilai akurasi (ketepatan) dan kualitas data serta membandingkan informasi pada teks; mengeksplorasi dan mengevaluasi berbagai topik aktual yang dibaca dan dipirsa.\nElemen Berbicara - Mempresentasikan: Peserta didik mampu menyampaikan gagasan, pikiran, pandangan, arahan atau pesan untuk tujuan pengajuan usul, pemecahan masalah, dan pemberian solusi secara lisan dalam bentuk monolog dan dialog logis, kritis, dan kreatif. Peserta didik mampu menggunakan dan memaknai kosakata baru yang memiliki makna denotatif, konotatif, dan kiasan untuk berbicara dan menyajikan gagasannya. Peserta didik mampu menggunakan ungkapan sesuai dengan norma kesopanan dalam berkomunikasi. Peserta didik mampu berdiskusi secara aktif, kontributif, efektif, dan santun. Peserta didik mampu menuturkan dan menyajikan ungkapan kepedulian dalam bentuk teks nonfiksi dan fiksi multimodal yang netral, ramah gender, dan/atau ramah keberagaman. Peserta didik mampu mengungkapkan dan mempresentasikan berbagai topik aktual secara kritis.\nElemen Menulis: Peserta didik mampu menulis gagasan, pikiran, pandangan, arahan atau pesan tertulis untuk berbagai tujuan secara logis, kritis, dan kreatif. Peserta didik mampu menuliskan hasil penelitian menggunakan metodologi sederhana dengan mengutip sumber rujukan secara etis. Peserta didik mampu menyampaikan ungkapan rasa kepedulian dan pendapat pro/kontra secara etis dalam memberikan penghargaan secara tertulis dalam teks multimodal yang disajikan melalui media cetak, elektronik, dan/atau digital. Peserta didik mampu menggunakan dan mengembangkan kosakata baru yang memiliki makna denotatif, konotatif, dan kiasan untuk menulis. Peserta didik mampu menyampaikan tulisan berdasarkan fakta, pengalaman, dan imajinasi secara indah dan menarik dalam bentuk karya sastra dengan penggunaan kosakata secara kreatif.',
    kalender: 'SEMESTER 1:\nJuli | 5 | 2 | MPLS\nAgustus | 4 | 0 | Efektif\nSeptember | 5 | 0 | Efektif\nOktober | 4 | 0 | Efektif\nNovember | 4 | 0 | Efektif\nDesember | 5 | 5 | PAS & Libur\n\nSEMESTER 2:\nJanuari | 4 | 0 | Efektif\nFebruari | 4 | 1 | Libur\nMaret | 5 | 2 | Idul Fitri\nApril | 4 | 0 | Efektif\nMei | 4 | 1 | Libur Mei\nJuni | 5 | 5 | PAT & Libur',
    rentangNilai: 'Level 1 (Mulai Berkembang): 0-54 | D\nLevel 2 (Layak): 55-69 | C\nLevel 3 (Cakap): 70-84 | B\nLevel 4 (Mahir): 85-100 | A',
  modelPembelajaran: 'Problem Based Learning (PBL)', dataSebelumnya: '', bukuReferensi: '',
  pdfName: '', pdfStoragePath: '' 
};

const DEFAULT_DOCS = { cp: '', tp: '', atp: '', prota: '', prosem1: '', prosem2: '', kktp: '', modul: '' };

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  if (!isLoggedIn) return <LoginScreen onLogin={() => setIsLoggedIn(true)} />;
  return <Dashboard onLogout={() => setIsLoggedIn(false)} />;
}

function LoginScreen({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    if (password.trim() === '') setError('Password wajib diisi.');
    else if (password === 'berdayagunawan') onLogin();
    else setError('Password salah. Silakan coba lagi.');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="h-16 w-16 bg-blue-900 rounded-2xl flex items-center justify-center shadow-lg"><BookOpen className="h-8 w-8 text-white" /></div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900">Generator Perangkat Ajar</h2>
        <p className="mt-2 text-center text-sm text-slate-600">Terintegrasi Firebase Cloud</p>
      </div>
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-blue-900/5 sm:rounded-2xl sm:px-10 border border-slate-100">
          <form className="space-y-6" onSubmit={handleLogin}>
            <div>
              <label className="block text-sm font-medium text-slate-700">Password Akses</label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Lock className="h-5 w-5 text-slate-400" /></div>
                <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} className={`block w-full pl-10 sm:text-sm border rounded-md py-3 focus:ring-blue-500 focus:border-blue-500 ${error ? 'border-red-300' : 'border-slate-300'}`} placeholder="Masukkan sandi akses" />
              </div>
              {error && <p className="mt-2 text-sm text-red-600 font-medium flex items-center"><AlertCircle className="w-4 h-4 mr-1"/>{error}</p>}
            </div>
            <button type="submit" className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-900 hover:bg-blue-800 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-900">Masuk Sistem</button>
          </form>
        </div>
        <div className="mt-8 text-center text-[11px] text-slate-400 font-medium tracking-wide">created by nawanug_kdw</div>
      </div>
    </div>
  );
}

function Dashboard({ onLogout }) {
  const [activeTab, setActiveTab] = useState('identitas');
  const [apiKey, setApiKey] = useState('');
  const [showApiModal, setShowApiModal] = useState(false);
  
  // Custom UI States
  const [toastMessage, setToastMessage] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  
  const showToast = (message, type = 'success') => {
    setToastMessage({ message, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  // State Data Proyek
  const [appData, setAppData] = useState(() => {
    try { const saved = localStorage.getItem('generator_autosave_appData'); return saved ? JSON.parse(saved) : DEFAULT_APP_DATA; } catch(e) { return DEFAULT_APP_DATA; }
  });
  const [generatedDocs, setGeneratedDocs] = useState(() => {
    try { const saved = localStorage.getItem('generator_autosave_docs'); return saved ? JSON.parse(saved) : DEFAULT_DOCS; } catch(e) { return DEFAULT_DOCS; }
  });
  const [currentProjectName, setCurrentProjectName] = useState(() => localStorage.getItem('generator_autosave_projectName') || '');
  
  // State Eksekusi & Cloud
  const [extractedTPs, setExtractedTPs] = useState([]);
  const [selectedTPIndex, setSelectedTPIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  
  // FIREBASE STATES
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [firebaseProjectsList, setFirebaseProjectsList] = useState([]);
  const [tempPdfFile, setTempPdfFile] = useState(null); 
  const [tempPdfBase64, setTempPdfBase64] = useState(''); 

  useEffect(() => {
    const localApiKey = localStorage.getItem('gemini_api_key');
    if (localApiKey) setApiKey(localApiKey);
    
    if (generatedDocs.atp) parseATPForModules(generatedDocs.atp);
    
    if (isFirebaseConfigured) fetchProjectsFromFirebase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const saveSession = setTimeout(() => {
       try {
         localStorage.setItem('generator_autosave_appData', JSON.stringify({ ...appData, pdfBase64: '' })); 
         localStorage.setItem('generator_autosave_docs', JSON.stringify(generatedDocs));
         localStorage.setItem('generator_autosave_projectName', currentProjectName);
       } catch (error) { console.warn("Lokal draft gagal disimpan (mungkin kepenuhan)"); }
    }, 1000); 
    return () => clearTimeout(saveSession);
  }, [appData, generatedDocs, currentProjectName]);

  const fetchProjectsFromFirebase = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "projects"));
      const projects = [];
      querySnapshot.forEach((doc) => projects.push(doc.id));
      setFirebaseProjectsList(projects);
    } catch (error) {
      console.error("Gagal memuat proyek dari Firebase:", error);
    }
  };

  const handleSaveToCloud = async () => {
    if (!isFirebaseConfigured) return showToast("Gagal: Konfigurasi Firebase Anda belum dimasukkan ke kode sumber.", "error");
    if (!currentProjectName.trim()) return showToast("Silakan ketik nama proyek terlebih dahulu.", "error");
    
    setIsCloudSyncing(true);
    setProgressMsg("Mengunggah data proyek ke Cloud...");
    
    try {
      let currentStoragePath = appData.pdfStoragePath || "";
      
      // Upload PDF jika ada
      if (tempPdfFile) {
         setProgressMsg(`Mengunggah lampiran PDF: ${tempPdfFile.name}...`);
         currentStoragePath = `pdfs/${currentProjectName}_${Date.now()}_${tempPdfFile.name}`;
         const storageRef = ref(storage, currentStoragePath);
         await uploadBytes(storageRef, tempPdfFile);
         showToast("Lampiran PDF berhasil diamankan di Cloud.");
      }

      // Simpan Data di Firestore
      setProgressMsg("Menyimpan dokumen dan identitas...");
      const dataToSave = {
         appData: { ...appData, pdfStoragePath: currentStoragePath, pdfName: tempPdfFile ? tempPdfFile.name : appData.pdfName },
         generatedDocs: generatedDocs,
         updatedAt: new Date().toISOString()
      };
      
      await setDoc(doc(db, "projects", currentProjectName), dataToSave);
      
      setTempPdfFile(null); 
      setAppData(prev => ({ ...prev, pdfStoragePath: currentStoragePath, pdfName: tempPdfFile ? tempPdfFile.name : appData.pdfName }));
      
      showToast(`Proyek "${currentProjectName}" tersimpan dengan aman di Cloud!`);
      fetchProjectsFromFirebase(); 
    } catch (error) {
      showToast("Gagal menyimpan proyek ke Firebase. Periksa koneksi internet.", "error");
    } finally {
      setIsCloudSyncing(false);
      setProgressMsg('');
    }
  };

  const handleLoadFromCloud = async (e) => {
    const projName = e.target.value;
    if (!projName) return;
    
    setConfirmDialog({
        message: `Muat proyek "${projName}" dari Cloud? Data yang belum Anda simpan di layar saat ini akan hilang.`,
        onConfirm: async () => {
            setConfirmDialog(null);
            setIsCloudSyncing(true);
            setProgressMsg(`Mengunduh proyek "${projName}"...`);
            
            try {
              const docSnap = await getDoc(doc(db, "projects", projName));
              if (docSnap.exists()) {
                 const data = docSnap.data();
                 setAppData(data.appData);
                 setGeneratedDocs(data.generatedDocs);
                 setCurrentProjectName(projName);
                 setTempPdfFile(null);
                 setTempPdfBase64(''); 
                 
                 if (data.generatedDocs.atp) parseATPForModules(data.generatedDocs.atp);
                 else setExtractedTPs([]);
                 
                 showToast(`Proyek "${projName}" berhasil dimuat dari Cloud!`);
              } else {
                 showToast("Dokumen tidak ditemukan di database.", "error");
              }
            } catch (error) {
              showToast("Gagal memuat proyek.", "error");
            } finally {
              setIsCloudSyncing(false);
              setProgressMsg('');
            }
        }
    });
  };

  const handleDeleteFromCloud = (projName) => {
    setConfirmDialog({
        message: `Yakin ingin MENGHAPUS proyek "${projName}" secara permanen dari Cloud? Tindakan ini tidak dapat dibatalkan.`,
        onConfirm: async () => {
           setConfirmDialog(null);
           setIsCloudSyncing(true);
           setProgressMsg(`Menghapus data proyek...`);
           
           try {
             const docSnap = await getDoc(doc(db, "projects", projName));
             if (docSnap.exists()) {
                 const data = docSnap.data();
                 if (data.appData.pdfStoragePath) {
                     try { await deleteObject(ref(storage, data.appData.pdfStoragePath)); } 
                     catch (e) { console.warn("Gagal menghapus PDF di storage, mungkin sudah hilang."); }
                 }
             }
             
             await deleteDoc(doc(db, "projects", projName));
             if (currentProjectName === projName) setCurrentProjectName('');
             showToast(`Proyek "${projName}" berhasil dihapus.`);
             fetchProjectsFromFirebase(); 
           } catch (error) {
             showToast("Gagal menghapus proyek.", "error");
           } finally {
             setIsCloudSyncing(false);
             setProgressMsg('');
           }
        }
    });
  };

  const handleChange = (e) => setAppData(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') return showToast("Hanya file PDF yang diperbolehkan.", "error");
    if (file.size > 10 * 1024 * 1024) return showToast("Ukuran maksimal file 10MB.", "error");

    setTempPdfFile(file); 
    const reader = new FileReader();
    reader.onload = (event) => {
      setTempPdfBase64(event.target.result.split(',')[1]);
      setAppData(prev => ({ ...prev, pdfName: file.name }));
      showToast(`PDF ${file.name} siap. Ingat untuk klik "Simpan ke Cloud".`);
    };
    reader.readAsDataURL(file);
  };

  const removePdf = () => {
    setTempPdfFile(null);
    setTempPdfBase64('');
    setAppData(prev => ({ ...prev, pdfName: '', pdfStoragePath: '' }));
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

  const handleGenerateSingleTab = async (docType) => {
    if (!apiKey) return setShowApiModal(true);
    setIsGenerating(true); 
    let currentData = { ...appData };
    
    try {
      let result = '';
      let finalBase64ToSend = null;
      
      // Jika Modul, ambil file PDF dari Base64 Lokal atau Unduh dari Cloud Storage
      if (docType === 'modul') {
          if (extractedTPs.length === 0) throw new Error("Buat ATP dulu agar TP tersedia.");
          
          if (tempPdfBase64) {
              finalBase64ToSend = tempPdfBase64;
          } else if (appData.pdfStoragePath) {
              setProgressMsg("Mengunduh lampiran PDF dari Cloud Storage...");
              try {
                  const storageRef = ref(storage, appData.pdfStoragePath);
                  const blob = await getBlob(storageRef);
                  finalBase64ToSend = await new Promise((resolve) => {
                      const reader = new FileReader();
                      reader.onloadend = () => resolve(reader.result.split(',')[1]);
                      reader.readAsDataURL(blob);
                  });
              } catch (cloudErr) {
                  throw new Error("Gagal mengunduh PDF dari Cloud. File mungkin telah dihapus.");
              }
          }
      }

      setProgressMsg(`AI Sedang Merumuskan Dokumen... Ini mungkin memakan waktu hingga 30 detik.`);
      
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
      else if (docType === 'modul') {
        result = await generateWithAI(apiKey, COMMON_RULES, getPromptModul(currentData, extractedTPs[selectedTPIndex]), finalBase64ToSend);
      }
      
      setGeneratedDocs(prev => ({ ...prev, [docType]: result }));
      showToast("Dokumen berhasil dibuat!");
    } catch (err) { showToast(err.message, 'error'); } 
    finally { setIsGenerating(false); setProgressMsg(''); }
  };

  const handleCopyPrompt = async (docType) => {
    try {
      let currentData = { ...appData };
      let promptText = '';
      if (docType === 'cp') promptText = getPromptAnalisisCP(currentData);
      else if (docType === 'tp') promptText = getPromptTP(currentData);
      else if (docType === 'atp') {
          if (!generatedDocs.tp) return showToast("Anda harus membuat dokumen TP terlebih dahulu!", "error");
          currentData.dataSebelumnya = generatedDocs.tp;
          promptText = getPromptATP(currentData);
      }
      else if (docType === 'prota') {
          if (!generatedDocs.atp) return showToast("Buat dokumen ATP terlebih dahulu!", "error");
          currentData.dataSebelumnya = generatedDocs.atp;
          promptText = getPromptProta(currentData);
      }
      else if (docType === 'prosem1' || docType === 'prosem2') {
          if (!generatedDocs.atp) return showToast("Buat dokumen ATP terlebih dahulu!", "error");
          currentData.dataSebelumnya = generatedDocs.atp;
          promptText = getPromptProsem(currentData, docType === 'prosem1' ? '1 (Ganjil)' : '2 (Genap)');
      }
      else if (docType === 'kktp') {
          if (!generatedDocs.atp) return showToast("Buat dokumen ATP terlebih dahulu!", "error");
          currentData.dataSebelumnya = generatedDocs.atp;
          promptText = getPromptKKTP(currentData);
      }
      else if (docType === 'modul') {
          if (extractedTPs.length === 0) return showToast("Buat dokumen ATP terlebih dahulu agar TP tersedia!", "error");
          promptText = getPromptModul(currentData, extractedTPs[selectedTPIndex]);
      }

      const prefix = "Tolong buatkan dokumen HTML sesuai instruksi di bawah ini secara langsung di dalam teks balasan Anda:\n\n";
      await navigator.clipboard.writeText(prefix + promptText);
      showToast("Prompt disalin! Silakan paste di Chat AI (Gemini/ChatGPT).");
    } catch (err) {
      showToast("Gagal menyalin text. Periksa izin clipboard browser.", "error");
    }
  };

  const handlePasteResult = async (docType) => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || text.trim() === '') return showToast("Clipboard kosong.", "error");
      
      let cleanText = text.replace(/^```html\n/i, '').replace(/^```\n/i, '').replace(/```$/i, '');
      setGeneratedDocs(prev => ({ ...prev, [docType]: cleanText }));
      
      if(docType === 'atp') parseATPForModules(cleanText);
      showToast("HTML berhasil dipaste dan dirender!");
    } catch (err) {
      showToast("Gagal mem-paste. Izinkan akses Clipboard.", "error");
    }
  };

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
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900 flex flex-col md:flex-row relative">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center space-x-2 text-white animate-fade-in-down ${toastMessage.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>
           {toastMessage.type === 'error' ? <AlertCircle className="w-5 h-5"/> : <CheckCircle2 className="w-5 h-5"/>}
           <span className="font-medium text-sm">{toastMessage.message}</span>
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Konfirmasi</h3>
            <p className="text-slate-600 mb-6 text-sm">{confirmDialog.message}</p>
            <div className="flex justify-end space-x-3">
              <button onClick={() => setConfirmDialog(null)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md">Batal</button>
              <button onClick={confirmDialog.onConfirm} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md">Ya, Lanjutkan</button>
            </div>
          </div>
        </div>
      )}

      {/* API Key Modal */}
      {showApiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 border border-slate-200">
             <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-slate-800 flex items-center"><Key className="w-5 h-5 mr-2 text-blue-600"/> Setup API Key</h3>
                <button onClick={() => setShowApiModal(false)} className="text-slate-400 hover:text-red-500 font-bold">&times;</button>
             </div>
             <p className="text-sm text-slate-600 mb-4">Masukkan Google Gemini API Key Anda untuk mengaktifkan fitur pembuatan perangkat ajar otomatis.</p>
             <input type="text" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="AIzaSy..." className="w-full border-slate-300 border p-3 rounded-md mb-4 focus:ring-2 focus:ring-blue-500 font-mono text-sm" />
             <div className="flex justify-end space-x-2">
                <button onClick={() => {
                   localStorage.setItem('gemini_api_key', apiKey);
                   setShowApiModal(false);
                   showToast("API Key berhasil disimpan!");
                }} className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 w-full">Simpan API Key</button>
             </div>
          </div>
        </div>
      )}

      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-white border-r border-slate-200 flex-shrink-0 flex flex-col print:hidden no-print z-10 shadow-sm">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-8 w-8 bg-blue-900 rounded-lg flex items-center justify-center"><BookOpen className="h-4 w-4 text-white" /></div>
            <div><h1 className="font-bold text-slate-800 text-sm">Generator AI</h1><p className="text-[10px] text-slate-500">Perangkat Ajar</p></div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-blue-50 text-blue-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
              <div className="flex items-center space-x-3"><tab.icon className={`h-4 w-4 ${activeTab === tab.id ? 'text-blue-700' : 'text-slate-400'}`} /><span>{tab.label}</span></div>
              {generatedDocs[tab.id] && tab.id !== 'identitas' && <Check className="h-4 w-4 text-green-500" />}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-100 space-y-2">
           <div className="flex items-center justify-center w-full px-3 py-2 text-[11px] font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded mb-2 shadow-inner">
               {isFirebaseConfigured ? <><Cloud className="w-4 h-4 mr-1.5 text-blue-600"/> Firebase Terhubung</> : <><CloudOff className="w-4 h-4 mr-1.5 text-red-500"/> Firebase Tidak Terhubung</>}
           </div>
           <button onClick={() => setShowApiModal(true)} className="w-full flex items-center justify-center px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded hover:bg-slate-100"><Key className="w-3.5 h-3.5 mr-2"/> Set API Key</button>
           <button onClick={onLogout} className="w-full flex items-center justify-center px-3 py-2 text-xs font-medium text-red-600 bg-red-50 rounded hover:bg-red-100"><LogOut className="w-3.5 h-3.5 mr-2"/> Keluar</button>
           <div className="pt-2 pb-1 text-center text-[10px] text-slate-400 font-medium tracking-wide">created by nawanug_kdw</div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center print:hidden no-print z-10 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center">{tabs.find(t => t.id === activeTab)?.label}</h2>
          
          {activeTab !== 'identitas' && activeTab !== 'modul' && generatedDocs[activeTab] && (
            <div className="flex space-x-2">
               <button onClick={() => handlePasteResult(activeTab)} className="inline-flex items-center text-sm space-x-1.5 px-3 py-1.5 border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 rounded-md font-medium"><ClipboardPaste className="h-4 w-4" /><span className="hidden sm:inline">Paste Ulang</span></button>
               <button onClick={() => handleGenerateSingleTab(activeTab)} disabled={isGenerating || isCloudSyncing} className="inline-flex items-center text-sm space-x-1.5 px-3 py-1.5 border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md font-medium transition-colors">
                 {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}<span className="hidden sm:inline">Generate (API)</span>
               </button>
            </div>
          )}
        </header>

        <div className="flex-1 overflow-auto bg-slate-100/50 p-4 sm:p-6 print:p-0 flex flex-col relative custom-scrollbar">
          
          {(isGenerating || isCloudSyncing) && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center rounded-lg m-4 border border-slate-200">
               <Loader2 className={`h-12 w-12 animate-spin mb-4 ${isCloudSyncing ? 'text-blue-600' : 'text-purple-600'}`} />
               <h3 className="text-lg font-bold text-slate-800">{isCloudSyncing ? 'Sinkronisasi Cloud...' : 'AI Sedang Merumuskan...'}</h3>
               <p className="text-slate-500 mt-2 text-center max-w-md">{progressMsg}</p>
            </div>
          )}

          {/* TAB 1: FORM IDENTITAS DAN FIREBASE PROJECT MANAGER */}
          {activeTab === 'identitas' && (
            <div className="max-w-5xl mx-auto w-full bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col print:hidden no-print">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 rounded-t-xl">
                <h3 className="font-bold text-slate-800 text-lg">Input Data Global 1 Tahun</h3>
              </div>
              
              <div className="p-6 overflow-y-auto space-y-8 flex-1">
                
                {/* BLOK FIREBASE MANAJEMEN PROYEK */}
                <section className="bg-blue-900 text-white p-6 rounded-xl border border-blue-800 shadow-lg relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-4 opacity-10"><Cloud className="w-32 h-32"/></div>
                   <h4 className="font-bold text-xl mb-6 flex items-center"><Cloud className="w-6 h-6 mr-3 text-blue-200" /> Firebase Cloud Projects</h4>
                   
                   {!isFirebaseConfigured ? (
                       <div className="bg-red-500/20 border border-red-400 p-4 rounded-lg text-sm">
                           <strong>Konfigurasi Belum Ditemukan!</strong><br/>
                           Mohon edit file kode sumber <code>App.jsx</code> Anda dan masukkan kredensial Firebase di bagian atas.
                       </div>
                   ) : (
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                        <div className="bg-blue-800/50 p-5 rounded-lg border border-blue-700 backdrop-blur-sm">
                           <label className="block text-sm font-semibold text-blue-100 mb-2">Simpan ke Awan Saat Ini</label>
                           <div className="flex space-x-2">
                             <input type="text" value={currentProjectName} onChange={(e) => setCurrentProjectName(e.target.value)} placeholder="Nama Proyek (Mis: Kelas 8)" className="flex-1 text-sm rounded-md border-transparent bg-white text-slate-900 p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                             <button onClick={handleSaveToCloud} className="bg-green-600 hover:bg-green-500 text-white px-5 py-2.5 rounded-md text-sm font-bold flex items-center transition-all shadow-md"><Save className="w-4 h-4 mr-2" /> Simpan</button>
                           </div>
                        </div>
                        
                        <div className="bg-blue-800/50 p-5 rounded-lg border border-blue-700 backdrop-blur-sm">
                           <label className="block text-sm font-semibold text-blue-100 mb-2">Muat Proyek dari Awan</label>
                           <select onChange={handleLoadFromCloud} className="w-full text-sm rounded-md border-transparent bg-white text-slate-900 p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-sm" value="">
                             <option value="" disabled>-- Pilih Dokumen Anda --</option>
                             {firebaseProjectsList.map(proj => <option key={proj} value={proj}>{proj}</option>)}
                           </select>
                           <div className="mt-3 space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                              {firebaseProjectsList.length === 0 && <p className="text-xs text-blue-300 italic">Belum ada proyek di database.</p>}
                              {firebaseProjectsList.map(proj => (
                                <div key={proj} className="flex justify-between items-center text-xs bg-blue-900/60 px-3 py-2 rounded-md border border-blue-700/50">
                                  <span className="font-semibold text-blue-100 truncate">{proj}</span>
                                  <button onClick={() => handleDeleteFromCloud(proj)} className="text-red-300 hover:text-red-100 bg-red-900/40 px-2 py-1 rounded transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                              ))}
                           </div>
                        </div>
                     </div>
                   )}
                </section>

                <section><h4 className="font-semibold text-blue-900 border-b pb-2 mb-4">Blok 1: Identitas Sekolah & Guru</h4>
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {['provinsiKota','dinas','sekolah','alamat','mapel','singkatan','fase','tahun','alokasiWaktu','jpMinggu','jpPertemuan','guru','nipGuru','kepsek','nipKepsek','kotaTanggal'].map(key => (
                         <div key={key}>
                           <label className="block text-xs font-medium text-slate-700 mb-1">{key.replace(/([A-Z])/g, ' $1').trim().toUpperCase()}</label>
                           <input type="text" name={key} value={appData[key]} onChange={handleChange} className="w-full text-sm rounded-md border-slate-300 p-2 border focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white" />
                         </div>
                      ))}
                   </div>
                </section>
                
                <section><h4 className="font-semibold text-blue-900 border-b pb-2 mb-4">Blok 2, 3, 4: Capaian & Kalender</h4>
                   <div className="space-y-4">
                      <textarea name="elemenList" rows={3} value={appData.elemenList} onChange={handleChange} className="w-full text-sm rounded-md border-slate-300 border p-2 focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="Daftar Elemen" />
                      <textarea name="cpUmum" rows={3} value={appData.cpUmum} onChange={handleChange} className="w-full text-sm rounded-md border-slate-300 border p-2 focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="CP Umum" />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <textarea name="kalender" rows={4} value={appData.kalender} onChange={handleChange} className="w-full text-sm border rounded-md border-slate-300 p-2 focus:outline-none font-mono text-xs" placeholder="Kalender" />
                        <textarea name="rentangNilai" rows={4} value={appData.rentangNilai} onChange={handleChange} className="w-full text-sm border rounded-md border-slate-300 p-2 focus:outline-none" placeholder="KKTP" />
                      </div>
                   </div>
                </section>

                <section><h4 className="font-semibold text-blue-900 border-b pb-2 mb-4">Blok 5: Referensi Materi & Upload Cloud</h4>
                   <textarea name="bukuReferensi" rows={2} value={appData.bukuReferensi} onChange={handleChange} placeholder="Ringkasan atau Judul Bab Materi Pokok..." className="w-full text-sm border rounded-md border-slate-300 p-2 focus:outline-none mb-4" />
                   
                   <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
                      <label className="block text-sm font-bold text-blue-900 mb-2 flex items-center"><Cloud className="w-4 h-4 mr-2"/> Upload Materi PDF ke Cloud Storage (Opsional)</label>
                      <p className="text-xs text-blue-700 mb-4">File yang diupload akan dikirim ke <strong>Firebase Storage</strong> saat Anda menekan tombol Simpan Proyek di atas. AI akan membaca file ini langsung dari Cloud saat merumuskan Modul Ajar.</p>
                      
                      {appData.pdfName ? (
                         <div className="flex items-center justify-between bg-white border border-green-300 p-4 rounded-lg shadow-sm">
                            <div className="flex items-center space-x-3 overflow-hidden">
                               <div className="bg-green-100 p-2.5 rounded-full"><File className="w-5 h-5 text-green-700"/></div>
                               <div className="flex flex-col">
                                   <span className="text-sm font-bold text-slate-800 truncate">{appData.pdfName}</span>
                                   <span className="text-xs font-medium text-green-600">
                                       {appData.pdfStoragePath && !tempPdfFile ? '✓ Terhubung dengan Cloud Storage' : 'Menunggu disimpan ke Cloud...'}
                                   </span>
                               </div>
                            </div>
                            <button onClick={removePdf} className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-md transition-colors font-semibold text-xs border border-red-200">Hapus File</button>
                         </div>
                      ) : (
                         <div className="flex items-center justify-center w-full">
                            <label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full h-32 border-2 border-blue-300 border-dashed rounded-xl cursor-pointer bg-white hover:bg-blue-50 transition-colors">
                               <div className="flex flex-col items-center justify-center pt-5 pb-6 text-blue-500">
                                  <Upload className="w-8 h-8 mb-3" />
                                  <p className="text-sm font-bold text-center px-4">Klik untuk pilih PDF Materi</p>
                                  <p className="text-xs font-medium mt-1">Maks. 10MB</p>
                               </div>
                               <input id="dropzone-file" type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} />
                            </label>
                         </div>
                      )}
                   </div>
                </section>
              </div>
            </div>
          )}

          {activeTab === 'modul' && (
             <div className="w-full flex flex-col items-center print:hidden no-print pb-12">
               {!generatedDocs.modul ? (
                 <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-xl shadow-sm mb-6 p-8">
                   <h3 className="font-bold text-slate-800 text-2xl mb-2 text-center">Pengaturan Modul Ajar Presisi</h3>
                   <p className="text-slate-500 text-sm mb-8 text-center">Pilih target Tujuan Pembelajaran untuk di-generate menjadi Modul Ajar utuh.</p>
                   
                   {extractedTPs.length === 0 ? (
                      <div className="bg-yellow-50 border border-yellow-200 p-6 rounded-md text-sm text-yellow-800 flex flex-col items-center text-center">
                        <AlertCircle className="w-10 h-10 mb-3 text-yellow-600" />
                        <span className="font-bold text-lg mb-1">Data TP Belum Tersedia</span>
                        <span>Anda harus membuat dokumen ATP (Alur Tujuan Pembelajaran) terlebih dahulu di Tab 3.</span>
                      </div>
                   ) : (
                      <div className="space-y-6 max-w-2xl mx-auto">
                         <div>
                           <label className="block text-sm font-bold text-slate-700 mb-2">Pilih Tujuan Pembelajaran (TP):</label>
                           <select value={selectedTPIndex} onChange={(e) => setSelectedTPIndex(Number(e.target.value))} className="w-full border-2 border-slate-200 p-3.5 rounded-lg focus:outline-none focus:border-blue-500 text-sm font-medium bg-slate-50 shadow-sm">
                              {extractedTPs.map((tp, idx) => <option key={idx} value={idx}>[{tp.kode}] {tp.tujuan}</option>)}
                           </select>
                         </div>
                         <div>
                           <label className="block text-sm font-bold text-slate-700 mb-2">Pilih Model Pembelajaran:</label>
                           <select name="modelPembelajaran" value={appData.modelPembelajaran} onChange={handleChange} className="w-full border-2 border-slate-200 p-3.5 rounded-lg focus:outline-none focus:border-blue-500 text-sm font-medium bg-slate-50 shadow-sm">
                              <option value="Problem Based Learning (PBL)">Problem Based Learning (PBL)</option>
                              <option value="Project Based Learning (PjBL)">Project Based Learning (PjBL)</option>
                              <option value="Discovery Learning">Discovery Learning</option>
                              <option value="Inquiry Learning">Inquiry Learning</option>
                              <option value="Cooperative Learning">Cooperative Learning</option>
                              <option value="Direct Instruction (Pembelajaran Langsung)">Direct Instruction (Pembelajaran Langsung)</option>
                           </select>
                         </div>
                         
                         <div className="flex flex-col pt-4 border-t border-slate-100">
                           <button onClick={() => handleGenerateSingleTab('modul')} disabled={isGenerating || isCloudSyncing} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-bold flex items-center justify-center transition-colors shadow-lg shadow-blue-600/30 text-lg">
                             {isGenerating ? <Loader2 className="w-6 h-6 mr-2 animate-spin"/> : <Play className="w-6 h-6 mr-2"/>} Generate Otomatis via API
                           </button>
                           
                           <div className="flex items-center w-full my-6">
                             <div className="flex-1 border-t border-slate-200"></div>
                             <span className="px-4 text-xs font-bold text-slate-400 tracking-wider">ATAU CARA MANUAL</span>
                             <div className="flex-1 border-t border-slate-200"></div>
                           </div>
                           
                           <div className="flex space-x-4">
                             <button onClick={() => handleCopyPrompt('modul')} className="flex-1 bg-white border-2 border-slate-800 text-slate-800 hover:bg-slate-50 py-3 rounded-lg font-bold flex items-center justify-center transition-colors"><Copy className="w-5 h-5 mr-2"/> 1. Salin Prompt</button>
                             <button onClick={() => handlePasteResult('modul')} className="flex-1 bg-green-50 text-green-700 border-2 border-green-600 hover:bg-green-100 py-3 rounded-lg font-bold flex items-center justify-center transition-colors"><ClipboardPaste className="w-5 h-5 mr-2"/> 2. Paste HTML</button>
                           </div>
                         </div>
                      </div>
                   )}
                 </div>
               ) : (
                 <div className="w-full max-w-5xl flex flex-col items-center bg-slate-700 rounded-xl overflow-hidden shadow-2xl border border-slate-600">
                    <div className="w-full bg-green-600 text-white px-6 py-4 flex justify-between items-center"><span className="font-bold flex items-center"><CheckCircle2 className="w-5 h-5 mr-2" /> Modul Ajar Selesai</span></div>
                    <div className="w-full overflow-x-auto flex justify-center py-10 px-4">
                       <div className="document-preview bg-white shadow-xl p-10 text-black w-full" style={{ maxWidth: '210mm', minHeight: '297mm' }} dangerouslySetInnerHTML={{ __html: generatedDocs.modul }} />
                    </div>
                    <div className="w-full flex flex-wrap justify-center gap-4 p-6 bg-slate-800">
                      <button onClick={handleDownloadWord} className="flex items-center px-6 py-3 rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-md"><Download className="h-5 w-5 mr-2" />Word (.doc)</button>
                      <button onClick={handlePrintHTML} className="flex items-center px-6 py-3 rounded-md text-white bg-slate-600 hover:bg-slate-500 transition-colors shadow-md"><Printer className="h-5 w-5 mr-2" />Cetak / PDF</button>
                      <button onClick={() => setGeneratedDocs(prev => ({...prev, modul: ''}))} className="flex items-center px-6 py-3 rounded-md text-white bg-orange-600 hover:bg-orange-700 font-bold transition-colors shadow-lg"><ArrowLeft className="h-5 w-5 mr-2"/> Buat TP Lain</button>
                    </div>
                 </div>
               )}
             </div>
          )}

          {activeTab !== 'identitas' && activeTab !== 'modul' && (
             <div className="w-full flex flex-col items-center print:hidden no-print pb-12">
               {!generatedDocs[activeTab] ? (
                 <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-xl shadow-sm p-10 text-center mt-6">
                     <div className="mx-auto w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-6 shadow-inner text-blue-600 border border-blue-100">
                         {React.createElement(tabs.find(t => t.id === activeTab)?.icon || FileText, { className: "w-10 h-10" })}
                     </div>
                     <h3 className="font-bold text-slate-800 text-3xl mb-3">Mulai {tabs.find(t => t.id === activeTab)?.label}</h3>
                     <p className="text-slate-500 text-base mb-10 max-w-lg mx-auto">Sistem AI akan merumuskan dokumen berdasarkan data profil sekolah dan preferensi yang Anda setel di halaman Identitas.</p>
                     
                     <div className="max-w-md mx-auto space-y-6">
                         <button onClick={() => handleGenerateSingleTab(activeTab)} className="w-full py-4 px-10 rounded-xl shadow-lg shadow-blue-900/20 text-lg font-bold text-white bg-blue-600 hover:bg-blue-700 hover:-translate-y-1 transition-all flex items-center justify-center">
                            <Play className="w-6 h-6 mr-2"/> Generate via Cloud API
                         </button>
                         
                         <div className="flex items-center w-full my-4">
                             <div className="flex-1 border-t border-slate-200"></div><span className="px-4 text-xs font-bold text-slate-400 tracking-wider">ATAU MANUAL</span><div className="flex-1 border-t border-slate-200"></div>
                         </div>
                         
                         <div className="flex space-x-3">
                             <button onClick={() => handleCopyPrompt(activeTab)} className="flex-1 bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50 py-3 rounded-lg font-bold flex items-center justify-center transition-colors"><Copy className="w-5 h-5 mr-2"/> 1. Salin Prompt</button>
                             <button onClick={() => handlePasteResult(activeTab)} className="flex-1 bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50 py-3 rounded-lg font-bold flex items-center justify-center transition-colors"><ClipboardPaste className="w-5 h-5 mr-2"/> 2. Paste Hasil</button>
                         </div>
                     </div>
                 </div>
               ) : (
                 <div className="w-full max-w-5xl flex flex-col items-center bg-slate-700 rounded-xl overflow-hidden shadow-2xl border border-slate-600">
                    <div className="w-full bg-slate-800 text-white px-6 py-4 flex justify-between items-center border-b border-slate-600">
                       <span className="font-bold text-lg">Dokumen Siap</span>
                       <div className="flex space-x-3">
                          <button onClick={handleDownloadWord} className="bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded text-sm font-bold flex items-center shadow transition-colors"><Download className="w-4 h-4 mr-2"/> Word (.doc)</button>
                          <button onClick={handlePrintHTML} className="bg-slate-600 hover:bg-slate-500 px-5 py-2.5 rounded text-sm font-bold flex items-center shadow transition-colors"><Printer className="w-4 h-4 mr-2"/> Cetak</button>
                       </div>
                    </div>
                    <div className="w-full overflow-x-auto flex justify-center py-10 px-4">
                       <div className="document-preview bg-white shadow-xl p-10 text-black w-full" style={{ maxWidth: ['prosem1', 'prosem2', 'atp', 'kktp'].includes(activeTab) ? '297mm' : '210mm', minHeight: ['prosem1', 'prosem2', 'atp', 'kktp'].includes(activeTab) ? '210mm' : '297mm' }} dangerouslySetInnerHTML={{ __html: generatedDocs[activeTab] }} />
                    </div>
                 </div>
               )}
             </div>
          )}
        </div>
      </main>

      {/* Styles */}
      <style dangerouslySetInnerHTML={{__html: `
        .document-preview table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; border: 1pt solid black; } 
        .document-preview th, .document-preview td { border: 1pt solid black; padding: 0.5rem; text-align: left; vertical-align: top; font-size: 11pt; } 
        .document-preview th { background-color: #1a3a5c !important; color: white !important; font-weight: bold; } 
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        @keyframes fadeInDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in-down { animation: fadeInDown 0.3s ease-out; }
        @media print { 
          body { background: white; } 
          aside, header, button { display: none !important; } 
          .document-preview { box-shadow: none !important; margin: 0 !important; padding: 0 !important; }
        }
      `}} />
    </div>
  );
}
