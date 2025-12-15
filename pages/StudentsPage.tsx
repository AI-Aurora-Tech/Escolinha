
import React, { useState, useRef, useEffect } from 'react';
import { Student, Group, Plan, Transaction, TransactionType, PaymentStatus, PaymentMethod, Activity, User, UserRole } from '../types';
import { Search, Plus, Phone, User as UserIcon, Edit, Camera, X, CheckSquare, Square, FileSpreadsheet, FileText, Filter, HeartPulse, ShieldCheck, MessageCircle, MapPin, Loader2, Printer, Wallet, QrCode, CheckCircle, Clock, Link as LinkIcon, History, CalendarCheck, XCircle, Download, Calculator, AlertTriangle, FileWarning, FolderCheck, Upload, RefreshCw, Copy, Send, Lock, PlusCircle, Calendar, Ban, Zap, Play, Pause, DollarSign } from 'lucide-react';
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
  
  // Background Monitoring State for PIX
  const [monitoredPayments, setMonitoredPayments] = useState<{ mpId: number, txIds: string[] }[]>([]);

  // Camera States
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  // CEP Loading State
  const [isLoadingCep, setIsLoadingCep] = useState(false);
  
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

      if (confirm(`Encontradas ${queue.length} cobranças pendentes. Deseja iniciar o envio?`)) {
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
      if (!finalLink && student.guardian.cpf) {
         try {
              const externalReference = tx.externalReference || crypto.randomUUID();
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
                onUpdateTransaction({ ...tx, paymentLink: finalLink, externalReference });
            }
         } catch(e) {}
      }

      if (finalLink) {
          const phone = student.guardian.phone.replace(/\D/g, '');
          if (phone) {
              const dueDate = formatDate(tx.date);
              const message = `Olá ${student.guardian.name}, mensalidade de ${student.name} (${dueDate}). Link: ${finalLink}`;
              const url = `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`;
              const win = window.open(url, '_blank');
              if (win) setBulkLogs(prev => [`✅ Enviado para ${student.name}`, ...prev]);
              else setBulkLogs(prev => [`⚠️ Pop-up bloqueado: ${student.name}`, ...prev]);
          } else {
              setBulkLogs(prev => [`⚠️ Sem telefone: ${student.name}`, ...prev]);
          }
      } else {
          setBulkLogs(prev => [`❌ Falha no link: ${student.name}`, ...prev]);
      }

      nextBulkItem();
  };

  const nextBulkItem = () => {
      setBulkCurrentIndex(prev => prev + 1);
      setBulkCountdown(10); 
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

  // --- CAMERA HANDLERS ---
  const startCamera = async () => {
      setIsCameraOpen(true);
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (videoRef.current) {
              videoRef.current.srcObject = stream;
          }
      } catch (err) {
          console.error("Erro ao acessar camera:", err);
          alert("Não foi possível acessar a câmera.");
          setIsCameraOpen(false);
      }
  };

  const capturePhoto = () => {
      if (videoRef.current && canvasRef.current) {
          const context = canvasRef.current.getContext('2d');
          if (context) {
              context.drawImage(videoRef.current, 0, 0, 320, 240);
              const dataUrl = canvasRef.current.toDataURL('image/jpeg');
              setCapturedImage(dataUrl);
              setStudentForm({...studentForm, photoUrl: dataUrl});
              stopCamera();
          }
      }
  };

  const stopCamera = () => {
      if (videoRef.current && videoRef.current.srcObject) {
          const stream = videoRef.current.srcObject as MediaStream;
          const tracks = stream.getTracks();
          tracks.forEach(track => track.stop());
          videoRef.current.srcObject = null;
      }
      setIsCameraOpen(false);
  };

  // --- CEP HANDLER ---
  const handleCepBlur = async () => {
      const cep = studentForm.address.cep.replace(/\D/g, '');
      if (cep.length === 8) {
          setIsLoadingCep(true);
          try {
              const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
              const data = await response.json();
              if (!data.erro) {
                  setStudentForm(prev => ({
                      ...prev,
                      address: {
                          ...prev.address,
                          street: data.logradouro,
                          district: data.bairro,
                          city: data.localidade,
                          state: data.uf
                      }
                  }));
              }
          } catch (error) {
              console.error("Erro ao buscar CEP", error);
          } finally {
              setIsLoadingCep(false);
          }
      }
  };

  const handleOpenAdd = () => {
    setEditingId(null);
    setStudentForm(initialFormState);
    setCapturedImage(null);
    setActiveTab('DETAILS');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (student: Student) => {
    setEditingId(student.id);
    setCapturedImage(student.photoUrl || null);
    setStudentForm({
        ...student,
        groupIds: student.groupIds || [],
        documents: student.documents || initialFormState.documents,
        address: student.address || initialFormState.address
    });
    setActiveTab('DETAILS');
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const studentData = {
        ...studentForm,
        photoUrl: capturedImage || studentForm.photoUrl
    };

    if (editingId) {
        onUpdateStudent({ ...studentData, id: editingId });
    } else {
        onAddStudent(studentData);
    }
    setIsModalOpen(false);
  };

  // Render logic...
  const filteredStudents = students.filter(student => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
        student.name.toLowerCase().includes(searchLower) ||
        student.guardian.name.toLowerCase().includes(searchLower);
    return matchesSearch;
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

      {isModalOpen && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
             <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl p-6 my-8">
                 <div className="flex justify-between items-center mb-6">
                     <h3 className="text-xl font-bold text-gray-900">
                         {editingId ? (isGuardian ? 'Detalhes do Aluno' : 'Editar Aluno') : 'Novo Aluno'}
                     </h3>
                     <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                 </div>

                 <div className="flex gap-4 border-b border-gray-100 mb-6 overflow-x-auto">
                      <button onClick={() => setActiveTab('DETAILS')} className={`pb-2 text-sm font-medium whitespace-nowrap transition-colors ${activeTab === 'DETAILS' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}`}>
                          Dados Cadastrais
                      </button>
                      {editingId && (
                          <>
                              <button onClick={() => setActiveTab('FINANCE')} className={`pb-2 text-sm font-medium whitespace-nowrap transition-colors ${activeTab === 'FINANCE' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}`}>
                                  Financeiro
                              </button>
                              <button onClick={() => setActiveTab('ATTENDANCE')} className={`pb-2 text-sm font-medium whitespace-nowrap transition-colors ${activeTab === 'ATTENDANCE' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}`}>
                                  Frequência
                              </button>
                          </>
                      )}
                 </div>

                 {activeTab === 'DETAILS' && (
                     <form onSubmit={handleSubmit} className="space-y-8">
                         {/* PHOTO SECTION */}
                         <div className="flex flex-col items-center justify-center gap-4 p-6 bg-gray-50 rounded-xl border border-gray-100">
                             <div className="relative">
                                 {isCameraOpen ? (
                                     <div className="relative rounded-full overflow-hidden w-32 h-32 border-4 border-white shadow-lg">
                                         <video ref={videoRef} autoPlay className="w-full h-full object-cover"></video>
                                         <canvas ref={canvasRef} width="320" height="240" className="hidden"></canvas>
                                     </div>
                                 ) : (
                                     <img 
                                         src={capturedImage || studentForm.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(studentForm.name || 'Novo Aluno')}&background=random`} 
                                         alt="Foto" 
                                         className="w-32 h-32 rounded-full object-cover border-4 border-white shadow-lg"
                                     />
                                 )}
                                 {!isGuardian && (
                                     <button 
                                         type="button"
                                         onClick={isCameraOpen ? capturePhoto : startCamera}
                                         className="absolute bottom-0 right-0 p-2 bg-primary-600 text-white rounded-full shadow-lg hover:bg-primary-700 transition-colors"
                                         title={isCameraOpen ? "Tirar Foto" : "Abrir Câmera"}
                                     >
                                         <Camera className="w-5 h-5" />
                                     </button>
                                 )}
                             </div>
                             {isCameraOpen && <button type="button" onClick={stopCamera} className="text-xs text-red-500 underline">Cancelar</button>}
                         </div>

                         {/* PERSONAL INFO */}
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                             <div>
                                 <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                                 <input type="text" required className="w-full border rounded-lg p-2" value={studentForm.name} onChange={e => setStudentForm({...studentForm, name: e.target.value})} disabled={isGuardian} />
                             </div>
                             <div>
                                 <label className="block text-sm font-medium text-gray-700 mb-1">Data de Nascimento</label>
                                 <input type="date" required className="w-full border rounded-lg p-2" value={studentForm.birthDate} onChange={e => setStudentForm({...studentForm, birthDate: e.target.value})} disabled={isGuardian} />
                             </div>
                             <div>
                                 <label className="block text-sm font-medium text-gray-700 mb-1">CPF do Aluno</label>
                                 <input type="text" className="w-full border rounded-lg p-2" value={studentForm.cpf} onChange={e => setStudentForm({...studentForm, cpf: e.target.value})} disabled={isGuardian} />
                             </div>
                             <div>
                                 <label className="block text-sm font-medium text-gray-700 mb-1">RG do Aluno</label>
                                 <input type="text" className="w-full border rounded-lg p-2" value={studentForm.rg} onChange={e => setStudentForm({...studentForm, rg: e.target.value})} disabled={isGuardian} />
                             </div>
                             
                             {!isGuardian && (
                                 <>
                                 <div>
                                     <label className="block text-sm font-medium text-gray-700 mb-1">Plano</label>
                                     <select className="w-full border rounded-lg p-2 bg-white" value={studentForm.planId} onChange={e => setStudentForm({...studentForm, planId: e.target.value})}>
                                         <option value="">Selecione...</option>
                                         {plans.map(p => <option key={p.id} value={p.id}>{p.name} - R$ {p.price}</option>)}
                                     </select>
                                 </div>
                                 <div>
                                     <label className="block text-sm font-medium text-gray-700 mb-1">Grupos (Segure Ctrl para múltiplos)</label>
                                     <select multiple className="w-full border rounded-lg p-2 bg-white h-24" 
                                        value={studentForm.groupIds} 
                                        onChange={e => {
                                            const options = Array.from(e.target.selectedOptions, option => option.value);
                                            setStudentForm({...studentForm, groupIds: options});
                                        }}
                                     >
                                         {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                     </select>
                                 </div>
                                 <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Validade Atestado</label>
                                    <input type="date" className="w-full border rounded-lg p-2" value={studentForm.medicalCertificateExpiry} onChange={e => setStudentForm({...studentForm, medicalCertificateExpiry: e.target.value})} />
                                 </div>
                                 <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                                    <select className="w-full border rounded-lg p-2 bg-white" value={studentForm.active ? 'true' : 'false'} onChange={e => setStudentForm({...studentForm, active: e.target.value === 'true'})}>
                                        <option value="true">Ativo</option>
                                        <option value="false">Inativo</option>
                                    </select>
                                 </div>
                                 </>
                             )}
                         </div>

                         {/* ADDRESS */}
                         <div className="border-t pt-6">
                             <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><MapPin className="w-4 h-4"/> Endereço</h4>
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                 <div>
                                     <label className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
                                     <div className="relative">
                                         <input type="text" className="w-full border rounded-lg p-2" value={studentForm.address?.cep || ''} 
                                             onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, cep: e.target.value}})} 
                                             onBlur={handleCepBlur}
                                             placeholder="00000-000"
                                         />
                                         {isLoadingCep && <Loader2 className="absolute right-2 top-2.5 w-4 h-4 animate-spin text-gray-400" />}
                                     </div>
                                 </div>
                                 <div className="md:col-span-2">
                                     <label className="block text-sm font-medium text-gray-700 mb-1">Rua</label>
                                     <input type="text" className="w-full border rounded-lg p-2" value={studentForm.address?.street || ''} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, street: e.target.value}})} />
                                 </div>
                                 <div>
                                     <label className="block text-sm font-medium text-gray-700 mb-1">Número</label>
                                     <input type="text" className="w-full border rounded-lg p-2" value={studentForm.address?.number || ''} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, number: e.target.value}})} />
                                 </div>
                                 <div>
                                     <label className="block text-sm font-medium text-gray-700 mb-1">Bairro</label>
                                     <input type="text" className="w-full border rounded-lg p-2" value={studentForm.address?.district || ''} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, district: e.target.value}})} />
                                 </div>
                                 <div>
                                     <label className="block text-sm font-medium text-gray-700 mb-1">Cidade/UF</label>
                                     <input type="text" className="w-full border rounded-lg p-2" value={`${studentForm.address?.city || ''} - ${studentForm.address?.state || ''}`} disabled />
                                 </div>
                             </div>
                         </div>

                         {/* GUARDIAN */}
                         <div className="border-t pt-6">
                             <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><UserIcon className="w-4 h-4"/> Responsável</h4>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                 <div>
                                     <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                                     <input type="text" required className="w-full border rounded-lg p-2" value={studentForm.guardian?.name || ''} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, name: e.target.value}})} />
                                 </div>
                                 <div>
                                     <label className="block text-sm font-medium text-gray-700 mb-1">Telefone (WhatsApp)</label>
                                     <input type="text" required className="w-full border rounded-lg p-2" value={studentForm.guardian?.phone || ''} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, phone: e.target.value}})} />
                                 </div>
                                 <div>
                                     <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                     <input type="email" className="w-full border rounded-lg p-2" value={studentForm.guardian?.email || ''} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, email: e.target.value}})} />
                                 </div>
                                 <div>
                                     <label className="block text-sm font-medium text-gray-700 mb-1">CPF (Login)</label>
                                     <input type="text" required className="w-full border rounded-lg p-2" value={studentForm.guardian?.cpf || ''} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, cpf: e.target.value}})} />
                                 </div>
                             </div>
                         </div>

                         {/* DOCUMENTS CHECKLIST */}
                         {!isGuardian && (
                             <div className="border-t pt-6">
                                 <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><FileText className="w-4 h-4"/> Documentos Entregues</h4>
                                 <div className="flex flex-wrap gap-4">
                                     {['rg', 'cpf', 'medical', 'address', 'school'].map((docKey) => {
                                         const labelMap: any = { rg: 'RG', cpf: 'CPF', medical: 'Atestado', address: 'Comp. Residência', school: 'Dec. Escolar' };
                                         const isChecked = studentForm.documents && 
                                            (typeof studentForm.documents[docKey] === 'boolean' 
                                                ? studentForm.documents[docKey] 
                                                : studentForm.documents[docKey]?.delivered);
                                         
                                         return (
                                             <label key={docKey} className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer bg-white hover:bg-gray-50">
                                                 <input 
                                                     type="checkbox" 
                                                     checked={isChecked || false}
                                                     onChange={(e) => {
                                                         setStudentForm({
                                                             ...studentForm, 
                                                             documents: {
                                                                 ...studentForm.documents,
                                                                 [docKey]: { delivered: e.target.checked, isDigital: false }
                                                             }
                                                         });
                                                     }}
                                                     className="w-4 h-4 text-primary-600 rounded" 
                                                 />
                                                 <span className="text-sm font-medium text-gray-700">{labelMap[docKey]}</span>
                                             </label>
                                         );
                                     })}
                                 </div>
                             </div>
                         )}

                         <div className="flex justify-end gap-2 pt-4 border-t">
                             <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                             <button type="submit" className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">Salvar Alterações</button>
                         </div>
                     </form>
                 )}

                 {activeTab === 'FINANCE' && editingId && (
                     <div className="space-y-6">
                         {!isGuardian && (
                            <div className="flex justify-between items-center bg-gray-50 p-4 rounded-lg border border-gray-100">
                                <div>
                                    <h4 className="font-bold text-gray-800">Nova Cobrança</h4>
                                    <p className="text-sm text-gray-500">Adicionar cobrança avulsa (uniforme, taxa, etc)</p>
                                </div>
                                <button onClick={() => setShowChargeModal(true)} className="flex items-center gap-2 bg-white border border-gray-200 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-100 text-gray-700">
                                    <Plus className="w-4 h-4" /> Adicionar
                                </button>
                            </div>
                         )}

                         <div className="overflow-x-auto border rounded-lg">
                             <table className="w-full text-sm text-left">
                                 <thead className="bg-gray-50 text-gray-500">
                                     <tr>
                                         <th className="p-3">Vencimento</th>
                                         <th className="p-3">Descrição</th>
                                         <th className="p-3">Valor</th>
                                         <th className="p-3">Status</th>
                                         <th className="p-3 text-right">Ações</th>
                                     </tr>
                                 </thead>
                                 <tbody className="divide-y">
                                     {transactions
                                        .filter(t => t.studentId === editingId && t.type === TransactionType.INCOME)
                                        .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                        .map(tx => (
                                            <tr key={tx.id} className="hover:bg-gray-50">
                                                <td className="p-3">{formatDate(tx.date)}</td>
                                                <td className="p-3">{tx.description}</td>
                                                <td className="p-3 font-medium">R$ {tx.amount.toFixed(2)}</td>
                                                <td className="p-3">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                                        tx.status === PaymentStatus.PAID ? 'bg-green-100 text-green-700' : 
                                                        tx.status === PaymentStatus.PENDING ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                                                    }`}>
                                                        {tx.status === PaymentStatus.PAID ? 'Pago' : tx.status === PaymentStatus.PENDING ? 'Pendente' : 'Atrasado'}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-right flex justify-end gap-2">
                                                    {tx.status !== PaymentStatus.PAID && (
                                                        <>
                                                            {!isGuardian && (
                                                                <button onClick={() => handlePayTransaction(tx.id, PaymentMethod.CASH)} className="p-1.5 text-green-600 hover:bg-green-50 rounded" title="Receber em Dinheiro">
                                                                    <DollarSign className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                            {tx.paymentLink && (
                                                                <a href={tx.paymentLink} target="_blank" rel="noreferrer" className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Link de Pagamento">
                                                                    <LinkIcon className="w-4 h-4" />
                                                                </a>
                                                            )}
                                                        </>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                 </tbody>
                             </table>
                         </div>
                     </div>
                 )}

                 {activeTab === 'ATTENDANCE' && editingId && (
                     <div className="space-y-4">
                         <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 mb-4">
                             <div className="flex gap-4 items-center">
                                 <span className="text-sm font-medium text-gray-600">Presença nos últimos 30 dias:</span>
                                 <span className="text-lg font-bold text-gray-900">
                                     {activities.filter(a => a.attendance.includes(editingId!) && new Date(a.date) > new Date(Date.now() - 30*24*60*60*1000)).length} aulas
                                 </span>
                             </div>
                         </div>
                         <div className="overflow-x-auto border rounded-lg">
                             <table className="w-full text-sm text-left">
                                 <thead className="bg-gray-50 text-gray-500">
                                     <tr>
                                         <th className="p-3">Data</th>
                                         <th className="p-3">Atividade</th>
                                         <th className="p-3">Horário</th>
                                         <th className="p-3 text-center">Status</th>
                                     </tr>
                                 </thead>
                                 <tbody className="divide-y">
                                     {activities
                                        .filter(a => a.groupId && studentForm.groupIds.includes(a.groupId))
                                        .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                        .map(activity => {
                                            const isPresent = activity.attendance.includes(editingId!);
                                            const isFuture = new Date(activity.date) > new Date();
                                            return (
                                                <tr key={activity.id} className="hover:bg-gray-50">
                                                    <td className="p-3">{formatDate(activity.date)}</td>
                                                    <td className="p-3">{activity.title}</td>
                                                    <td className="p-3">{activity.startTime}</td>
                                                    <td className="p-3 text-center">
                                                        {isFuture ? (
                                                            <span className="text-gray-400">-</span>
                                                        ) : isPresent ? (
                                                            <span className="inline-flex items-center gap-1 text-green-600 font-medium"><CheckCircle className="w-3 h-3"/> Presente</span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 text-red-500"><XCircle className="w-3 h-3"/> Ausente</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                 </tbody>
                             </table>
                         </div>
                     </div>
                 )}
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
      
      {/* Charge Modal */}
      {showChargeModal && editingId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
                <h3 className="font-bold text-lg mb-4">Nova Cobrança Avulsa</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Descrição</label>
                        <input type="text" className="w-full border rounded p-2" placeholder="Ex: Uniforme" 
                            value={manualCharge.description} onChange={e => setManualCharge({...manualCharge, description: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Valor (R$)</label>
                        <input type="number" className="w-full border rounded p-2" placeholder="0.00" 
                            value={manualCharge.amount} onChange={e => setManualCharge({...manualCharge, amount: parseFloat(e.target.value)})} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Vencimento</label>
                        <input type="date" className="w-full border rounded p-2" 
                            value={manualCharge.date} onChange={e => setManualCharge({...manualCharge, date: e.target.value})} />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button onClick={() => setShowChargeModal(false)} className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancelar</button>
                        <button onClick={() => {
                            onAddTransaction({
                                description: manualCharge.description,
                                amount: manualCharge.amount,
                                type: TransactionType.INCOME,
                                status: PaymentStatus.PENDING,
                                date: manualCharge.date,
                                studentId: editingId,
                                paymentMethod: PaymentMethod.PIX_MERCADO_PAGO
                            });
                            setShowChargeModal(false);
                            setManualCharge({ description: '', amount: 0, date: new Date().toISOString().split('T')[0] });
                        }} className="px-3 py-2 bg-primary-600 text-white rounded hover:bg-primary-700">Criar</button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
