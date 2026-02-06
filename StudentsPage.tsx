
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Student, Group, Plan, Transaction, TransactionType, PaymentStatus, PaymentMethod, Activity, User, UserRole, Occurrence } from './types';
import { Search, Plus, Phone, User as UserIcon, Edit, Camera, X, CheckSquare, Square, FileSpreadsheet, FileText, Filter, HeartPulse, ShieldCheck, MessageCircle, MapPin, Loader2, Printer, Wallet, QrCode, CheckCircle, Clock, Link as LinkIcon, History, XCircle, Download, Calculator, AlertTriangle, FileWarning, FolderCheck, Upload, RefreshCw, Copy, Send, Lock, PlusCircle, Calendar, CalendarCheck, Ban, Zap, Play, Pause, Ticket, Trophy, Medal, ChevronDown, Layers, Settings2, Banknote as CashIcon, Share2, MessageSquareWarning } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createPixPayment, createMPPreference } from './services/mercadoPago';
import { sendZApiMessage } from './zapiService';

interface StudentsPageProps {
  students: Student[];
  groups: Group[];
  plans: Plan[];
  transactions: Transaction[];
  activities: Activity[];
  occurrences: Occurrence[];
  onAddStudent: (s: Omit<Student, 'id'>) => void;
  onBatchAddStudents: (s: Omit<Student, 'id'>[]) => void;
  onUpdateStudent: (s: Student) => void;
  onUpdateTransaction: (t: Partial<Transaction>) => void;
  onAddTransaction: (t: Omit<Transaction, 'id'>) => void;
  onAddOccurrence: (studentId: string, description: string, date: string) => Promise<boolean>;
  onGenerateTuitions: () => Promise<void>;
  initialFilter?: string;
  currentUser?: User | null;
}

