
import React, { useState, useRef, useEffect } from 'react';
import { Student, Group, Plan, Transaction, TransactionType, PaymentStatus, PaymentMethod, Activity, User, UserRole } from '../types';
import { Search, Plus, Phone, User as UserIcon, Edit, Camera, X, CheckSquare, Square, FileSpreadsheet, FileText, Filter, HeartPulse, ShieldCheck, MessageCircle, MapPin, Loader2, Printer, Wallet, QrCode, CheckCircle, Clock, Link as LinkIcon, History, CalendarCheck, XCircle, Download, Calculator, AlertTriangle, FileWarning, FolderCheck, Upload, RefreshCw, Copy, Send, Lock } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { checkMPPaymentStatus, createPixPayment, getPaymentStatus } from '../services/mercadoPago';

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
  initialFilter?: string;
  currentUser?: User | null;
}

export const StudentsPage: React.FC<StudentsPageProps> = ({ students, groups, plans, transactions, activities, onAddStudent, onBatchAddStudents, onUpdateStudent, onUpdateTransaction, initialFilter, currentUser }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [ageFilter, setAgeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [medicalFilter, setMedicalFilter] = useState('ALL');
  const [financeFilter, setFinanceFilter] = useState('ALL'); 
  const [docsFilter, setDocsFilter] = useState('ALL'); 

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'DETAILS' | 'FINANCE' | 'ATTENDANCE'>('DETAILS');
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Payment PIX State
  const [showPixModal, setShowPixModal] = useState(false);
  const [pixLoading, setPixLoading] = useState(false);
  const [pixData, setPixData] = useState<{ qrCode: string; qrCodeBase64: string; id: number } | null>(null);
  
  // Sending PIX via Whatsapp loading state
  const [sendingPixId, setSendingPixId] = useState<string | null>(null);

  // Background Monitoring State for PIX
  const [monitoredPayments, setMonitoredPayments] = useState<{ mpId: number, txIds: string[] }[]>([]);

  // Multi-select State for Finance
  const [selectedFinanceIds, setSelectedFinanceIds] = useState<Set<string>>(new Set());

  // Camera States
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  // CEP Loading State
  const [isLoadingCep, setIsLoadingCep] = useState(false);
  
  // Excel Upload Input Ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Check status loading
  const [checkingStatusId, setCheckingStatusId] = useState<string | null>(null);

  const isGuardian = currentUser?.role === UserRole.RESPONSAVEL;

  // Inicializar filtro se passado via prop
  useEffect(() => {
    if (initialFilter === 'DEFAULTING') {
        setFinanceFilter('DEFAULTING');
    } else if (initialFilter === 'MISSING_DOCS') {
        setDocsFilter('MISSING_DOCS');
    }
  }, [initialFilter]);

  // Polling unificado para pagamentos PIX (Background)
  useEffect(() => {
    if (monitoredPayments.length === 0) return;

    const interval = setInterval(async () => {
        const remainingMonitored: typeof monitoredPayments = [];
        let somethingChanged = false;

        for (const payment of monitoredPayments) {
            try {
                const status = await getPaymentStatus(payment.mpId);
                
                if (status === 'approved') {
                    // Pagamento Confirmado!
                    somethingChanged = true;
                    payment.txIds.forEach(id => {
                        handlePayTransaction(id, PaymentMethod.PIX_MERCADO_PAGO);
                    });

                    // Se este pagamento for o que está no modal agora, fecha o modal
                    if (pixData && pixData.id === payment.mpId) {
                         confirmPixPaymentSuccess();
                    }
                } else if (status === 'rejected' || status === 'cancelled') {
                    somethingChanged = true;
                } else {
                    remainingMonitored.push(payment);
                }
            } catch (e) {
                remainingMonitored.push(payment);
            }
        }
        
        if (somethingChanged) {
             setMonitoredPayments(remainingMonitored);
        }

    }, 3000); 

    return () => clearInterval(interval);
  }, [monitoredPayments, pixData, transactions]); 


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

  const checkStatus = async (tx: Transaction) => {
      if (!tx.paymentLink && !tx.externalReference) {
          alert("Esta transação não possui vínculo com Mercado Pago.");
          return;
      }
      
      const refToCheck = tx.externalReference;
      
      if (!refToCheck) {
          alert("Referência de pagamento não encontrada. Gere uma nova cobrança.");
          return;
      }

      setCheckingStatusId(tx.id);
      const status = await checkMPPaymentStatus(refToCheck);
      
      if (status === 'approved') {
          handlePayTransaction(tx.id, PaymentMethod.PIX_MERCADO_PAGO);
          alert("Pagamento CONFIRMADO pelo Mercado Pago! Baixa efetuada.");
      } else if (status === 'pending') {
          alert("Pagamento ainda pendente.");
      } else if (status === 'rejected' || status === 'cancelled') {
          alert("Pagamento foi rejeitado/cancelado.");
      } else {
          alert("Não foi possível verificar o status.");
      }
      setCheckingStatusId(null);
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

  const handleSendPixToWhatsApp = async (tx: Transaction) => {
      const phone = studentForm.guardian.phone.replace(/\D/g, '');
      if (!phone) {
          alert("Telefone do responsável não encontrado.");
          return;
      }
      
      if (!studentForm.guardian.cpf) {
          alert("CPF do responsável é obrigatório para gerar PIX.");
          return;
      }

      setSendingPixId(tx.id);

      try {
          const externalRef = tx.externalReference || crypto.randomUUID();
          
          const mpResult = await createPixPayment({
              title: tx.description,
              price: tx.amount,
              externalReference: externalRef,
              payer: {
                  name: studentForm.guardian.name,
                  email: studentForm.guardian.email,
                  phone: studentForm.guardian.phone,
                  identification: { type: 'CPF', number: studentForm.guardian.cpf }
              }
          });

          if (mpResult && mpResult.qrCode) {
              const code = mpResult.qrCode;
              setMonitoredPayments(prev => [...prev, { mpId: mpResult.id, txIds: [tx.id] }]);

              const message = `Olá ${studentForm.guardian.name}, aqui é da Garotos do Martinica. ⚽\n\n` +
                  `Referente a: *${tx.description}*\n` +
                  `Valor: R$ ${tx.amount.toFixed(2)}\n\n` +
                  `Segue o código PIX Copia e Cola para pagamento:\n\n` +
                  `${code}\n\n` +
                  `Ao efetuar o pagamento, o sistema identificará automaticamente.`;

              const encodedMessage = encodeURIComponent(message);
              window.open(`https://wa.me/55${phone}?text=${encodedMessage}`, '_blank');
          } else {
              alert("Erro ao gerar o código PIX. Verifique se o CPF do responsável é válido.");
          }
      } catch (e) {
          console.error(e);
          alert("Erro de comunicação com o sistema de pagamento.");
      } finally {
          setSendingPixId(null);
      }
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
    if(isGuardian) return; 

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

  const initiatePixPayment = async (txId?: string) => {
      let amount = 0;
      let description = '';
      let externalRef = '';
      
      const idsToPay: string[] = [];

      if (txId) {
          const tx = transactions.find(t => t.id === txId);
          if (!tx) return;
          amount = tx.amount;
          description = tx.description;
          externalRef = tx.externalReference || crypto.randomUUID(); 
          idsToPay.push(txId);
      } else if (selectedFinanceIds.size > 0) {
          const selectedTxs = transactions.filter(t => selectedFinanceIds.has(t.id));
          amount = selectedTxs.reduce((acc, t) => acc + t.amount, 0);
          description = `Combo de ${selectedTxs.length} mensalidades`;
          externalRef = `combo_${Date.now()}`;
          selectedTxs.forEach(t => idsToPay.push(t.id));
      } else {
          return;
      }
      
      if (!studentForm.guardian.cpf) {
          alert("CPF do responsável é obrigatório para gerar PIX.");
          return;
      }

      setPixLoading(true);
      setShowPixModal(true);
      setPixData(null);

      try {
          const result = await createPixPayment({
              title: description,
              price: amount,
              externalReference: externalRef,
              payer: {
                  name: studentForm.guardian.name,
                  email: studentForm.guardian.email,
                  phone: studentForm.guardian.phone,
                  identification: { type: 'CPF', number: studentForm.guardian.cpf }
              }
          });

          if (result) {
              setPixData(result);
              setMonitoredPayments(prev => [...prev, { mpId: result.id, txIds: idsToPay }]);
          } else {
              alert("Erro ao gerar QR Code PIX. Verifique se o CPF é válido.");
              setShowPixModal(false);
          }
      } catch (error) {
          console.error(error);
          alert("Erro na comunicação com Mercado Pago.");
          setShowPixModal(false);
      } finally {
          setPixLoading(false);
      }
  };
  
  const confirmPixPaymentSuccess = () => {
      setSelectedFinanceIds(new Set());
      setShowPixModal(false);
      setPixData(null);
  };

  const copyPixCode = () => {
      if (pixData?.qrCode) {
          navigator.clipboard.writeText(pixData.qrCode);
          alert("Código Copiado!");
      }
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

  const handleDownloadTemplate = () => {
      const templateData = [{
          'Nome Completo': 'Ex: João Silva',
          'Data Nascimento (dd/mm/aaaa)': '20/05/2010',
          'RG': '00.000.000-0',
          'CPF': '000.000.000-00',
          'Telefone': '(11) 99999-9999',
          'Nome Responsável': 'Maria Silva',
          'CPF Responsável': '111.111.111-11',
          'Telefone Responsável': '(11) 98888-8888',
          'Validade Atestado (dd/mm/aaaa)': '01/01/2025',
          'CEP': '12345-678',
          'Logradouro': 'Rua Exemplo',
          'Número': '123',
          'Complemento': 'Apto 1',
          'Bairro': 'Centro',
          'Cidade': 'Cidade',
          'Estado': 'SP',
          'Grupo (Nome Exato)': 'Sub-11',
          'Plano (Nome Exato)': 'Básico'
      }];

      const ws = XLSX.utils.json_to_sheet(templateData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Template Importacao");
      XLSX.writeFile(wb, "Template_Importacao_Completo.xlsx");
  };

  const parseExcelDate = (value: any): string => {
      if (!value) return '';
      if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}$/)) {
          return value;
      }
      if (typeof value === 'string' && value.includes('/')) {
          const parts = value.split('/');
          if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      if (typeof value === 'number') {
          const date = new Date(Math.round((value - 25569) * 86400 * 1000));
          return date.toISOString().split('T')[0];
      }
      return '';
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
          try {
              const data = new Uint8Array(evt.target?.result as ArrayBuffer);
              const wb = XLSX.read(data, { type: 'array' });
              
              const wsname = wb.SheetNames[0];
              const ws = wb.Sheets[wsname];
              const jsonData = XLSX.utils.sheet_to_json(ws);

              if (jsonData.length === 0) {
                  alert("Arquivo vazio ou formato inválido.");
                  return;
              }

              const newStudents: Omit<Student, 'id'>[] = jsonData.map((row: any) => {
                  const groupName = row['Grupo (Nome Exato)'];
                  const planName = row['Plano (Nome Exato)'];
                  
                  const matchedGroup = groupName ? groups.find(g => g.name.toLowerCase() === String(groupName).toLowerCase().trim()) : undefined;
                  const matchedPlan = planName ? plans.find(p => p.name.toLowerCase() === String(planName).toLowerCase().trim()) : undefined;

                  return {
                    name: row['Nome Completo'] || 'Sem Nome',
                    birthDate: parseExcelDate(row['Data Nascimento (dd/mm/aaaa)'] || row['Data Nascimento (YYYY-MM-DD)']),
                    rg: row['RG'] ? String(row['RG']) : '',
                    cpf: row['CPF'] ? String(row['CPF']) : '',
                    phone: row['Telefone'] ? String(row['Telefone']) : '',
                    medicalCertificateExpiry: parseExcelDate(row['Validade Atestado (dd/mm/aaaa)'] || row['Validade Atestado (YYYY-MM-DD)']),
                    photoUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(row['Nome Completo'] || 'User')}`,
                    groupId: matchedGroup ? matchedGroup.id : '',
                    planId: matchedPlan ? matchedPlan.id : '',
                    active: true,
                    address: {
                        cep: row['CEP'] ? String(row['CEP']) : '', 
                        street: row['Logradouro'] ? String(row['Logradouro']) : '', 
                        number: row['Número'] ? String(row['Número']) : '', 
                        complement: row['Complemento'] ? String(row['Complemento']) : '', 
                        district: row['Bairro'] ? String(row['Bairro']) : '', 
                        city: row['Cidade'] ? String(row['Cidade']) : '', 
                        state: row['Estado'] ? String(row['Estado']) : ''
                    },
                    guardian: {
                        name: row['Nome Responsável'] || '',
                        phone: row['Telefone Responsável'] ? String(row['Telefone Responsável']) : '',
                        email: '',
                        cpf: row['CPF Responsável'] ? String(row['CPF Responsável']) : ''
                    },
                    documents: {
                        rg: false, cpf: false, medical: false, address: false, school: false
                    }
                  }
              });

              if (confirm(`Encontrados ${newStudents.length} alunos. Deseja importar?`)) {
                  onBatchAddStudents(newStudents);
              }
          } catch (error) {
              console.error(error);
              alert("Erro ao ler o arquivo Excel. Verifique se está usando o Template correto.");
          }
          if (fileInputRef.current) fileInputRef.current.value = '';
      };
      reader.readAsArrayBuffer(file);
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
        headStyles: { fillColor: [249, 115, 22] } 
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
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    
    const today = new Date().toLocaleDateString('pt-BR');
    const groupName = groups.find(g => g.id === studentForm.groupId)?.name || '________________';
    
    const headerText = `
    CONTRATANTE (RESPONSÁVEL):
    Nome: ${studentForm.guardian.name}
    CPF: ${studentForm.guardian.cpf}
    Telefone: ${studentForm.guardian.phone}
    
    ALUNO(A):
    Nome: ${studentForm.name}
    RG: ${studentForm.rg} | CPF: ${studentForm.cpf}
    Data de Nascimento: ${new Date(studentForm.birthDate).toLocaleDateString('pt-BR')}
    Grupo/Categoria: ${groupName}
    `;
    
    doc.text(headerText, margin, 40);
    
    const bodyText = `
    Eu, CONTRATANTE, abaixo qualificado, na qualidade de RESPONSÁVEL pelo (ALUNO) acima citado, venho solicitar e formalizar a inscrição, neste TERMO DE CONTRATAÇÃO, na UNIDADE, do ALUNO acima qualificado, declarando e assumindo, nesta oportunidade:
    
    1 - Eximir a escola de eventuais acidentes, tais como, lesões, machucados, torções etc., decorrente da prática do futebol. Em caso de ocorrência é dever da escola prestar os primeiros socorros. Em caso de acidente grave fica autorizado o atendimento no posto/hospital publico mais próximo;
    
    2 - Apresentar o ATESTADO MÉDICO em tempo hábil (30 dias), além de declarar que o aluno goza de perfeita saúde, não havendo qualquer impedimento ao se estado de saúde para a prática esportiva;
    
    3 - O Aluno não treinara sem que esteja DEVIDAMENTE UNIFORMIZADO. Portanto, é obrigatório o uso do kit completo, além de chuteiras Society (obs.: É proibido o uso de chuteiras com travas em nosso campo);
    
    4 - Os eventuais problemas de ordem DISCIPLINAR serão resolvidos pela direção da escola e posteriormente comunicados ao responsável pelo aluno;
    
    5 - Autorizo a utilização da imagem do referido aluno nas mídias sociais do Garotos do Martinica / Martinica Oficial, site e demais ações publicitárias com o intuito de promover o trabalho desenvolvido pela entidade;
    
    6 - Caso o atleta acumule duas ou mais mensalidades em atraso, o mesmo terá o acesso aos treinamentos automaticamente suspenso, permanecendo o bloqueio até a regularização dos débitos pendentes;
    
    7 - Alunos com 2 ou mais mensalidades atrasadas terão seus cadastro suspenso até regularização.
    `;
    
    const splitBody = doc.splitTextToSize(bodyText, maxLineWidth);
    doc.text(splitBody, margin, 90);
    
    doc.text(`Data: ${today}`, margin, 240);
    
    doc.text("___________________________________________________", pageWidth / 2, 260, { align: 'center' });
    doc.text("Assinatura do Responsável", pageWidth / 2, 265, { align: 'center' });

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
      
      const tableData = studentActivities.map(activity => {
          const isPresent = activity.attendance.includes(editingId!);
          return [
              new Date(activity.date).toLocaleDateString('pt-BR'),
              activity.title,
              activity.startTime + ' - ' + activity.endTime,
              isPresent ? 'PRESENTE' : 'AUSENTE'
          ];
      });

      autoTable(doc, {
          startY: 35,
          head: [['Data', 'Atividade', 'Horário', 'Status']],
          body: tableData,
          didParseCell: (data) => {
              if (data.section === 'body' && data.column.index === 3) {
                  if (data.cell.raw === 'AUSENTE') {
                      data.cell.styles.textColor = [220, 38, 38];
                  } else {
                      data.cell.styles.textColor = [22, 163, 74];
                  }
              }
          }
      });
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
      {/* ... (Search and Headers) ... */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-xl md:text-2xl font-bold text-gray-800">{isGuardian ? 'Meus Filhos' : 'Alunos e Responsáveis'}</h2>
        
        {/* HIDE ACTION BUTTONS FOR GUARDIANS */}
        {!isGuardian && (
            <div className="flex flex-wrap gap-2 w-full md:w-auto">
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleImportExcel} 
                    accept=".xlsx, .xls" 
                    className="hidden" 
                />
                <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 md:flex-none justify-center flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-sm"
                title="Importar de Excel"
                >
                <Upload className="w-4 h-4" />
                Importar
                </button>
                <button 
                onClick={handleDownloadTemplate}
                className="flex-1 md:flex-none justify-center flex items-center gap-2 bg-gray-600 text-white px-3 py-2 rounded-lg hover:bg-gray-700 transition-colors shadow-sm text-sm"
                title="Baixar Modelo Excel"
                >
                <FileSpreadsheet className="w-4 h-4" />
                Modelo
                </button>
                <button 
                onClick={handleExportExcel}
                className="flex-1 md:flex-none justify-center flex items-center gap-2 bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 transition-colors shadow-sm text-sm"
                title="Exportar Excel"
                >
                <Download className="w-4 h-4" />
                Exportar
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
        )}
      </div>

      {/* Filters */}
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
          {/* Other filters can remain visible for Guardians to filter their own children if they have many */}
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
                              {missingDocs && !isGuardian && (
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
                              {student.phone && !isGuardian && (
                                <a href={getWhatsAppLink(student.phone)} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700" title="Abrir WhatsApp Aluno">
                                  <MessageCircle className="w-4 h-4" />
                                </a>
                              )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 font-medium">{age} anos</td>
                    <td className="px-6 py-4 text-sm text-gray-600"><span className="px-2 py-1 bg-gray-100 rounded-md text-xs font-medium">{groupName}</span></td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-900">{student.guardian.name}</span>
                        <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                            <Phone className="w-3 h-3" /> {student.guardian.phone}
                            {student.guardian.phone && !isGuardian && (
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
                           {expired && !isGuardian && (
                             <button 
                                onClick={() => handleRequestMedical(student)}
                                className="px-2 py-0.5 bg-orange-100 text-orange-600 rounded-md text-[10px] font-bold flex items-center w-fit gap-1 border border-orange-200 hover:bg-orange-200 cursor-pointer"
                             >
                                <HeartPulse className="w-3 h-3" /> Atestado Vencido
                             </button>
                        )}
                        {expired && isGuardian && (
                            <span className="text-[10px] text-orange-600 font-bold flex items-center gap-1">
                                <HeartPulse className="w-3 h-3" /> Atestado Vencido
                            </span>
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
                        </button>
                        
                        {!isGuardian ? (
                            <button 
                            onClick={() => handleOpenEdit(student)}
                            className="text-primary-600 hover:text-primary-800 transition-colors p-2 bg-primary-50 rounded-lg"
                            title="Editar Dados"
                            >
                            <Edit className="w-4 h-4" />
                            </button>
                        ) : (
                            <button 
                            onClick={() => handleOpenEdit(student)}
                            className="text-gray-400 hover:text-gray-600 transition-colors p-2 bg-gray-50 rounded-lg"
                            title="Ver Dados"
                            >
                            <UserIcon className="w-4 h-4" />
                            </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-2 sm:p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl max-h-[95vh] flex flex-col">
             {/* Header */}
             <div className="p-4 md:p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-2xl flex-shrink-0">
              <div>
                  <h3 className="text-lg md:text-xl font-bold text-gray-800">
                      {isGuardian ? 'Ficha do Aluno (Visualização)' : (editingId ? 'Editar Aluno' : 'Cadastrar Novo Aluno')}
                  </h3>
                  {editingId && (
                      <div className="flex gap-2 md:gap-4 mt-4 overflow-x-auto pb-1">
                          <button onClick={() => setActiveTab('DETAILS')} className={`pb-2 px-2 text-xs md:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'DETAILS' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Dados Cadastrais</button>
                          <button onClick={() => setActiveTab('FINANCE')} className={`pb-2 px-2 text-xs md:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'FINANCE' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Histórico Financeiro</button>
                          <button onClick={() => setActiveTab('ATTENDANCE')} className={`pb-2 px-2 text-xs md:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'ATTENDANCE' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Frequência</button>
                      </div>
                  )}
              </div>
              <button onClick={() => { setIsModalOpen(false); stopCamera(); }} className="text-gray-400 hover:text-gray-600 mb-auto">✕</button>
            </div>
            
            {activeTab === 'DETAILS' ? (
                // FORM 
                <div className="flex-1 overflow-y-auto">
                    <form id="student-form" onSubmit={handleSubmit} className="p-4 md:p-6">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                            {/* Column 1 */}
                            <div className="space-y-4">
                                <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2 border-b pb-2"><Camera className="w-4 h-4 text-primary-600" /> Foto do Aluno</h4>
                                <div className="flex flex-col items-center gap-4">
                                    {isCameraOpen ? (
                                        <div className="relative w-full aspect-square max-w-[250px] bg-black rounded-lg overflow-hidden">
                                            <video ref={videoRef} autoPlay className="w-full h-full object-cover"></video>
                                            <canvas ref={canvasRef} width="300" height="300" className="hidden"></canvas>
                                            <button type="button" onClick={capturePhoto} className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-white rounded-full p-3 shadow-lg hover:scale-105 transition-transform"><div className="w-4 h-4 rounded-full bg-red-600"></div></button>
                                            <button type="button" onClick={stopCamera} className="absolute top-2 right-2 text-white bg-black/50 rounded-full p-1"><X className="w-4 h-4" /></button>
                                        </div>
                                    ) : capturedImage ? (
                                        <div className="relative w-32 h-32 md:w-40 md:h-40">
                                            <img src={capturedImage} alt="Captured" className="w-full h-full object-cover rounded-full border-4 border-primary-100" />
                                            {!isGuardian && <button type="button" onClick={() => setCapturedImage(null)} className="absolute bottom-0 right-0 bg-red-500 text-white p-2 rounded-full shadow-md hover:bg-red-600"><X className="w-4 h-4" /></button>}
                                        </div>
                                    ) : (
                                        <div className="w-32 h-32 md:w-40 md:h-40 bg-gray-100 rounded-full flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-300">
                                            <UserIcon className="w-12 h-12 mb-2 opacity-20" />
                                            {!isGuardian && <button type="button" onClick={startCamera} className="text-xs bg-white border border-gray-300 px-3 py-1 rounded-full shadow-sm hover:bg-gray-50">{editingId ? 'Alterar Foto' : 'Abrir Câmera'}</button>}
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-3">
                                    <div><label className="block text-xs font-semibold text-gray-600 mb-1">Nome Completo do Aluno</label><input required disabled={isGuardian} type="text" className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-primary-500 outline-none text-sm disabled:bg-gray-100" value={studentForm.name} onChange={e => setStudentForm({...studentForm, name: e.target.value})} /></div>
                                    <div><label className="block text-xs font-semibold text-gray-600 mb-1">Data de Nascimento</label><input required disabled={isGuardian} type="date" className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-primary-500 outline-none text-sm disabled:bg-gray-100" value={studentForm.birthDate} onChange={e => setStudentForm({...studentForm, birthDate: e.target.value})} /></div>
                                </div>
                            </div>
                            {/* Middle Column */}
                            <div className="space-y-4">
                                <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2 border-b pb-2"><UserIcon className="w-4 h-4 text-primary-600" /> Documentos & Saúde</h4>
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div><label className="block text-xs font-semibold text-gray-600 mb-1">RG</label><input type="text" disabled={isGuardian} className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-primary-500 outline-none text-sm disabled:bg-gray-100" placeholder="00.000.000-0" value={studentForm.rg} onChange={e => setStudentForm({...studentForm, rg: e.target.value})} /></div>
                                        <div><label className="block text-xs font-semibold text-gray-600 mb-1">CPF</label><input type="text" disabled={isGuardian} className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-primary-500 outline-none text-sm disabled:bg-gray-100" placeholder="000.000.000-00" value={studentForm.cpf} onChange={e => setStudentForm({...studentForm, cpf: e.target.value})} /></div>
                                    </div>
                                    <div><label className="block text-xs font-semibold text-gray-600 mb-1">Telefone do Aluno</label><input type="tel" disabled={isGuardian} className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-primary-500 outline-none text-sm disabled:bg-gray-100" placeholder="(00) 00000-0000" value={studentForm.phone} onChange={e => setStudentForm({...studentForm, phone: e.target.value})} /></div>
                                    <div className="bg-red-50 p-3 rounded-lg border border-red-100"><label className="block text-xs font-bold text-red-700 mb-1">Validade Atestado Médico</label><input required disabled={isGuardian} type="date" className="w-full border border-red-200 rounded-lg p-2 focus:ring-2 focus:ring-red-500 outline-none text-sm bg-white disabled:bg-gray-100" value={studentForm.medicalCertificateExpiry} onChange={e => setStudentForm({...studentForm, medicalCertificateExpiry: e.target.value})} /></div>
                                </div>
                                <div className="pt-2">
                                    <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2 border-b pb-2 mb-2"><FolderCheck className="w-4 h-4 text-primary-600" /> Checklist de Entrega</h4>
                                    <div className="space-y-2 bg-gray-50 p-3 rounded-lg border border-gray-100">
                                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"><input type="checkbox" disabled={isGuardian} checked={studentForm.documents.rg} onChange={() => toggleDoc('rg')} className="rounded text-primary-600 focus:ring-primary-500" />RG Entregue</label>
                                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"><input type="checkbox" disabled={isGuardian} checked={studentForm.documents.cpf} onChange={() => toggleDoc('cpf')} className="rounded text-primary-600 focus:ring-primary-500" />CPF Entregue</label>
                                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"><input type="checkbox" disabled={isGuardian} checked={studentForm.documents.medical} onChange={() => toggleDoc('medical')} className="rounded text-primary-600 focus:ring-primary-500" />Atestado Médico Entregue</label>
                                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"><input type="checkbox" disabled={isGuardian} checked={studentForm.documents.address} onChange={() => toggleDoc('address')} className="rounded text-primary-600 focus:ring-primary-500" />Comp. Endereço Entregue</label>
                                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"><input type="checkbox" disabled={isGuardian} checked={studentForm.documents.school} onChange={() => toggleDoc('school')} className="rounded text-primary-600 focus:ring-primary-500" />Declaração Escolar Entregue</label>
                                    </div>
                                </div>
                                <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2 border-b pb-2 pt-2"><MapPin className="w-4 h-4 text-primary-600" /> Endereço</h4>
                                <div className="space-y-3">
                                    <div className="relative"><label className="block text-xs font-semibold text-gray-600 mb-1">CEP (Somente números)</label><div className="relative"><input required disabled={isGuardian} type="text" className="w-full border rounded-lg p-2 pr-8 focus:ring-2 focus:ring-primary-500 outline-none text-sm disabled:bg-gray-100" placeholder="00000-000" value={studentForm.address.cep} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, cep: e.target.value}})} onBlur={(e) => fetchAddressByCep(e.target.value)} />{isLoadingCep && (<div className="absolute right-2 top-1/2 transform -translate-y-1/2"><Loader2 className="w-4 h-4 text-primary-500 animate-spin" /></div>)}</div></div>
                                    <div><label className="block text-xs font-semibold text-gray-600 mb-1">Logradouro</label><input required disabled={isGuardian} type="text" className="w-full border rounded-lg p-2 bg-gray-50 focus:ring-2 focus:ring-primary-500 outline-none text-sm disabled:bg-gray-100" value={studentForm.address.street} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, street: e.target.value}})} /></div>
                                    <div className="grid grid-cols-2 gap-2"><div><label className="block text-xs font-semibold text-gray-600 mb-1">Número</label><input required disabled={isGuardian} type="text" className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-primary-500 outline-none text-sm disabled:bg-gray-100" value={studentForm.address.number} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, number: e.target.value}})} /></div><div><label className="block text-xs font-semibold text-gray-600 mb-1">Complemento</label><input type="text" disabled={isGuardian} className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-primary-500 outline-none text-sm disabled:bg-gray-100" value={studentForm.address.complement} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, complement: e.target.value}})} /></div></div>
                                    <div className="grid grid-cols-2 gap-2"><div><label className="block text-xs font-semibold text-gray-600 mb-1">Bairro</label><input required disabled={isGuardian} type="text" className="w-full border rounded-lg p-2 bg-gray-50 focus:ring-2 focus:ring-primary-500 outline-none text-sm disabled:bg-gray-100" value={studentForm.address.district} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, district: e.target.value}})} /></div><div><label className="block text-xs font-semibold text-gray-600 mb-1">Cidade/UF</label><input required disabled={isGuardian} type="text" className="w-full border rounded-lg p-2 bg-gray-50 focus:ring-2 focus:ring-primary-500 outline-none text-sm disabled:bg-gray-100" value={`${studentForm.address.city}/${studentForm.address.state}`} readOnly /></div></div>
                                </div>
                            </div>
                            {/* Right Column */}
                            <div className="space-y-4">
                                <div><h4 className="text-sm font-bold text-gray-900 flex items-center gap-2 border-b pb-2 mb-3"><UserIcon className="w-4 h-4 text-primary-600" /> Dados do Responsável</h4><div className="space-y-3"><div><label className="block text-xs font-semibold text-gray-600 mb-1">Nome do Responsável</label><input required disabled={isGuardian} type="text" className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-primary-500 outline-none text-sm disabled:bg-gray-100" value={studentForm.guardian.name} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, name: e.target.value}})} /></div><div><label className="block text-xs font-semibold text-gray-600 mb-1">CPF do Responsável</label><input required disabled={isGuardian} type="text" className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-primary-500 outline-none text-sm disabled:bg-gray-100" placeholder="000.000.000-00" value={studentForm.guardian.cpf} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, cpf: e.target.value}})} /></div><div><label className="block text-xs font-semibold text-gray-600 mb-1">Telefone do Responsável</label><input required disabled={isGuardian} type="tel" className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-primary-500 outline-none text-sm disabled:bg-gray-100" placeholder="(00) 00000-0000" value={studentForm.guardian.phone} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, phone: e.target.value}})} /></div></div></div>
                                <div><h4 className="text-sm font-bold text-gray-900 flex items-center gap-2 border-b pb-2 mb-3"><Edit className="w-4 h-4 text-primary-600" /> Plano e Status</h4><div className="space-y-3"><div><label className="block text-xs font-semibold text-gray-600 mb-1">Grupo/Categoria</label><select required disabled={isGuardian} className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-primary-500 outline-none bg-white text-sm disabled:bg-gray-100" value={studentForm.groupId} onChange={e => setStudentForm({...studentForm, groupId: e.target.value})}><option value="">Selecione...</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div><div><label className="block text-xs font-semibold text-gray-600 mb-1">Plano de Mensalidade</label><select required disabled={isGuardian} className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-primary-500 outline-none bg-white text-sm disabled:bg-gray-100" value={studentForm.planId} onChange={e => setStudentForm({...studentForm, planId: e.target.value})}><option value="">Selecione...</option>{plans.map(p => <option key={p.id} value={p.id}>{p.name} - R$ {p.price} (Dia {p.dueDay})</option>)}</select></div><div className="pt-2"><label className="block text-xs font-semibold text-gray-600 mb-2">Status da Matrícula</label><div className="flex items-center gap-4"><button disabled={isGuardian} type="button" onClick={() => setStudentForm({...studentForm, active: true})} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${studentForm.active ? 'bg-green-50 border-green-200 text-green-700 ring-1 ring-green-500' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>{studentForm.active ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}Ativo</button><button disabled={isGuardian} type="button" onClick={() => setStudentForm({...studentForm, active: false})} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${!studentForm.active ? 'bg-red-50 border-red-200 text-red-700 ring-1 ring-red-500' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>{!studentForm.active ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}Inativo</button></div></div></div></div>
                            </div>
                        </div>
                    </form>
                </div>
            ) : activeTab === 'FINANCE' ? (
                // FINANCE TAB
                <div className="p-6 flex-1 overflow-y-auto">
                    <div className="mb-6 flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <Wallet className="w-5 h-5 text-primary-600" /> Histórico de Mensalidades
                            </h4>
                            <div className="text-sm text-gray-500 bg-gray-50 px-3 py-1 rounded-full border border-gray-200">
                                Plano Atual: {plans.find(p => p.id === studentForm.planId)?.name || 'Sem plano'}
                            </div>
                        </div>
                        {selectedFinanceIds.size > 0 && (
                             <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
                                <div className="flex items-center gap-3">
                                    <div className="bg-orange-100 p-2 rounded-full text-orange-600"><Calculator className="w-5 h-5" /></div>
                                    <div><p className="text-xs font-bold text-orange-800 uppercase">Seleção em Lote</p><p className="text-sm font-semibold text-gray-900">{selectedFinanceIds.size} parcelas • Total: R$ {selectedTotal.toFixed(2)}</p></div>
                                </div>
                                <div className="flex gap-2">
                                    {!isGuardian && (
                                        <button onClick={() => sendBatchChargeMessage(selectedTransactions)} className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700 flex items-center gap-1.5 shadow-sm"><MessageCircle className="w-3.5 h-3.5" /> Cobrar (WhatsApp)</button>
                                    )}
                                    <button onClick={() => initiatePixPayment()} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700 flex items-center gap-1.5 shadow-sm"><QrCode className="w-3.5 h-3.5" /> Pagar Combo (PIX)</button>
                                </div>
                             </div>
                        )}
                    </div>

                    <div className="overflow-hidden border border-gray-200 rounded-xl overflow-x-auto">
                        <table className="w-full text-left text-sm min-w-[600px]">
                            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-3 w-10 text-center"><Square className="w-4 h-4 text-gray-400 mx-auto" /></th>
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
                                        const isChecking = checkingStatusId === tx.id;
                                        const isSendingPix = sendingPixId === tx.id;

                                        return (
                                        <tr key={tx.id} className={`hover:bg-gray-50 ${isSelected ? 'bg-orange-50' : ''}`}>
                                            <td className="px-4 py-3 text-center">
                                                {!isPaid && (
                                                    <button onClick={() => toggleFinanceSelection(tx.id)} className="text-gray-400 hover:text-primary-600">
                                                        {isSelected ? <CheckSquare className="w-5 h-5 text-primary-600" /> : <Square className="w-5 h-5" />}
                                                    </button>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">{dueDate.toLocaleDateString()}</td>
                                            <td className="px-4 py-3">{tx.description}</td>
                                            <td className="px-4 py-3 font-semibold">R$ {tx.amount.toFixed(2)}</td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-1 rounded-md text-xs font-medium ${tx.status === PaymentStatus.PAID ? 'bg-green-100 text-green-700' : isLate ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                    {tx.status === PaymentStatus.PAID ? 'Pago' : (isLate ? 'Atrasado' : 'Pendente')}
                                                </span>
                                                {tx.status === PaymentStatus.PAID && (<div className="text-[10px] text-gray-500 mt-1">Via {tx.paymentMethod === PaymentMethod.PIX_MERCADO_PAGO ? 'PIX (MP)' : 'Dinheiro/Outro'}</div>)}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {tx.status !== PaymentStatus.PAID && (
                                                    <div className="flex justify-end gap-2">
                                                        {isLate && tx.paymentLink && !isGuardian && (<button onClick={() => sendChargeMessage(tx)} className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded text-xs hover:bg-orange-200 transition-colors flex items-center gap-1 border border-orange-200" title="Enviar Cobrança via WhatsApp"><MessageCircle className="w-3 h-3" /> Cobrar</button>)}
                                                        {(tx.paymentLink || tx.externalReference) && !isGuardian && (
                                                            <button onClick={() => checkStatus(tx)} disabled={isChecking} className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 transition-colors flex items-center gap-1 border border-blue-200" title="Verificar Pagamento no Mercado Pago">
                                                                {isChecking ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}Verificar
                                                            </button>
                                                        )}
                                                        {showPayButton && (<button onClick={() => initiatePixPayment(tx.id)} className="px-3 py-1.5 bg-[#009EE3] text-white rounded text-xs hover:bg-[#007eb5] transition-colors flex items-center gap-1" title="Pagar com Mercado Pago"><QrCode className="w-3 h-3" /> Pagar (PIX)</button>)}
                                                        
                                                        {showPayButton && !isGuardian && (
                                                            <button 
                                                                onClick={() => handleSendPixToWhatsApp(tx)}
                                                                disabled={isSendingPix}
                                                                className="px-3 py-1.5 bg-green-500 text-white rounded text-xs hover:bg-green-600 transition-colors flex items-center gap-1"
                                                                title="Gerar PIX e Enviar no WhatsApp"
                                                            >
                                                                {isSendingPix ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                                                                PIX Zap
                                                            </button>
                                                        )}

                                                        {!isGuardian && <button onClick={() => handlePayTransaction(tx.id, PaymentMethod.CASH)} className="px-3 py-1.5 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition-colors" title="Baixa Manual (Dinheiro)">$</button>}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    )})
                                ) : (
                                    <tr><td colSpan={6} className="p-8 text-center text-gray-500">Nenhuma mensalidade gerada ou registrada.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                // ATTENDANCE TAB (Unchanged)
                 <div className="p-6 flex-1 overflow-y-auto">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-center"><p className="text-xs text-gray-500 font-semibold uppercase">Presença</p><div className="text-2xl font-bold text-gray-900 mt-1">{attendanceRate}%</div></div>
                        <div className="bg-green-50 p-4 rounded-xl border border-green-100 text-center"><p className="text-xs text-green-700 font-semibold uppercase">Aulas Presente</p><div className="text-2xl font-bold text-green-800 mt-1">{attendanceStats.present}</div></div>
                        <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-center"><p className="text-xs text-red-700 font-semibold uppercase">Faltas</p><div className="text-2xl font-bold text-red-800 mt-1">{attendanceStats.absent}</div></div>
                    </div>
                    <div className="flex justify-between items-center mb-4"><h4 className="text-lg font-bold text-gray-800 flex items-center gap-2"><CalendarCheck className="w-5 h-5 text-primary-600" /> Histórico de Aulas</h4>
                    {!isGuardian && <button onClick={handleExportStudentAttendance} className="flex items-center gap-2 bg-white text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 hover:text-primary-600 transition-colors shadow-sm"><Download className="w-4 h-4" /> Exportar Histórico</button>}
                    </div>
                    <div className="overflow-hidden border border-gray-200 rounded-xl max-h-[400px] overflow-y-auto overflow-x-auto">
                        <table className="w-full text-left text-sm min-w-[500px]">
                            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200 sticky top-0"><tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Atividade</th><th className="px-4 py-3">Horário</th><th className="px-4 py-3 text-right">Status</th></tr></thead>
                            <tbody className="divide-y divide-gray-100">
                                {studentActivities.length > 0 ? (
                                    studentActivities.map(activity => {
                                        const isPresent = activity.attendance.includes(editingId!);
                                        const isPast = new Date(activity.date + 'T' + activity.endTime) <= new Date();
                                        let statusBadge;
                                        if (isPresent) { statusBadge = (<span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle className="w-3 h-3" /> Presente</span>); } 
                                        else if (isPast) { statusBadge = (<span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"><XCircle className="w-3 h-3" /> Ausente</span>); } 
                                        else { statusBadge = (<span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600"><Clock className="w-3 h-3" /> Agendado</span>); }
                                        return (<tr key={activity.id} className="hover:bg-gray-50"><td className="px-4 py-3">{new Date(activity.date).toLocaleDateString()}</td><td className="px-4 py-3 font-medium">{activity.title}</td><td className="px-4 py-3 text-gray-500">{activity.startTime} - {activity.endTime}</td><td className="px-4 py-3 text-right">{statusBadge}</td></tr>)})
                                ) : (<tr><td colSpan={4} className="p-8 text-center text-gray-500">Nenhuma atividade registrada para este aluno.</td></tr>)}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            
            {/* Footer with Actions (Only for DETAILS form tab) */}
            {activeTab === 'DETAILS' && (
                 <div className="p-4 md:p-6 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex-shrink-0">
                    <div className="flex flex-col-reverse sm:flex-row justify-between items-center gap-4">
                        <button type="button" onClick={handlePrintContract} className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 text-indigo-600 font-medium hover:bg-indigo-50 border border-indigo-200 rounded-lg transition-colors"><Printer className="w-4 h-4" /> Imprimir Contrato</button>
                        <div className="flex gap-3 w-full sm:w-auto justify-end">
                            <button type="button" onClick={() => { setIsModalOpen(false); stopCamera(); }} className="flex-1 sm:flex-none px-5 py-2.5 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors">
                                {isGuardian ? 'Fechar' : 'Cancelar'}
                            </button>
                            {!isGuardian && (
                                <button 
                                    type="submit" 
                                    form="student-form" // Connects to the form ID
                                    className="flex-1 sm:flex-none px-5 py-2.5 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors shadow-lg shadow-primary-500/30"
                                >
                                    {editingId ? 'Salvar Alterações' : 'Finalizar Cadastro'}
                                </button>
                            )}
                        </div>
                    </div>
                 </div>
            )}
          </div>
        </div>
      )}

      {/* Pix Modal (REAL) */}
      {showPixModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
                  <div className="mx-auto w-12 h-12 bg-[#009EE3] rounded-full flex items-center justify-center text-white mb-4">
                      <QrCode className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Pagamento via PIX</h3>
                  <p className="text-sm text-gray-500 mb-4">
                      {pixLoading 
                        ? 'Gerando código PIX...' 
                        : 'Escaneie o QR Code ou copie o código abaixo'}
                  </p>
                  
                  {pixLoading ? (
                      <div className="py-8 flex flex-col items-center">
                          <Loader2 className="w-10 h-10 text-[#009EE3] animate-spin mb-4" />
                          <p className="text-sm text-gray-600">Conectando com Mercado Pago...</p>
                      </div>
                  ) : pixData ? (
                      <div className="flex flex-col items-center">
                           <div className="bg-white border border-gray-200 p-2 rounded-lg mb-4">
                               <img src={`data:image/png;base64,${pixData.qrCodeBase64}`} alt="QR Code PIX" className="w-48 h-48 object-contain" />
                           </div>
                           
                           <div className="w-full bg-gray-50 p-3 rounded-lg border border-gray-200 mb-4 relative">
                                <p className="text-[10px] text-gray-500 break-all font-mono text-left h-12 overflow-hidden">{pixData.qrCode}</p>
                                <button 
                                    onClick={copyPixCode}
                                    className="absolute top-2 right-2 p-1.5 bg-white shadow-sm border border-gray-200 rounded text-gray-600 hover:text-[#009EE3]"
                                    title="Copiar Código"
                                >
                                    <Copy className="w-4 h-4" />
                                </button>
                           </div>

                           <div className="flex items-center gap-2 text-xs text-green-600 font-medium animate-pulse mb-4">
                               <RefreshCw className="w-3 h-3 animate-spin" /> Aguardando pagamento...
                           </div>
                           <p className="text-[10px] text-gray-400 mb-4">O sistema identificará o pagamento automaticamente.</p>
                      </div>
                  ) : (
                      <div className="py-4 text-red-500 text-sm">Erro ao gerar PIX. Tente novamente.</div>
                  )}

                  <div className="mt-2">
                      <button 
                        onClick={() => { setShowPixModal(false); setPixData(null); }}
                        className="w-full py-2.5 bg-gray-100 text-gray-600 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                      >
                          Fechar / Cancelar
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
