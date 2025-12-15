
import React, { useState, useRef, useEffect } from 'react';
import { Student, Group, Plan, Transaction, TransactionType, PaymentStatus, PaymentMethod, Activity, User, UserRole } from '../types';
import { Search, Plus, Phone, User as UserIcon, Edit, Camera, X, CheckSquare, Square, FileText, Filter, MessageCircle, MapPin, Loader2, Link as LinkIcon, CalendarCheck, XCircle, CheckCircle, DollarSign, LayoutGrid, List, MoreVertical, TrendingUp, AlertCircle, Users, FileWarning, Shirt } from 'lucide-react';
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
  // UI State
  const [viewMode, setViewMode] = useState<'GRID' | 'LIST'>('GRID');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [financeFilter, setFinanceFilter] = useState<'ALL' | 'DEFAULTING'>('ALL');
  const [docsFilter, setDocsFilter] = useState<'ALL' | 'MISSING'>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'DETAILS' | 'FINANCE' | 'ATTENDANCE'>('DETAILS');
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Payment PIX State
  const [showPixModal, setShowPixModal] = useState(false);
  const [pixLoading, setPixLoading] = useState(false);
  const [pixData, setPixData] = useState<{ qrCode: string; qrCodeBase64: string; id: number } | null>(null);
  
  // Monitoring
  const [monitoredPayments, setMonitoredPayments] = useState<{ mpId: number, txIds: string[] }[]>([]);

  // Camera & Upload
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isLoadingCep, setIsLoadingCep] = useState(false);
  
  // Manual Charge
  const [showChargeModal, setShowChargeModal] = useState(false);
  const [manualCharge, setManualCharge] = useState({ description: '', amount: 0, date: new Date().toISOString().split('T')[0] });

  // Bulk Send
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

  // Apply initial props filter
  useEffect(() => {
    if (initialFilter === 'DEFAULTING') setFinanceFilter('DEFAULTING');
    if (initialFilter === 'MISSING_DOCS') setDocsFilter('MISSING');
  }, [initialFilter]);

  // --- STATS CALCULATIONS ---
  const stats = {
      total: students.length,
      active: students.filter(s => s.active).length,
      defaulting: 0,
      missingDocs: 0
  };

  // Calculate defaulting (expensive operation, do efficiently)
  const today = new Date();
  const defaultingIds = new Set(
    transactions
        .filter(t => t.type === TransactionType.INCOME && t.status !== PaymentStatus.PAID && new Date(t.date) < today)
        .map(t => t.studentId)
  );
  stats.defaulting = defaultingIds.size;

  // Calculate Missing Docs
  stats.missingDocs = students.filter(s => {
      if (!s.active || !s.documents) return false;
      const check = (doc: any) => typeof doc === 'boolean' ? doc : doc?.delivered;
      return !check(s.documents.rg) || !check(s.documents.cpf) || !check(s.documents.medical);
  }).length;


  // --- FILTER LOGIC ---
  const filteredStudents = students.filter(student => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
        student.name.toLowerCase().includes(searchLower) ||
        student.guardian.name.toLowerCase().includes(searchLower);
    
    if (!matchesSearch) return false;

    if (statusFilter === 'ACTIVE' && !student.active) return false;
    if (statusFilter === 'INACTIVE' && student.active) return false;

    if (financeFilter === 'DEFAULTING' && !defaultingIds.has(student.id)) return false;

    if (docsFilter === 'MISSING') {
        const check = (doc: any) => typeof doc === 'boolean' ? doc : doc?.delivered;
        const docs = student.documents || initialFormState.documents;
        const isMissing = !check(docs.rg) || !check(docs.cpf) || !check(docs.medical);
        if (!isMissing) return false;
    }

    return true;
  });

  // --- ACTIONS ---
  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const parts = dateString.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateString;
  };

  const calculateAge = (birthDateString: string) => {
    if (!birthDateString) return 0;
    const today = new Date();
    const birthDate = new Date(birthDateString);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
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

  // --- MODAL HANDLERS ---
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

  // --- CAMERA ---
  const startCamera = async () => {
    setIsCameraOpen(true);
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) { alert("Não foi possível acessar a câmera."); setIsCameraOpen(false); }
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

  // --- BULK SEND ---
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

  // --- CEP ---
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
          } catch (error) { console.error("Erro ao buscar CEP", error); } finally { setIsLoadingCep(false); }
      }
  };

  return (
    <div className="space-y-6">
      
      {/* --- HEADER & STATS --- */}
      {!isGuardian && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                <div>
                    <p className="text-xs text-gray-500 uppercase font-semibold">Total Alunos</p>
                    <h3 className="text-2xl font-bold text-gray-900">{stats.total}</h3>
                </div>
                <div className="p-2 bg-gray-50 rounded-lg text-gray-600"><Users className="w-5 h-5"/></div>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                <div>
                    <p className="text-xs text-gray-500 uppercase font-semibold">Ativos</p>
                    <h3 className="text-2xl font-bold text-green-600">{stats.active}</h3>
                </div>
                <div className="p-2 bg-green-50 rounded-lg text-green-600"><CheckCircle className="w-5 h-5"/></div>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between cursor-pointer hover:border-red-200 transition-colors" onClick={() => setFinanceFilter(financeFilter === 'DEFAULTING' ? 'ALL' : 'DEFAULTING')}>
                <div>
                    <p className="text-xs text-gray-500 uppercase font-semibold">Inadimplentes</p>
                    <h3 className="text-2xl font-bold text-red-600">{stats.defaulting}</h3>
                </div>
                <div className={`p-2 rounded-lg ${financeFilter === 'DEFAULTING' ? 'bg-red-100 text-red-700' : 'bg-red-50 text-red-600'}`}><AlertCircle className="w-5 h-5"/></div>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between cursor-pointer hover:border-orange-200 transition-colors" onClick={() => setDocsFilter(docsFilter === 'MISSING' ? 'ALL' : 'MISSING')}>
                <div>
                    <p className="text-xs text-gray-500 uppercase font-semibold">Doc. Pendente</p>
                    <h3 className="text-2xl font-bold text-orange-600">{stats.missingDocs}</h3>
                </div>
                <div className={`p-2 rounded-lg ${docsFilter === 'MISSING' ? 'bg-orange-100 text-orange-700' : 'bg-orange-50 text-orange-600'}`}><FileWarning className="w-5 h-5"/></div>
            </div>
        </div>
      )}

      {/* --- TOOLBAR --- */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
              <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input 
                      type="text" 
                      placeholder="Buscar aluno..." 
                      className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 w-full sm:w-64"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                  />
              </div>
              
              {!isGuardian && (
                  <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0 scrollbar-hide">
                      <button 
                        onClick={() => setStatusFilter(statusFilter === 'ALL' ? 'ACTIVE' : 'ALL')}
                        className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${statusFilter === 'ACTIVE' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                      >
                          Ativos
                      </button>
                      <button 
                        onClick={() => setFinanceFilter(financeFilter === 'ALL' ? 'DEFAULTING' : 'ALL')}
                        className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${financeFilter === 'DEFAULTING' ? 'bg-red-100 text-red-800 border border-red-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                      >
                          Financeiro
                      </button>
                  </div>
              )}
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
              <div className="flex bg-gray-100 p-1 rounded-lg mr-2">
                  <button onClick={() => setViewMode('GRID')} className={`p-2 rounded-md transition-all ${viewMode === 'GRID' ? 'bg-white shadow-sm text-primary-600' : 'text-gray-500'}`}><LayoutGrid className="w-5 h-5"/></button>
                  <button onClick={() => setViewMode('LIST')} className={`p-2 rounded-md transition-all ${viewMode === 'LIST' ? 'bg-white shadow-sm text-primary-600' : 'text-gray-500'}`}><List className="w-5 h-5"/></button>
              </div>
              
              {!isGuardian && (
                  <>
                    <button 
                        onClick={handleStartBulkSend}
                        className="p-2 text-green-600 bg-green-50 hover:bg-green-100 rounded-lg border border-green-200 transition-colors"
                        title="Cobrança em Massa"
                    >
                        <MessageCircle className="w-5 h-5" />
                    </button>
                    <button 
                        onClick={handleOpenAdd}
                        className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 shadow-sm transition-colors font-medium"
                    >
                        <Plus className="w-5 h-5" /> <span className="hidden sm:inline">Novo Aluno</span>
                    </button>
                  </>
              )}
          </div>
      </div>

      {/* --- CONTENT GRID/LIST --- */}
      {viewMode === 'GRID' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredStudents.map(student => {
                const isDefaulting = defaultingIds.has(student.id);
                return (
                    <div key={student.id} className="group bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-all hover:border-primary-200 relative flex flex-col">
                        <div className="h-24 bg-gradient-to-r from-primary-500 to-orange-400 relative">
                             {/* Status Badge Top Right */}
                             <div className="absolute top-3 right-3 flex gap-1">
                                {!student.active && <span className="bg-gray-900/80 text-white text-[10px] font-bold px-2 py-1 rounded-full backdrop-blur-sm">INATIVO</span>}
                                {isDefaulting && <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-sm flex items-center gap-1"><AlertCircle className="w-3 h-3"/> PENDENTE</span>}
                             </div>
                        </div>
                        <div className="px-6 relative flex-1 flex flex-col">
                            <div className="relative -mt-12 mb-3 self-center">
                                <img 
                                    src={student.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(student.name)}&background=random`} 
                                    alt={student.name} 
                                    className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-md bg-white"
                                />
                            </div>
                            
                            <div className="text-center mb-4">
                                <h3 className="font-bold text-gray-900 text-lg leading-tight truncate px-2" title={student.name}>{student.name}</h3>
                                <p className="text-sm text-gray-500 mt-1">{calculateAge(student.birthDate)} anos • {groups.find(g => student.groupIds?.includes(g.id))?.name || 'Sem Grupo'}</p>
                            </div>

                            <div className="space-y-2 mb-6">
                                <div className="flex items-center text-sm text-gray-600 bg-gray-50 p-2 rounded-lg">
                                    <UserIcon className="w-4 h-4 mr-2 text-gray-400" />
                                    <span className="truncate flex-1">{student.guardian.name}</span>
                                </div>
                                <div className="flex items-center text-sm text-gray-600 bg-gray-50 p-2 rounded-lg">
                                    <Phone className="w-4 h-4 mr-2 text-gray-400" />
                                    <span className="truncate flex-1">{student.guardian.phone}</span>
                                </div>
                            </div>
                            
                            <div className="mt-auto pb-6">
                                <button 
                                    onClick={() => handleOpenEdit(student)}
                                    className="w-full py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 hover:border-primary-300 hover:text-primary-700 transition-all flex items-center justify-center gap-2"
                                >
                                    <Edit className="w-4 h-4" /> Gerenciar
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
             <table className="w-full text-left border-collapse">
                 <thead className="bg-gray-50 border-b border-gray-200">
                     <tr>
                         <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Aluno</th>
                         <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Idade / Grupo</th>
                         <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Responsável</th>
                         <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Status</th>
                         <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Ações</th>
                     </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-100">
                     {filteredStudents.map(student => {
                         const isDefaulting = defaultingIds.has(student.id);
                         return (
                             <tr key={student.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => handleOpenEdit(student)}>
                                 <td className="px-6 py-3">
                                     <div className="flex items-center gap-3">
                                         <img src={student.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(student.name)}`} className="w-10 h-10 rounded-full object-cover border border-gray-200" alt=""/>
                                         <div>
                                             <p className="font-medium text-gray-900">{student.name}</p>
                                             {isDefaulting && <span className="text-[10px] text-red-600 font-bold flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Pendente</span>}
                                         </div>
                                     </div>
                                 </td>
                                 <td className="px-6 py-3">
                                     <p className="text-sm text-gray-900">{calculateAge(student.birthDate)} anos</p>
                                     <p className="text-xs text-gray-500">{groups.find(g => student.groupIds?.includes(g.id))?.name || '-'}</p>
                                 </td>
                                 <td className="px-6 py-3 hidden md:table-cell">
                                     <p className="text-sm text-gray-900">{student.guardian.name}</p>
                                     <p className="text-xs text-gray-500">{student.guardian.phone}</p>
                                 </td>
                                 <td className="px-6 py-3 text-center">
                                     <span className={`px-2 py-1 rounded-full text-xs font-bold ${student.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                         {student.active ? 'Ativo' : 'Inativo'}
                                     </span>
                                 </td>
                                 <td className="px-6 py-3 text-right">
                                     <button className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                                         <Edit className="w-4 h-4" />
                                     </button>
                                 </td>
                             </tr>
                         );
                     })}
                 </tbody>
             </table>
        </div>
      )}

      {/* --- EDIT/ADD MODAL --- */}
      {isModalOpen && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
             <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl p-0 my-8 flex flex-col max-h-[90vh]">
                 {/* Modal Header */}
                 <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-2xl">
                     <div>
                        <h3 className="text-xl font-bold text-gray-900">{editingId ? 'Gerenciar Aluno' : 'Novo Cadastro'}</h3>
                        <p className="text-sm text-gray-500">{editingId ? 'Visualize e edite as informações.' : 'Preencha os dados para matricular.'}</p>
                     </div>
                     <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><X className="w-6 h-6 text-gray-500" /></button>
                 </div>

                 {/* Tabs */}
                 <div className="flex border-b border-gray-200 bg-white px-6">
                      {[{id: 'DETAILS', label: 'Dados Cadastrais', icon: FileText}, {id: 'FINANCE', label: 'Financeiro', icon: DollarSign}, {id: 'ATTENDANCE', label: 'Frequência', icon: CalendarCheck}].map(tab => {
                          if (!editingId && tab.id !== 'DETAILS') return null;
                          const Icon = tab.icon;
                          return (
                              <button 
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)} 
                                className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                              >
                                  <Icon className="w-4 h-4" /> {tab.label}
                              </button>
                          )
                      })}
                 </div>

                 {/* Modal Body */}
                 <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-white">
                     {activeTab === 'DETAILS' && (
                         <form onSubmit={handleSubmit} className="space-y-8">
                             {/* Photo & Basic Info Row */}
                             <div className="flex flex-col md:flex-row gap-8">
                                 {/* Photo Area */}
                                 <div className="flex flex-col items-center gap-3">
                                     <div className="relative group">
                                         {isCameraOpen ? (
                                             <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-gray-200 shadow-inner">
                                                 <video ref={videoRef} autoPlay className="w-full h-full object-cover"></video>
                                                 <canvas ref={canvasRef} width="320" height="240" className="hidden"></canvas>
                                             </div>
                                         ) : (
                                             <img 
                                                 src={capturedImage || studentForm.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(studentForm.name || 'Novo')}&background=random`} 
                                                 alt="Foto" 
                                                 className="w-32 h-32 rounded-full object-cover border-4 border-gray-100 shadow-md"
                                             />
                                         )}
                                         {!isGuardian && (
                                             <button 
                                                 type="button"
                                                 onClick={isCameraOpen ? capturePhoto : startCamera}
                                                 className="absolute bottom-0 right-0 p-2.5 bg-primary-600 text-white rounded-full shadow-lg hover:bg-primary-700 transition-transform transform hover:scale-105"
                                                 title="Alterar Foto"
                                             >
                                                 <Camera className="w-4 h-4" />
                                             </button>
                                         )}
                                     </div>
                                     {isCameraOpen && <button type="button" onClick={stopCamera} className="text-xs text-red-500 hover:underline">Cancelar</button>}
                                 </div>

                                 {/* Main Fields */}
                                 <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-5">
                                     <div className="md:col-span-2">
                                         <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nome Completo</label>
                                         <input type="text" required className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" 
                                            value={studentForm.name} onChange={e => setStudentForm({...studentForm, name: e.target.value})} disabled={isGuardian} />
                                     </div>
                                     <div>
                                         <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Data de Nascimento</label>
                                         <input type="date" required className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" 
                                            value={studentForm.birthDate} onChange={e => setStudentForm({...studentForm, birthDate: e.target.value})} disabled={isGuardian} />
                                     </div>
                                     <div>
                                         <label className="block text-xs font-bold text-gray-500 uppercase mb-1">RG / CPF (Aluno)</label>
                                         <input type="text" className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" placeholder="Opcional"
                                            value={studentForm.cpf} onChange={e => setStudentForm({...studentForm, cpf: e.target.value})} disabled={isGuardian} />
                                     </div>
                                 </div>
                             </div>

                             <hr className="border-gray-100" />

                             {/* Settings Grid */}
                             {!isGuardian && (
                                <div className="space-y-6">
                                     <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                         <div>
                                             <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Plano de Mensalidade</label>
                                             <select className="w-full border border-gray-300 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-primary-500 outline-none" 
                                                value={studentForm.planId} onChange={e => setStudentForm({...studentForm, planId: e.target.value})}>
                                                 <option value="">Selecione...</option>
                                                 {plans.map(p => <option key={p.id} value={p.id}>{p.name} - R$ {p.price}</option>)}
                                             </select>
                                         </div>
                                         <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Status da Matrícula</label>
                                            <select className="w-full border border-gray-300 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-primary-500 outline-none" 
                                                value={studentForm.active ? 'true' : 'false'} onChange={e => setStudentForm({...studentForm, active: e.target.value === 'true'})}>
                                                <option value="true">Ativo</option>
                                                <option value="false">Inativo</option>
                                            </select>
                                         </div>
                                     </div>

                                     {/* Group Checkboxes */}
                                     <div>
                                         <label className="block text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-2">
                                             <Shirt className="w-4 h-4"/> Grupos e Categorias
                                         </label>
                                         <div className="grid grid-cols-2 md:grid-cols-3 gap-3 bg-gray-50 p-4 rounded-xl border border-gray-100">
                                             {groups.map(group => {
                                                const isChecked = studentForm.groupIds.includes(group.id);
                                                return (
                                                 <label 
                                                     key={group.id} 
                                                     className={`
                                                         flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all select-none
                                                         ${isChecked 
                                                             ? 'bg-primary-50 border-primary-500 text-primary-700 shadow-sm' 
                                                             : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100 hover:border-gray-300'}
                                                     `}
                                                 >
                                                     <div className={`
                                                         w-5 h-5 rounded border flex items-center justify-center transition-colors
                                                         ${isChecked ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-300'}
                                                     `}>
                                                         {isChecked && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                                                     </div>
                                                     <input 
                                                         type="checkbox"
                                                         className="hidden"
                                                         checked={isChecked}
                                                         onChange={(e) => {
                                                             const newGroups = e.target.checked
                                                                 ? [...studentForm.groupIds, group.id]
                                                                 : studentForm.groupIds.filter((id: string) => id !== group.id);
                                                             setStudentForm({...studentForm, groupIds: newGroups});
                                                         }}
                                                     />
                                                     <span className="text-sm font-medium truncate">{group.name}</span>
                                                 </label>
                                                );
                                             })}
                                             {groups.length === 0 && <p className="text-sm text-gray-400 italic col-span-full">Nenhum grupo cadastrado.</p>}
                                         </div>
                                     </div>
                                </div>
                             )}

                             {/* Guardian & Address */}
                             <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                 <div className="space-y-4">
                                     <h4 className="font-bold text-gray-900 flex items-center gap-2 pb-2 border-b border-gray-100"><UserIcon className="w-4 h-4 text-primary-600"/> Dados do Responsável</h4>
                                     <div>
                                         <label className="block text-xs text-gray-500 mb-1">Nome Completo</label>
                                         <input type="text" required className="w-full border rounded-lg p-2.5" value={studentForm.guardian?.name || ''} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, name: e.target.value}})} />
                                     </div>
                                     <div className="grid grid-cols-2 gap-4">
                                         <div>
                                             <label className="block text-xs text-gray-500 mb-1">WhatsApp</label>
                                             <input type="text" required className="w-full border rounded-lg p-2.5" value={studentForm.guardian?.phone || ''} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, phone: e.target.value}})} />
                                         </div>
                                         <div>
                                             <label className="block text-xs text-gray-500 mb-1">CPF (Login)</label>
                                             <input type="text" required className="w-full border rounded-lg p-2.5" value={studentForm.guardian?.cpf || ''} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, cpf: e.target.value}})} />
                                         </div>
                                     </div>
                                     <div>
                                         <label className="block text-xs text-gray-500 mb-1">Email</label>
                                         <input type="email" className="w-full border rounded-lg p-2.5" value={studentForm.guardian?.email || ''} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, email: e.target.value}})} />
                                     </div>
                                 </div>

                                 <div className="space-y-4">
                                     <h4 className="font-bold text-gray-900 flex items-center gap-2 pb-2 border-b border-gray-100"><MapPin className="w-4 h-4 text-primary-600"/> Endereço</h4>
                                     <div className="flex gap-4">
                                         <div className="w-1/3">
                                             <label className="block text-xs text-gray-500 mb-1">CEP</label>
                                             <div className="relative">
                                                <input type="text" className="w-full border rounded-lg p-2.5" value={studentForm.address?.cep || ''} 
                                                    onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, cep: e.target.value}})} 
                                                    onBlur={handleCepBlur} />
                                                {isLoadingCep && <Loader2 className="absolute right-2 top-2.5 w-4 h-4 animate-spin text-gray-400"/>}
                                             </div>
                                         </div>
                                         <div className="flex-1">
                                             <label className="block text-xs text-gray-500 mb-1">Rua</label>
                                             <input type="text" className="w-full border rounded-lg p-2.5" value={studentForm.address?.street || ''} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, street: e.target.value}})} />
                                         </div>
                                     </div>
                                     <div className="flex gap-4">
                                         <div className="w-1/3">
                                             <label className="block text-xs text-gray-500 mb-1">Número</label>
                                             <input type="text" className="w-full border rounded-lg p-2.5" value={studentForm.address?.number || ''} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, number: e.target.value}})} />
                                         </div>
                                         <div className="flex-1">
                                             <label className="block text-xs text-gray-500 mb-1">Bairro</label>
                                             <input type="text" className="w-full border rounded-lg p-2.5" value={studentForm.address?.district || ''} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, district: e.target.value}})} />
                                         </div>
                                     </div>
                                 </div>
                             </div>

                             {!isGuardian && (
                                 <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                     <h4 className="font-bold text-gray-800 mb-3 text-sm flex items-center gap-2"><CheckSquare className="w-4 h-4"/> Checklist de Documentos</h4>
                                     <div className="flex flex-wrap gap-3">
                                         {['rg', 'cpf', 'medical', 'address', 'school'].map((docKey) => {
                                             const labelMap: any = { rg: 'RG do Aluno', cpf: 'CPF do Aluno', medical: 'Atestado Médico', address: 'Comp. Residência', school: 'Declaração Escolar' };
                                             const isChecked = studentForm.documents && 
                                                (typeof studentForm.documents[docKey] === 'boolean' 
                                                    ? studentForm.documents[docKey] 
                                                    : studentForm.documents[docKey]?.delivered);
                                             
                                             return (
                                                 <label key={docKey} className={`flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer transition-all text-sm ${isChecked ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
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
                                                         className="rounded text-primary-600 focus:ring-primary-500" 
                                                     />
                                                     {labelMap[docKey]}
                                                 </label>
                                             );
                                         })}
                                     </div>
                                 </div>
                             )}

                             <div className="flex justify-end gap-3 pt-6 border-t border-gray-100">
                                 <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-3 text-gray-600 hover:bg-gray-100 rounded-xl font-medium transition-colors">Cancelar</button>
                                 <button type="submit" className="px-8 py-3 bg-primary-600 text-white rounded-xl hover:bg-primary-700 font-bold shadow-lg shadow-primary-500/30 transition-all transform hover:-translate-y-0.5">Salvar Cadastro</button>
                             </div>
                         </form>
                     )}

                     {activeTab === 'FINANCE' && editingId && (
                         <div className="space-y-6">
                             {!isGuardian && (
                                <div className="flex justify-between items-center bg-gray-50 p-6 rounded-xl border border-gray-100">
                                    <div>
                                        <h4 className="font-bold text-gray-900">Cobrança Avulsa</h4>
                                        <p className="text-sm text-gray-500 mt-1">Crie cobranças extras como uniformes ou taxas.</p>
                                    </div>
                                    <button onClick={() => setShowChargeModal(true)} className="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-50 text-gray-700 shadow-sm transition-colors">
                                        <Plus className="w-4 h-4" /> Nova Cobrança
                                    </button>
                                </div>
                             )}

                             <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                                 <table className="w-full text-sm text-left">
                                     <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200">
                                         <tr>
                                             <th className="p-4">Vencimento</th>
                                             <th className="p-4">Descrição</th>
                                             <th className="p-4">Valor</th>
                                             <th className="p-4">Status</th>
                                             <th className="p-4 text-right">Ações</th>
                                         </tr>
                                     </thead>
                                     <tbody className="divide-y divide-gray-100 bg-white">
                                         {transactions
                                            .filter(t => t.studentId === editingId && t.type === TransactionType.INCOME)
                                            .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                            .map(tx => (
                                                <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                                                    <td className="p-4 text-gray-600">{formatDate(tx.date)}</td>
                                                    <td className="p-4 font-medium text-gray-900">{tx.description}</td>
                                                    <td className="p-4 font-medium">R$ {tx.amount.toFixed(2)}</td>
                                                    <td className="p-4">
                                                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
                                                            tx.status === PaymentStatus.PAID ? 'bg-green-100 text-green-700' : 
                                                            tx.status === PaymentStatus.PENDING ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                                                        }`}>
                                                            {tx.status === PaymentStatus.PAID ? 'Pago' : tx.status === PaymentStatus.PENDING ? 'Pendente' : 'Atrasado'}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-right flex justify-end gap-2">
                                                        {tx.status !== PaymentStatus.PAID && (
                                                            <>
                                                                {!isGuardian && (
                                                                    <button onClick={() => handlePayTransaction(tx.id, PaymentMethod.CASH)} className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Receber Dinheiro">
                                                                        <DollarSign className="w-4 h-4" />
                                                                    </button>
                                                                )}
                                                                {tx.paymentLink && (
                                                                    <a href={tx.paymentLink} target="_blank" rel="noreferrer" className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Link de Pagamento">
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
                         <div className="space-y-6">
                             <div className="bg-orange-50 p-6 rounded-xl border border-orange-100 flex items-center gap-4">
                                 <div className="p-3 bg-orange-100 rounded-full text-orange-600"><TrendingUp className="w-6 h-6" /></div>
                                 <div>
                                     <span className="text-sm font-medium text-orange-800">Frequência (30 dias)</span>
                                     <p className="text-2xl font-bold text-gray-900">
                                         {activities.filter(a => a.attendance.includes(editingId!) && new Date(a.date) > new Date(Date.now() - 30*24*60*60*1000)).length} <span className="text-sm font-normal text-gray-500">presenças</span>
                                     </p>
                                 </div>
                             </div>
                             <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                                 <table className="w-full text-sm text-left">
                                     <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200">
                                         <tr>
                                             <th className="p-4">Data</th>
                                             <th className="p-4">Atividade</th>
                                             <th className="p-4">Horário</th>
                                             <th className="p-4 text-center">Status</th>
                                         </tr>
                                     </thead>
                                     <tbody className="divide-y divide-gray-100 bg-white">
                                         {activities
                                            .filter(a => a.groupId && studentForm.groupIds.includes(a.groupId))
                                            .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                            .map(activity => {
                                                const isPresent = activity.attendance.includes(editingId!);
                                                const isFuture = new Date(activity.date) > new Date();
                                                return (
                                                    <tr key={activity.id} className="hover:bg-gray-50">
                                                        <td className="p-4 text-gray-600">{formatDate(activity.date)}</td>
                                                        <td className="p-4 font-medium text-gray-900">{activity.title}</td>
                                                        <td className="p-4 text-gray-500">{activity.startTime}</td>
                                                        <td className="p-4 text-center">
                                                            {isFuture ? (
                                                                <span className="text-gray-400 font-medium">-</span>
                                                            ) : isPresent ? (
                                                                <span className="inline-flex items-center gap-1 text-green-600 font-bold bg-green-50 px-2 py-1 rounded-full text-xs"><CheckCircle className="w-3 h-3"/> Presente</span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 text-red-500 font-bold bg-red-50 px-2 py-1 rounded-full text-xs"><XCircle className="w-3 h-3"/> Ausente</span>
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
         </div>
      )}

      {/* --- EXTRA MODALS (Bulk Send & Charge) --- */}
      {isBulkModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                  <h3 className="text-lg font-bold mb-4">Envio em Massa - WhatsApp</h3>
                  <div className="mb-4">
                      {bulkIsRunning ? (
                           <div className="text-center py-6">
                               <Loader2 className="w-10 h-10 animate-spin mx-auto text-primary-600 mb-3" />
                               <p className="text-sm text-gray-600 font-medium">Enviando {bulkCurrentIndex + 1} de {bulkQueue.length}...</p>
                               <p className="text-xs text-gray-400 mt-1">Próximo envio em {bulkCountdown}s</p>
                           </div>
                      ) : (
                          <div className="text-center text-green-600 font-bold py-6">Processo Finalizado!</div>
                      )}
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg h-32 overflow-y-auto text-xs font-mono mb-4 border border-gray-100">
                      {bulkLogs.map((log, i) => <div key={i}>{log}</div>)}
                  </div>
                  <div className="flex justify-end">
                      <button onClick={() => setIsBulkModalOpen(false)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium">Fechar</button>
                  </div>
              </div>
          </div>
      )}
      
      {showChargeModal && editingId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                <h3 className="font-bold text-lg mb-4 text-gray-900">Nova Cobrança Avulsa</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Descrição</label>
                        <input type="text" className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary-500" placeholder="Ex: Uniforme" 
                            value={manualCharge.description} onChange={e => setManualCharge({...manualCharge, description: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Valor (R$)</label>
                        <input type="number" className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary-500" placeholder="0.00" 
                            value={manualCharge.amount} onChange={e => setManualCharge({...manualCharge, amount: parseFloat(e.target.value)})} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Vencimento</label>
                        <input type="date" className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary-500" 
                            value={manualCharge.date} onChange={e => setManualCharge({...manualCharge, date: e.target.value})} />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button onClick={() => setShowChargeModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">Cancelar</button>
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
                        }} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-bold shadow-lg shadow-primary-500/20">Criar Cobrança</button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
