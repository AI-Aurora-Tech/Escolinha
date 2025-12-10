
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Student, Group, Plan, Transaction, TransactionType, PaymentStatus, PaymentMethod, Activity, User, UserRole, DocumentStatus, StudentDocuments } from '../types';
import { Search, Plus, Phone, User as UserIcon, Edit, Camera, X, CheckSquare, Square, FileSpreadsheet, FileText, Filter, HeartPulse, ShieldCheck, MessageCircle, MapPin, Loader2, Printer, Wallet, QrCode, CheckCircle, Clock, Link as LinkIcon, History, CalendarCheck, XCircle, Download, Calculator, AlertTriangle, FileWarning, FolderCheck, Upload, RefreshCw, Copy, Send, Lock, PlusCircle, Calendar, Ban, Zap, Play, Pause, Smartphone } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { checkMPPaymentStatus, createMPPreference, createPixPayment, getPaymentStatus } from '../services/mercadoPago';
import { getZApiCredentials, sendZApiMessage } from '../services/zapiService';

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

  // Attendance Report State
  const [attendanceMonth, setAttendanceMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM

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

  // Manual Charge State
  const [showChargeModal, setShowChargeModal] = useState(false);
  const [manualCharge, setManualCharge] = useState({ description: '', amount: 0, date: new Date().toISOString().split('T')[0] });

  // --- BULK SEND STATE ---
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkQueue, setBulkQueue] = useState<Transaction[]>([]);
  const [bulkCurrentIndex, setBulkCurrentIndex] = useState(0);
  const [bulkIsRunning, setBulkIsRunning] = useState(false);
  const [bulkCountdown, setBulkCountdown] = useState(10);
  const [bulkLogs, setBulkLogs] = useState<string[]>([]);
  const bulkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hasZApi, setHasZApi] = useState(false); // To determine sending method
  const [isProcessingSmartBilling, setIsProcessingSmartBilling] = useState(false);


  const isGuardian = currentUser?.role === UserRole.RESPONSAVEL;
  const isAdmin = currentUser?.role === UserRole.ADMIN;

  // Helper to get today's date string in local time (YYYY-MM-DD)
  const getTodayStr = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

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

  // --- SMART BILLING LOGIC ---
  const handleSmartBilling = async () => {
     if (!confirm("Isso irá verificar as mensalidades do MÊS ATUAL para todos os alunos ativos.\n\n- Se o vencimento for HOJE ou nos próximos 10 DIAS, a cobrança será gerada (se ainda não existir).\n- Em seguida, iniciará o envio automático.\n\nDeseja continuar?")) {
         return;
     }

     setIsProcessingSmartBilling(true);
     const zApiCreds = await getZApiCredentials();
     const zApiAvailable = !!zApiCreds;
     setHasZApi(zApiAvailable);

     // 1. Logic to Find Candidates for Generation/Sending
     const today = new Date();
     today.setHours(0,0,0,0);
     const currentMonthStr = new Date().toISOString().slice(0, 7); // YYYY-MM
     
     const queue: Transaction[] = [];
     
     const activeStudents = students.filter(s => s.active);
     
     activeStudents.forEach(student => {
         // Find transaction for this month
         const monthTx = transactions.find(t => 
            t.studentId === student.id && 
            t.type === TransactionType.INCOME && 
            (t.date.startsWith(currentMonthStr) || t.status === PaymentStatus.LATE) && // Current month or Late
            t.status !== PaymentStatus.PAID &&
            t.status !== PaymentStatus.CANCELLED
         );

         if (monthTx) {
             // Check 10 days rule
             const dueDate = new Date(monthTx.date);
             const diffTime = dueDate.getTime() - today.getTime();
             const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
             
             // Include if it's late (diffDays < 0) OR if it's within next 10 days
             if (diffDays <= 10) {
                 queue.push(monthTx);
             }
         }
     });
     
     if (queue.length === 0) {
        alert("Nenhuma cobrança encontrada para o período (Vencidas ou a vencer em 10 dias).");
        setIsProcessingSmartBilling(false);
        return;
     }

     setBulkQueue(queue);
     setBulkCurrentIndex(0);
     setBulkIsRunning(true);
     setIsBulkModalOpen(true);
     setBulkLogs([`🚀 Cobrança Inteligente Iniciada!`, `📅 Mês: ${currentMonthStr}`, `🎯 Alunos na fila: ${queue.length}`, `🤖 Modo de Envio: ${zApiAvailable ? 'Automático (Z-API)' : 'Manual (WhatsApp Web)'}`]);
     setBulkCountdown(3);
     setIsProcessingSmartBilling(false);
  };


  // --- BULK SEND LOGIC ---
  const handleStartBulkSend = async () => {
      // Check for Z-API configuration first
      const zApiCreds = await getZApiCredentials();
      const zApiAvailable = !!zApiCreds;
      setHasZApi(zApiAvailable);

      const activeStudents = students.filter(s => s.active);
      const queue: Transaction[] = [];

      activeStudents.forEach(student => {
          // Find the oldest pending transaction or the next upcoming one
          const studentPendingTxs = transactions
            .filter(t => 
                t.studentId === student.id && 
                t.type === TransactionType.INCOME && 
                (t.status === PaymentStatus.PENDING || t.status === PaymentStatus.LATE)
            )
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

          if (studentPendingTxs.length > 0) {
              queue.push(studentPendingTxs[0]);
          }
      });

      if (queue.length === 0) {
          alert("Não há mensalidades pendentes para enviar.");
          return;
      }

      const methodMsg = zApiAvailable 
          ? "O envio será feito AUTOMATICAMENTE via Z-API (WhatsApp) em segundo plano."
          : "O envio abrirá janelas do WhatsApp Web. Por favor, permita pop-ups.";

      if (confirm(`Encontradas ${queue.length} cobranças pendentes.\n\n${methodMsg}\n\nDeseja iniciar?`)) {
          setBulkQueue(queue);
          setBulkCurrentIndex(0);
          setBulkIsRunning(true);
          setIsBulkModalOpen(true);
          setBulkLogs([`Iniciando fila com ${queue.length} cobranças... Modo: ${zApiAvailable ? 'Automático (API)' : 'Manual (Pop-up)'}`]);
          setBulkCountdown(1); 
      }
  };

  useEffect(() => {
      if (!isBulkModalOpen || !bulkIsRunning) {
          if (bulkTimerRef.current) clearTimeout(bulkTimerRef.current);
          return;
      }

      if (bulkCurrentIndex >= bulkQueue.length) {
          setBulkIsRunning(false);
          setBulkLogs(prev => [...prev, "✅ Processo finalizado!"]);
          return;
      }

      if (bulkCountdown > 0) {
          bulkTimerRef.current = setTimeout(() => {
              setBulkCountdown(prev => prev - 1);
          }, 1000);
      } else {
          // Process current item
          processBulkItem(bulkQueue[bulkCurrentIndex]);
      }

      return () => {
          if (bulkTimerRef.current) clearTimeout(bulkTimerRef.current);
      };
  }, [isBulkModalOpen, bulkIsRunning, bulkCountdown, bulkCurrentIndex, bulkQueue]);

  const processBulkItem = async (tx: Transaction) => {
      const student = students.find(s => s.id === tx.studentId);
      if (!student) {
          setBulkLogs(prev => [`⚠️ Aluno não encontrado para TX ${tx.description}`, ...prev]);
          nextBulkItem();
          return;
      }

      let finalLink = tx.paymentLink;
      
      // Generate link if missing
      if (!finalLink) {
          setBulkLogs(prev => [`🔄 Gerando link para ${student.name}...`, ...prev]);
          try {
              const externalReference = tx.externalReference || crypto.randomUUID();
              
              if (student.guardian.cpf) {
                  const mpResult = await createMPPreference({
                    title: tx.description,
                    price: tx.amount,
                    externalReference: externalReference,
                    payer: {
                        name: student.guardian.name,
                        email: student.guardian.email,
                        phone: student.guardian.phone,
                        identification: { type: 'CPF', number: student.guardian.cpf }
                    }
                });
                
                if (mpResult) {
                    finalLink = mpResult.init_point;
                    onUpdateTransaction({ 
                        ...tx, 
                        paymentLink: finalLink, 
                        externalReference 
                    });
                }
              }
          } catch (e) {
              setBulkLogs(prev => [`❌ Erro ao gerar link para ${student.name}`, ...prev]);
          }
      }

      if (finalLink) {
          const phone = student.guardian.phone.replace(/\D/g, '');
          if (phone) {
              const dueDate = formatDate(tx.date);
              const message = `Olá ${student.guardian.name}, somos da Escolinha Garotos do Martinica. ⚽\n\n` +
                  `A mensalidade de *${student.name}* (${dueDate}) já está disponível.\n` +
                  `Valor: R$ ${tx.amount.toFixed(2)}\n\n` +
                  `Link para pagamento:\n${finalLink}\n\n` +
                  `Obrigado!`;
              
              if (hasZApi) {
                  // SEND VIA API
                  const sent = await sendZApiMessage(phone, message);
                  if (sent) {
                      setBulkLogs(prev => [`✅ Enviado (API) para ${student.name}`, ...prev]);
                  } else {
                      setBulkLogs(prev => [`❌ Falha API para ${student.name}`, ...prev]);
                  }
              } else {
                  // SEND VIA WINDOW OPEN
                  const encodedMessage = encodeURIComponent(message);
                  const url = `https://wa.me/55${phone}?text=${encodedMessage}`;
                  const win = window.open(url, '_blank');
                  if (win) {
                      setBulkLogs(prev => [`✅ Aberto para ${student.name}`, ...prev]);
                  } else {
                      setBulkLogs(prev => [`⚠️ Pop-up bloqueado para ${student.name}.`, ...prev]);
                  }
              }
          } else {
              setBulkLogs(prev => [`⚠️ Sem telefone para ${student.name}`, ...prev]);
          }
      } else {
          setBulkLogs(prev => [`❌ Falha no link para ${student.name}.`, ...prev]);
      }

      nextBulkItem();
  };

  const nextBulkItem = () => {
      setBulkCurrentIndex(prev => prev + 1);
      // If using API, wait longer (10s) to avoid spam ban. If window open, 8s is fine.
      setBulkCountdown(hasZApi ? 15 : 10); 
  };


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
        rg: { delivered: false, isDigital: false },
        cpf: { delivered: false, isDigital: false },
        medical: { delivered: false, isDigital: false },
        address: { delivered: false, isDigital: false },
        school: { delivered: false, isDigital: false }
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

  // Helper para formatar data sem fuso horário
  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const parts = dateString.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateString;
  };
  
  const getWhatsAppLink = (phone: string) => {
    if (!phone) return '#';
    const numbers = phone.replace(/\D/g, '');
    return `https://wa.me/55${numbers}`;
  };

  const isMedicalExpired = (dateString: string) => {
    if (!dateString) return true;
    return new Date(dateString) < new Date();
  };

  const getDocStatus = (doc: any) => {
      if (typeof doc === 'boolean') return doc;
      if (doc && typeof doc === 'object') return doc.delivered;
      return false;
  };

  const hasMissingDocs = (student: Student) => {
      if (!student.documents) return true;
      const d = student.documents;
      return !getDocStatus(d.rg) || !getDocStatus(d.cpf) || !getDocStatus(d.medical) || !getDocStatus(d.address) || !getDocStatus(d.school);
  };

  const getStudentOverdueCount = (studentId: string) => {
    const todayStr = getTodayStr(); // Safe local date comparison string
    return transactions.filter(t => 
        t.studentId === studentId && 
        t.type === TransactionType.INCOME && 
        t.status !== PaymentStatus.PAID && 
        t.status !== PaymentStatus.CANCELLED &&
        t.date < todayStr // Comparação estrita: Só é atrasado se data < hoje (vencimento já passou)
    ).length;
  };

  const handleRequestDocuments = (student: Student) => {
      const phone = student.guardian.phone.replace(/\D/g, '');
      if (!phone) {
          alert("Telefone do responsável não encontrado.");
          return;
      }

      const d = student.documents;
      const missingList = [];
      if (!getDocStatus(d.rg)) missingList.push("RG");
      if (!getDocStatus(d.cpf)) missingList.push("CPF");
      if (!getDocStatus(d.medical)) missingList.push("Atestado Médico");
      if (!getDocStatus(d.address)) missingList.push("Comp. de Endereço");
      if (!getDocStatus(d.school)) missingList.push("Declaração Escolar");

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

      const dueDate = formatDate(tx.date);
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

      // Normalize Documents (Handle legacy booleans vs new objects)
      const normalizeDoc = (doc: any): DocumentStatus => {
          if (typeof doc === 'boolean') return { delivered: doc, isDigital: false };
          if (doc && typeof doc === 'object') return doc as DocumentStatus;
          return { delivered: false, isDigital: false };
      };

      const docs = (student.documents || {}) as any;

      setStudentForm({
          name: student.name,
          birthDate: student.birthDate,
          rg: student.rg,
          cpf: student.cpf,
          phone: student.phone,
          medicalCertificateExpiry: student.medicalCertificateExpiry || '',
          groupId: student.groupId,
          planId: student.planId,
          active: student.active,
          address: student.address || { cep: '', street: '', number: '', complement: '', district: '', city: '', state: '' },
          guardian: { ...student.guardian },
          documents: {
              rg: normalizeDoc(docs.rg),
              cpf: normalizeDoc(docs.cpf),
              medical: normalizeDoc(docs.medical),
              address: normalizeDoc(docs.address),
              school: normalizeDoc(docs.school)
          }
      });
      setCapturedImage(student.photoUrl || null);
      setActiveTab('DETAILS');
      setSelectedFinanceIds(new Set());
      setIsModalOpen(true);
  };

  const handleOpenHistory = (student: Student) => {
     handleOpenEdit(student);
     setActiveTab('FINANCE');
  };

  const handleOpenAttendance = (student: Student) => {
      handleOpenEdit(student);
      setActiveTab('ATTENDANCE'); 
  };
  
  // New handler for detailed doc toggle
  const toggleDoc = (key: keyof StudentDocuments, mode: 'PHYSICAL' | 'DIGITAL') => {
      // @ts-ignore
      const currentDoc = studentForm.documents[key] as DocumentStatus;
      const currentDelivered = currentDoc?.delivered || false;
      const currentIsDigital = currentDoc?.isDigital || false;

      let newDelivered = true;
      let newIsDigital = mode === 'DIGITAL';

      // If clicking the active mode, toggle off (set to undelivered)
      if (currentDelivered && currentIsDigital === (mode === 'DIGITAL')) {
          newDelivered = false;
      }

      setStudentForm(prev => ({
          ...prev,
          documents: {
              ...prev.documents,
              [key]: { delivered: newDelivered, isDigital: newIsDigital }
          }
      }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if(isGuardian) return; 

    const studentData = {
      ...studentForm,
      // Se não tiver imagem capturada, usa UI Avatars para gerar as iniciais em vez de imagem aleatória
      photoUrl: capturedImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(studentForm.name)}&background=random&color=fff&size=200`
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

  const handleCancelTransaction = (tx: Transaction) => {
    if (confirm(`Deseja realmente cancelar/ignorar esta cobrança?\n${tx.description}`)) {
        onUpdateTransaction({
            ...tx,
            status: PaymentStatus.CANCELLED
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
    const data = filteredStudents.map(s => {
        return {
            'Nome do Aluno': s.name,
            'Data Nascimento': formatDate(s.birthDate),
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
        }
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Alunos");
    XLSX.writeFile(wb, "GarotosMartinica_Alunos.xlsx");
  };

  const handleSaveManualCharge = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    
    onAddTransaction({
        description: manualCharge.description,
        amount: manualCharge.amount,
        type: TransactionType.INCOME,
        date: manualCharge.date,
        status: PaymentStatus.PENDING,
        studentId: editingId,
        paymentMethod: PaymentMethod.PIX_MERCADO_PAGO 
    });
    
    setShowChargeModal(false);
    setManualCharge({ description: '', amount: 0, date: new Date().toISOString().split('T')[0] });
  };

  const handlePrintContract = () => {
    if (!editingId) return;
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text("CONTRATO DE PRESTAÇÃO DE SERVIÇOS", 105, 20, { align: 'center' });
    doc.setFontSize(12);
    doc.text("Escolinha de Futebol Garotos do Martinica", 105, 30, { align: 'center' });
    
    doc.setFontSize(10);
    const body = `
    Pelo presente instrumento particular, de um lado a Escolinha Garotos do Martinica, e de outro o responsável legal do aluno abaixo qualificado, têm entre si justo e contratado o seguinte:

    ALUNO: ${studentForm.name}
    NASCIMENTO: ${formatDate(studentForm.birthDate)}
    RG: ${studentForm.rg} | CPF: ${studentForm.cpf}

    RESPONSÁVEL: ${studentForm.guardian.name}
    CPF: ${studentForm.guardian.cpf}
    TELEFONE: ${studentForm.guardian.phone}
    EMAIL: ${studentForm.guardian.email}
    ENDEREÇO: ${studentForm.address.street}, ${studentForm.address.number} - ${studentForm.address.district}, ${studentForm.address.city}/${studentForm.address.state}

    CLÁUSULA 1: O objeto deste contrato é a prestação de serviços de treinamento esportivo (futebol).
    CLÁUSULA 2: O valor da mensalidade deve ser pago até a data de vencimento acordada.
    CLÁUSULA 3: O uso de imagem do atleta para fins de divulgação da escolinha fica autorizado.
    
    Local e Data: ______________________, ${new Date().toLocaleDateString('pt-BR')}

    __________________________________________
    Assinatura do Responsável
    `;
    
    const splitText = doc.splitTextToSize(body, 180);
    doc.text(splitText, 15, 50);
    
    doc.save(`Contrato_${studentForm.name}.pdf`);
  };

  const studentActivities = useMemo(() => {
      if (!editingId) return [];
      return activities.filter(a => {
          const inGroup = a.groupId === studentForm.groupId;
          const isParticipant = a.participants?.includes(editingId);
          return inGroup || isParticipant;
      }).sort((a, b) => new Date(b.date + 'T' + b.startTime).getTime() - new Date(a.date + 'T' + a.startTime).getTime());
  }, [activities, editingId, studentForm.groupId]);

  const attendanceStats = useMemo(() => {
      let present = 0;
      let absent = 0;
      studentActivities.forEach(a => {
           // Skip future activities
           if (new Date(a.date + 'T' + a.startTime) > new Date()) return;
           
           if (a.attendance?.includes(editingId!)) present++;
           else absent++;
      });
      return { present, absent };
  }, [studentActivities, editingId]);

  const attendanceRate = useMemo(() => {
      const total = attendanceStats.present + attendanceStats.absent;
      if (total === 0) return 0;
      return Math.round((attendanceStats.present / total) * 100);
  }, [attendanceStats]);
  
  const handleExportStudentAttendance = () => {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text(`Relatório de Presença: ${studentForm.name}`, 14, 20);
      
      const rows = studentActivities
        .filter(a => a.date.startsWith(attendanceMonth))
        .map(a => {
          const isPresent = a.attendance?.includes(editingId!);
          return [formatDate(a.date), a.title, isPresent ? 'PRESENTE' : 'FALTA'];
        });

      autoTable(doc, {
          startY: 30,
          head: [['Data', 'Atividade', 'Status']],
          body: rows,
      });
      
      doc.save(`Presenca_${studentForm.name}.pdf`);
  };

  const handleSendAttendanceToWhatsApp = () => {
      const phone = studentForm.guardian.phone.replace(/\D/g, '');
      if (!phone) return;
      
      const msg = `Olá, segue resumo de presença de ${studentForm.name} em ${attendanceMonth}:\n` +
                  `Presenças: ${attendanceStats.present}\n` +
                  `Faltas: ${attendanceStats.absent}\n` +
                  `Frequência: ${attendanceRate}%`;
                  
      window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const studentTransactions = transactions.filter(t => t.studentId === editingId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="space-y-6">
      {/* Header and Filters */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Alunos e Responsáveis</h2>
        <div className="flex gap-2 w-full md:w-auto">
             {!isGuardian && (
                <>
                 <button onClick={handleStartBulkSend} className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg flex items-center gap-2 text-sm">
                     <Send className="w-4 h-4" /> Cobrança Inteligente
                 </button>
                 <button onClick={handleSmartBilling} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg flex items-center gap-2 text-sm">
                     <Zap className="w-4 h-4" /> Cobrança Mês (Z-API)
                 </button>
                 <button onClick={handleExportExcel} className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg flex items-center gap-2 text-sm">
                     <FileSpreadsheet className="w-4 h-4" /> Exportar
                 </button>
                 <button onClick={handleOpenNew} className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm shadow-sm">
                     <Plus className="w-4 h-4" /> Novo Aluno
                 </button>
                </>
             )}
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4 flex-wrap">
           <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input 
                    type="text" 
                    placeholder="Buscar por nome..." 
                    className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
           </div>
           
           <div className="flex gap-2 flex-wrap">
               <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" value={ageFilter} onChange={(e) => setAgeFilter(e.target.value)}>
                   <option value="">Todas Idades</option>
                   {[...Array(15)].map((_, i) => <option key={i} value={i+4}>{i+4} anos</option>)}
               </select>

               <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                   <option value="ALL">Todos Status</option>
                   <option value="ACTIVE">Ativos</option>
                   <option value="INACTIVE">Inativos</option>
               </select>
               
               {isAdmin && (
                   <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" value={financeFilter} onChange={(e) => setFinanceFilter(e.target.value)}>
                       <option value="ALL">Situação Financeira</option>
                       <option value="OK">Em dia</option>
                       <option value="DEFAULTING">Inadimplentes</option>
                   </select>
               )}
           </div>
      </div>

      {/* Student List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredStudents.map(student => {
              const groupName = groups.find(g => g.id === student.groupId)?.name || 'Sem Grupo';
              const isLate = getStudentOverdueCount(student.id) > 0;
              const missingDocs = hasMissingDocs(student);

              return (
                  <div key={student.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:border-primary-200 transition-colors flex flex-col">
                      <div className="p-4 flex items-start gap-3">
                          <img src={student.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(student.name)}`} alt={student.name} className="w-14 h-14 rounded-full object-cover border-2 border-white shadow-sm bg-gray-100" />
                          <div className="flex-1 min-w-0">
                              <h3 className="font-bold text-gray-900 truncate">{student.name}</h3>
                              <p className="text-xs text-gray-500 truncate">{groupName} • {calculateAge(student.birthDate)} anos</p>
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                  <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${student.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                      {student.active ? 'ATIVO' : 'INATIVO'}
                                  </span>
                                  {isLate && <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-100 text-red-700 flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" /> ATRASO</span>}
                                  {missingDocs && <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-orange-100 text-orange-700 flex items-center gap-0.5"><FileWarning className="w-3 h-3" /> DOC</span>}
                              </div>
                          </div>
                      </div>
                      
                      <div className="mt-auto border-t border-gray-50 bg-gray-50 p-2 flex justify-between items-center">
                           <button onClick={() => handleOpenHistory(student)} className="flex-1 py-1.5 text-xs font-medium text-gray-600 hover:text-primary-600 hover:bg-white rounded transition-colors">
                               <Wallet className="w-4 h-4 mx-auto mb-1" /> Financeiro
                           </button>
                           <div className="w-px h-6 bg-gray-200"></div>
                           <button onClick={() => handleOpenAttendance(student)} className="flex-1 py-1.5 text-xs font-medium text-gray-600 hover:text-primary-600 hover:bg-white rounded transition-colors">
                               <CalendarCheck className="w-4 h-4 mx-auto mb-1" /> Presença
                           </button>
                           <div className="w-px h-6 bg-gray-200"></div>
                           <button onClick={() => handleOpenEdit(student)} className="flex-1 py-1.5 text-xs font-medium text-gray-600 hover:text-primary-600 hover:bg-white rounded transition-colors">
                               <Edit className="w-4 h-4 mx-auto mb-1" /> Editar
                           </button>
                      </div>
                  </div>
              );
          })}
      </div>

      {filteredStudents.length === 0 && (
          <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-100">
              <UserIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>Nenhum aluno encontrado com os filtros atuais.</p>
          </div>
      )}

      {/* Main Student Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl p-0 my-8 flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="p-6 border-b border-gray-100 flex justify-between items-start">
                 <div className="flex items-center gap-4">
                     <div className="relative group">
                         <img src={capturedImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(studentForm.name || 'Novo Aluno')}`} className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-md bg-gray-100" />
                         {!isGuardian && (
                             <button onClick={startCamera} className="absolute bottom-0 right-0 p-1 bg-primary-600 text-white rounded-full shadow-sm hover:bg-primary-700" title="Tirar Foto">
                                 <Camera className="w-3 h-3" />
                             </button>
                         )}
                     </div>
                     <div>
                         <h3 className="text-xl font-bold text-gray-900">{editingId ? studentForm.name : 'Novo Aluno'}</h3>
                         <p className="text-sm text-gray-500">{editingId ? 'Editar informações' : 'Preencha os dados do cadastro'}</p>
                     </div>
                 </div>
                 <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-100 bg-gray-50/50 px-6">
                <button onClick={() => setActiveTab('DETAILS')} className={`py-3 px-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'DETAILS' ? 'border-primary-500 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    Dados Cadastrais
                </button>
                {editingId && (
                    <>
                    <button onClick={() => setActiveTab('FINANCE')} className={`py-3 px-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'FINANCE' ? 'border-primary-500 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                        Financeiro
                    </button>
                    <button onClick={() => setActiveTab('ATTENDANCE')} className={`py-3 px-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'ATTENDANCE' ? 'border-primary-500 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                        Frequência
                    </button>
                    </>
                )}
            </div>

            {/* Camera View */}
            {isCameraOpen && (
                <div className="p-4 bg-black flex flex-col items-center">
                    <video ref={videoRef} autoPlay className="w-full max-w-sm rounded-lg mb-4" />
                    <canvas ref={canvasRef} width="300" height="300" className="hidden" />
                    <div className="flex gap-4">
                        <button onClick={capturePhoto} className="px-4 py-2 bg-white text-black rounded-full font-bold">Capturar</button>
                        <button onClick={stopCamera} className="px-4 py-2 bg-gray-800 text-white rounded-full">Cancelar</button>
                    </div>
                </div>
            )}

            {/* Content Body */}
            {activeTab === 'DETAILS' ? (
                <form id="student-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
                    {/* Form content */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <h4 className="font-bold text-gray-800 flex items-center gap-2 border-b pb-2"><UserIcon className="w-4 h-4 text-primary-500" /> Dados do Aluno</h4>
                            
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nome Completo</label>
                                <input required type="text" className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" value={studentForm.name} onChange={e => setStudentForm({...studentForm, name: e.target.value})} disabled={isGuardian} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Data Nascimento</label>
                                    <input required type="date" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none" value={studentForm.birthDate} onChange={e => setStudentForm({...studentForm, birthDate: e.target.value})} disabled={isGuardian} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Grupo</label>
                                    <select className="w-full border border-gray-300 rounded-lg p-2.5 outline-none bg-white" value={studentForm.groupId} onChange={e => setStudentForm({...studentForm, groupId: e.target.value})} disabled={isGuardian}>
                                        <option value="">Selecione...</option>
                                        {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">RG</label>
                                    <input type="text" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none" value={studentForm.rg} onChange={e => setStudentForm({...studentForm, rg: e.target.value})} disabled={isGuardian} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">CPF</label>
                                    <input type="text" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none" value={studentForm.cpf} onChange={e => setStudentForm({...studentForm, cpf: e.target.value})} disabled={isGuardian} />
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Atestado Médico (Validade)</label>
                                <div className="flex gap-2">
                                    <input type="date" className={`w-full border rounded-lg p-2.5 outline-none ${isMedicalExpired(studentForm.medicalCertificateExpiry) ? 'border-red-300 bg-red-50 text-red-700' : 'border-gray-300'}`} 
                                        value={studentForm.medicalCertificateExpiry} onChange={e => setStudentForm({...studentForm, medicalCertificateExpiry: e.target.value})} disabled={isGuardian} />
                                    {!isGuardian && isMedicalExpired(studentForm.medicalCertificateExpiry) && (
                                        <button type="button" onClick={() => handleRequestMedical(studentForm as Student)} className="bg-red-100 text-red-600 p-2 rounded-lg hover:bg-red-200" title="Cobrar Atestado">
                                            <MessageCircle className="w-5 h-5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h4 className="font-bold text-gray-800 flex items-center gap-2 border-b pb-2"><ShieldCheck className="w-4 h-4 text-primary-500" /> Responsável</h4>
                            
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nome do Responsável</label>
                                <input required type="text" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none" value={studentForm.guardian.name} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, name: e.target.value}})} disabled={isGuardian} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">CPF Resp.</label>
                                    <input required type="text" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none" value={studentForm.guardian.cpf} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, cpf: e.target.value}})} disabled={isGuardian} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Telefone (Whatsapp)</label>
                                    <div className="flex gap-2">
                                        <input required type="text" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none" value={studentForm.guardian.phone} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, phone: e.target.value}})} disabled={isGuardian} />
                                        {!isGuardian && studentForm.guardian.phone && (
                                            <a href={getWhatsAppLink(studentForm.guardian.phone)} target="_blank" rel="noopener noreferrer" className="bg-green-100 text-green-600 p-2.5 rounded-lg hover:bg-green-200 flex items-center justify-center">
                                                <MessageCircle className="w-4 h-4" />
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
                                <input type="email" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none" value={studentForm.guardian.email} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, email: e.target.value}})} disabled={isGuardian} />
                            </div>
                            
                            {!isGuardian && (
                                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 mt-2">
                                    <label className="block text-xs font-bold text-blue-800 uppercase mb-1">Plano / Mensalidade</label>
                                    <select className="w-full border border-blue-200 rounded-lg p-2.5 outline-none bg-white" value={studentForm.planId} onChange={e => setStudentForm({...studentForm, planId: e.target.value})}>
                                        <option value="">Selecione um plano...</option>
                                        {plans.map(p => <option key={p.id} value={p.id}>{p.name} - R$ {p.price}</option>)}
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {/* Address Section */}
                    <div className="space-y-4 pt-4 border-t border-gray-100">
                         <h4 className="font-bold text-gray-800 flex items-center gap-2"><MapPin className="w-4 h-4 text-primary-500" /> Endereço</h4>
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                             <div className="relative">
                                 <input type="text" placeholder="CEP" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none" 
                                    value={studentForm.address.cep} 
                                    onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, cep: e.target.value}})}
                                    onBlur={(e) => fetchAddressByCep(e.target.value)}
                                    disabled={isGuardian}
                                 />
                                 {isLoadingCep && <Loader2 className="absolute right-3 top-3 w-4 h-4 animate-spin text-gray-400" />}
                             </div>
                             <div className="md:col-span-2">
                                 <input type="text" placeholder="Rua / Logradouro" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none" value={studentForm.address.street} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, street: e.target.value}})} disabled={isGuardian} />
                             </div>
                             <div>
                                 <input type="text" placeholder="Número" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none" value={studentForm.address.number} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, number: e.target.value}})} disabled={isGuardian} />
                             </div>
                             <div>
                                 <input type="text" placeholder="Bairro" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none" value={studentForm.address.district} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, district: e.target.value}})} disabled={isGuardian} />
                             </div>
                             <div>
                                 <input type="text" placeholder="Cidade - UF" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none" value={`${studentForm.address.city} - ${studentForm.address.state}`} readOnly disabled={isGuardian} />
                             </div>
                         </div>
                    </div>

                    {/* Documents Checklist (Admin Only) */}
                    {!isGuardian && (
                        <div className="space-y-4 pt-4 border-t border-gray-100">
                            <div className="flex justify-between items-center mb-2">
                                <h4 className="font-bold text-gray-800 flex items-center gap-2"><FolderCheck className="w-4 h-4 text-primary-500" /> Documentação</h4>
                                <button type="button" onClick={() => handleRequestDocuments(studentForm as Student)} className="text-xs bg-orange-100 text-orange-700 px-3 py-1.5 rounded-lg font-medium hover:bg-orange-200 flex items-center gap-1">
                                    <MessageCircle className="w-3 h-3" /> Cobrar Docs
                                </button>
                            </div>
                            
                            <div className="grid grid-cols-1 gap-3">
                                {[
                                    { key: 'rg', label: 'RG do Aluno' },
                                    { key: 'cpf', label: 'CPF do Aluno' },
                                    { key: 'medical', label: 'Atestado Médico' },
                                    { key: 'address', label: 'Comprovante de Endereço' },
                                    { key: 'school', label: 'Declaração Escolar' }
                                ].map((docItem) => {
                                    // @ts-ignore
                                    const docData = studentForm.documents[docItem.key] as DocumentStatus;
                                    const isDelivered = docData?.delivered || false;
                                    const isDigital = docData?.isDigital || false;
                                    const isPhysical = isDelivered && !isDigital;

                                    return (
                                        <div key={docItem.key} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50/50 gap-3">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-full ${isDelivered ? (isDigital ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600') : 'bg-gray-200 text-gray-400'}`}>
                                                    {isDelivered ? (isDigital ? <Smartphone className="w-4 h-4" /> : <FileText className="w-4 h-4" />) : <FileWarning className="w-4 h-4" />}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold text-gray-800">{docItem.label}</p>
                                                    <p className="text-xs text-gray-500">
                                                        {isDelivered ? (isDigital ? 'Entregue (Digital)' : 'Entregue (Físico)') : 'Pendente'}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleDoc(docItem.key as keyof StudentDocuments, 'PHYSICAL')}
                                                    className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-medium rounded-md transition-all border ${
                                                        isPhysical 
                                                        ? 'bg-orange-100 text-orange-700 border-orange-200' 
                                                        : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    Físico
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleDoc(docItem.key as keyof StudentDocuments, 'DIGITAL')}
                                                    className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-medium rounded-md transition-all border ${
                                                        isDigital 
                                                        ? 'bg-blue-100 text-blue-700 border-blue-200' 
                                                        : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    Digital
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {!isGuardian && (
                         <div className="pt-4 border-t border-gray-100 flex items-center gap-3">
                             <label className="text-sm font-medium text-gray-700">Situação Cadastral:</label>
                             <button type="button" onClick={() => setStudentForm({...studentForm, active: true})} className={`px-4 py-2 rounded-lg text-sm font-bold border ${studentForm.active ? 'bg-green-100 text-green-700 border-green-200' : 'bg-white text-gray-400 border-gray-200'}`}>Ativo</button>
                             <button type="button" onClick={() => setStudentForm({...studentForm, active: false})} className={`px-4 py-2 rounded-lg text-sm font-bold border ${!studentForm.active ? 'bg-red-100 text-red-700 border-red-200' : 'bg-white text-gray-400 border-gray-200'}`}>Inativo</button>
                         </div>
                    )}
                </form>
            ) : activeTab === 'FINANCE' ? (
                // FINANCE TAB
                <div className="flex-1 overflow-y-auto p-4 md:p-6">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex gap-2">
                             {!isGuardian && (
                                <button onClick={() => setShowChargeModal(true)} className="flex items-center gap-2 bg-primary-600 text-white px-3 py-2 rounded-lg text-sm shadow hover:bg-primary-700">
                                    <PlusCircle className="w-4 h-4" /> Nova Cobrança
                                </button>
                             )}
                             {!isGuardian && (
                                 <button 
                                    onClick={() => initiatePixPayment()} 
                                    disabled={selectedFinanceIds.size === 0}
                                    className="flex items-center gap-2 bg-green-600 text-white px-3 py-2 rounded-lg text-sm shadow hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <QrCode className="w-4 h-4" /> Gerar PIX ({selectedFinanceIds.size})
                                </button>
                             )}
                        </div>
                        <div className="text-sm text-gray-500">
                            Saldo Devedor: <span className="font-bold text-red-600">R$ {studentTransactions.filter(t => t.type === TransactionType.INCOME && t.status !== PaymentStatus.PAID && t.status !== PaymentStatus.CANCELLED).reduce((acc, t) => acc + t.amount, 0).toFixed(2)}</span>
                        </div>
                    </div>
                    
                    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-semibold">
                                <tr>
                                    <th className="px-4 py-3 w-10">
                                    </th>
                                    <th className="px-4 py-3">Vencimento</th>
                                    <th className="px-4 py-3">Descrição</th>
                                    <th className="px-4 py-3 text-center">Status</th>
                                    <th className="px-4 py-3 text-right">Valor</th>
                                    <th className="px-4 py-3 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {studentTransactions.length > 0 ? (
                                    studentTransactions.map(tx => {
                                        const isSelected = selectedFinanceIds.has(tx.id);
                                        const isPaid = tx.status === PaymentStatus.PAID;
                                        const isCancelled = tx.status === PaymentStatus.CANCELLED;
                                        const todayStr = getTodayStr();
                                        const isLate = !isPaid && !isCancelled && tx.date < todayStr;
                                        
                                        return (
                                            <tr key={tx.id} className={`hover:bg-gray-50 transition-colors ${isCancelled ? 'opacity-50' : ''}`}>
                                                <td className="px-4 py-3">
                                                    {!isPaid && !isCancelled && (
                                                        <button onClick={() => toggleFinanceSelection(tx.id)} className="text-gray-400 hover:text-primary-600">
                                                            {isSelected ? <CheckSquare className="w-5 h-5 text-primary-600" /> : <Square className="w-5 h-5" />}
                                                        </button>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-600">{formatDate(tx.date)}</td>
                                                <td className="px-4 py-3 text-sm font-medium text-gray-900">{tx.description}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-bold border ${
                                                        isPaid ? 'bg-green-50 text-green-700 border-green-200' :
                                                        isCancelled ? 'bg-gray-100 text-gray-500 border-gray-200' :
                                                        isLate ? 'bg-red-50 text-red-700 border-red-200' :
                                                        'bg-yellow-50 text-yellow-700 border-yellow-200'
                                                    }`}>
                                                        {isPaid ? 'PAGO' : isCancelled ? 'CANCELADO' : isLate ? 'ATRASADO' : 'ABERTO'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right text-sm font-bold text-gray-800">
                                                    R$ {tx.amount.toFixed(2)}
                                                </td>
                                                {/* ... Actions ... */}
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        {!isPaid && !isCancelled && (
                                                            <>
                                                                <button onClick={() => initiatePixPayment(tx.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded" title="Pagar com PIX">
                                                                    <QrCode className="w-4 h-4" />
                                                                </button>
                                                                {!isGuardian && (
                                                                  <>
                                                                    <button onClick={() => sendChargeMessage(tx)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Enviar Cobrança WhatsApp">
                                                                        <Send className="w-4 h-4" />
                                                                    </button>
                                                                    <button onClick={() => checkStatus(tx)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded" title="Verificar Status MP">
                                                                        {checkingStatusId === tx.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                                                    </button>
                                                                    <button onClick={() => handleSendPixToWhatsApp(tx)} className="p-1.5 text-purple-600 hover:bg-purple-50 rounded" title="Enviar PIX Copia e Cola no WhatsApp">
                                                                        {sendingPixId === tx.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                                                                    </button>
                                                                    <button onClick={() => handleCancelTransaction(tx)} className="p-1.5 text-red-500 hover:bg-red-50 rounded" title="Cancelar Cobrança">
                                                                        <Ban className="w-4 h-4" />
                                                                    </button>
                                                                  </>
                                                                )}
                                                            </>
                                                        )}
                                                        {isPaid && <span className="text-xs text-gray-400 italic">Liquidado</span>}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-gray-400">Nenhum registro financeiro encontrado.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                // ATTENDANCE TAB
                <div className="flex-1 overflow-y-auto p-4 md:p-6">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                            <div className="bg-purple-100 p-2 rounded-lg text-purple-700">
                                <CalendarCheck className="w-6 h-6" />
                            </div>
                            <div>
                                <h4 className="font-bold text-gray-800 text-lg">Frequência e Presença</h4>
                                <div className="flex items-center gap-2 text-sm text-gray-500">
                                    <span>Presença: <strong className="text-green-600">{attendanceStats.present}</strong></span>
                                    <span>Faltas: <strong className="text-red-600">{attendanceStats.absent}</strong></span>
                                    <span>Taxa: <strong>{attendanceRate}%</strong></span>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2">
                             <input 
                                type="month" 
                                className="border rounded-lg p-2 text-sm"
                                value={attendanceMonth}
                                onChange={(e) => setAttendanceMonth(e.target.value)}
                             />
                             <button onClick={handleExportStudentAttendance} className="p-2 text-gray-500 border rounded-lg hover:bg-gray-50" title="PDF">
                                 <Download className="w-4 h-4" />
                             </button>
                             {!isGuardian && (
                                <button onClick={handleSendAttendanceToWhatsApp} className="p-2 text-green-600 border border-green-200 bg-green-50 rounded-lg hover:bg-green-100" title="Enviar Relatório WhatsApp">
                                    <Send className="w-4 h-4" />
                                </button>
                             )}
                        </div>
                    </div>
                    
                    <div className="space-y-3">
                        {studentActivities
                            .filter(a => a.date.startsWith(attendanceMonth))
                            .map(activity => {
                                const isPresent = activity.attendance.includes(studentForm.name) || activity.attendance.includes(editingId!); // Fallback logic
                                const isFuture = new Date(activity.date + 'T' + activity.startTime) > new Date();
                                
                                return (
                                    <div key={activity.id} className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-xl shadow-sm">
                                        <div className="flex items-center gap-4">
                                            <div className={`p-3 rounded-lg text-center min-w-[60px] ${isPresent ? 'bg-green-100 text-green-700' : isFuture ? 'bg-gray-100 text-gray-500' : 'bg-red-100 text-red-700'}`}>
                                                <span className="block text-xs font-bold uppercase">{new Date(activity.date).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</span>
                                                <span className="block text-lg font-bold leading-none">{activity.date.split('-')[2]}</span>
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-gray-800">{activity.title}</h4>
                                                <p className="text-sm text-gray-500">{activity.startTime} - {activity.endTime}</p>
                                            </div>
                                        </div>
                                        <div>
                                            {isFuture ? (
                                                <span className="text-xs font-bold text-gray-400 bg-gray-100 px-3 py-1 rounded-full">AGENDADO</span>
                                            ) : isPresent ? (
                                                <span className="text-xs font-bold text-green-700 bg-green-100 px-3 py-1 rounded-full flex items-center gap-1"><CheckCircle className="w-3 h-3" /> PRESENTE</span>
                                            ) : (
                                                <span className="text-xs font-bold text-red-700 bg-red-100 px-3 py-1 rounded-full flex items-center gap-1"><XCircle className="w-3 h-3" /> FALTA</span>
                                            )}
                                        </div>
                                    </div>
                                );
                        })}
                        {studentActivities.filter(a => a.date.startsWith(attendanceMonth)).length === 0 && (
                            <p className="text-center text-gray-400 py-8">Nenhuma atividade registrada neste mês.</p>
                        )}
                    </div>
                </div>
            )}

            {/* Footer Buttons */}
            <div className="p-4 md:p-6 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex justify-between items-center">
                 {!isGuardian ? (
                    <>
                        <div className="flex gap-2">
                             <button type="button" onClick={handlePrintContract} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm font-medium transition-colors">
                                <Printer className="w-4 h-4" /> Imprimir Contrato
                             </button>
                        </div>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-gray-600 font-medium hover:bg-gray-200 rounded-lg transition-colors">
                                Cancelar
                            </button>
                            <button form="student-form" type="submit" className="px-5 py-2.5 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors shadow-lg shadow-primary-500/30">
                                {editingId ? 'Salvar Alterações' : 'Cadastrar Aluno'}
                            </button>
                        </div>
                    </>
                 ) : (
                    <button type="button" onClick={() => setIsModalOpen(false)} className="ml-auto px-5 py-2.5 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors">
                        Fechar
                    </button>
                 )}
            </div>
          </div>
        </div>
      )}

      {/* PIX Payment Modal */}
      {showPixModal && pixData && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center animate-in zoom-in-95 duration-200">
                  <div className="flex justify-end">
                      <button onClick={() => setShowPixModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                  </div>
                  <div className="flex justify-center mb-4">
                      <img src="/pix-logo.svg" alt="Pix" className="h-8" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-800 mb-2">Pagamento via PIX</h3>
                  <p className="text-sm text-gray-500 mb-6">Escaneie o QR Code ou use o Copia e Cola para pagar.</p>
                  
                  <div className="bg-gray-50 p-4 rounded-xl border-2 border-dashed border-gray-200 mb-6 flex justify-center relative">
                      {pixLoading ? (
                          <div className="h-48 w-48 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>
                      ) : (
                         <img src={`data:image/png;base64,${pixData.qrCodeBase64}`} alt="QR Code" className="w-48 h-48 mix-blend-multiply" />
                      )}
                  </div>
                  
                  <div className="space-y-3">
                      <div className="bg-gray-100 p-3 rounded-lg flex items-center justify-between gap-2 text-left">
                          <div className="flex-1 overflow-hidden">
                              <p className="text-xs text-gray-500 mb-1">Código Copia e Cola</p>
                              <p className="text-xs font-mono text-gray-800 truncate">{pixData.qrCode}</p>
                          </div>
                          <button onClick={copyPixCode} className="p-2 bg-white rounded shadow-sm hover:bg-gray-50 text-primary-600">
                              <Copy className="w-4 h-4" />
                          </button>
                      </div>
                      
                      <button 
                          onClick={() => setShowPixModal(false)}
                          className="w-full py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
                      >
                          Fechar
                      </button>
                  </div>
              </div>
          </div>
      )}

       {/* Charge Modal */}
       {showChargeModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
               <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
                   <div className="flex justify-between items-center mb-4">
                       <h3 className="text-lg font-bold text-gray-900">Nova Cobrança Avulsa</h3>
                       <button onClick={() => setShowChargeModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
                   </div>
                   <form onSubmit={handleSaveManualCharge} className="space-y-4">
                       <div>
                           <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                           <input required type="text" className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" 
                               placeholder="Ex: Uniforme, Taxa Extra..."
                               value={manualCharge.description} onChange={e => setManualCharge({...manualCharge, description: e.target.value})} />
                       </div>
                       <div>
                           <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$)</label>
                           <input required type="number" step="0.01" className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" 
                               value={manualCharge.amount} onChange={e => setManualCharge({...manualCharge, amount: parseFloat(e.target.value)})} />
                       </div>
                       <div>
                           <label className="block text-sm font-medium text-gray-700 mb-1">Data de Vencimento</label>
                           <input required type="date" className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" 
                               value={manualCharge.date} onChange={e => setManualCharge({...manualCharge, date: e.target.value})} />
                       </div>
                       <div className="pt-2">
                           <button type="submit" className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-lg shadow-lg shadow-primary-500/20">
                               Criar Cobrança
                           </button>
                       </div>
                   </form>
               </div>
          </div>
      )}

      {/* Bulk Send Modal (Progress) */}
      {isBulkModalOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
                  <div className="p-6 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                      <div>
                          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                              {bulkIsRunning ? <Loader2 className="w-5 h-5 animate-spin text-primary-600" /> : <CheckCircle className="w-5 h-5 text-green-600" />}
                              {bulkIsRunning ? 'Enviando Cobranças...' : 'Envio Finalizado'}
                          </h3>
                          <p className="text-sm text-gray-500 mt-1">
                              {bulkIsRunning ? `Processando ${bulkCurrentIndex + 1} de ${bulkQueue.length}` : `Total processado: ${bulkQueue.length}`}
                          </p>
                      </div>
                      {!bulkIsRunning && (
                          <button onClick={() => setIsBulkModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                      )}
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-4 bg-black text-green-400 font-mono text-xs space-y-1">
                      {bulkLogs.map((log, i) => (
                          <div key={i}>{log}</div>
                      ))}
                      <div ref={(el) => el?.scrollIntoView({ behavior: "smooth" })} />
                  </div>

                  {bulkIsRunning && (
                       <div className="p-4 bg-white border-t border-gray-100">
                           <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                               <div className="bg-primary-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${(bulkCurrentIndex / bulkQueue.length) * 100}%` }}></div>
                           </div>
                           <p className="text-center text-xs text-gray-500">
                               Próximo envio em {bulkCountdown}s... {hasZApi ? '(Automático)' : '(Prepare-se para o pop-up)'}
                           </p>
                           <button 
                                onClick={() => setBulkIsRunning(false)}
                                className="mt-3 w-full py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 text-sm font-bold"
                            >
                                Parar Processo
                            </button>
                       </div>
                  )}
              </div>
          </div>
      )}
    </div>
  );
};
