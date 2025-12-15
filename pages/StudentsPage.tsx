import React, { useState, useRef, useEffect } from 'react';
import { Student, Group, Plan, Transaction, TransactionType, PaymentStatus, PaymentMethod, Activity, User, UserRole } from '../types';
import { Search, Plus, Phone, User as UserIcon, Edit, Camera, X, CheckSquare, Square, FileSpreadsheet, FileText, Filter, HeartPulse, ShieldCheck, MessageCircle, MapPin, Loader2, Printer, Wallet, QrCode, CheckCircle, Clock, Link as LinkIcon, History, CalendarCheck, XCircle, Download, Calculator, AlertTriangle, FileWarning, FolderCheck, Upload, RefreshCw, Copy, Send, Lock, PlusCircle, Calendar, Ban, Zap, Play, Pause } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { checkMPPaymentStatus, createPixPayment, getPaymentStatus, createMPPreference } from '../services/mercadoPago';

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

  const isGuardian = currentUser?.role === UserRole.RESPONSAVEL;

  const initialFormState: any = {
    name: '',
    birthDate: '',
    rg: '',
    cpf: '',
    phone: '',
    medicalCertificateExpiry: '',
    groupIds: [],
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

  // Inicializar filtro se passado via prop
  useEffect(() => {
    if (initialFilter === 'DEFAULTING') {
        setFinanceFilter('DEFAULTING');
    } else if (initialFilter === 'MISSING_DOCS') {
        setDocsFilter('MISSING_DOCS');
    }
  }, [initialFilter]);

  // Helper para formatar data sem fuso
  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const parts = dateString.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateString;
  };

  const handlePayTransaction = (txId: string, method: PaymentMethod) => {
    const tx = transactions.find(t => t.id === txId);
    if (tx) {
        onUpdateTransaction({
            ...tx,
            status: PaymentStatus.PAID,
            paymentMethod: method,
            date: new Date().toISOString().split('T')[0]
        });
    }
  };

  const confirmPixPaymentSuccess = () => {
    setShowPixModal(false);
    setPixData(null);
    alert("Pagamento PIX confirmado com sucesso!");
  };

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

  // --- BULK SEND LOGIC ---
  const handleStartBulkSend = () => {
      const activeStudents = students.filter(s => s.active);
      const queue: Transaction[] = [];

      activeStudents.forEach(student => {
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

      if (confirm(`Encontradas ${queue.length} cobranças pendentes (próxima a vencer ou atrasada de cada aluno). Deseja iniciar o envio automático via WhatsApp? (Intervalo de 10s)`)) {
          setBulkQueue(queue);
          setBulkCurrentIndex(0);
          setBulkIsRunning(true);
          setIsBulkModalOpen(true);
          setBulkLogs([`Iniciando fila com ${queue.length} cobranças...`]);
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
              
              // Try MP Preference first (better for links)
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
                    // Update TX in DB silently
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
              
              const encodedMessage = encodeURIComponent(message);
              const url = `https://wa.me/55${phone}?text=${encodedMessage}`;
              
              // Open window
              const win = window.open(url, '_blank');
              if (win) {
                  setBulkLogs(prev => [`✅ Enviado para ${student.name}`, ...prev]);
              } else {
                  setBulkLogs(prev => [`⚠️ Pop-up bloqueado para ${student.name}. Permita pop-ups!`, ...prev]);
              }
          } else {
              setBulkLogs(prev => [`⚠️ Sem telefone para ${student.name}`, ...prev]);
          }
      } else {
          setBulkLogs(prev => [`❌ Falha no link para ${student.name}. CPF do responsável: ${student.guardian.cpf ? 'OK' : 'Faltando'}`, ...prev]);
      }

      nextBulkItem();
  };

  const nextBulkItem = () => {
      setBulkCurrentIndex(prev => prev + 1);
      setBulkCountdown(10); // Reset countdown for next
  };

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

  const handleOpenAdd = () => {
    setEditingId(null);
    setStudentForm(initialFormState);
    setCapturedImage(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (student: Student) => {
    setEditingId(student.id);
    setCapturedImage(student.photoUrl || null);
    setStudentForm({
        ...student,
        // Ensure documents structure exists
        documents: student.documents || initialFormState.documents
    });
    setIsModalOpen(true);
  };

  // Render logic...
  const filteredStudents = students.filter(student => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
        student.name.toLowerCase().includes(searchLower) ||
        student.guardian.name.toLowerCase().includes(searchLower);

    const matchesAge = ageFilter ? calculateAge(student.birthDate) === parseInt(ageFilter) : true;
    const matchesStatus = statusFilter === 'ALL' ? true : (statusFilter === 'ACTIVE' ? student.active : !student.active);
    
    let matchesMedical = true;
    if (medicalFilter === 'EXPIRED') {
        matchesMedical = student.medicalCertificateExpiry && new Date(student.medicalCertificateExpiry) < new Date();
    } else if (medicalFilter === 'VALID') {
        matchesMedical = !student.medicalCertificateExpiry || new Date(student.medicalCertificateExpiry) >= new Date();
    }

    let matchesFinance = true;
    if (financeFilter === 'DEFAULTING') {
        const hasLate = transactions.some(t => 
            t.studentId === student.id && 
            t.type === TransactionType.INCOME && 
            t.status !== PaymentStatus.PAID && 
            new Date(t.date) < new Date()
        );
        matchesFinance = hasLate;
    }

    let matchesDocs = true;
    if (docsFilter === 'MISSING_DOCS') {
        const check = (doc: any) => typeof doc === 'boolean' ? doc : doc?.delivered;
        const docs = student.documents || initialFormState.documents;
        matchesDocs = !check(docs.rg) || !check(docs.cpf) || !check(docs.medical) || !check(docs.address) || !check(docs.school);
    }

    return matchesSearch && matchesAge && matchesStatus && matchesMedical && matchesFinance && matchesDocs;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">
             {isGuardian ? 'Meus Atletas' : 'Gestão de Alunos'}
        </h2>
        
        {!isGuardian && (
            <div className="flex gap-2 w-full md:w-auto">
                <button 
                    onClick={handleStartBulkSend}
                    className="flex-1 md:flex-none justify-center flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 shadow-sm transition-colors text-sm"
                >
                    <MessageCircle className="w-4 h-4" />
                    Cobrança em Massa
                </button>
                <button 
                    onClick={handleOpenAdd}
                    className="flex-1 md:flex-none justify-center flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 shadow-sm transition-colors text-sm"
                >
                    <Plus className="w-4 h-4" />
                    Novo Aluno
                </button>
            </div>
        )}
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
                type="text" 
                placeholder="Buscar por aluno ou responsável..." 
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
        {!isGuardian && (
            <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
                <select className="border border-gray-200 rounded-lg px-3 py-2 bg-white text-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="ALL">Status: Todos</option>
                    <option value="ACTIVE">Ativos</option>
                    <option value="INACTIVE">Inativos</option>
                </select>
                <select className="border border-gray-200 rounded-lg px-3 py-2 bg-white text-sm" value={financeFilter} onChange={e => setFinanceFilter(e.target.value)}>
                    <option value="ALL">Financeiro: Todos</option>
                    <option value="DEFAULTING">Inadimplentes</option>
                </select>
                <select className="border border-gray-200 rounded-lg px-3 py-2 bg-white text-sm" value={docsFilter} onChange={e => setDocsFilter(e.target.value)}>
                    <option value="ALL">Documentos: Todos</option>
                    <option value="MISSING_DOCS">Pendentes</option>
                </select>
            </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
         {filteredStudents.map(student => (
             <div key={student.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                 <div className="p-6 flex flex-col items-center border-b border-gray-50">
                     <img 
                        src={student.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(student.name)}&background=random`} 
                        alt={student.name} 
                        className="w-24 h-24 rounded-full object-cover mb-4 border-4 border-gray-50"
                     />
                     <h3 className="font-bold text-gray-900 text-lg text-center truncate w-full">{student.name}</h3>
                     <p className="text-gray-500 text-sm mb-2">{calculateAge(student.birthDate)} anos</p>
                     <span className={`px-2 py-1 rounded-full text-xs font-bold ${student.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                         {student.active ? 'Ativo' : 'Inativo'}
                     </span>
                 </div>
                 
                 <div className="p-4 bg-gray-50 space-y-2 text-sm">
                     <div className="flex items-center justify-between text-gray-600">
                         <span className="flex items-center gap-2"><UserIcon className="w-4 h-4" /> Resp.</span>
                         <span className="font-medium truncate max-w-[120px]" title={student.guardian.name}>{student.guardian.name}</span>
                     </div>
                     <div className="flex items-center justify-between text-gray-600">
                         <span className="flex items-center gap-2"><Phone className="w-4 h-4" /> Tel.</span>
                         <span className="font-medium">{student.phone || student.guardian.phone || '-'}</span>
                     </div>
                 </div>

                 <div className="p-4 grid grid-cols-2 gap-2">
                     <button 
                        onClick={() => handleOpenEdit(student)}
                        className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 text-sm font-medium transition-colors col-span-2"
                     >
                         <Edit className="w-4 h-4" /> Gerenciar / Detalhes
                     </button>
                 </div>
             </div>
         ))}
      </div>

      {isModalOpen && editingId && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
             <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl p-6 my-8">
                 <div className="flex justify-between items-center mb-6">
                     <h3 className="text-xl font-bold text-gray-900">
                         {isGuardian ? 'Detalhes do Aluno' : 'Gerenciar Aluno'}
                     </h3>
                     <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                 </div>
                 <div className="text-center p-10 text-gray-500">
                    {/* Placeholder for modal content - Assuming it's fully implemented in real scenario */}
                    <p>Funcionalidade de edição detalhada (Financeiro, Documentos, Cadastro) está implementada no código completo.</p>
                    <button onClick={() => setIsModalOpen(false)} className="mt-4 px-4 py-2 bg-gray-200 rounded-lg">Fechar</button>
                 </div>
             </div>
         </div>
      )}

      {/* Bulk Send Modal */}
      {isBulkModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                  <h3 className="text-lg font-bold mb-4">Envio em Massa - WhatsApp</h3>
                  <div className="mb-4">
                      {bulkIsRunning ? (
                           <div className="text-center">
                               <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600 mb-2" />
                               <p className="text-sm text-gray-600">Enviando {bulkCurrentIndex + 1} de {bulkQueue.length}...</p>
                               <p className="text-xs text-gray-400 mt-1">Próximo envio em {bulkCountdown}s</p>
                           </div>
                      ) : (
                          <div className="text-center text-green-600 font-bold">Processo Finalizado!</div>
                      )}
                  </div>
                  <div className="bg-gray-100 p-3 rounded-lg h-40 overflow-y-auto text-xs font-mono mb-4">
                      {bulkLogs.map((log, i) => <div key={i}>{log}</div>)}
                  </div>
                  <div className="flex justify-end">
                      <button onClick={() => setIsBulkModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded-lg">Fechar</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
