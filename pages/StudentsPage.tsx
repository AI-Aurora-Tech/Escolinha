
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Student, Group, Plan, Transaction, TransactionType, PaymentStatus, PaymentMethod, Activity, User, UserRole } from '../types';
import { Search, Plus, Phone, User as UserIcon, Edit, Camera, X, CheckSquare, Square, FileSpreadsheet, FileText, Filter, HeartPulse, ShieldCheck, MessageCircle, MapPin, Loader2, Printer, Wallet, QrCode, CheckCircle, Clock, Link as LinkIcon, History, CalendarCheck, XCircle, Download, Calculator, AlertTriangle, FileWarning, FolderCheck, Upload, RefreshCw, Copy, Send, Lock, PlusCircle, Calendar, Ban, Zap, Play, Pause, Ticket, Trophy, Medal, ChevronDown, Layers } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { checkMPPaymentStatus, createPixPayment, getPaymentStatus, createMPPreference } from '../services/mercadoPago';
import { sendZApiMessage } from '../services/zapiService';

interface StudentsPageProps {
  students: Student[];
  groups: Group[];
  plans: Plan[];
  transactions: Transaction[];
  activities: Activity[];
  onAddStudent: (s: Omit<Student, 'id'>) => void;
  onBatchAddStudents: (s: Omit<Student, 'id'>[]) => void;
  onUpdateStudent: (s: Student) => void;
  onUpdateTransaction: (t: Transaction) => void;
  onAddTransaction: (t: Omit<Transaction, 'id'>) => void;
  initialFilter?: string;
  currentUser?: User | null;
}