export const StudentsPage: React.FC<StudentsPageProps> = ({ students, groups, plans, transactions, activities, occurrences, onAddStudent, onBatchAddStudents, onUpdateStudent, onUpdateTransaction, onAddTransaction, onAddOccurrence, onGenerateTuitions, initialFilter, currentUser }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const ageFilter = '';
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [medicalFilter, setMedicalFilter] = useState('ALL');
  const [financeFilter, setFinanceFilter] = useState('ALL'); 
  const [docsFilter, setDocsFilter] = useState('ALL'); 
  const [planFilter, setPlanFilter] = useState('ALL');
  
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'DETAILS' | 'FINANCE' | 'ATTENDANCE' | 'OCCURRENCES'>('DETAILS');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [attendanceMonth, setAttendanceMonth] = useState<number>(new Date().getMonth());
  const [attendanceYear, setAttendanceYear] = useState<number>(new Date().getFullYear());
  
  const [showPixModal, setShowPixModal] = useState(false);
  const [pixLoading, setPixLoading] = useState(false);
  const [pixData, setPixData] = useState<{ qrCode: string; qrCodeBase64: string; id: number } | null>(null);
  const [pixTxIds, setPixTxIds] = useState<string[]>([]);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedFinanceIds, setSelectedFinanceIds] = useState<Set<string>>(new Set());

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  const [isLoadingCep, setIsLoadingCep] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoUploadRef = useRef<HTMLInputElement>(null);

  const [showChargeModal, setShowChargeModal] = useState(false);
  const [editingChargeId, setEditingChargeId] = useState<string | null>(null);
  const [manualCharge, setManualCharge] = useState({ description: '', amount: 0, date: new Date().toISOString().split('T')[0] });

  const [showOccurrenceModal, setShowOccurrenceModal] = useState(false);
  const [newOccurrence, setNewOccurrence] = useState({ description: '', date: new Date().toISOString().split('T')[0], studentId: '' });

  const isGuardian = currentUser?.role === UserRole.RESPONSAVEL;

  const positionsList = ['Goleiro', 'Lateral Direito', 'Zagueiro', 'Lateral Esquerdo', 'Volante', 'Meia', 'Atacante'];

  const todayStr = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString('en-CA'); 
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
        if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
            setIsCategoryDropdownOpen(false);
        }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => { document.removeEventListener("mousedown", handleClickOutside); };
  }, [categoryDropdownRef]);

  useEffect(() => {
    if (initialFilter === 'DEFAULTING') setFinanceFilter('DEFAULTING');
    else if (initialFilter === 'MISSING_DOCS') setDocsFilter('MISSING_DOCS');
  }, [initialFilter]);

  const confirmPixPaymentSuccess = () => {
    setShowPixModal(false);
    setPixData(null);
    setPixTxIds([]);
  };

  useEffect(() => {
      if (showPixModal && pixTxIds.length > 0) {
          const allPaid = pixTxIds.every(id => {
              const tx = transactions.find(t => t.id === id);
              return tx?.status === PaymentStatus.PAID;
          });
          if (allPaid) {
              confirmPixPaymentSuccess();
          }
      }
  }, [transactions, showPixModal, pixTxIds]);

  const calculateAge = (birthDateString: string) => {
    if (!birthDateString) return 0;
    const today = new Date(); const birthDate = new Date(birthDateString);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const parts = dateString.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateString;
  };

  const isMedicalExpired = (dateString: string) => {
    if (!dateString) return true;
    return new Date(dateString) < new Date();
  };

  const hasMissingDocs = (student: Student) => {
      if (!student.documents) return true;
      const d = student.documents as any;
      const check = (doc: any) => (typeof doc === 'boolean' ? doc : doc?.delivered);
      return !check(d.rg) || !check(d.cpf) || !check(d.medical) || !check(d.address) || !check(d.school);
  };

  const getStudentOverdueCount = (studentId: string) => {
    return transactions.filter(t => t.studentId === studentId && t.type === TransactionType.INCOME && t.status !== PaymentStatus.PAID && t.status !== PaymentStatus.CANCELLED && t.date < todayStr).length;
  };

  const handleGenerateContract = (student: Student) => {
    const doc = new jsPDF();
    const plan = plans.find(p => p.id === student.planId);
    const today = new Date().toLocaleDateString('pt-BR');
    
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("CONTRATO DE PRESTAÇÃO DE SERVIÇOS ESPORTIVOS", 105, 20, { align: 'center' });
    doc.setFontSize(12);
    doc.text("Garotos do Martinica", 105, 28, { align: 'center' });
    doc.setFontSize(10);
    doc.text("DADOS DA UNIDADE:", 14, 40);
    doc.setFont("helvetica", "normal");
    doc.text("Escola: Garotos do Martinica", 14, 45);
    doc.text("Endereço: Unidade Martinica - São Paulo/SP", 14, 50);
    doc.setFont("helvetica", "bold");
    doc.text("DADOS DO RESPONSÁVEL (CONTRATANTE):", 14, 60);
    doc.setFont("helvetica", "normal");
    doc.text(`Nome: ${student.guardian.name}`, 14, 65);
    doc.text(`CPF: ${student.guardian.cpf || '-'}`, 14, 70);
    doc.text(`Telefone: ${student.guardian.phone}`, 100, 70);
    doc.text(`Email: ${student.guardian.email || '-'}`, 14, 75);
    doc.setFont("helvetica", "bold");
    doc.text("DADOS DO ALUNO (ATLETA):", 14, 85);
    doc.setFont("helvetica", "normal");
    doc.text(`Nome: ${student.name}`, 14, 90);
    doc.text(`Data de Nascimento: ${formatDate(student.birthDate)} (Idade: ${calculateAge(student.birthDate)} anos)`, 14, 95);
    doc.text(`RG: ${student.rg || '-'}`, 14, 100);
    doc.text(`CPF: ${student.cpf || '-'}`, 100, 100);
    doc.setFont("helvetica", "bold");
    doc.text("DADOS DO PLANO CONTRATADO:", 14, 110);
    doc.setFont("helvetica", "normal");
    doc.text(`Plano: ${plan?.name || 'Não definido'}`, 14, 115);
    doc.text(`Valor da Mensalidade: R$ ${plan?.price.toFixed(2) || '0,00'}`, 14, 120);
    doc.text(`Dia do Vencimento: Todo dia ${plan?.dueDay || '10'}`, 100, 120);
    doc.setFont("helvetica", "bold");
    doc.text("TERMOS E CONDIÇÕES:", 14, 130);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    
    const introText = `Eu, CONTRATANTE, abaixo qualificado, na qualidade de RESPONSÁVEL pelo (ALUNO) acima citado, venho solicitar e formalizar a inscrição, neste TERMO DE CONTRATAÇÃO, na UNIDADE, do ALUNO acima qualificado, declarando e assumindo, nesta oportunidade:`;
    
    const clauses = [
      "1 - Eximir a escola de eventuais acidentes, tais como, lesões, machucados, torções etc., decorrente da prática do futebol.",
      "2 - Apresentar o ATESTADO MÉDICO em tempo hábil (30 dias).",
      "3 - O Aluno não treinara sem que esteja DEVIDAMENTE UNIFORMIZADO.",
      "4 - Os eventuais problemas de ordem DISCIPLINAR serão resolvidos pela direção.",
      "5 - Autorizo a utilização da imagem do referido aluno.",
      "6 - Caso o atleta acumule duas ou mais mensalidades em atraso, o mesmo terá o acesso suspenso."
    ];

    let currentY = 135;
    const splitIntro = doc.splitTextToSize(introText, 180);
    doc.text(splitIntro, 14, currentY);
    currentY += (splitIntro.length * 5) + 2;

    clauses.forEach(clause => {
      const splitClause = doc.splitTextToSize(clause, 180);
      doc.text(splitClause, 14, currentY);
      currentY += (splitClause.length * 5) + 1.5;
    });

    currentY += 5;
    doc.setFont("helvetica", "bold");
    doc.text("SEU FILHO POSSUI ALGUM RESTRIÇÃO DE SAUDE: SIM (  ) NÃO (  )", 14, currentY);
    currentY += 20;
    doc.text(`São Paulo, ${today}.`, 14, currentY);
    currentY += 20;
    doc.text("___________________________________________________", 14, currentY);
    doc.text("Assinatura do Responsável", 14, currentY + 5);

    doc.save(`Contrato_Martinica_${student.name.replace(/\s+/g, '_')}.pdf`);
  };

  const handleManualTuitionGen = async () => {
      if (confirm("Gerar mensalidades deste mês?")) {
          setIsGenerating(true);
          try { await onGenerateTuitions(); alert("Concluído!"); } catch (e) { alert("Erro"); } finally { setIsGenerating(false); }
      }
  };

  const handleBatchSendCharges = async () => {
      const debtors = students.filter(s => s.active && getStudentOverdueCount(s.id) > 0);
      if (debtors.length === 0) return alert("Ninguém em atraso.");
      if (!confirm(`Enviar cobrança para ${debtors.length} pais?`)) return;
      setIsGenerating(true);
      for (let i = 0; i < debtors.length; i++) {
          const student = debtors[i];
          const overdueTxs = transactions.filter(t => t.studentId === student.id && t.status === PaymentStatus.PENDING && t.date < todayStr);
          const totalDebt = overdueTxs.reduce((acc, t) => acc + t.amount, 0);
          const phone = student.guardian.phone.replace(/\D/g, '');
          if (phone) {
              const msg = `Olá *${student.guardian.name}*! ⚽ Cobrança Martinica: Pendência Total R$ ${totalDebt.toFixed(2)}. Pague via PIX 11987019721.`;
              await sendZApiMessage(phone, msg);
          }
          if (i < debtors.length - 1) await new Promise(resolve => setTimeout(resolve, 10000));
      }
      setIsGenerating(false);
      alert(`Enviado!`);
  };

  const handleExportExcel = () => {
    const currentYear = new Date().getFullYear();
    const data = filteredStudents.map(s => {
        const birthYear = s.birthDate ? parseInt(s.birthDate.split('-')[0]) : currentYear;
        const category = `Sub-${currentYear - birthYear}`;
        const checkDoc = (doc: any) => (doc?.delivered ? 'Entregue' : 'Pendente');
        return {
            'Nome do Atleta': s.name,
            'Categoria': category,
            'Data de Nascimento': formatDate(s.birthDate),
            'Idade': calculateAge(s.birthDate),
            'RG Atleta': s.rg || '',
            'CPF Atleta': s.cpf || '',
            'Telefone Atleta': s.phone || '',
            'Posições': (s.positions || []).join(', '),
            'Vencimento Atestado': formatDate(s.medicalCertificateExpiry),
            'Nome do Responsável': s.guardian.name,
            'CPF Responsável': s.guardian.cpf || '',
            'WhatsApp Responsável': s.guardian.phone || '',
            'Email Responsável': s.guardian.email || '',
            'CEP': s.address?.cep || '',
            'Rua': s.address?.street || '',
            'Número': s.address?.number || '',
            'Complemento': s.address?.complement || '',
            'Bairro': s.address?.district || '',
            'Cidade': s.address?.city || '',
            'Estado': s.address?.state || '',
            'Plano Atual': plans.find(p => p.id === s.planId)?.name || 'Sem Plano',
            'Status de Cadastro': s.active ? 'Ativo' : 'Inativo',
            'Mensalidades em Atraso': getStudentOverdueCount(s.id),
            'Doc: RG': checkDoc(s.documents?.rg),
            'Doc: CPF': checkDoc(s.documents?.cpf),
            'Doc: Atestado Médico': checkDoc(s.documents?.medical),
            'Doc: Comprovante Endereço': checkDoc(s.documents?.address),
            'Doc: Comprovante Escolar': checkDoc(s.documents?.school)
        };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Alunos");
    XLSX.writeFile(wb, `Alunos_Martinica_Completo_${todayStr}.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Relatório Geral de Atletas - Garotos do Martinica", 14, 20);
    const currentYear = new Date().getFullYear();
    const tableBody = filteredStudents.map(s => {
        const birthYear = s.birthDate ? parseInt(s.birthDate.split('-')[0]) : currentYear;
        const category = `Sub-${currentYear - birthYear}`;
        const overdue = getStudentOverdueCount(s.id);
        const plan = plans.find(p => p.id === s.planId);
        return [s.name, category, calculateAge(s.birthDate), (s.positions || []).join(', '), s.rg || s.cpf || '-', s.guardian.name, s.guardian.phone, plan?.name || '-', s.active ? 'Ativo' : 'Inat.', overdue > 0 ? `Sim (${overdue})` : 'Não'];
    });
    autoTable(doc, {
        startY: 35,
        head: [['Nome do Atleta', 'Cat.', 'Idade', 'Posições', 'RG/CPF', 'Responsável', 'WhatsApp', 'Plano', 'Status', 'Em Atraso']],
        body: tableBody,
        headStyles: { fillColor: [249, 115, 22] },
        styles: { fontSize: 7, cellPadding: 2 }
    });
    doc.save(`Relatorio_Atletas_Martinica_${todayStr}.pdf`);
  };

  const handlePayTransaction = (id: string, method: PaymentMethod) => {
      onUpdateTransaction({ id, status: PaymentStatus.PAID, paymentMethod: method, paymentDate: new Date().toISOString().split('T')[0] });
  };

  const initialFormState: any = {
    name: '', birthDate: '', rg: '', cpf: '', phone: '', medicalCertificateExpiry: '', groupIds: [], planId: '', active: true, positions: [],
    address: { cep: '', street: '', number: '', complement: '', district: '', city: '', state: '' },
    guardian: { name: '', phone: '', email: '', cpf: '' },
    documents: { rg: { delivered: false, isDigital: false }, cpf: { delivered: false, isDigital: false }, medical: { delivered: false, isDigital: false }, address: { delivered: false, isDigital: false }, school: { delivered: false, isDigital: false } }
  };

  const [studentForm, setStudentForm] = useState(initialFormState);

  const availableCategories = useMemo(() => {
    const cats = new Set<string>(); const currentYear = new Date().getFullYear();
    students.forEach(s => { const birthYear = s.birthDate ? parseInt(s.birthDate.split('-')[0]) : currentYear; cats.add(`Sub-${currentYear - birthYear}`); });
    return Array.from(cats).sort();
  }, [students]);

  const toggleCategory = (cat: string) => { setSelectedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]); };

  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const ms = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.guardian.name.toLowerCase().includes(searchTerm.toLowerCase());
      let mc = selectedCategories.length === 0; if (selectedCategories.length > 0) { const birthYear = s.birthDate ? parseInt(s.birthDate.split('-')[0]) : new Date().getFullYear(); mc = selectedCategories.includes(`Sub-${ new Date().getFullYear() - birthYear}`); }
      let mstat = statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? s.active : !s.active);
      let mmed = medicalFilter === 'ALL' || (medicalFilter === 'VALID' ? !isMedicalExpired(s.medicalCertificateExpiry) : isMedicalExpired(s.medicalCertificateExpiry));
      let mfin = financeFilter === 'ALL' || (financeFilter === 'DEFAULTING' ? getStudentOverdueCount(s.id) > 0 : getStudentOverdueCount(s.id) === 0);
      let mdoc = docsFilter === 'ALL' || (docsFilter === 'MISSING_DOCS' ? hasMissingDocs(s) : !hasMissingDocs(s));
      let mplan = planFilter === 'ALL' || s.planId === planFilter;
      return ms && mc && mstat && mmed && mfin && mdoc && mplan;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [students, searchTerm, selectedCategories, statusFilter, medicalFilter, financeFilter, docsFilter, planFilter]);

  const startCamera = async () => {
    setIsCameraOpen(true);
    try { const stream = await navigator.mediaDevices.getUserMedia({ video: true }); if (videoRef.current) videoRef.current.srcObject = stream; } 
    catch (e) { setIsCameraOpen(false); }
  };

  const stopCamera = () => { 
    if (videoRef.current?.srcObject) { (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop()); videoRef.current.srcObject = null; }
    setIsCameraOpen(false); 
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) { ctx.drawImage(videoRef.current, 0, 0, 300, 300); setCapturedImage(canvasRef.current.toDataURL('image/jpeg')); stopCamera(); }
    }
  };

  const handleOpenNew = () => { setEditingId(null); setStudentForm(initialFormState); setCapturedImage(null); setActiveTab('DETAILS'); setIsModalOpen(true); };

  const handleOpenEdit = (student: Student) => {
      setEditingId(student.id);
      const normalizeDocs = (docs: any): any => {
          if (!docs) return initialFormState.documents;
          const newDocs: any = {};
          ['rg', 'cpf', 'medical', 'address', 'school'].forEach(k => {
              const v = docs[k];
              newDocs[k] = typeof v === 'boolean' ? { delivered: v, isDigital: false } : v || { delivered: false, isDigital: false };
          });
          return newDocs;
      };
      setStudentForm({ ...student, groupIds: Array.isArray(student.groupIds) ? student.groupIds : [], positions: Array.isArray(student.positions) ? student.positions : [], documents: normalizeDocs(student.documents) });
      setCapturedImage(student.photoUrl || null); setActiveTab('DETAILS'); setIsModalOpen(true);
  };

  const handleOpenHistory = (student: Student) => { handleOpenEdit(student); setActiveTab('FINANCE'); };
  const handleOpenAttendance = (student: Student) => { handleOpenEdit(student); setActiveTab('ATTENDANCE'); };

  const handleOpenAddOccurrence = (e: React.MouseEvent, student: Student) => {
    e.stopPropagation();
    setNewOccurrence({ description: '', date: new Date().toISOString().split('T')[0], studentId: student.id });
    setShowOccurrenceModal(true);
  };

  const handleSaveOccurrence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newOccurrence.description && newOccurrence.studentId) {
        if (await onAddOccurrence(newOccurrence.studentId, newOccurrence.description, newOccurrence.date)) setShowOccurrenceModal(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault(); if(isGuardian) return; 
    const data = { ...studentForm, photoUrl: capturedImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(studentForm.name)}&background=random` };
    if (editingId) onUpdateStudent({ ...data, id: editingId } as Student);
    else onAddStudent(data);
    setIsModalOpen(false);
  };

  const toggleFinanceSelection = (id: string) => {
      const next = new Set(selectedFinanceIds); if (next.has(id)) next.delete(id); else next.add(id); setSelectedFinanceIds(next);
  };

  const initiatePixPayment = async (txId?: string) => {
      let amount = 0; let desc = ''; const ids: string[] = [];
      if (txId) { const tx = transactions.find(t => t.id === txId); if (!tx) return; amount = tx.amount; desc = tx.description; ids.push(txId); } 
      else if (selectedFinanceIds.size > 0) { const sel = transactions.filter(t => selectedFinanceIds.has(t.id)); amount = sel.reduce((a, t) => a + t.amount, 0); desc = `Combo`; sel.forEach(t => ids.push(t.id)); } 
      else return;
      if (!studentForm.guardian.cpf) return alert("CPF necessário.");
      setPixLoading(true); setShowPixModal(true);
      try {
          const res = await createPixPayment({ title: desc, price: amount, externalReference: crypto.randomUUID(), payer: { name: studentForm.guardian.name, email: studentForm.guardian.email || 'fin@martinica.com', phone: studentForm.guardian.phone, identification: { type: 'CPF', number: studentForm.guardian.cpf } } });
          if (res) { setPixData(res); setPixTxIds(ids); } else setShowPixModal(false);
      } catch (e) { setShowPixModal(false); } finally { setPixLoading(false); }
  };
  
  const studentTransactions = transactions.filter(t => t.studentId === editingId).sort((a, b) => b.date.localeCompare(a.date));
  const studentActivities = activities.filter(a => editingId && (a.groupId && (studentForm.groupIds || []).includes(a.groupId) || a.participants?.includes(editingId))).sort((a, b) => b.date.localeCompare(a.date));
  const studentOccurrences = occurrences.filter(o => o.studentId === editingId).sort((a, b) => b.date.localeCompare(a.date));

  const updateDoc = (field: string, sub: 'delivered' | 'isDigital', val: boolean) => {
      setStudentForm((prev: any) => ({ ...prev, documents: { ...prev.documents, [field]: { ...prev.documents[field], [sub]: val } } }));
  };

  const toggleGroupSelection = (gid: string) => {
      setStudentForm((prev: any) => ({ ...prev, groupIds: prev.groupIds.includes(gid) ? prev.groupIds.filter((id: any) => id !== gid) : [...prev.groupIds, gid] }));
  };

  const togglePositionSelection = (pos: string) => {
      setStudentForm((prev: any) => ({ ...prev, positions: prev.positions.includes(pos) ? prev.positions.filter((p: any) => p !== pos) : [...prev.positions, pos] }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-xl md:text-2xl font-bold text-gray-800">{isGuardian ? 'Meus Filhos' : 'Alunos e Responsáveis'}</h2>
        {!isGuardian && (
            <div className="flex flex-wrap gap-2 w-full md:w-auto">
                <button onClick={handleManualTuitionGen} className="p-2 bg-gray-700 text-white rounded-lg text-xs"><Settings2 className="w-4 h-4" /></button>
                <button onClick={handleBatchSendCharges} className="p-2 bg-purple-600 text-white rounded-lg text-xs"><Zap className="w-4 h-4" /></button>
                <button onClick={handleExportExcel} className="p-2 bg-green-600 text-white rounded-lg text-xs"><Download className="w-4 h-4" /></button>
                <button onClick={handleExportPDF} className="p-2 bg-red-600 text-white rounded-lg text-xs"><FileText className="w-4 h-4" /></button>
                <button onClick={handleOpenNew} className="flex-1 md:flex-none px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-bold flex items-center gap-2"><Plus className="w-4 h-4" /> Novo Aluno</button>
            </div>
        )}
      </div>

      {!isGuardian && (
        <div className="bg-white p-4 rounded-xl border grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="relative md:col-span-2"><Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" /><input type="text" placeholder="Buscar..." className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
            <select className="border rounded-lg p-2 text-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="ALL">Status: Todos</option><option value="ACTIVE">Ativos</option><option value="INACTIVE">Inativos</option></select>
            <select className="border rounded-lg p-2 text-sm" value={financeFilter} onChange={e => setFinanceFilter(e.target.value)}><option value="ALL">Financ.: Todos</option><option value="DEFAULTING">Inadimplentes</option></select>
            <select className="border rounded-lg p-2 text-sm" value={docsFilter} onChange={e => setDocsFilter(e.target.value)}><option value="ALL">Docs: Todos</option><option value="MISSING_DOCS">Pendentes</option></select>
            <select className="border rounded-lg p-2 text-sm" value={planFilter} onChange={e => setPlanFilter(e.target.value)}><option value="ALL">Plano: Todos</option>{plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredStudents.map(student => {
              const overdueCount = getStudentOverdueCount(student.id);
              return (
                  <div key={student.id} className={`bg-white p-5 rounded-2xl border shadow-sm transition-all hover:shadow-md ${overdueCount > 0 ? 'border-red-200 bg-red-50/10' : 'border-gray-100'}`}>
                      <div className="flex gap-4 mb-4">
                          <img src={student.photoUrl} className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-sm bg-gray-100" />
                          <div className="flex-1 min-w-0">
                              <h4 className="font-bold text-gray-900 truncate text-lg leading-tight">{student.name}</h4>
                              <p className="text-sm text-gray-500 font-medium">Idade: {calculateAge(student.birthDate)} anos</p>
                              <span className={`inline-block mt-2 px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${student.active ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'}`}>{student.active ? 'Ativo' : 'Inativo'}</span>
                          </div>
                      </div>
                      <div className="space-y-2 mb-6">
                          <div className="flex items-center gap-2 text-xs text-gray-600"><UserIcon className="w-3.5 h-3.5" /><span className="font-bold">{student.guardian.name}</span></div>
                          <div className="flex items-center gap-2 text-xs text-gray-600"><Phone className="w-3.5 h-3.5" />{student.guardian.phone}</div>
                      </div>
                      <div className="flex gap-2 pt-4 border-t border-gray-50">
                          <button onClick={() => handleOpenHistory(student)} className={`flex-1 p-2 rounded-lg text-xs font-bold border transition-colors ${overdueCount > 0 ? 'bg-red-500 text-white border-red-600 animate-pulse' : 'bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100'}`}>Financeiro</button>
                          <button onClick={() => handleOpenAttendance(student)} className="flex-1 p-2 bg-purple-50 text-purple-700 border border-purple-100 rounded-lg text-xs font-bold hover:bg-purple-100">Frequência</button>
                          <button onClick={() => handleOpenEdit(student)} className="p-2 bg-gray-50 text-gray-600 border border-gray-100 rounded-lg"><Edit className="w-4 h-4" /></button>
                      </div>
                  </div>
              );
          })}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in duration-200">
            <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{editingId ? 'Ficha do Aluno' : 'Novo Aluno'}</h3>
                {editingId && (
                  <div className="flex gap-6 mt-4">
                    {['DETAILS', 'FINANCE', 'ATTENDANCE', 'OCCURRENCES'].map((t: any) => (
                      <button key={t} onClick={() => setActiveTab(t)} className={`pb-2 text-sm font-bold transition-all border-b-2 ${activeTab === t ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>{t === 'DETAILS' ? 'Dados' : t === 'FINANCE' ? 'Financeiro' : t === 'ATTENDANCE' ? 'Frequência' : 'Ocorrências'}</button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => { setIsModalOpen(false); stopCamera(); }} className="p-2 hover:bg-gray-200 rounded-full transition-colors">✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8">
              {activeTab === 'DETAILS' ? (
                <form id="student-form" onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="space-y-6 text-center">
                    <div className="w-48 h-48 mx-auto relative group">
                      {isCameraOpen ? (
                        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover rounded-3xl bg-black" />
                      ) : (
                        <img src={capturedImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(studentForm.name || 'A')}&background=random`} className="w-full h-full object-cover rounded-3xl border-4 border-white shadow-xl" />
                      )}
                      {!isGuardian && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 rounded-3xl transition-opacity">
                          {isCameraOpen ? <button type="button" onClick={capturePhoto} className="p-4 bg-white rounded-full text-black"><Camera /></button> : <button type="button" onClick={startCamera} className="p-4 bg-white rounded-full text-black"><Camera /></button>}
                        </div>
                      )}
                    </div>
                    {!isGuardian && <button type="button" onClick={() => photoUploadRef.current?.click()} className="text-xs font-bold text-primary-600 uppercase tracking-widest hover:underline">Alterar Foto</button>}
                    <input type="file" ref={photoUploadRef} className="hidden" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if(f){ const r = new FileReader(); r.onload = (x) => setCapturedImage(x.target?.result as string); r.readAsDataURL(f); } }} />
                    <div className="pt-6 border-t text-left space-y-4">
                      <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Acesso e Plano</h4>
                      <select className="w-full p-3 border rounded-xl text-sm font-bold bg-gray-50" value={studentForm.planId} onChange={e => setStudentForm({...studentForm, planId: e.target.value})} disabled={isGuardian} required><option value="">Selecione o Plano...</option>{plans.map(p => <option key={p.id} value={p.id}>{p.name} - R$ {p.price.toFixed(2)}</option>)}</select>
                      <div className="space-y-1">{groups.map(g => <label key={g.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded-lg cursor-pointer"><input type="checkbox" checked={studentForm.groupIds.includes(g.id)} onChange={() => toggleGroupSelection(g.id)} className="rounded text-primary-600" disabled={isGuardian} /><span className="text-sm font-medium">{g.name}</span></label>)}</div>
                    </div>
                  </div>
                  <div className="lg:col-span-2 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><UserIcon className="w-4 h-4" /> Atleta</h4>
                        <input className="w-full p-3 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500" placeholder="Nome Completo" required value={studentForm.name} onChange={e => setStudentForm({...studentForm, name: e.target.value})} disabled={isGuardian} />
                        <div className="grid grid-cols-2 gap-4"><input type="date" className="w-full p-3 border rounded-xl text-sm" value={studentForm.birthDate} onChange={e => setStudentForm({...studentForm, birthDate: e.target.value})} disabled={isGuardian} /><input type="text" className="w-full p-3 border rounded-xl text-sm" placeholder="Telefone" value={studentForm.phone} onChange={e => setStudentForm({...studentForm, phone: e.target.value})} disabled={isGuardian} /></div>
                        <div className="grid grid-cols-2 gap-4"><input className="w-full p-3 border rounded-xl text-sm" placeholder="RG" value={studentForm.rg} onChange={e => setStudentForm({...studentForm, rg: e.target.value})} disabled={isGuardian} /><input className="w-full p-3 border rounded-xl text-sm" placeholder="CPF" value={studentForm.cpf} onChange={e => setStudentForm({...studentForm, cpf: e.target.value})} disabled={isGuardian} /></div>
                        <div className="pt-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block">Posições</label>
                            <div className="flex flex-wrap gap-2">{positionsList.map(pos => <button key={pos} type="button" onClick={() => !isGuardian && togglePositionSelection(pos)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${studentForm.positions.includes(pos) ? 'bg-primary-600 text-white border-primary-700 shadow-md' : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'}`}>{pos}</button>)}</div>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Responsável</h4>
                        <input className="w-full p-3 border rounded-xl text-sm" placeholder="Nome" required value={studentForm.guardian.name} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, name: e.target.value}})} disabled={isGuardian} />
                        <input className="w-full p-3 border rounded-xl text-sm" placeholder="WhatsApp" required value={studentForm.guardian.phone} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, phone: e.target.value}})} disabled={isGuardian} />
                        <input className="w-full p-3 border rounded-xl text-sm" placeholder="CPF" required value={studentForm.guardian.cpf} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, cpf: e.target.value}})} disabled={isGuardian} />
                        <input className="w-full p-3 border rounded-xl text-sm" placeholder="E-mail" value={studentForm.guardian.email} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, email: e.target.value}})} disabled={isGuardian} />
                      </div>
                    </div>
                  </div>
                </form>
              ) : activeTab === 'FINANCE' ? (
                <div className="space-y-4">
                  {studentTransactions.map(tx => (
                    <div key={tx.id} className="p-4 border rounded-2xl flex justify-between items-center bg-gray-50">
                      <div>
                        <p className="font-bold text-gray-900">{tx.description}</p>
                        <p className="text-xs text-gray-500">Venc: {formatDate(tx.date)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-gray-900">R$ {tx.amount.toFixed(2)}</p>
                        {tx.status === PaymentStatus.PENDING && !isGuardian && <button onClick={() => handlePayTransaction(tx.id, PaymentMethod.CASH)} className="text-[10px] font-black text-green-600 uppercase mt-1">Dar Baixa</button>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            
            <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
              <button onClick={() => { setIsModalOpen(false); stopCamera(); }} className="px-6 py-2.5 font-bold text-gray-500 hover:bg-gray-200 rounded-xl transition-colors">Fechar</button>
              {!isGuardian && activeTab === 'DETAILS' && <button type="submit" form="student-form" className="px-10 py-2.5 bg-primary-600 text-white rounded-xl font-black shadow-lg hover:bg-primary-700 transition-all">SALVAR FICHA</button>}
            </div>
          </div>
        </div>
      )}

      {showPixModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center">
            <h3 className="text-xl font-black mb-6 uppercase">Pagamento PIX</h3>
            {pixLoading ? <Loader2 className="animate-spin mx-auto w-12 h-12" /> : pixData && <img src={`data:image/jpeg;base64,${pixData.qrCodeBase64}`} className="mx-auto w-64 h-64 rounded-xl border p-2" />}
            <button onClick={() => setShowPixModal(false)} className="mt-8 text-sm font-bold text-gray-400">FECHAR</button>
          </div>
        </div>
      )}
    </div>
  );
};
