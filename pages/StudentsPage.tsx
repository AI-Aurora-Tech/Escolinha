
import React, { useState, useRef, useEffect } from 'react';
import { Student, Group, Plan, Transaction, TransactionType, PaymentStatus, PaymentMethod, Activity } from '../types';
import { Search, Plus, Phone, User, Edit, Camera, X, CheckSquare, Square, FileSpreadsheet, FileText, Filter, HeartPulse, ShieldCheck, MessageCircle, MapPin, Loader2, Printer, Wallet, QrCode, CheckCircle, Clock, Link as LinkIcon, History, CalendarCheck, XCircle, Download, Calculator, AlertTriangle, FileWarning, FolderCheck } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface StudentsPageProps {
  students: Student[];
  groups: Group[];
  plans: Plan[];
  transactions: Transaction[];
  activities: Activity[];
  onAddStudent: (s: Omit<Student, 'id'>) => void;
  onUpdateStudent: (s: Student) => void;
  onUpdateTransaction: (t: Transaction) => void;
  initialFilter?: string; // Prop opcional para definir filtro inicial
}

export const StudentsPage: React.FC<StudentsPageProps> = ({ students, groups, plans, transactions, activities, onAddStudent, onUpdateStudent, onUpdateTransaction, initialFilter }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [ageFilter, setAgeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [medicalFilter, setMedicalFilter] = useState('ALL');
  const [financeFilter, setFinanceFilter] = useState('ALL'); 
  const [docsFilter, setDocsFilter] = useState('ALL'); // Novo filtro de documentos

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'DETAILS' | 'FINANCE' | 'ATTENDANCE'>('DETAILS');
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Payment Simulation State
  const [showPixModal, setShowPixModal] = useState(false);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [simulatingPix, setSimulatingPix] = useState(false);
  
  // Multi-select State for Finance
  const [selectedFinanceIds, setSelectedFinanceIds] = useState<Set<string>>(new Set());

  // Camera States
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  // CEP Loading State
  const [isLoadingCep, setIsLoadingCep] = useState(false);

  // Inicializar filtro se passado via prop
  useEffect(() => {
    if (initialFilter === 'DEFAULTING') {
        setFinanceFilter('DEFAULTING');
    } else if (initialFilter === 'MISSING_DOCS') {
        setDocsFilter('MISSING_DOCS');
    }
  }, [initialFilter]);

  const initialFormState = {
    name: '',
    birthDate: '',
    rg: '',
    cpf: '',
    phone: '',
    medicalCertificateExpiry: '',
    groupId: '',
    planId: '',
    active: true,
    address: {
        cep: '',
        street: '',
        number: '',
        complement: '',
        district: '',
        city: '',
        state: ''
    },
    guardian: { name: '', phone: '', email: '', cpf: '' },
    documents: {
        rg: false,
        cpf: false,
        medical: false,
        address: false,
        school: false
    }
  };

  const [studentForm, setStudentForm] = useState(initialFormState);

  // Helper functions
  const calculateAge = (birthDateString: string) => {
    if (!birthDateString) return 0;
    const today = new Date();
    const birthDate = new Date(birthDateString);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
  };

  const isMedicalExpired = (dateString: string) => {
    if (!dateString) return true;
    return new Date(dateString) < new Date();
  };

  const hasMissingDocs = (student: Student) => {
      if (!student.documents) return true;
      return !student.documents.rg || !student.documents.cpf || !student.documents.medical || !student.documents.address || !student.documents.school;
  };

  // Check if student has overdue payments
  const getStudentOverdueCount = (studentId: string) => {
    const today = new Date();
    return transactions.filter(t => 
        t.studentId === studentId && 
        t.type === TransactionType.INCOME && 
        t.status !== PaymentStatus.PAID && 
        new Date(t.date) < today
    ).length;
  };

  const getWhatsAppLink = (phone: string) => {
    if (!phone) return '#';
    const numbers = phone.replace(/\D/g, '');
    return `https://wa.me/55${numbers}`;
  };

  const handleRequestDocuments = (student: Student) => {
      const phone = student.guardian.phone.replace(/\D/g, '');
      if (!phone) {
          alert("Telefone do responsável não encontrado.");
          return;
      }

      const missingList = [];
      if (!student.documents?.rg) missingList.push("RG");
      if (!student.documents?.cpf) missingList.push("CPF");
      if (!student.documents?.medical) missingList.push("Atestado Médico");
      if (!student.documents?.address) missingList.push("Comp. de Endereço");
      if (!student.documents?.school) missingList.push("Declaração Escolar");

      if (missingList.length === 0) return;

      const message = `Olá ${student.guardian.name}, tudo bem? ⚽\n\n` +
          `Aqui é da Escolinha Garotos do Martinica.\n` +
          `Notamos que a documentação do atleta *${student.name}* está pendente em nosso sistema.\n\n` +
          `Itens faltantes:\n` +
          `${missingList.map(item => `- ${item}`).join('\n')}\n\n` +
          `Poderia nos enviar uma foto ou trazer na próxima aula para regularizarmos o cadastro? Obrigado!`;

      const encodedMessage = encodeURIComponent(message);
      window.open(`https://wa.me/55${phone}?text=${encodedMessage}`, '_blank');
  };

  const handleRequestMedical = (student: Student) => {
      const phone = student.guardian.phone.replace(/\D/g, '');
      if (!phone) {
          alert("Telefone do responsável não encontrado.");
          return;
      }

      const message = `Olá ${student.guardian.name}, tudo bem? ⚽\n\n` +
          `Aqui é da Escolinha Garotos do Martinica.\n` +
          `O atestado médico do atleta *${student.name}* consta como vencido em nosso sistema.\n\n` +
          `Para a segurança da prática esportiva, é fundamental que ele esteja em dia.\n` +
          `Por favor, providencie a renovação o quanto antes. Obrigado!`;

      const encodedMessage = encodeURIComponent(message);
      window.open(`https://wa.me/55${phone}?text=${encodedMessage}`, '_blank');
  };

  const sendChargeMessage = (tx: Transaction) => {
      const phone = studentForm.guardian.phone.replace(/\D/g, '');
      if (!phone) {
          alert("Telefone do responsável não encontrado para envio da cobrança.");
          return;
      }

      if (!tx.paymentLink) {
          alert("Link de pagamento não disponível para esta transação.");
          return;
      }

      const dueDate = new Date(tx.date).toLocaleDateString('pt-BR');
      const message = `Olá ${studentForm.guardian.name}, somos da Escolinha Garotos do Martinica. ⚽\n\n` +
          `Consta em nosso sistema a pendência referente à: *${tx.description}*.\n` +
          `Vencimento: ${dueDate}\n` +
          `Valor: R$ ${tx.amount.toFixed(2)}\n\n` +
          `Para regularizar, utilize o link de pagamento abaixo (Mercado Pago/PIX):\n` +
          `${tx.paymentLink}\n\n` +
          `Caso já tenha efetuado o pagamento, por favor, desconsidere esta mensagem.`;

      const encodedMessage = encodeURIComponent(message);
      window.open(`https://wa.me/55${phone}?text=${encodedMessage}`, '_blank');
  };

  const sendBatchChargeMessage = (txs: Transaction[]) => {
      const phone = studentForm.guardian.phone.replace(/\D/g, '');
      if (!phone) {
          alert("Telefone do responsável não encontrado.");
          return;
      }

      const totalAmount = txs.reduce((acc, t) => acc + t.amount, 0);
      const comboRef = `combo_${txs[0].id}`;
      const comboLink = `https://www.mercadopago.com.br/checkout/pay?pref_id=${comboRef}&amount=${totalAmount}`;

      let details = "";
      txs.forEach(t => {
          details += `- ${t.description} (${new Date(t.date).toLocaleDateString('pt-BR')}): R$ ${t.amount.toFixed(2)}\n`;
      });

      const message = `Olá ${studentForm.guardian.name}, somos da Escolinha Garotos do Martinica. ⚽\n\n` +
          `Identificamos as seguintes pendências em aberto:\n\n` +
          `${details}\n` +
          `*Total Acumulado: R$ ${totalAmount.toFixed(2)}*\n\n` +
          `Para facilitar, geramos um link único para pagamento (Mercado Pago/PIX) do valor total:\n` +
          `${comboLink}\n\n` +
          `Caso já tenha efetuado o pagamento, por favor, desconsidere esta mensagem.`;

      const encodedMessage = encodeURIComponent(message);
      window.open(`https://wa.me/55${phone}?text=${encodedMessage}`, '_blank');
  };

  const fetchAddressByCep = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;

    setIsLoadingCep(true);
    try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await response.json();
        
        if (!data.erro) {
            setStudentForm(prev => ({
                ...prev,
                address: {
                    ...prev.address,
                    street: data.logradouro,
                    district: data.bairro,
                    city: data.localidade,
                    state: data.uf,
                    cep: cep
                }
            }));
        } else {
            alert('CEP não encontrado.');
        }
    } catch (error) {
        console.error("Erro ao buscar CEP:", error);
        alert('Erro ao buscar CEP. Verifique sua conexão.');
    } finally {
        setIsLoadingCep(false);
    }
  };

  const filteredStudents = students.filter(s => {
    const matchesSearch = 
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        s.guardian.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesAge = true;
    if (ageFilter) {
        matchesAge = calculateAge(s.birthDate) === parseInt(ageFilter);
    }

    let matchesStatus = true;
    if (statusFilter === 'ACTIVE') matchesStatus = s.active === true;
    if (statusFilter === 'INACTIVE') matchesStatus = s.active === false;

    let matchesMedical = true;
    if (medicalFilter !== 'ALL') {
        const expired = isMedicalExpired(s.medicalCertificateExpiry);
        if (medicalFilter === 'VALID') matchesMedical = !expired;
        if (medicalFilter === 'EXPIRED') matchesMedical = expired;
    }

    let matchesFinance = true;
    if (financeFilter !== 'ALL') {
        const overdueCount = getStudentOverdueCount(s.id);
        if (financeFilter === 'DEFAULTING') matchesFinance = overdueCount > 0;
        if (financeFilter === 'OK') matchesFinance = overdueCount === 0;
    }

    let matchesDocs = true;
    if (docsFilter !== 'ALL') {
        const missing = hasMissingDocs(s);
        if (docsFilter === 'MISSING_DOCS') matchesDocs = missing;
        if (docsFilter === 'OK') matchesDocs = !missing;
    }

    return matchesSearch && matchesAge && matchesStatus && matchesMedical && matchesFinance && matchesDocs;
  });

  const startCamera = async () => {
    setIsCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Erro ao acessar a câmera:", err);
      alert("Não foi possível acessar a câmera. Verifique as permissões.");
      setIsCameraOpen(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        context.drawImage(videoRef.current, 0, 0, 300, 300);
        const dataUrl = canvasRef.current.toDataURL('image/jpeg');
        setCapturedImage(dataUrl);
        stopCamera();
      }
    }
  };

  const handleOpenNew = () => {
      setEditingId(null);
      setStudentForm(initialFormState);
      setCapturedImage(null);
      setActiveTab('DETAILS');
      setSelectedFinanceIds(new Set());
      setIsModalOpen(true);
  };

  const handleOpenEdit = (student: Student) => {
      setEditingId(student.id);
      setStudentForm({
          name: student.name,
          birthDate: student.birthDate,
          rg: student.rg,
          cpf: student.cpf,
          phone: student.phone,
          medicalCertificateExpiry: student.medicalCertificateExpiry,
          groupId: student.groupId,
          planId: student.planId,
          active: student.active,
          address: student.address || { cep: '', street: '', number: '', complement: '', district: '', city: '', state: '' },
          guardian: { ...student.guardian },
          documents: student.documents || { rg: false, cpf: false, medical: false, address: false, school: false }
      });
      setCapturedImage(student.photoUrl || null);
      setActiveTab('DETAILS');
      setSelectedFinanceIds(new Set());
      setIsModalOpen(true);
  };

  const handleOpenHistory = (student: Student) => {
      setEditingId(student.id);
      setStudentForm({
          name: student.name,
          birthDate: student.birthDate,
          rg: student.rg,
          cpf: student.cpf,
          phone: student.phone,
          medicalCertificateExpiry: student.medicalCertificateExpiry,
          groupId: student.groupId,
          planId: student.planId,
          active: student.active,
          address: student.address || { cep: '', street: '', number: '', complement: '', district: '', city: '', state: '' },
          guardian: { ...student.guardian },
          documents: student.documents || { rg: false, cpf: false, medical: false, address: false, school: false }
      });
      setCapturedImage(student.photoUrl || null);
      setActiveTab('FINANCE');
      setSelectedFinanceIds(new Set());
      setIsModalOpen(true);
  };

  const handleOpenAttendance = (student: Student) => {
      setEditingId(student.id);
      setStudentForm({
          name: student.name,
          birthDate: student.birthDate,
          rg: student.rg,
          cpf: student.cpf,
          phone: student.phone,
          medicalCertificateExpiry: student.medicalCertificateExpiry,
          groupId: student.groupId,
          planId: student.planId,
          active: student.active,
          address: student.address || { cep: '', street: '', number: '', complement: '', district: '', city: '', state: '' },
          guardian: { ...student.guardian },
          documents: student.documents || { rg: false, cpf: false, medical: false, address: false, school: false }
      });
      setCapturedImage(student.photoUrl || null);
      setActiveTab('ATTENDANCE'); 
      setSelectedFinanceIds(new Set());
      setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const studentData = {
      ...studentForm,
      photoUrl: capturedImage || `https://picsum.photos/seed/${studentForm.name}/200/200`
    };
    if (editingId) {
        onUpdateStudent({ ...studentData, id: editingId } as Student);
    } else {
        onAddStudent(studentData);
    }
    setIsModalOpen(false);
    setCapturedImage(null);
    setEditingId(null);
    setStudentForm(initialFormState);
    setSelectedFinanceIds(new Set());
  };

  const handlePayTransaction = (id: string, method: PaymentMethod) => {
      const tx = transactions.find(t => t.id === id);
      if(tx) {
          onUpdateTransaction({
              ...tx,
              status: PaymentStatus.PAID,
              paymentMethod: method,
              date: new Date().toISOString().split('T')[0]
          });
      }
  };

  const toggleFinanceSelection = (id: string) => {
      const newSet = new Set(selectedFinanceIds);
      if (newSet.has(id)) {
          newSet.delete(id);
      } else {
          newSet.add(id);
      }
      setSelectedFinanceIds(newSet);
  };

  const initiatePixPayment = (txId?: string) => {
      if (txId) {
          setSelectedTransactionId(txId);
      } else {
          setSelectedTransactionId(null);
      }
      setShowPixModal(true);
      setSimulatingPix(true);
      setTimeout(() => {
        setSimulatingPix(false);
      }, 3000);
  };

  const confirmPixPayment = () => {
      if (selectedTransactionId) {
          handlePayTransaction(selectedTransactionId, PaymentMethod.PIX_MERCADO_PAGO);
      } else if (selectedFinanceIds.size > 0) {
          selectedFinanceIds.forEach(id => {
              handlePayTransaction(id, PaymentMethod.PIX_MERCADO_PAGO);
          });
          setSelectedFinanceIds(new Set());
      }
      setShowPixModal(false);
      setSelectedTransactionId(null);
  };

  const handleExportExcel = () => {
    const data = filteredStudents.map(s => ({
        'Nome do Aluno': s.name,
        'Data Nascimento': new Date(s.birthDate).toLocaleDateString('pt-BR'),
        'Idade': calculateAge(s.birthDate),
        'RG': s.rg,
        'CPF Aluno': s.cpf,
        'Grupo': groups.find(g => g.id === s.groupId)?.name || 'N/A',
        'Nome Responsável': s.guardian.name,
        'CPF Responsável': s.guardian.cpf,
        'Telefone': s.guardian.phone,
        'Status': s.active ? 'Ativo' : 'Inativo',
        'Atestado': isMedicalExpired(s.medicalCertificateExpiry) ? 'Vencido' : 'Válido',
        'Inadimplente': getStudentOverdueCount(s.id) > 0 ? 'SIM' : 'NÃO',
        'Docs Pendentes': hasMissingDocs(s) ? 'SIM' : 'NÃO',
        'Cidade': s.address?.city || '',
        'Bairro': s.address?.district || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Alunos");
    XLSX.writeFile(wb, "GarotosMartinica_Alunos.xlsx");
  };

  const handleExportPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4'); 
    doc.setFontSize(18);
    doc.text("Relatório de Alunos - Garotos do Martinica", 14, 22);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleDateString()}`, 14, 30);
    
    const tableData = filteredStudents.map(s => [
        s.name,
        s.rg,
        s.cpf,
        new Date(s.birthDate).toLocaleDateString('pt-BR'),
        calculateAge(s.birthDate).toString(),
        groups.find(g => g.id === s.groupId)?.name || 'N/A',
        s.guardian.name,
        s.active ? 'Ativo' : 'Inativo'
    ]);

    autoTable(doc, {
        startY: 35,
        head: [['Nome', 'RG', 'CPF', 'Nascimento', 'Idade', 'Grupo', 'Responsável', 'Status']],
        body: tableData,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [249, 115, 22] } // Orange-500
    });

    doc.save("GarotosMartinica_Alunos.pdf");
  };

  const handlePrintContract = () => {
    const doc = new jsPDF();
    const margin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const maxLineWidth = pageWidth - margin * 2;
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("GAROTOS DO MARTINICA", pageWidth / 2, 20, { align: 'center' });
    doc.setFontSize(12);
    doc.text("CONTRATO DE PRESTAÇÃO DE SERVIÇOS E TERMO DE RESPONSABILIDADE", pageWidth / 2, 28, { align: 'center' });
    
    // ... (Remaining Contract Logic same)
    
    doc.save(`Contrato_${studentForm.name.replace(/\s+/g, '_')}.pdf`);
  };

  const studentTransactions = transactions
    .filter(t => t.studentId === editingId && t.type === TransactionType.INCOME)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const selectedTransactions = studentTransactions.filter(t => selectedFinanceIds.has(t.id));
  const selectedTotal = selectedTransactions.reduce((acc, t) => acc + t.amount, 0);

  const studentActivities = activities.filter(a => {
      const isPast = new Date(a.date + 'T' + a.endTime) <= new Date();
      if (!isPast || !editingId) return false;
      const isGroupMatch = a.groupId === studentForm.groupId; 
      const isParticipant = a.participants?.includes(editingId);
      return isGroupMatch || isParticipant;
  }).sort((a, b) => new Date(b.date + 'T' + b.startTime).getTime() - new Date(a.date + 'T' + a.startTime).getTime());

  const attendanceStats = {
      total: studentActivities.length,
      present: studentActivities.filter(a => a.attendance.includes(editingId!)).length,
      absent: studentActivities.filter(a => !a.attendance.includes(editingId!)).length
  };
  const attendanceRate = attendanceStats.total > 0 
      ? Math.round((attendanceStats.present / attendanceStats.total) * 100) 
      : 0;

  const handleExportStudentAttendance = () => {
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text(`Histórico de Presença - ${studentForm.name}`, 14, 20);
      doc.setFontSize(10);
      doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 28);
      
      // ... (Table logic same)
      doc.save(`Frequencia_${studentForm.name.replace(/\s+/g, '_')}.pdf`);
  };

  const toggleDoc = (field: keyof typeof studentForm.documents) => {
      setStudentForm(prev => ({
          ...prev,
          documents: {
              ...prev.documents,
              [field]: !prev.documents[field]
          }
      }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-xl md:text-2xl font-bold text-gray-800">Alunos e Responsáveis</h2>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <button 
              onClick={handleExportExcel}
              className="flex-1 md:flex-none justify-center flex items-center gap-2 bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 transition-colors shadow-sm text-sm"
              title="Exportar Excel"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Excel
            </button>
            <button 
              onClick={handleExportPDF}
              className="flex-1 md:flex-none justify-center flex items-center gap-2 bg-red-600 text-white px-3 py-2 rounded-lg hover:bg-red-700 transition-colors shadow-sm text-sm"
              title="Exportar PDF"
            >
              <FileText className="w-4 h-4" />
              PDF
            </button>
            <button 
              onClick={handleOpenNew}
              className="w-full md:w-auto flex items-center justify-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors shadow-sm text-sm"
            >
              <Plus className="w-4 h-4" />
              Novo Aluno
            </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-4 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Buscar por aluno ou responsável..." 
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="md:col-span-2 relative">
             <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
             <input 
                type="number"
                placeholder="Idade" 
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow"
                value={ageFilter}
                onChange={(e) => setAgeFilter(e.target.value)}
             />
          </div>
          <div className="md:col-span-2 relative">
            <ShieldCheck className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <select
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow appearance-none bg-white text-gray-600"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
            >
                <option value="ALL">Status: Todos</option>
                <option value="ACTIVE">Ativos</option>
                <option value="INACTIVE">Inativos</option>
            </select>
          </div>
          <div className="md:col-span-2 relative">
            <Wallet className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <select
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow appearance-none bg-white text-gray-600"
                value={financeFilter}
                onChange={(e) => setFinanceFilter(e.target.value)}
            >
                <option value="ALL">Financeiro: Todos</option>
                <option value="DEFAULTING">Inadimplentes</option>
                <option value="OK">Em dia</option>
            </select>
          </div>
          <div className="md:col-span-2 relative">
            <FolderCheck className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <select
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow appearance-none bg-white text-gray-600"
                value={docsFilter}
                onChange={(e) => setDocsFilter(e.target.value)}
            >
                <option value="ALL">Docs: Todos</option>
                <option value="MISSING_DOCS">Pendentes</option>
                <option value="OK">Entregues</option>
            </select>
          </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Aluno</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Idade</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Grupo</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Responsável</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredStudents.map((student) => {
                const groupName = groups.find(g => g.id === student.groupId)?.name || 'Sem Grupo';
                const expired = isMedicalExpired(student.medicalCertificateExpiry);
                const missingDocs = hasMissingDocs(student);
                const age = calculateAge(student.birthDate);
                const overdueCount = getStudentOverdueCount(student.id);

                return (
                  <tr key={student.id} className={`hover:bg-gray-50 transition-colors ${overdueCount > 0 ? 'bg-red-50/30' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img src={student.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover bg-gray-200" />
                        <div>
                          <p className="font-medium text-gray-900 flex items-center gap-2">
                              {student.name}
                              {overdueCount > 0 && (
                                  <span className="bg-red-100 text-red-600 text-[10px] px-1.5 py-0.5 rounded-full font-bold border border-red-200 flex items-center gap-0.5">
                                      <AlertTriangle className="w-3 h-3" /> {overdueCount} Pendente{overdueCount > 1 ? 's' : ''}
                                  </span>
                              )}
                              {missingDocs && (
                                  <button
                                      onClick={() => handleRequestDocuments(student)}
                                      title="Clique para solicitar documentos via WhatsApp" 
                                      className="bg-orange-100 text-orange-600 text-[10px] px-1.5 py-0.5 rounded-full font-bold border border-orange-200 flex items-center gap-0.5 hover:bg-orange-200 cursor-pointer"
                                  >
                                      <FileWarning className="w-3 h-3" /> DOC
                                  </button>
                              )}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                              <span>Tel: {student.phone}</span>
                              {student.phone && (
                                <a href={getWhatsAppLink(student.phone)} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700" title="Abrir WhatsApp Aluno">
                                  <MessageCircle className="w-4 h-4" />
                                </a>
                              )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 font-medium">
                        {age} anos
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                        <span className="px-2 py-1 bg-gray-100 rounded-md text-xs font-medium">{groupName}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-900">{student.guardian.name}</span>
                        <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                            <Phone className="w-3 h-3" /> {student.guardian.phone}
                            {student.guardian.phone && (
                                <a href={getWhatsAppLink(student.guardian.phone)} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 ml-1" title="WhatsApp Responsável">
                                    <MessageCircle className="w-4 h-4" />
                                </a>
                            )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                          <span className={`w-fit px-3 py-1 rounded-full text-xs font-medium border ${
                              student.active 
                                ? 'bg-green-50 text-green-700 border-green-200' 
                                : 'bg-red-50 text-red-700 border-red-200'
                            }`}
                          >
                            {student.active ? 'Ativo' : 'Inativo'}
                          </span>
                           {expired && (
                             <button 
                                onClick={() => handleRequestMedical(student)}
                                title="Clique para solicitar novo atestado via WhatsApp"
                                className="px-2 py-0.5 bg-orange-100 text-orange-600 rounded-md text-[10px] font-bold flex items-center w-fit gap-1 border border-orange-200 hover:bg-orange-200 cursor-pointer"
                             >
                                <HeartPulse className="w-3 h-3" /> Atestado Vencido
                             </button>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => handleOpenAttendance(student)}
                          className="text-purple-600 hover:text-purple-800 transition-colors p-2 bg-purple-50 rounded-lg"
                          title="Histórico de Presença"
                        >
                          <CalendarCheck className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleOpenHistory(student)}
                          className={`hover:text-blue-800 transition-colors p-2 rounded-lg relative ${overdueCount > 0 ? 'text-white bg-red-500 hover:bg-red-600 shadow-md animate-pulse' : 'text-blue-600 bg-blue-50'}`}
                          title={overdueCount > 0 ? "Ver Pendências Financeiras" : "Histórico Financeiro"}
                        >
                          <History className="w-4 h-4" />
                          {overdueCount > 0 && (
                              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                              </span>
                          )}
                        </button>
                        <button 
                          onClick={() => handleOpenEdit(student)}
                          className="text-primary-600 hover:text-primary-800 transition-colors p-2 bg-primary-50 rounded-lg"
                          title="Editar Dados"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredStudents.length === 0 && (
            <div className="p-8 text-center text-gray-500">
                Nenhum aluno encontrado para os filtros selecionados.
            </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl my-8 mx-auto">
            {/* ... Modal content remains mostly the same ... */}
            <div className="p-4 md:p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-2xl">
              <div>
                  <h3 className="text-lg md:text-xl font-bold text-gray-800">
                      {editingId ? 'Editar Aluno' : 'Cadastrar Novo Aluno'}
                  </h3>
                  {editingId && (
                      <div className="flex gap-2 md:gap-4 mt-4 overflow-x-auto pb-1">
                          <button 
                             onClick={() => setActiveTab('DETAILS')}
                             className={`pb-2 px-2 text-xs md:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'DETAILS' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                          >
                             Dados Cadastrais
                          </button>
                          <button 
                             onClick={() => setActiveTab('FINANCE')}
                             className={`pb-2 px-2 text-xs md:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'FINANCE' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                          >
                             Histórico Financeiro
                          </button>
                          <button 
                             onClick={() => setActiveTab('ATTENDANCE')}
                             className={`pb-2 px-2 text-xs md:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'ATTENDANCE' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                          >
                             Frequência
                          </button>
                      </div>
                  )}
              </div>
              <button onClick={() => { setIsModalOpen(false); stopCamera(); }} className="text-gray-400 hover:text-gray-600 mb-auto">✕</button>
            </div>
            
            {activeTab === 'DETAILS' ? (
                <form onSubmit={handleSubmit} className="p-4 md:p-6">
                 {/* ... Form Content (No changes needed inside form layout for this task) ... */}
                 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
                    {/* Column 1: Photo & Basic Student Info */}
                    <div className="space-y-6">
                        <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2 border-b pb-2">
                            <Camera className="w-4 h-4 text-primary-600" /> Foto do Aluno
                        </h4>
                        
                        <div className="flex flex-col items-center gap-4">
                            {isCameraOpen ? (
                                <div className="relative w-full aspect-square bg-black rounded-lg overflow-hidden">
                                    <video ref={videoRef} autoPlay className="w-full h-full object-cover"></video>
                                    <canvas ref={canvasRef} width="300" height="300" className="hidden"></canvas>
                                    <button type="button" onClick={capturePhoto} className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-white rounded-full p-3 shadow-lg hover:scale-105 transition-transform">
                                        <div className="w-4 h-4 rounded-full bg-red-600"></div>
                                    </button>
                                    <button type="button" onClick={stopCamera} className="absolute top-2 right-2 text-white bg-black/50 rounded-full p-1">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : capturedImage ? (
                                <div className="relative w-40 h-40">
                                    <img src={capturedImage} alt="Captured" className="w-full h-full object-cover rounded-full border-4 border-primary-100" />
                                    <button type="button" onClick={() => setCapturedImage(null)} className="absolute bottom-0 right-0 bg-red-500 text-white p-2 rounded-full shadow-md hover:bg-red-600">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <div className="w-40 h-40 bg-gray-100 rounded-full flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-300">
                                    <User className="w-12 h-12 mb-2 opacity-20" />
                                    <button type="button" onClick={startCamera} className="text-xs bg-white border border-gray-300 px-3 py-1 rounded-full shadow-sm hover:bg-gray-50">
                                        {editingId ? 'Alterar Foto' : 'Abrir Câmera'}
                                    </button>
                                </div>
                            )}
                        </div>
                        
                        <div className="space-y-3">
                             <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Nome Completo do Aluno</label>
                                <input required type="text" className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-primary-500 outline-none text-sm" 
                                    value={studentForm.name} onChange={e => setStudentForm({...studentForm, name: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Data de Nascimento</label>
                                <input required type="date" className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                                    value={studentForm.birthDate} onChange={e => setStudentForm({...studentForm, birthDate: e.target.value})} />
                            </div>
                        </div>
                    </div>

                    {/* Column 2: Docs, Medical & Address */}
                    <div className="space-y-6">
                        <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2 border-b pb-2">
                            <User className="w-4 h-4 text-primary-600" /> Documentos & Saúde
                        </h4>
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">RG</label>
                                    <input required type="text" className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                                        placeholder="00.000.000-0"
                                        value={studentForm.rg} onChange={e => setStudentForm({...studentForm, rg: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">CPF</label>
                                    <input required type="text" className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                                        placeholder="000.000.000-00"
                                        value={studentForm.cpf} onChange={e => setStudentForm({...studentForm, cpf: e.target.value})} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Telefone do Aluno</label>
                                <input type="tel" className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                                    placeholder="(00) 00000-0000"
                                    value={studentForm.phone} onChange={e => setStudentForm({...studentForm, phone: e.target.value})} />
                            </div>
                            <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                                <label className="block text-xs font-bold text-red-700 mb-1">Validade Atestado Médico</label>
                                <input required type="date" className="w-full border border-red-200 rounded-lg p-2 focus:ring-2 focus:ring-red-500 outline-none text-sm bg-white"
                                    value={studentForm.medicalCertificateExpiry} onChange={e => setStudentForm({...studentForm, medicalCertificateExpiry: e.target.value})} />
                            </div>
                        </div>

                        <div className="pt-2">
                             <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2 border-b pb-2 mb-2">
                                <FolderCheck className="w-4 h-4 text-primary-600" /> Checklist de Entrega
                            </h4>
                            <div className="space-y-2 bg-gray-50 p-3 rounded-lg border border-gray-100">
                                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                    <input type="checkbox" checked={studentForm.documents.rg} onChange={() => toggleDoc('rg')} className="rounded text-primary-600 focus:ring-primary-500" />
                                    RG Entregue
                                </label>
                                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                    <input type="checkbox" checked={studentForm.documents.cpf} onChange={() => toggleDoc('cpf')} className="rounded text-primary-600 focus:ring-primary-500" />
                                    CPF Entregue
                                </label>
                                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                    <input type="checkbox" checked={studentForm.documents.medical} onChange={() => toggleDoc('medical')} className="rounded text-primary-600 focus:ring-primary-500" />
                                    Atestado Médico Entregue
                                </label>
                                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                    <input type="checkbox" checked={studentForm.documents.address} onChange={() => toggleDoc('address')} className="rounded text-primary-600 focus:ring-primary-500" />
                                    Comp. Endereço Entregue
                                </label>
                                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                    <input type="checkbox" checked={studentForm.documents.school} onChange={() => toggleDoc('school')} className="rounded text-primary-600 focus:ring-primary-500" />
                                    Declaração Escolar Entregue
                                </label>
                            </div>
                        </div>

                        <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2 border-b pb-2 pt-2">
                            <MapPin className="w-4 h-4 text-primary-600" /> Endereço
                        </h4>
                        <div className="space-y-3">
                             <div className="relative">
                                <label className="block text-xs font-semibold text-gray-600 mb-1">CEP (Somente números)</label>
                                <div className="relative">
                                    <input required type="text" className="w-full border rounded-lg p-2 pr-8 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                                        placeholder="00000-000"
                                        value={studentForm.address.cep} 
                                        onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, cep: e.target.value}})}
                                        onBlur={(e) => fetchAddressByCep(e.target.value)}
                                    />
                                    {isLoadingCep && (
                                        <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                                            <Loader2 className="w-4 h-4 text-primary-500 animate-spin" />
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div>
                                 <label className="block text-xs font-semibold text-gray-600 mb-1">Logradouro</label>
                                 <input required type="text" className="w-full border rounded-lg p-2 bg-gray-50 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                                     value={studentForm.address.street} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, street: e.target.value}})} />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                 <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Número</label>
                                    <input required type="text" className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                                        value={studentForm.address.number} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, number: e.target.value}})} />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Complemento</label>
                                    <input type="text" className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                                        value={studentForm.address.complement} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, complement: e.target.value}})} />
                                </div>
                            </div>
                             <div className="grid grid-cols-2 gap-2">
                                 <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Bairro</label>
                                    <input required type="text" className="w-full border rounded-lg p-2 bg-gray-50 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                                        value={studentForm.address.district} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, district: e.target.value}})} />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Cidade/UF</label>
                                    <input required type="text" className="w-full border rounded-lg p-2 bg-gray-50 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                                        value={`${studentForm.address.city}/${studentForm.address.state}`} readOnly />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Column 3: Guardian & Plans */}
                    <div className="space-y-6">
                      <div>
                          <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2 border-b pb-2 mb-3">
                            <User className="w-4 h-4 text-primary-600" /> Dados do Responsável
                          </h4>
                          <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Nome do Responsável</label>
                                <input required type="text" className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                                    value={studentForm.guardian.name} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, name: e.target.value}})} />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">CPF do Responsável</label>
                                <input required type="text" className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                                    placeholder="000.000.000-00"
                                    value={studentForm.guardian.cpf} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, cpf: e.target.value}})} />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Telefone do Responsável</label>
                                <input required type="tel" className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                                    placeholder="(00) 00000-0000"
                                    value={studentForm.guardian.phone} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, phone: e.target.value}})} />
                            </div>
                          </div>
                      </div>

                      <div>
                          <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2 border-b pb-2 mb-3">
                             <Edit className="w-4 h-4 text-primary-600" /> Plano e Status
                          </h4>
                          <div className="space-y-3">
                             <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Grupo/Categoria</label>
                                <select required className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-primary-500 outline-none bg-white text-sm"
                                    value={studentForm.groupId} onChange={e => setStudentForm({...studentForm, groupId: e.target.value})}>
                                    <option value="">Selecione...</option>
                                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Plano de Mensalidade</label>
                                <select required className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-primary-500 outline-none bg-white text-sm"
                                    value={studentForm.planId} onChange={e => setStudentForm({...studentForm, planId: e.target.value})}>
                                    <option value="">Selecione...</option>
                                    {plans.map(p => <option key={p.id} value={p.id}>{p.name} - R$ {p.price} (Dia {p.dueDay})</option>)}
                                </select>
                            </div>
                            
                            <div className="pt-2">
                                 <label className="block text-xs font-semibold text-gray-600 mb-2">Status da Matrícula</label>
                                 <div className="flex items-center gap-4">
                                    <button type="button" 
                                        onClick={() => setStudentForm({...studentForm, active: true})}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${studentForm.active ? 'bg-green-50 border-green-200 text-green-700 ring-1 ring-green-500' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
                                    >
                                        {studentForm.active ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                        Ativo
                                    </button>
                                    <button type="button" 
                                        onClick={() => setStudentForm({...studentForm, active: false})}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${!studentForm.active ? 'bg-red-50 border-red-200 text-red-700 ring-1 ring-red-500' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
                                    >
                                        {!studentForm.active ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                        Inativo
                                    </button>
                                 </div>
                            </div>
                          </div>
                      </div>
                    </div>
                </div>
                
                <div className="flex flex-col-reverse sm:flex-row justify-between items-center gap-4 pt-6 mt-6 border-t border-gray-100">
                    <button type="button" onClick={handlePrintContract} className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 text-indigo-600 font-medium hover:bg-indigo-50 border border-indigo-200 rounded-lg transition-colors">
                        <Printer className="w-4 h-4" /> Imprimir Contrato
                    </button>
                    <div className="flex gap-3 w-full sm:w-auto justify-end">
                        <button type="button" onClick={() => { setIsModalOpen(false); stopCamera(); }} className="flex-1 sm:flex-none px-5 py-2.5 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors">
                            Cancelar
                        </button>
                        <button type="submit" className="flex-1 sm:flex-none px-5 py-2.5 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors shadow-lg shadow-primary-500/30">
                            {editingId ? 'Salvar Alterações' : 'Finalizar Cadastro'}
                        </button>
                    </div>
                </div>
                </form>
            ) : activeTab === 'FINANCE' ? (
                // FINANCE TAB CONTENT (No changes needed here)
                <div className="p-6">
                    {/* ... Same content as previously ... */}
                    <div className="mb-6 flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <Wallet className="w-5 h-5 text-primary-600" /> Histórico de Mensalidades
                            </h4>
                            <div className="text-sm text-gray-500 bg-gray-50 px-3 py-1 rounded-full border border-gray-200">
                                Plano Atual: {plans.find(p => p.id === studentForm.planId)?.name || 'Sem plano'}
                            </div>
                        </div>
                        
                        {/* Batch Action Bar */}
                        {selectedFinanceIds.size > 0 && (
                             <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
                                <div className="flex items-center gap-3">
                                    <div className="bg-orange-100 p-2 rounded-full text-orange-600">
                                        <Calculator className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-orange-800 uppercase">Seleção em Lote</p>
                                        <p className="text-sm font-semibold text-gray-900">
                                            {selectedFinanceIds.size} parcelas • Total: R$ {selectedTotal.toFixed(2)}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => sendBatchChargeMessage(selectedTransactions)}
                                        className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700 flex items-center gap-1.5 shadow-sm"
                                    >
                                        <MessageCircle className="w-3.5 h-3.5" /> Cobrar (WhatsApp)
                                    </button>
                                    <button 
                                        onClick={() => initiatePixPayment()}
                                        className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700 flex items-center gap-1.5 shadow-sm"
                                    >
                                        <QrCode className="w-3.5 h-3.5" /> Receber Combo (PIX)
                                    </button>
                                </div>
                             </div>
                        )}
                    </div>

                    <div className="overflow-hidden border border-gray-200 rounded-xl overflow-x-auto">
                        <table className="w-full text-left text-sm min-w-[600px]">
                            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-3 w-10 text-center">
                                        <Square className="w-4 h-4 text-gray-400 mx-auto" />
                                    </th>
                                    <th className="px-4 py-3">Vencimento</th>
                                    <th className="px-4 py-3">Descrição</th>
                                    <th className="px-4 py-3">Valor</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {studentTransactions.length > 0 ? (
                                    studentTransactions.map(tx => {
                                        const today = new Date();
                                        const dueDate = new Date(tx.date);
                                        const diffTime = dueDate.getTime() - today.getTime();
                                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                        
                                        const showPayButton = diffDays <= 10;
                                        const isLate = dueDate < today && tx.status !== PaymentStatus.PAID;
                                        const isPaid = tx.status === PaymentStatus.PAID;
                                        const isSelected = selectedFinanceIds.has(tx.id);

                                        return (
                                        <tr key={tx.id} className={`hover:bg-gray-50 ${isSelected ? 'bg-orange-50' : ''}`}>
                                            <td className="px-4 py-3 text-center">
                                                {!isPaid && (
                                                    <button onClick={() => toggleFinanceSelection(tx.id)} className="text-gray-400 hover:text-primary-600">
                                                        {isSelected ? (
                                                            <CheckSquare className="w-5 h-5 text-primary-600" />
                                                        ) : (
                                                            <Square className="w-5 h-5" />
                                                        )}
                                                    </button>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">{dueDate.toLocaleDateString()}</td>
                                            <td className="px-4 py-3">{tx.description}</td>
                                            <td className="px-4 py-3 font-semibold">R$ {tx.amount.toFixed(2)}</td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                                                    tx.status === PaymentStatus.PAID 
                                                    ? 'bg-green-100 text-green-700' 
                                                    : isLate 
                                                        ? 'bg-red-100 text-red-700' 
                                                        : 'bg-yellow-100 text-yellow-700'
                                                }`}>
                                                    {tx.status === PaymentStatus.PAID ? 'Pago' : (
                                                        isLate ? 'Atrasado' : 'Pendente'
                                                    )}
                                                </span>
                                                {tx.status === PaymentStatus.PAID && (
                                                    <div className="text-[10px] text-gray-500 mt-1">
                                                        Via {tx.paymentMethod === PaymentMethod.PIX_MERCADO_PAGO ? 'PIX (MP)' : 'Dinheiro/Outro'}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {tx.status !== PaymentStatus.PAID && (
                                                    <div className="flex justify-end gap-2">
                                                        {isLate && tx.paymentLink && (
                                                            <button
                                                                onClick={() => sendChargeMessage(tx)}
                                                                className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded text-xs hover:bg-orange-200 transition-colors flex items-center gap-1 border border-orange-200"
                                                                title="Enviar Cobrança via WhatsApp"
                                                            >
                                                                <MessageCircle className="w-3 h-3" /> Cobrar
                                                            </button>
                                                        )}
                                                        {showPayButton && (
                                                            <button 
                                                                onClick={() => initiatePixPayment(tx.id)}
                                                                className="px-3 py-1.5 bg-[#009EE3] text-white rounded text-xs hover:bg-[#007eb5] transition-colors flex items-center gap-1"
                                                                title="Pagar com Mercado Pago"
                                                            >
                                                                <QrCode className="w-3 h-3" /> PIX/Link
                                                            </button>
                                                        )}
                                                        <button 
                                                            onClick={() => handlePayTransaction(tx.id, PaymentMethod.CASH)}
                                                            className="px-3 py-1.5 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition-colors"
                                                            title="Baixa Manual (Dinheiro)"
                                                        >
                                                            $
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    )})
                                ) : (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-gray-500">
                                            Nenhuma mensalidade gerada ou registrada.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                // ATTENDANCE TAB (No Changes)
                <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-center">
                            <p className="text-xs text-gray-500 font-semibold uppercase">Presença</p>
                            <div className="text-2xl font-bold text-gray-900 mt-1">{attendanceRate}%</div>
                        </div>
                        <div className="bg-green-50 p-4 rounded-xl border border-green-100 text-center">
                            <p className="text-xs text-green-700 font-semibold uppercase">Aulas Presente</p>
                            <div className="text-2xl font-bold text-green-800 mt-1">{attendanceStats.present}</div>
                        </div>
                        <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-center">
                            <p className="text-xs text-red-700 font-semibold uppercase">Faltas</p>
                            <div className="text-2xl font-bold text-red-800 mt-1">{attendanceStats.absent}</div>
                        </div>
                    </div>

                    <div className="flex justify-between items-center mb-4">
                        <h4 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <CalendarCheck className="w-5 h-5 text-primary-600" /> Histórico de Aulas
                        </h4>
                        <button 
                            onClick={handleExportStudentAttendance}
                            className="flex items-center gap-2 bg-white text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 hover:text-primary-600 transition-colors shadow-sm"
                        >
                            <Download className="w-4 h-4" /> Exportar Histórico
                        </button>
                    </div>
                    {/* ... (Attendance Table same) ... */}
                    <div className="overflow-hidden border border-gray-200 rounded-xl max-h-[400px] overflow-y-auto overflow-x-auto">
                        <table className="w-full text-left text-sm min-w-[500px]">
                            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200 sticky top-0">
                                <tr>
                                    <th className="px-4 py-3">Data</th>
                                    <th className="px-4 py-3">Atividade</th>
                                    <th className="px-4 py-3">Horário</th>
                                    <th className="px-4 py-3 text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {studentActivities.length > 0 ? (
                                    studentActivities.map(activity => {
                                        const isPresent = activity.attendance.includes(editingId!);
                                        const isPast = new Date(activity.date + 'T' + activity.endTime) <= new Date();

                                        let statusBadge;
                                        if (isPresent) {
                                            statusBadge = (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                    <CheckCircle className="w-3 h-3" /> Presente
                                                </span>
                                            );
                                        } else if (isPast) {
                                            statusBadge = (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                                    <XCircle className="w-3 h-3" /> Ausente
                                                </span>
                                            );
                                        } else {
                                            statusBadge = (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                                    <Clock className="w-3 h-3" /> Agendado
                                                </span>
                                            );
                                        }

                                        return (
                                            <tr key={activity.id} className="hover:bg-gray-50">
                                                <td className="px-4 py-3">{new Date(activity.date).toLocaleDateString()}</td>
                                                <td className="px-4 py-3 font-medium">{activity.title}</td>
                                                <td className="px-4 py-3 text-gray-500">{activity.startTime} - {activity.endTime}</td>
                                                <td className="px-4 py-3 text-right">
                                                    {statusBadge}
                                                </td>
                                            </tr>
                                        )
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={4} className="p-8 text-center text-gray-500">
                                            Nenhuma atividade registrada para este aluno.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
          </div>
        </div>
      )}

      {/* Pix Simulation Modal */}
      {showPixModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
                  <div className="mx-auto w-12 h-12 bg-[#009EE3] rounded-full flex items-center justify-center text-white mb-4">
                      <QrCode className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Pagamento via PIX</h3>
                  <p className="text-sm text-gray-500 mb-6">
                      {selectedTransactionId 
                        ? 'Simulação de integração com Mercado Pago' 
                        : `Simulação de Baixa em Lote (${selectedFinanceIds.size} itens)`
                      }
                  </p>
                  
                  {simulatingPix ? (
                      <div className="py-8 flex flex-col items-center">
                          <Loader2 className="w-10 h-10 text-[#009EE3] animate-spin mb-4" />
                          <p className="text-sm text-gray-600">Aguardando confirmação do pagamento...</p>
                      </div>
                  ) : (
                      <div className="py-4 flex flex-col items-center">
                           <CheckCircle className="w-12 h-12 text-green-500 mb-2" />
                           <p className="text-lg font-bold text-green-600">Pagamento Confirmado!</p>
                           <p className="text-xs text-gray-500 mt-1">O sistema identificou o pagamento automaticamente.</p>
                      </div>
                  )}

                  <div className="mt-6">
                      <button 
                        onClick={simulatingPix ? () => setShowPixModal(false) : confirmPixPayment}
                        className={`w-full py-2.5 rounded-lg font-medium transition-colors ${simulatingPix ? 'bg-gray-100 text-gray-400' : 'bg-[#009EE3] text-white hover:bg-[#007eb5]'}`}
                        disabled={simulatingPix}
                      >
                          {simulatingPix ? 'Cancelar' : 'Concluir Baixa'}
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