export const StudentsPage: React.FC<StudentsPageProps> = ({ students, groups, plans, transactions, activities, onAddStudent, onBatchAddStudents, onUpdateStudent, onUpdateTransaction, onAddTransaction, initialFilter, currentUser }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [ageFilter, setAgeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [medicalFilter, setMedicalFilter] = useState('ALL');
  const [financeFilter, setFinanceFilter] = useState('ALL'); 
  const [docsFilter, setDocsFilter] = useState('ALL'); 
  const [planFilter, setPlanFilter] = useState('ALL');
  
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'DETAILS' | 'FINANCE' | 'ATTENDANCE'>('DETAILS');
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [showPixModal, setShowPixModal] = useState(false);
  const [pixLoading, setPixLoading] = useState(false);
  const [pixData, setPixData] = useState<{ qrCode: string; qrCodeBase64: string; id: number } | null>(null);
  
  const [sendingPixId, setSendingPixId] = useState<string | null>(null);
  const [monitoredPayments, setMonitoredPayments] = useState<{ mpId: number, txIds: string[] }[]>([]);
  const [selectedFinanceIds, setSelectedFinanceIds] = useState<Set<string>>(new Set());
  const [attendanceMonth, setAttendanceMonth] = useState(new Date().toISOString().slice(0, 7)); 

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  const [isLoadingCep, setIsLoadingCep] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [checkingStatusId, setCheckingStatusId] = useState<string | null>(null);

  const [showChargeModal, setShowChargeModal] = useState(false);
  const [manualCharge, setManualCharge] = useState({ description: '', amount: 0, date: new Date().toISOString().split('T')[0] });

  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkQueue, setBulkQueue] = useState<Transaction[]>([]);
  const [bulkCurrentIndex, setBulkCurrentIndex] = useState(0);
  const [bulkIsRunning, setBulkIsRunning] = useState(false);
  const [bulkCountdown, setBulkCountdown] = useState(10);
  const [bulkLogs, setBulkLogs] = useState<string[]>([]);
  const bulkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isGuardian = currentUser?.role === UserRole.RESPONSAVEL;

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

  useEffect(() => {
    if (monitoredPayments.length === 0) return;
    const interval = setInterval(async () => {
        const remainingMonitored: typeof monitoredPayments = [];
        let somethingChanged = false;
        for (const payment of monitoredPayments) {
            try {
                const status = await getPaymentStatus(payment.mpId);
                if (status === 'approved') {
                    somethingChanged = true;
                    payment.txIds.forEach(id => { handlePayTransaction(id, PaymentMethod.PIX_MERCADO_PAGO); });
                    if (pixData && pixData.id === payment.mpId) confirmPixPaymentSuccess();
                } else if (status === 'rejected' || status === 'cancelled') {
                    somethingChanged = true;
                } else {
                    remainingMonitored.push(payment);
                }
            } catch (e) { remainingMonitored.push(payment); }
        }
        if (somethingChanged) setMonitoredPayments(remainingMonitored);
    }, 3000); 
    return () => clearInterval(interval);
  }, [monitoredPayments, pixData, transactions, onUpdateTransaction]); 

  const handleStartBulkSend = () => {
      const activeStudents = students.filter(s => s.active);
      const queue: Transaction[] = [];
      activeStudents.forEach(student => {
          const studentPendingTxs = transactions
            .filter(t => t.studentId === student.id && t.type === TransactionType.INCOME && (t.status === PaymentStatus.PENDING || t.status === PaymentStatus.LATE))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); 
          if (studentPendingTxs.length > 0) queue.push(studentPendingTxs[0]);
      });
      if (queue.length === 0) { alert("Não há mensalidades pendentes para enviar."); return; }
      if (confirm(`Encontradas ${queue.length} cobranças pendentes. Deseja iniciar o envio automático via Z-API?`)) {
          setBulkQueue(queue); setBulkCurrentIndex(0); setBulkIsRunning(true); setIsBulkModalOpen(true); setBulkLogs([`Iniciando fila com ${queue.length} cobranças...`]); setBulkCountdown(1); 
      }
  };

  useEffect(() => {
      if (!isBulkModalOpen || !bulkIsRunning) { if (bulkTimerRef.current) clearTimeout(bulkTimerRef.current); return; }
      if (bulkCurrentIndex >= bulkQueue.length) { setBulkIsRunning(false); setBulkLogs(prev => [...prev, "✅ Processo finalizado!"]); return; }
      if (bulkCountdown > 0) { bulkTimerRef.current = setTimeout(() => { setBulkCountdown(prev => prev - 1); }, 1000); } 
      else processBulkItem(bulkQueue[bulkCurrentIndex]);
      return () => { if (bulkTimerRef.current) clearTimeout(bulkTimerRef.current); };
  }, [isBulkModalOpen, bulkIsRunning, bulkCountdown, bulkCurrentIndex, bulkQueue]);

  const processBulkItem = async (tx: Transaction) => {
      const student = students.find(s => s.id === tx.studentId);
      if (!student) { setBulkLogs(prev => [`⚠️ Aluno não encontrado para TX ${tx.description}`, ...prev]); nextBulkItem(); return; }
      let finalLink = tx.paymentLink;
      if (!finalLink) {
          setBulkLogs(prev => [`🔄 Gerando link para ${student.name}...`, ...prev]);
          try {
              const externalReference = tx.externalReference || crypto.randomUUID();
              if (student.guardian.cpf) {
                  const mpResult = await createMPPreference({
                    title: tx.description, price: tx.amount, externalReference: externalReference,
                    payer: { name: student.guardian.name, email: student.guardian.email, phone: student.guardian.phone, identification: { type: 'CPF', number: student.guardian.cpf } }
                });
                if (mpResult) { finalLink = mpResult.init_point; onUpdateTransaction({ ...tx, paymentLink: finalLink, externalReference }); }
              }
          } catch (e) { setBulkLogs(prev => [`❌ Erro ao gerar link para ${student.name}`, ...prev]); }
      }
      if (finalLink) {
          const phone = student.guardian.phone.replace(/\D/g, '');
          if (phone) {
              const dueDate = formatDate(tx.date);
              const message = `Olá ${student.guardian.name}, somos da Escolinha Garotos do Martinica. ⚽\n\nA mensalidade de *${student.name}* (${dueDate}) já está disponível.\nValor: R$ ${tx.amount.toFixed(2)}\n\nLink para pagamento:\n${finalLink}\n\nObrigado!`;
              
              const sent = await sendZApiMessage(phone, message);
              if (sent) setBulkLogs(prev => [`✅ Enviado para ${student.name}`, ...prev]);
              else setBulkLogs(prev => [`❌ Falha Z-API: ${student.name}`, ...prev]);
          } else setBulkLogs(prev => [`⚠️ Sem telefone para ${student.name}`, ...prev]);
      } else setBulkLogs(prev => [`❌ Falha no link para ${student.name}`, ...prev]);
      nextBulkItem();
  };

  const nextBulkItem = () => { setBulkCurrentIndex(prev => prev + 1); setBulkCountdown(10); };

  const initialFormState: any = {
    name: '', birthDate: '', rg: '', cpf: '', phone: '', medicalCertificateExpiry: '', groupIds: [], planId: '', active: true,
    address: { cep: '', street: '', number: '', complement: '', district: '', city: '', state: '' },
    guardian: { name: '', phone: '', email: '', cpf: '' },
    documents: { rg: { delivered: false, isDigital: false }, cpf: { delivered: false, isDigital: false }, medical: { delivered: false, isDigital: false }, address: { delivered: false, isDigital: false }, school: { delivered: false, isDigital: false } }
  };

  const [studentForm, setStudentForm] = useState(initialFormState);

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
    const today = new Date();
    return transactions.filter(t => t.studentId === studentId && t.type === TransactionType.INCOME && t.status !== PaymentStatus.PAID && t.status !== PaymentStatus.CANCELLED && new Date(t.date) < today).length;
  };

  const handleRequestDocuments = async (student: Student) => {
      const phone = student.guardian.phone.replace(/\D/g, '');
      if (!phone) { alert("Telefone do responsável não encontrado."); return; }
      const getStatus = (doc: any) => (typeof doc === 'boolean' ? doc : (doc?.delivered || false));
      const d = student.documents as any;
      const missingList = [];
      if (!getStatus(d.rg)) missingList.push("RG");
      if (!getStatus(d.cpf)) missingList.push("CPF");
      if (!getStatus(d.medical)) missingList.push("Atestado Médico");
      if (!getStatus(d.address)) missingList.push("Comp. de Endereço");
      if (!getStatus(d.school)) missingList.push("Declaração Escolar");
      if (missingList.length === 0) return;
      const message = `Olá ${student.guardian.name}, tudo bem? ⚽\nAqui é da Escolinha Garotos do Martinica.\nNotamos que a documentação do atleta *${student.name}* está pendente.\n\nItens faltantes:\n${missingList.map(item => `- ${item}`).join('\n')}\n\nPoderia nos enviar uma foto para regularizarmos o cadastro? Obrigado!`;
      
      const sent = await sendZApiMessage(phone, message);
      if (sent) alert("Solicitação enviada via Z-API!"); else alert("Erro ao enviar via Z-API. Verifique as configurações.");
  };

  const handleRequestMedical = async (student: Student) => {
      const phone = student.guardian.phone.replace(/\D/g, '');
      if (!phone) { alert("Telefone do responsável não encontrado."); return; }
      const message = `Olá ${student.guardian.name}, tudo bem? ⚽\nAqui é da Escolinha Garotos do Martinica.\nO atestado médico do atleta *${student.name}* consta como vencido.\n\nPara a segurança dele, é fundamental a renovação. Por favor, providencie. Obrigado!`;
      const sent = await sendZApiMessage(phone, message);
      if (sent) alert("Aviso enviado via Z-API!"); else alert("Erro ao enviar via Z-API.");
  };

  const sendChargeMessage = async (tx: Transaction) => {
      const phone = studentForm.guardian.phone.replace(/\D/g, '');
      if (!phone || !tx.paymentLink) { alert("Telefone ou Link indisponível."); return; }
      const message = `Olá ${studentForm.guardian.name}, somos da Garotos do Martinica. ⚽\nConsta a pendência: *${tx.description}*\nVencimento: ${formatDate(tx.date)}\nValor: R$ ${tx.amount.toFixed(2)}\n\nLink PIX:\n${tx.paymentLink}\n\nObrigado!`;
      const sent = await sendZApiMessage(phone, message);
      if (sent) alert("Cobrança enviada via Z-API!"); else alert("Erro Z-API.");
  };

  const checkStatus = async (tx: Transaction) => {
      if (!tx.externalReference) { alert("Sem vínculo Mercado Pago."); return; }
      setCheckingStatusId(tx.id);
      const status = await checkMPPaymentStatus(tx.externalReference);
      if (status === 'approved') { handlePayTransaction(tx.id, PaymentMethod.PIX_MERCADO_PAGO); alert("Pagamento CONFIRMADO!"); } 
      else alert(status === 'pending' ? "Pagamento pendente." : "Não aprovado.");
      setCheckingStatusId(null);
  };

  const sendBatchChargeMessage = async (txs: Transaction[]) => {
      const pendingTxs = txs.filter(t => t.status !== PaymentStatus.PAID && t.status !== PaymentStatus.CANCELLED);
      if (pendingTxs.length === 0) { alert("Nada pendente."); return; }
      const phone = studentForm.guardian.phone.replace(/\D/g, '');
      if (!phone || !studentForm.guardian.cpf) { alert("Telefone ou CPF do responsável ausente."); return; }
      const totalAmount = pendingTxs.reduce((acc, t) => acc + t.amount, 0);
      setSendingPixId('batch');
      try {
          const externalRef = `batch_${editingId}_${Date.now()}`;
          const mpResult = await createPixPayment({
              title: `Débitos ${studentForm.name}`, price: totalAmount, externalReference: externalRef,
              payer: { name: studentForm.guardian.name, email: studentForm.guardian.email, phone: studentForm.guardian.phone, identification: { type: 'CPF', number: studentForm.guardian.cpf } }
          });
          if (mpResult?.qrCode) {
              setMonitoredPayments(prev => [...prev, { mpId: mpResult.id, txIds: pendingTxs.map(t => t.id) }]);
              const message = `Olá ${studentForm.guardian.name}, aqui é da Garotos do Martinica. ⚽\nIdentificamos débitos em aberto de *${studentForm.name}* (Total: R$ ${totalAmount.toFixed(2)}).\n\nCódigo PIX Copia e Cola:\n\n${mpResult.qrCode}\n\nO sistema confirmará automaticamente.`;
              await sendZApiMessage(phone, message);
              alert("Cobrança unificada enviada via Z-API!");
          } else alert("Erro ao gerar PIX.");
      } catch (e) { alert("Erro de comunicação."); } finally { setSendingPixId(null); }
  };

  const handleSendPixToWhatsApp = async (tx: Transaction) => {
      const phone = studentForm.guardian.phone.replace(/\D/g, '');
      if (!phone || !studentForm.guardian.cpf) { alert("Dados incompletos."); return; }
      setSendingPixId(tx.id);
      try {
          const externalRef = tx.externalReference || crypto.randomUUID();
          const mpResult = await createPixPayment({
              title: tx.description, price: tx.amount, externalReference: externalRef,
              payer: { name: studentForm.guardian.name, email: studentForm.guardian.email, phone: studentForm.guardian.phone, identification: { type: 'CPF', number: studentForm.guardian.cpf } }
          });
          if (mpResult?.qrCode) {
              setMonitoredPayments(prev => [...prev, { mpId: mpResult.id, txIds: [tx.id] }]);
              const message = `Referente a: *${tx.description}*\nValor: R$ ${tx.amount.toFixed(2)}\n\nCódigo PIX:\n\n${mpResult.qrCode}`;
              await sendZApiMessage(phone, message);
              alert("Código PIX enviado via Z-API!");
          } else alert("Erro PIX.");
      } catch (e) { alert("Erro conexão."); } finally { setSendingPixId(null); }
  };
  
  const fetchAddressByCep = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, ''); if (cleanCep.length !== 8) return;
    setIsLoadingCep(true);
    try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await response.json();
        if (!data.erro) setStudentForm(prev => ({ ...prev, address: { ...prev.address, street: data.logradouro, district: data.bairro, city: data.localidade, state: data.uf, cep: cep } }));
        else alert('CEP não encontrado.');
    } catch (error) { alert('Erro ao buscar CEP.'); } finally { setIsLoadingCep(false); }
  };
  
  const availableCategories = useMemo(() => {
    const cats = new Set<string>(); const currentYear = new Date().getFullYear();
    students.forEach(s => { const birthYear = s.birthDate ? parseInt(s.birthDate.split('-')[0]) : currentYear; cats.add(`Sub-${currentYear - birthYear}`); });
    return Array.from(cats).sort((a, b) => parseInt(a.replace('Sub-', '')) - parseInt(b.replace('Sub-', '')));
  }, [students]);

  const toggleCategory = (cat: string) => { setSelectedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]); };

  const filteredStudents = students.filter(s => {
    const ms = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.guardian.name.toLowerCase().includes(searchTerm.toLowerCase());
    const ma = ageFilter ? calculateAge(s.birthDate) === parseInt(ageFilter) : true;
    let mc = true; if (selectedCategories.length > 0) { const birthYear = s.birthDate ? parseInt(s.birthDate.split('-')[0]) : new Date().getFullYear(); mc = selectedCategories.includes(`Sub-${ new Date().getFullYear() - birthYear}`); }
    let mstat = statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? s.active : !s.active);
    let mmed = medicalFilter === 'ALL' || (medicalFilter === 'VALID' ? !isMedicalExpired(s.medicalCertificateExpiry) : isMedicalExpired(s.medicalCertificateExpiry));
    let mfin = financeFilter === 'ALL' || (financeFilter === 'DEFAULTING' ? getStudentOverdueCount(s.id) > 0 : getStudentOverdueCount(s.id) === 0);
    let mdoc = docsFilter === 'ALL' || (docsFilter === 'MISSING_DOCS' ? hasMissingDocs(s) : !hasMissingDocs(s));
    let mplan = planFilter === 'ALL' || s.planId === planFilter;
    return ms && ma && mc && mstat && mmed && mfin && mdoc && mplan;
  });

  const startCamera = async () => {
    setIsCameraOpen(true);
    try { const stream = await navigator.mediaDevices.getUserMedia({ video: true }); if (videoRef.current) videoRef.current.srcObject = stream; } 
    catch (err) { alert("Sem acesso à câmera."); setIsCameraOpen(false); }
  };

  const stopCamera = () => { if (videoRef.current?.srcObject) (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop()); setIsCameraOpen(false); };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) { context.drawImage(videoRef.current, 0, 0, 300, 300); setCapturedImage(canvasRef.current.toDataURL('image/jpeg')); stopCamera(); }
    }
  };

  const handleOpenNew = () => { setEditingId(null); setStudentForm({ ...initialFormState, groupIds: [] }); setCapturedImage(null); setActiveTab('DETAILS'); setSelectedFinanceIds(new Set()); setIsModalOpen(true); };

  const handleOpenEdit = (student: Student) => {
      setEditingId(student.id);
      const normalizeDocs = (docs: any) => {
          if (!docs) return initialFormState.documents;
          const newDocs: any = {};
          ['rg', 'cpf', 'medical', 'address', 'school'].forEach(k => { const v = docs[k]; newDocs[k] = typeof v === 'boolean' ? { delivered: v, isDigital: false } : v || { delivered: false, isDigital: false }; });
          return newDocs;
      };
      setStudentForm({ ...student, groupIds: Array.isArray(student.groupIds) ? student.groupIds : [], documents: normalizeDocs(student.documents) });
      setCapturedImage(student.photoUrl || null); setActiveTab('DETAILS'); setSelectedFinanceIds(new Set()); setIsModalOpen(true);
  };

  const handleOpenHistory = (student: Student) => { handleOpenEdit(student); setActiveTab('FINANCE'); };
  const handleOpenAttendance = (student: Student) => { handleOpenEdit(student); setActiveTab('ATTENDANCE'); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault(); if(isGuardian) return; 
    const studentData = { ...studentForm, photoUrl: capturedImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(studentForm.name)}&background=random&color=fff&size=200` };
    if (editingId) onUpdateStudent({ ...studentData, id: editingId } as Student);
    else onAddStudent(studentData);
    setIsModalOpen(false); setCapturedImage(null); setEditingId(null); setStudentForm(initialFormState); setSelectedFinanceIds(new Set());
  };

  const handlePayTransaction = (id: string, method: PaymentMethod) => {
      const tx = transactions.find(t => t.id === id);
      if(tx) onUpdateTransaction({ ...tx, status: PaymentStatus.PAID, paymentMethod: method, date: new Date().toISOString().split('T')[0] });
  };

  const handleCancelTransaction = (tx: Transaction) => { if (confirm(`Ignorar cobrança: ${tx.description}?`)) onUpdateTransaction({ ...tx, status: PaymentStatus.CANCELLED }); };

  const handleSaveManualCharge = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCharge.description && manualCharge.amount > 0 && editingId) {
      onAddTransaction({ ...manualCharge, type: TransactionType.INCOME, status: PaymentStatus.PENDING, studentId: editingId, paymentMethod: PaymentMethod.CASH });
      setShowChargeModal(false); setManualCharge({ description: '', amount: 0, date: new Date().toISOString().split('T')[0] });
    }
  };

  const toggleFinanceSelection = (id: string) => {
      const next = new Set(selectedFinanceIds); if (next.has(id)) next.delete(id); else next.add(id); setSelectedFinanceIds(next);
  };

  const initiatePixPayment = async (txId?: string) => {
      let amount = 0; let description = ''; let externalRef = ''; const idsToPay: string[] = [];
      if (txId) { const tx = transactions.find(t => t.id === txId); if (!tx) return; amount = tx.amount; description = tx.description; externalRef = tx.externalReference || crypto.randomUUID(); idsToPay.push(txId); } 
      else if (selectedFinanceIds.size > 0) { const sel = transactions.filter(t => selectedFinanceIds.has(t.id)); amount = sel.reduce((a, t) => a + t.amount, 0); description = `Combo ${sel.length} mensalidades`; externalRef = `combo_${Date.now()}`; sel.forEach(t => idsToPay.push(t.id)); } 
      else return;
      if (!studentForm.guardian.cpf) { alert("CPF necessário."); return; }
      setPixLoading(true); setShowPixModal(true); setPixData(null);
      try {
          const result = await createPixPayment({ title: description, price: amount, externalReference: externalRef, payer: { name: studentForm.guardian.name, email: studentForm.guardian.email, phone: studentForm.guardian.phone, identification: { type: 'CPF', number: studentForm.guardian.cpf } } });
          if (result) { setPixData(result); setMonitoredPayments(prev => [...prev, { mpId: result.id, txIds: idsToPay }]); } 
          else { alert("Erro QR Code."); setShowPixModal(false); }
      } catch (e) { alert("Erro MP."); setShowPixModal(false); } finally { setPixLoading(false); }
  };
  
  const confirmPixPaymentSuccess = () => { setSelectedFinanceIds(new Set()); setShowPixModal(false); setPixData(null); };
  const copyPixCode = () => { if (pixData?.qrCode) { navigator.clipboard.writeText(pixData.qrCode); alert("Código Copiado!"); } };

  const handleExportExcel = () => {
    const data = filteredStudents.map(s => {
        const groupNames = s.groupIds.map(gid => groups.find(g => g.id === gid)?.name).filter(Boolean).join(', ');
        return { 'Nome do Aluno': s.name, 'Data Nascimento': formatDate(s.birthDate), 'Idade': calculateAge(s.birthDate), 'RG': s.rg, 'CPF Aluno': s.cpf, 'Grupos': groupNames || 'N/A', 'Nome Responsável': s.guardian.name, 'CPF Responsável': s.guardian.cpf, 'Telefone': s.guardian.phone, 'Status': s.active ? 'Ativo' : 'Inativo', 'Atestado': isMedicalExpired(s.medicalCertificateExpiry) ? 'Vencido' : 'Válido' };
    });
    const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Alunos"); XLSX.writeFile(wb, "GarotosMartinica_Alunos.xlsx");
  };

  const handleDownloadTemplate = () => {
      const template = [{ 'Nome Completo': 'Ex: João Silva', 'Data Nascimento (dd/mm/aaaa)': '20/05/2010', 'RG': '00.000.000-0', 'CPF': '000.000.000-00', 'Telefone': '(11) 99999-9999', 'Nome Responsável': 'Maria Silva', 'CPF Responsável': '111.111.111-11', 'Validade Atestado (dd/mm/aaaa)': '01/01/2025' }];
      const ws = XLSX.utils.json_to_sheet(template); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Template"); XLSX.writeFile(wb, "Template_Importacao.xlsx");
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]; if (!file) return;
      const reader = new FileReader(); reader.onload = (evt) => {
          try {
              const data = new Uint8Array(evt.target?.result as ArrayBuffer); const wb = XLSX.read(data, { type: 'array' });
              const jsonData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
              if (jsonData.length === 0) return;
              const newStus = jsonData.map((row: any) => ({
                name: row['Nome Completo'] || 'User', birthDate: parseExcelDate(row['Data Nascimento (dd/mm/aaaa)']), rg: String(row['RG'] || ''), cpf: String(row['CPF'] || ''), phone: String(row['Telefone'] || ''), medicalCertificateExpiry: parseExcelDate(row['Validade Atestado (dd/mm/aaaa)']),
                photoUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(row['Nome Completo'] || 'User')}`, groupIds: [], planId: '', active: true, address: { cep: '', street: '', number: '', complement: '', district: '', city: '', state: '' }, guardian: { name: row['Nome Responsável'] || '', phone: row['Telefone Responsável'] || '', email: '', cpf: row['CPF Responsável'] || '' }, documents: { rg: false, cpf: false, medical: false, address: false, school: false }
              }));
              if (confirm(`Importar ${newStus.length} alunos?`)) onBatchAddStudents(newStus);
          } catch (error) { alert("Erro no Excel."); }
      }; reader.readAsArrayBuffer(file);
  };

  const parseExcelDate = (val: any) => {
      if (!val) return ''; if (typeof val === 'number') return new Date(Math.round((val - 25569) * 86400 * 1000)).toISOString().split('T')[0];
      if (typeof val === 'string' && val.includes('/')) { const p = val.split('/'); return `${p[2]}-${p[1]}-${p[0]}`; }
      return val;
  };

  const handleExportPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4'); doc.setFontSize(18); doc.text("Relatório de Alunos", 14, 22);
    const rows = filteredStudents.map(s => [s.name, s.rg, s.cpf, formatDate(s.birthDate), calculateAge(s.birthDate).toString(), s.guardian.name, s.active ? 'Ativo' : 'Inativo']);
    autoTable(doc, { startY: 35, head: [['Nome', 'RG', 'CPF', 'Nascimento', 'Idade', 'Responsável', 'Status']], body: rows, headStyles: { fillColor: [249, 115, 22] } });
    doc.save("Alunos_Martinica.pdf");
  };

  const handlePrintContract = () => {
    const doc = new jsPDF(); const margin = 20; const pW = doc.internal.pageSize.getWidth();
    doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text("GAROTOS DO MARTINICA", pW / 2, 20, { align: 'center' });
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    const body = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS\nResponsável: ${studentForm.guardian.name}\nAluno: ${studentForm.name}\n\nEu, declaro que o aluno goza de perfeita saúde.\nAlunos com 2 ou mais parcelas em atraso terão o acesso suspenso.\nData: ${new Date().toLocaleDateString('pt-BR')}`;
    doc.text(doc.splitTextToSize(body, pW - margin * 2), margin, 40);
    doc.save(`Contrato_${studentForm.name}.pdf`);
  };

  const studentTransactions = transactions.filter(t => t.studentId === editingId && t.type === TransactionType.INCOME).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const selectedTotal = studentTransactions.filter(t => selectedFinanceIds.has(t.id)).reduce((acc, t) => acc + t.amount, 0);

  const studentActivities = activities.filter(a => editingId && (a.groupId && studentForm.groupIds?.includes(a.groupId) || a.participants?.includes(editingId) || a.attendance?.includes(editingId))).sort((a, b) => new Date(b.date + 'T' + b.startTime).getTime() - new Date(a.date + 'T' + a.startTime).getTime());

  const handleExportStudentAttendance = () => {
      const doc = new jsPDF(); doc.text(`Frequência - ${studentForm.name}`, 14, 20);
      const data = studentActivities.map(a => [formatDate(a.date), a.title, a.attendance.includes(editingId!) ? 'PRESENTE' : 'AUSENTE']);
      autoTable(doc, { startY: 30, head: [['Data', 'Atividade', 'Status']], body: data });
      doc.save(`Frequencia_${studentForm.name}.pdf`);
  };

  const handleSendAttendanceToWhatsApp = async () => {
      const phone = studentForm.guardian.phone.replace(/\D/g, ''); if (!phone) return;
      const curMonth = studentActivities.filter(a => a.date.startsWith(attendanceMonth));
      const pres = curMonth.filter(a => a.attendance.includes(editingId!)).length;
      const rate = curMonth.length > 0 ? Math.round((pres / curMonth.length) * 100) : 0;
      const message = `Relatório de Frequência - *${studentForm.name}*\nPresenças: ${pres}/${curMonth.length}\nFrequência: ${rate}%`;
      
      await sendZApiMessage(phone, message); 
      alert("Relatório de frequência enviado via Z-API!");
  };

  const updateDoc = (field: string, sub: 'delivered' | 'isDigital', val: boolean) => {
      setStudentForm(prev => { const d = (prev.documents as any)[field] || { delivered: false, isDigital: false }; return { ...prev, documents: { ...prev.documents, [field]: { ...d, [sub]: val } } }; });
  };

  const toggleGroupSelection = (gid: string) => {
      setStudentForm(prev => { const g = prev.groupIds || []; return { ...prev, groupIds: g.includes(gid) ? g.filter(id => id !== gid) : [...g, gid] }; });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-xl md:text-2xl font-bold text-gray-800">{isGuardian ? 'Meus Filhos' : 'Alunos e Responsáveis'}</h2>
        {!isGuardian && (
            <div className="flex flex-wrap gap-2 w-full md:w-auto">
                <button onClick={handleStartBulkSend} className="flex-1 md:flex-none justify-center flex items-center gap-2 bg-purple-600 text-white px-3 py-2 rounded-lg hover:bg-purple-700 transition-colors shadow-sm text-sm"><Zap className="w-4 h-4" />Enviar Cobranças</button>
                <input type="file" ref={fileInputRef} onChange={handleImportExcel} accept=".xlsx, .xls" className="hidden" />
                <button onClick={() => fileInputRef.current?.click()} className="flex-1 md:flex-none justify-center flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-sm"><Upload className="w-4 h-4" />Importar</button>
                <button onClick={handleDownloadTemplate} className="flex-1 md:flex-none justify-center flex items-center gap-2 bg-gray-600 text-white px-3 py-2 rounded-lg hover:bg-gray-700 transition-colors shadow-sm text-sm"><FileSpreadsheet className="w-4 h-4" />Modelo</button>
                <button onClick={handleExportExcel} className="flex-1 md:flex-none justify-center flex items-center gap-2 bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 transition-colors shadow-sm text-sm"><Download className="w-4 h-4" />Exportar</button>
                <button onClick={handleExportPDF} className="flex-1 md:flex-none justify-center flex items-center gap-2 bg-red-600 text-white px-3 py-2 rounded-lg hover:bg-red-700 transition-colors shadow-sm text-sm"><FileText className="w-4 h-4" />PDF</button>
                <button onClick={handleOpenNew} className="w-full md:w-auto flex items-center justify-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors shadow-sm text-sm"><Plus className="w-4 h-4" />Novo Aluno</button>
            </div>
        )}
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-2 relative"><Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" /><input type="text" placeholder="Buscar..." className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
          <div className="md:col-span-1 relative"><input type="number" placeholder="Idade" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow" value={ageFilter} onChange={(e) => setAgeFilter(e.target.value)} /></div>
          <div className="md:col-span-2 relative" ref={categoryDropdownRef}>
            <div className="w-full pl-3 pr-4 py-2 border border-gray-200 rounded-lg bg-white text-gray-600 text-sm cursor-pointer flex items-center justify-between hover:border-primary-300 transition-colors" onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}><div className="flex items-center gap-2 overflow-hidden truncate"><Layers className="w-4 h-4 flex-shrink-0" /><span className="truncate">{selectedCategories.length > 0 ? `${selectedCategories.length} Sel.` : 'Cat.: Todas'}</span></div><ChevronDown className={`w-4 h-4 transition-transform ${isCategoryDropdownOpen ? 'rotate-180' : ''}`} /></div>
            {isCategoryDropdownOpen && (<div className="absolute top-full left-0 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-20 max-h-60 overflow-y-auto p-1 animate-in fade-in zoom-in-95 duration-100"><div className="p-2 text-xs text-gray-400 font-medium uppercase tracking-wider border-b border-gray-50 mb-1">Selecione</div>{availableCategories.map(cat => (<label key={cat} className="flex items-center gap-2 p-2 hover:bg-primary-50 rounded-md cursor-pointer text-sm transition-colors"><input type="checkbox" checked={selectedCategories.includes(cat)} onChange={() => toggleCategory(cat)} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-4 h-4" /><span>{cat}</span></label>))}{selectedCategories.length > 0 && (<button onClick={() => { setSelectedCategories([]); setIsCategoryDropdownOpen(false); }} className="w-full text-center text-xs text-red-500 hover:bg-red-50 p-2 rounded mt-1 border-t border-gray-50">Limpar</button>)}</div>)}
          </div>
          <div className="md:col-span-2 relative"><Ticket className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" /><select className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow bg-white text-gray-600" value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}><option value="ALL">Plano: Todos</option>{plans.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}</select></div>
          <div className="md:col-span-2 relative"><ShieldCheck className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" /><select className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow bg-white text-gray-600" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="ALL">Status: Todos</option><option value="ACTIVE">Ativos</option><option value="INACTIVE">Inativos</option></select></div>
          <div className="md:col-span-2 relative"><Wallet className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" /><select className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow bg-white text-gray-600" value={financeFilter} onChange={(e) => setFinanceFilter(e.target.value)}><option value="ALL">Fin.: Todos</option><option value="DEFAULTING">Inadimplentes</option><option value="OK">Em dia</option></select></div>
          <div className="md:col-span-1 relative"><FolderCheck className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" /><select className="w-full pl-9 pr-2 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow bg-white text-gray-600 text-sm" value={docsFilter} onChange={(e) => setDocsFilter(e.target.value)}><option value="ALL">Docs</option><option value="MISSING_DOCS">Pend.</option><option value="OK">OK</option></select></div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
         <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Aluno</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Categoria</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Idade</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Grupos</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Responsável</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredStudents.map((student) => {
                const groupNames = student.groupIds.map(gid => groups.find(g => g.id === gid)?.name).filter(Boolean).join(', ') || 'Sem Grupo';
                const overdueCount = getStudentOverdueCount(student.id);
                const currentYear = new Date().getFullYear(); const birthYear = student.birthDate ? parseInt(student.birthDate.split('-')[0]) : currentYear;
                return (
                  <tr key={student.id} className={`hover:bg-gray-50 transition-colors ${overdueCount > 0 ? 'bg-red-50/30' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img src={student.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover bg-gray-200" />
                        <div>
                          <div className="font-medium text-gray-900 flex items-center gap-2">
                              {student.name}
                              {overdueCount > 0 && (<span className="bg-red-100 text-red-600 text-[10px] px-1.5 py-0.5 rounded-full font-bold border border-red-200"><AlertTriangle className="w-3 h-3 inline mr-0.5" /> {overdueCount} Pend.</span>)}
                              {hasMissingDocs(student) && !isGuardian && (<button onClick={() => handleRequestDocuments(student)} className="bg-orange-100 text-orange-600 text-[10px] px-1.5 py-0.5 rounded-full font-bold border border-orange-200 hover:bg-orange-200"><FileWarning className="w-3 h-3 inline mr-0.5" /> DOC</button>)}
                          </div>
                          <div className="text-xs text-gray-500 flex items-center gap-1.5">
                              <span>Tel: {student.phone}</span>
                              {student.phone && (
                                <a 
                                  href={`https://wa.me/55${student.phone.replace(/\D/g, '')}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="text-green-500 hover:text-green-600 transition-colors p-0.5 hover:bg-green-50 rounded"
                                  title="Chamar Aluno no WhatsApp"
                                >
                                  <MessageCircle className="w-3 h-3" />
                                </a>
                              )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4"><span className="bg-gray-100 text-gray-700 px-2 py-1 rounded-md text-xs font-bold border">Sub-{currentYear - birthYear}</span></td>
                    <td className="px-6 py-4 text-sm text-gray-600">{calculateAge(student.birthDate)} anos</td>
                    <td className="px-6 py-4 text-sm text-gray-600 truncate max-w-[200px]" title={groupNames}>{groupNames}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-900">{student.guardian.name}</span>
                        <div className="text-xs text-gray-500 flex items-center gap-1.5">
                            <span>{student.guardian.phone}</span>
                            {student.guardian.phone && (
                                <a 
                                  href={`https://wa.me/55${student.guardian.phone.replace(/\D/g, '')}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="text-green-500 hover:text-green-600 transition-colors p-0.5 hover:bg-green-50 rounded"
                                  title="Chamar Responsável no WhatsApp"
                                >
                                  <MessageCircle className="w-3 h-3" />
                                </a>
                            )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                          <span className={`w-fit px-3 py-1 rounded-full text-xs font-medium border ${student.active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{student.active ? 'Ativo' : 'Inativo'}</span>
                          {isMedicalExpired(student.medicalCertificateExpiry) && !isGuardian && (<button onClick={() => handleRequestMedical(student)} className="px-2 py-0.5 bg-orange-100 text-orange-600 rounded-md text-[10px] font-bold flex items-center gap-1 hover:bg-orange-200"><HeartPulse className="w-3 h-3" /> Atestado Vencido</button>)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleOpenAttendance(student)} className="text-purple-600 hover:text-purple-800 transition-colors p-2 bg-purple-50 rounded-lg"><CalendarCheck className="w-4 h-4" /></button>
                        <button onClick={() => handleOpenHistory(student)} className={`p-2 rounded-lg transition-colors ${overdueCount > 0 ? 'bg-red-500 text-white animate-pulse' : 'bg-blue-50 text-blue-600'}`}><History className="w-4 h-4" /></button>
                        <button onClick={() => handleOpenEdit(student)} className="text-primary-600 hover:text-primary-800 p-2 bg-primary-50 rounded-lg"><Edit className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl max-h-[95vh] flex flex-col animate-in zoom-in duration-200">
             <div className="p-4 md:p-6 border-b flex justify-between items-center bg-gray-50 rounded-t-2xl">
              <div>
                  <h3 className="text-lg md:text-xl font-bold">{isGuardian ? 'Ficha do Aluno' : (editingId ? 'Editar Aluno' : 'Novo Aluno')}</h3>
                  {editingId && (
                      <div className="flex gap-4 mt-4">
                          <button onClick={() => setActiveTab('DETAILS')} className={`pb-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'DETAILS' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Dados</button>
                          <button onClick={() => setActiveTab('FINANCE')} className={`pb-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'FINANCE' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Financeiro</button>
                          <button onClick={() => setActiveTab('ATTENDANCE')} className={`pb-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'ATTENDANCE' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Frequência</button>
                      </div>
                  )}
              </div>
              <button onClick={() => { setIsModalOpen(false); stopCamera(); }} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            
            {activeTab === 'DETAILS' ? (
                <div className="flex-1 overflow-y-auto p-4 md:p-6">
                    <form id="student-form" onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="space-y-4">
                            <h4 className="text-sm font-bold border-b pb-2">Foto</h4>
                            <div className="flex flex-col items-center gap-4">
                                {isCameraOpen ? (
                                    <div className="relative w-40 h-40 bg-black rounded-lg overflow-hidden"><video ref={videoRef} autoPlay className="w-full h-full object-cover" /><button type="button" onClick={capturePhoto} className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-white rounded-full p-2"><div className="w-4 h-4 bg-red-600 rounded-full" /></button></div>
                                ) : capturedImage ? (
                                    <div className="relative w-32 h-32 md:w-40 md:h-40"><img src={capturedImage} className="w-full h-full object-cover rounded-full border-4" /><button type="button" onClick={() => setCapturedImage(null)} className="absolute bottom-0 right-0 bg-red-500 text-white p-2 rounded-full"><X className="w-4 h-4" /></button></div>
                                ) : (
                                    <div className="w-32 h-32 md:w-40 md:h-40 bg-gray-100 rounded-full flex flex-col items-center justify-center text-gray-400 border-2 border-dashed"><UserIcon className="w-12 h-12 mb-2" /><button type="button" onClick={startCamera} className="text-xs bg-white border px-3 py-1 rounded-full shadow-sm">Abrir Câmera</button></div>
                                )}
                            </div>
                            <div className="space-y-3">
                                <div><label className="block text-xs font-semibold text-gray-600 mb-1">Nome Completo</label><input required disabled={isGuardian} type="text" className="w-full border rounded-lg p-2 text-sm disabled:bg-gray-100" value={studentForm.name} onChange={e => setStudentForm({...studentForm, name: e.target.value})} /></div>
                                <div><label className="block text-xs font-semibold text-gray-600 mb-1">Nascimento</label><input required disabled={isGuardian} type="date" className="w-full border rounded-lg p-2 text-sm disabled:bg-gray-100" value={studentForm.birthDate} onChange={e => setStudentForm({...studentForm, birthDate: e.target.value})} /></div>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <h4 className="text-sm font-bold border-b pb-2">Documentos & Endereço</h4>
                            <div className="grid grid-cols-2 gap-2">
                                <div><label className="block text-xs font-semibold text-gray-600 mb-1">RG</label><input type="text" disabled={isGuardian} className="w-full border rounded-lg p-2 text-sm disabled:bg-gray-100" value={studentForm.rg} onChange={e => setStudentForm({...studentForm, rg: e.target.value})} /></div>
                                <div><label className="block text-xs font-semibold text-gray-600 mb-1">CPF</label><input type="text" disabled={isGuardian} className="w-full border rounded-lg p-2 text-sm disabled:bg-gray-100" value={studentForm.cpf} onChange={e => setStudentForm({...studentForm, cpf: e.target.value})} /></div>
                            </div>
                            <div className="bg-red-50 p-3 rounded-lg border border-red-100"><label className="block text-xs font-bold text-red-700 mb-1">Venc. Atestado</label><input required disabled={isGuardian} type="date" className="w-full border rounded-lg p-2 text-sm bg-white disabled:bg-gray-100" value={studentForm.medicalCertificateExpiry} onChange={e => setStudentForm({...studentForm, medicalCertificateExpiry: e.target.value})} /></div>
                            <div className="space-y-2 bg-gray-50 p-3 rounded-lg border">
                                {['rg', 'cpf', 'medical', 'address', 'school'].map(k => (
                                    <label key={k} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"><input type="checkbox" disabled={isGuardian} checked={studentForm.documents[k]?.delivered} onChange={e => updateDoc(k, 'delivered', e.target.checked)} className="rounded" /> {k.toUpperCase()} Entregue</label>
                                ))}
                            </div>
                            <div><label className="block text-xs font-semibold text-gray-600 mb-1">CEP</label><div className="relative"><input disabled={isGuardian} type="text" className="w-full border rounded-lg p-2 text-sm disabled:bg-gray-100" value={studentForm.address.cep} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, cep: e.target.value}})} onBlur={e => fetchAddressByCep(e.target.value)} />{isLoadingCep && <Loader2 className="absolute right-2 top-2.5 w-4 h-4 animate-spin text-primary-500" />}</div></div>
                            <div><label className="block text-xs font-semibold text-gray-600 mb-1">Rua</label><input disabled={isGuardian} type="text" className="w-full border rounded-lg p-2 text-sm bg-gray-50" value={studentForm.address.street} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, street: e.target.value}})} /></div>
                        </div>
                        <div className="space-y-4">
                            <h4 className="text-sm font-bold border-b pb-2">Responsável & Plano</h4>
                            <div><label className="block text-xs font-semibold text-gray-600 mb-1">Nome Resp.</label><input required disabled={isGuardian} type="text" className="w-full border rounded-lg p-2 text-sm disabled:bg-gray-100" value={studentForm.guardian.name} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, name: e.target.value}})} /></div>
                            <div><label className="block text-xs font-semibold text-gray-600 mb-1">CPF Resp.</label><input required disabled={isGuardian} type="text" className="w-full border rounded-lg p-2 text-sm disabled:bg-gray-100" value={studentForm.guardian.cpf} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, cpf: e.target.value}})} /></div>
                            <div><label className="block text-xs font-semibold text-gray-600 mb-1">Tel. Resp.</label><input required disabled={isGuardian} type="text" className="w-full border rounded-lg p-2 text-sm disabled:bg-gray-100" value={studentForm.guardian.phone} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, phone: e.target.value}})} /></div>
                            <div><label className="block text-xs font-semibold text-gray-600 mb-1">Grupos</label><div className="border rounded-lg p-2 max-h-32 overflow-y-auto bg-white">{groups.map(g => (<label key={g.id} className="flex items-center gap-2 mb-1 text-sm"><input type="checkbox" disabled={isGuardian} checked={studentForm.groupIds?.includes(g.id)} onChange={() => toggleGroupSelection(g.id)} className="rounded" /> {g.name}</label>))}</div></div>
                            <div><label className="block text-sm font-semibold text-gray-600 mb-1">Plano</label><select required disabled={isGuardian} className="w-full border rounded-lg p-2 text-sm bg-white" value={studentForm.planId} onChange={e => setStudentForm({...studentForm, planId: e.target.value})}><option value="">Selecione...</option>{plans.map(p => <option key={p.id} value={p.id}>{p.name} - R$ {p.price}</option>)}</select></div>
                            <div className="flex gap-4"><button disabled={isGuardian} type="button" onClick={() => setStudentForm({...studentForm, active: true})} className={`flex-1 p-2 rounded-lg border text-sm font-bold ${studentForm.active ? 'bg-green-50 border-green-500 text-green-700' : 'bg-gray-50'}`}>Ativo</button><button disabled={isGuardian} type="button" onClick={() => setStudentForm({...studentForm, active: false})} className={`flex-1 p-2 rounded-lg border text-sm font-bold ${!studentForm.active ? 'bg-red-50 border-red-500 text-red-700' : 'bg-gray-50'}`}>Inativo</button></div>
                        </div>
                    </form>
                </div>
            ) : activeTab === 'FINANCE' ? (
                <div className="flex-1 overflow-y-auto p-4 md:p-6">
                    <div className="flex flex-col md:flex-row justify-between gap-4 mb-6">
                        <div className="bg-blue-50 text-blue-800 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 w-fit"><Wallet className="w-4 h-4" /> Histórico Financeiro</div>
                        <div className="flex gap-2">
                            {(isGuardian || true) && selectedFinanceIds.size > 0 && (
                                <button onClick={() => initiatePixPayment()} className="flex-1 md:flex-none justify-center flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm font-bold animate-pulse shadow-lg">
                                    <QrCode className="w-4 h-4" /> PAGAR SELECIONADOS (R$ {selectedTotal.toFixed(2)})
                                </button>
                            )}
                            {!isGuardian && (
                                <>
                                    <button onClick={() => setShowChargeModal(true)} className="flex-1 md:flex-none justify-center flex items-center gap-2 bg-primary-600 text-white px-3 py-2 rounded-lg hover:bg-primary-700 text-sm font-medium"><PlusCircle className="w-4 h-4" /> Nova Cobrança</button>
                                    <button onClick={() => sendBatchChargeMessage(studentTransactions)} className="flex-1 md:flex-none justify-center flex items-center gap-2 bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 text-sm font-medium"><MessageCircle className="w-4 h-4" /> Cobrar Tudo</button>
                                </>
                            )}
                        </div>
                    </div>
                    <div className="space-y-3">
                         {studentTransactions.map(tx => {
                             const isLate = tx.status !== PaymentStatus.PAID && new Date(tx.date) < new Date();
                             return (<div key={tx.id} className={`p-4 rounded-xl border flex justify-between items-start hover:shadow-md transition-shadow ${isLate ? 'bg-red-50 border-red-100' : 'bg-white border-gray-100'}`}>
                                 <div className="flex gap-3">
                                     {tx.status !== PaymentStatus.PAID && (<div onClick={() => toggleFinanceSelection(tx.id)} className="mt-1 cursor-pointer">{selectedFinanceIds.has(tx.id) ? <CheckSquare className="text-primary-600 w-5 h-5" /> : <Square className="text-gray-300 w-5 h-5" />}</div>)}
                                     <div>
                                         <p className="font-bold text-sm">{tx.description}</p>
                                         <p className="text-xs text-gray-500 mt-1">Vencimento: {formatDate(tx.date)}</p>
                                         <span className={`mt-2 inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${tx.status === PaymentStatus.PAID ? 'bg-green-50 text-green-700' : isLate ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-700'}`}>{tx.status}</span>
                                     </div>
                                 </div>
                                 <div className="text-right">
                                     <p className="font-bold">R$ {tx.amount.toFixed(2)}</p>
                                     {tx.status !== PaymentStatus.PAID && (
                                         <div className="flex gap-1 mt-2 justify-end">
                                             <button onClick={() => initiatePixPayment(tx.id)} className="p-1.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100" title="Gerar Código PIX"><QrCode className="w-3 h-3" /></button>
                                             {!isGuardian && (
                                                 <>
                                                     <button onClick={() => sendChargeMessage(tx)} className="p-1.5 bg-green-50 text-green-600 rounded hover:bg-green-100"><Send className="w-3 h-3" /></button>
                                                     <button onClick={() => handlePayTransaction(tx.id, PaymentMethod.CASH)} className="p-1.5 bg-gray-100 rounded hover:bg-gray-200"><CheckCircle className="w-3 h-3" /></button>
                                                 </>
                                             )}
                                         </div>
                                     )}
                                 </div>
                             </div>);
                         })}
                    </div>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto p-4 md:p-6">
                    <div className="flex justify-between items-center mb-6">
                        <div className="bg-purple-50 text-purple-800 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"><CalendarCheck className="w-4 h-4" /> Frequência</div>
                        {!isGuardian && (<div className="flex gap-2"><button onClick={handleExportStudentAttendance} className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200"><Printer className="w-4 h-4" /></button><button onClick={handleSendAttendanceToWhatsApp} className="p-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200"><MessageCircle className="w-4 h-4" /></button></div>)}
                    </div>
                    <div className="space-y-2">
                        {studentActivities.map(a => (<div key={a.id} className="p-3 border rounded-lg flex justify-between items-center hover:bg-gray-50">
                            <div><p className="text-sm font-bold">{a.title}</p><p className="text-xs text-gray-500">{formatDate(a.date)} • {a.startTime}</p></div>
                            <span className={`text-xs font-bold ${a.attendance.includes(editingId!) ? 'text-green-600' : 'text-red-500'}`}>{a.attendance.includes(editingId!) ? 'PRESENTE' : 'FALTA'}</span>
                        </div>))}
                    </div>
                </div>
            )}
            
            <div className="p-4 md:p-6 border-t bg-gray-50 rounded-b-2xl flex justify-between items-center">
                {!isGuardian && editingId && (<button type="button" onClick={handlePrintContract} className="flex items-center gap-1 text-gray-600 hover:text-black font-medium text-sm"><Printer className="w-4 h-4" /> Contrato</button>)}
                <div className="flex gap-3 ml-auto">
                    <button type="button" onClick={() => { setIsModalOpen(false); stopCamera(); }} className="px-5 py-2 text-gray-600 font-medium hover:bg-gray-200 rounded-lg">Fechar</button>
                    {!isGuardian && activeTab === 'DETAILS' && (<button type="submit" form="student-form" className="px-5 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 shadow-lg">Salvar Aluno</button>)}
                </div>
            </div>
          </div>
        </div>
      )}
      
      {showChargeModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
             <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
                  <h3 className="text-lg font-bold mb-4">Nova Cobrança Manual</h3>
                  <form onSubmit={handleSaveManualCharge} className="space-y-4">
                      <div><label className="block text-sm font-medium mb-1">Descrição</label><input required type="text" className="w-full border rounded-lg p-2" placeholder="Uniforme, etc..." value={manualCharge.description} onChange={e => setManualCharge({...manualCharge, description: e.target.value})} /></div>
                      <div><label className="block text-sm font-medium mb-1">Valor (R$)</label><input required type="number" step="0.01" className="w-full border rounded-lg p-2" value={manualCharge.amount} onChange={e => setManualCharge({...manualCharge, amount: parseFloat(e.target.value)})} /></div>
                      <div><label className="block text-sm font-medium mb-1">Vencimento</label><input required type="date" className="w-full border rounded-lg p-2" value={manualCharge.date} onChange={e => setManualCharge({...manualCharge, date: e.target.value})} /></div>
                      <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setShowChargeModal(false)} className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button><button type="submit" className="px-3 py-2 bg-green-600 text-white rounded-lg">Criar</button></div>
                  </form>
             </div>
        </div>
      )}

      {showPixModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-sm p-6 text-center animate-in fade-in zoom-in duration-200">
                  <div className="flex justify-between items-center mb-2"><h3 className="text-xl font-bold">Pagamento via PIX</h3><button onClick={() => setShowPixModal(false)} className="text-gray-400 hover:text-black"><X /></button></div>
                  {pixLoading ? (<div className="py-12 flex flex-col items-center gap-4"><Loader2 className="w-12 h-12 text-primary-600 animate-spin" /><p className="text-gray-500">Gerando QR Code...</p></div>) : pixData ? (
                      <div className="space-y-4">
                          <div className="bg-green-50 text-green-800 text-sm p-3 rounded-lg border border-green-100 font-medium">Aguardando pagamento...<br/><span className="text-xs font-normal opacity-80">A confirmação é automática.</span></div>
                          <div className="flex justify-center my-4"><img src={`data:image/png;base64,${pixData.qrCodeBase64}`} alt="QR" className="w-48 h-48 border-4 border-gray-900 rounded-xl" /></div>
                          <div className="relative"><textarea readOnly className="w-full text-xs p-3 border rounded-lg bg-gray-50 h-20 resize-none font-mono" value={pixData.qrCode} /><button onClick={copyPixCode} className="absolute bottom-2 right-2 bg-white shadow border p-1.5 rounded hover:bg-gray-100"><Copy className="w-4 h-4 text-primary-600" /></button></div>
                          <p className="text-xs text-gray-400">Escaneie ou copie o código para pagar.</p>
                      </div>
                  ) : (<div className="py-8 text-red-500">Erro ao carregar dados.</div>)}
              </div>
          </div>
      )}

      {sendingPixId && (<div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm"><div className="bg-white p-6 rounded-xl shadow-xl flex flex-col items-center gap-4"><Loader2 className="w-8 h-8 text-green-600 animate-spin" /><p className="font-medium text-gray-700">Enviando via Z-API...</p></div></div>)}

      {isBulkModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-bold flex items-center gap-2"><Zap className="w-5 h-5 text-purple-600" /> Envio Automático (Z-API)</h3>{!bulkIsRunning && <button onClick={() => setIsBulkModalOpen(false)}><X className="text-gray-400" /></button>}</div>
            <div className="mb-6">
                <div className="flex justify-between text-sm text-gray-600 mb-1"><span>Progresso:</span><span>{bulkCurrentIndex} de {bulkQueue.length}</span></div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4"><div className="bg-purple-600 h-2.5 rounded-full transition-all duration-500" style={{ width: `${(bulkCurrentIndex / bulkQueue.length) * 100}%` }}></div></div>
                {bulkIsRunning ? (<div className="bg-purple-50 text-purple-800 p-3 rounded-lg text-sm font-medium text-center flex flex-col items-center gap-2"><div className="animate-spin rounded-full h-4 w-4 border-2 border-purple-600 border-t-transparent"></div>Próximo envio em {bulkCountdown}s...</div>) : (<div className="bg-green-50 text-green-800 p-3 rounded-lg text-sm font-medium text-center">Processo Finalizado</div>)}
            </div>
            <div className="bg-gray-900 text-green-400 p-4 rounded-lg h-40 overflow-y-auto text-xs font-mono mb-4">{bulkLogs.map((log, i) => (<div key={i} className="mb-1">{log}</div>))}</div>
            <div className="flex justify-end gap-2">{bulkIsRunning ? (<button onClick={() => setBulkIsRunning(false)} className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm font-medium"><Pause className="w-4 h-4" /> Pausar</button>) : (<button onClick={() => setBulkIsRunning(true)} className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-sm font-medium" disabled={bulkCurrentIndex >= bulkQueue.length}><Play className="w-4 h-4" /> Continuar</button>)}<button onClick={() => setIsBulkModalOpen(false)} className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm font-medium">Fechar</button></div>
          </div>
        </div>
      )}
    </div>
  );
};
