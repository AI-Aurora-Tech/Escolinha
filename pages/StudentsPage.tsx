
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Student, Group, Plan, Transaction, TransactionType, PaymentStatus, PaymentMethod, Activity, User, UserRole, DocumentItem } from '../types';
import { Search, Plus, Phone, User as UserIcon, Edit, Camera, X, CheckSquare, FileText, MessageCircle, MapPin, Loader2, Link as LinkIcon, CalendarCheck, XCircle, CheckCircle, DollarSign, LayoutGrid, List, TrendingUp, AlertCircle, Users, FileWarning, Shirt, Send, ChevronDown, Check, Banknote } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createMPPreference } from '../services/mercadoPago';

interface StudentsPageProps {
  students: Student[];
  groups: Group[];
  plans: Plan[];
  transactions: Transaction[];
  activities: Activity[];
  onAddStudent: (s: Omit<Student, 'id'>) => void;
  onBatchAddStudents: (s: any[]) => void;
  onUpdateStudent: (s: Student) => void;
  onUpdateTransaction: (t: Transaction) => void;
  onAddTransaction: (t: Omit<Transaction, 'id'>) => void;
  initialFilter?: string;
  currentUser?: User | null;
}

// Helper outside component to avoid dependency cycles and re-creation
const checkDoc = (doc: boolean | DocumentItem | undefined) => {
    if (doc === undefined) return false;
    if (typeof doc === 'boolean') return doc;
    return doc.delivered;
};

export const StudentsPage: React.FC<StudentsPageProps> = ({ students, groups, plans, transactions, activities, onAddStudent, onBatchAddStudents, onUpdateStudent, onUpdateTransaction, onAddTransaction, initialFilter, currentUser }) => {
  // UI State
  const [viewMode, setViewMode] = useState<'GRID' | 'LIST'>('LIST');
  const [searchTerm, setSearchTerm] = useState('');
  const [isGroupDropdownOpen, setIsGroupDropdownOpen] = useState(false);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [financeFilter, setFinanceFilter] = useState<'ALL' | 'DEFAULTING'>('ALL');
  const [docsFilter, setDocsFilter] = useState<'ALL' | 'MISSING'>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'DETAILS' | 'FINANCE' | 'ATTENDANCE'>('DETAILS');
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Camera & Upload
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isLoadingCep, setIsLoadingCep] = useState(false);
  
  // Manual Charge
  const [showChargeModal, setShowChargeModal] = useState(false);
  const [manualCharge, setManualCharge] = useState({ description: '', amount: 0, date: new Date().toISOString().split('T')[0] });
  const [isGeneratingCharge, setIsGeneratingCharge] = useState(false);

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
  const defaultingIds = useMemo(() => {
    const today = new Date();
    return new Set(
        transactions
            .filter(t => t.type === TransactionType.INCOME && t.status !== PaymentStatus.PAID && new Date(t.date) < today && t.studentId)
            .map(t => t.studentId)
    );
  }, [transactions]);

  const stats = useMemo(() => {
      const active = students.filter(s => s.active).length;
      const missingDocs = students.filter(s => {
          if (!s.active || !s.documents) return false;
          return !checkDoc(s.documents.rg) || !checkDoc(s.documents.cpf) || !checkDoc(s.documents.medical);
      }).length;
      
      // Check intersection of defaulting IDs and current students list
      const defaultingCount = students.filter(s => defaultingIds.has(s.id)).length;

      return {
          total: students.length,
          active,
          defaulting: defaultingCount,
          missingDocs
      };
  }, [students, defaultingIds]);

  // --- FILTER LOGIC ---
  const filteredStudents = useMemo(() => {
    return students.filter(student => {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = 
            student.name.toLowerCase().includes(searchLower) ||
            student.guardian.name.toLowerCase().includes(searchLower);
        
        if (!matchesSearch) return false;

        if (statusFilter === 'ACTIVE' && !student.active) return false;
        if (statusFilter === 'INACTIVE' && student.active) return false;

        if (financeFilter === 'DEFAULTING' && !defaultingIds.has(student.id)) return false;

        if (docsFilter === 'MISSING') {
            const docs = student.documents || initialFormState.documents;
            const isMissing = !checkDoc(docs.rg) || !checkDoc(docs.cpf) || !checkDoc(docs.medical);
            if (!isMissing) return false;
        }

        return true;
    });
  }, [students, searchTerm, statusFilter, financeFilter, docsFilter, defaultingIds]);

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

  // --- WHATSAPP ACTIONS ---
  const handleSendPaymentReminder = (e: React.MouseEvent, student: Student) => {
    e.stopPropagation();
    const today = new Date();
    const pendingTxs = transactions.filter(t => 
        t.studentId === student.id && 
        t.status !== PaymentStatus.PAID && 
        t.type === TransactionType.INCOME &&
        new Date(t.date) < today
    );

    if (pendingTxs.length === 0) return;

    const totalDue = pendingTxs.reduce((acc, t) => acc + t.amount, 0);
    const phone = student.guardian.phone.replace(/\D/g, '');

    if (!phone) {
        alert("Telefone do responsável não cadastrado.");
        return;
    }

    const message = `Olá ${student.guardian.name}, identificamos ${pendingTxs.length} pagamento(s) pendente(s) referente ao aluno(a) *${student.name}* totalizando *R$ ${totalDue.toFixed(2)}*. \n\nPor favor, entre em contato para regularizar.`;
    window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleSendDocReminder = (e: React.MouseEvent, student: Student) => {
      e.stopPropagation();
      const docs = student.documents;
      const missing = [];
      if (!checkDoc(docs.rg)) missing.push('RG');
      if (!checkDoc(docs.cpf)) missing.push('CPF');
      if (!checkDoc(docs.medical)) missing.push('Atestado Médico');
      if (!checkDoc(docs.address)) missing.push('Comp. Residência');
      if (!checkDoc(docs.school)) missing.push('Declaração Escolar');

      if (missing.length === 0) return;

      const phone = student.guardian.phone.replace(/\D/g, '');
      if (!phone) {
          alert("Telefone do responsável não cadastrado.");
          return;
      }

      const message = `Olá ${student.guardian.name}, solicitamos o envio dos seguintes documentos pendentes do aluno(a) *${student.name}*: \n\n- ${missing.join('\n- ')}`;
      window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  // --- MODAL HANDLERS ---
  const handleOpenAdd = () => {
    setEditingId(null);
    setStudentForm(initialFormState);
    setCapturedImage(null);
    setIsGroupDropdownOpen(false);
    setActiveTab('DETAILS');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (student: Student) => {
    setEditingId(student.id);
    setCapturedImage(student.photoUrl || null);
    setIsGroupDropdownOpen(false);
    
    const safeGroupIds = Array.isArray(student.groupIds) ? student.groupIds : [];
    
    setStudentForm({
        ...student,
        groupIds: safeGroupIds,
        documents: student.documents || initialFormState.documents,
        address: student.address || initialFormState.address
    });
    setActiveTab('DETAILS');
    setIsModalOpen(true);
  };
  
  const toggleGroupSelection = (groupId: string) => {
      setStudentForm((prev: any) => {
          const currentIds = Array.isArray(prev.groupIds) ? prev.groupIds : [];
          const exists = currentIds.includes(groupId);
          let newGroups;
          if (exists) {
              newGroups = currentIds.filter((id: string) => id !== groupId);
          } else {
              newGroups = [...currentIds, groupId];
          }
          return { ...prev, groupIds: newGroups };
      });
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

  const handleAddCharge = async (e: React.FormEvent) => {
      e.preventDefault();
      
      if (editingId && manualCharge.description && manualCharge.amount > 0) {
          setIsGeneratingCharge(true);
          const student = students.find(s => s.id === editingId);
          let paymentLink = undefined;
          let externalReference = crypto.randomUUID();

          // Attempt to generate MP Link
          if (student && student.guardian) {
              try {
                  const mpResult = await createMPPreference({
                      title: manualCharge.description,
                      price: manualCharge.amount,
                      externalReference: externalReference,
                      payer: {
                          name: student.guardian.name,
                          email: student.guardian.email || 'email@naoinformado.com',
                          phone: student.guardian.phone,
                          identification: { type: 'CPF', number: student.guardian.cpf }
                      }
                  });
                  if (mpResult) {
                      paymentLink = mpResult.init_point;
                  }
              } catch (error) {
                  console.error("Erro ao gerar link MP:", error);
                  // Continue without link
              }
          }

          onAddTransaction({
              description: manualCharge.description,
              amount: manualCharge.amount,
              type: TransactionType.INCOME,
              date: manualCharge.date,
              status: PaymentStatus.PENDING,
              studentId: editingId,
              paymentMethod: PaymentMethod.PIX_MERCADO_PAGO,
              paymentLink: paymentLink,
              externalReference: paymentLink ? externalReference : undefined
          });

          setIsGeneratingCharge(false);
          setShowChargeModal(false);
          setManualCharge({ description: '', amount: 0, date: new Date().toISOString().split('T')[0] });
      }
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.text('Lista de Alunos', 14, 20);
    
    const tableData = filteredStudents.map(s => [
        s.name,
        s.active ? 'Ativo' : 'Inativo',
        s.guardian.name,
        s.guardian.phone,
        plans.find(p => p.id === s.planId)?.name || '-'
    ]);

    autoTable(doc, {
        startY: 30,
        head: [['Nome', 'Status', 'Responsável', 'Telefone', 'Plano']],
        body: tableData,
    });

    doc.save('alunos.pdf');
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
              setStudentForm((prev: any) => ({...prev, photoUrl: dataUrl}));
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

  const handleCepBlur = async () => {
      const cep = studentForm.address.cep.replace(/\D/g, '');
      if (cep.length === 8) {
          setIsLoadingCep(true);
          try {
              const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
              const data = await response.json();
              if (!data.erro) {
                  setStudentForm((prev: any) => ({
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
                
                const docs = student.documents || initialFormState.documents;
                const isMissingDocs = !checkDoc(docs.rg) || !checkDoc(docs.cpf) || !checkDoc(docs.medical);

                const studentGroups = groups
                    .filter(g => student.groupIds?.includes(g.id))
                    .map(g => g.name)
                    .join(', ');
                
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
                                <p className="text-sm text-gray-500 mt-1 truncate" title={studentGroups}>
                                    {calculateAge(student.birthDate)} anos • {studentGroups || 'Sem Grupo'}
                                </p>
                            </div>

                            <div className="space-y-3 mb-6">
                                {/* Guardian Info */}
                                <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                                    <div className="flex items-center gap-2 mb-1">
                                         <UserIcon className="w-3.5 h-3.5 text-gray-400" />
                                         <span className="text-xs font-bold text-gray-700 uppercase">Responsável</span>
                                    </div>
                                    <div className="flex justify-between items-center pl-1">
                                        <div className="overflow-hidden mr-2">
                                            <p className="text-sm text-gray-900 truncate font-medium">{student.guardian.name}</p>
                                            <p className="text-xs text-gray-500 truncate">{student.guardian.phone}</p>
                                        </div>
                                         {student.guardian.phone && (
                                            <a 
                                                href={`https://wa.me/55${student.guardian.phone.replace(/\D/g, '')}`} 
                                                target="_blank" 
                                                rel="noreferrer"
                                                className="p-1.5 bg-green-100 text-green-600 rounded-lg hover:bg-green-200 transition-colors flex-shrink-0"
                                                title="WhatsApp Responsável"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <MessageCircle className="w-4 h-4" />
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </div>
                            
                            <div className="mt-auto pb-4 space-y-3">
                                {/* Quick Actions */}
                                {!isGuardian && (
                                    <div className="flex justify-center gap-3">
                                        {isDefaulting && (
                                            <button 
                                                onClick={(e) => handleSendPaymentReminder(e, student)}
                                                className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-full transition-colors"
                                                title="Enviar Cobrança WhatsApp"
                                            >
                                                <DollarSign className="w-3 h-3" /> Cobrar
                                            </button>
                                        )}
                                        {isMissingDocs && (
                                            <button 
                                                onClick={(e) => handleSendDocReminder(e, student)}
                                                className="flex items-center gap-1 text-xs font-bold text-orange-600 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-full transition-colors"
                                                title="Solicitar Documentos WhatsApp"
                                            >
                                                <FileWarning className="w-3 h-3" /> Docs
                                            </button>
                                        )}
                                    </div>
                                )}

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
                         <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Idade / Grupos</th>
                         <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Responsável</th>
                         <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Status</th>
                         <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Ações</th>
                     </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-100">
                     {filteredStudents.map(student => {
                         const isDefaulting = defaultingIds.has(student.id);
                         const docs = student.documents || initialFormState.documents;
                         const isMissingDocs = !checkDoc(docs.rg) || !checkDoc(docs.cpf) || !checkDoc(docs.medical);

                         const studentGroups = groups
                            .filter(g => student.groupIds?.includes(g.id))
                            .map(g => g.name)
                            .join(', ');

                         return (
                             <tr key={student.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => handleOpenEdit(student)}>
                                 <td className="px-6 py-3">
                                     <div className="flex items-center gap-3">
                                         <img src={student.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(student.name)}`} className="w-10 h-10 rounded-full object-cover border border-gray-200" alt=""/>
                                         <div>
                                             <p className="font-medium text-gray-900">{student.name}</p>
                                             {/* Student Phone in List */}
                                             {student.phone && (
                                                 <div className="flex items-center gap-1 mt-0.5">
                                                    <p className="text-xs text-gray-500">{student.phone}</p>
                                                 </div>
                                             )}
                                             {isDefaulting && <span className="text-[10px] text-red-600 font-bold flex items-center gap-1 mt-0.5"><AlertCircle className="w-3 h-3"/> Pendente</span>}
                                         </div>
                                     </div>
                                 </td>
                                 <td className="px-6 py-3">
                                     <p className="text-sm text-gray-900">{calculateAge(student.birthDate)} anos</p>
                                     <p className="text-xs text-gray-500 max-w-[150px] truncate" title={studentGroups}>{studentGroups || '-'}</p>
                                 </td>
                                 <td className="px-6 py-3 hidden md:table-cell">
                                     <p className="text-sm text-gray-900">{student.guardian.name}</p>
                                     <div className="flex items-center gap-1">
                                        <p className="text-xs text-gray-500">{student.guardian.phone}</p>
                                        {student.guardian.phone && (
                                            <a 
                                                href={`https://wa.me/55${student.guardian.phone.replace(/\D/g, '')}`} 
                                                target="_blank" 
                                                rel="noreferrer"
                                                className="text-green-600 hover:text-green-700 p-1"
                                                title="Conversar no WhatsApp"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <MessageCircle className="w-3 h-3" />
                                            </a>
                                        )}
                                     </div>
                                 </td>
                                 <td className="px-6 py-3 text-center">
                                     <span className={`px-2 py-1 rounded-full text-xs font-bold ${student.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                         {student.active ? 'Ativo' : 'Inativo'}
                                     </span>
                                 </td>
                                 <td className="px-6 py-3 text-right">
                                     <div className="flex justify-end gap-1">
                                         {!isGuardian && isDefaulting && (
                                             <button 
                                                onClick={(e) => handleSendPaymentReminder(e, student)}
                                                className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Cobrar Pagamento (WhatsApp)"
                                             >
                                                 <Banknote className="w-4 h-4" />
                                             </button>
                                         )}
                                         {!isGuardian && isMissingDocs && (
                                             <button 
                                                onClick={(e) => handleSendDocReminder(e, student)}
                                                className="p-2 text-orange-500 hover:text-orange-700 hover:bg-orange-50 rounded-lg transition-colors"
                                                title="Cobrar Documentos (WhatsApp)"
                                             >
                                                 <FileWarning className="w-4 h-4" />
                                             </button>
                                         )}
                                         <button className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
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
                                         <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Telefone (Aluno)</label>
                                         <input type="text" className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" placeholder="(00) 00000-0000"
                                            value={studentForm.phone} onChange={e => setStudentForm({...studentForm, phone: e.target.value})} disabled={isGuardian} />
                                     </div>
                                     <div className="md:col-span-2">
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

                                     {/* Multi-Group Selection Dropdown (Compact Layout) */}
                                     <div className="relative">
                                         <label className="block text-xs font-bold text-gray-500 uppercase mb-1 flex items-center gap-2">
                                             <Shirt className="w-4 h-4"/> Grupo / Categoria
                                         </label>
                                         <button
                                            type="button"
                                            onClick={() => setIsGroupDropdownOpen(!isGroupDropdownOpen)}
                                            className="w-full text-left border border-gray-300 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-primary-500 outline-none flex justify-between items-center"
                                         >
                                            <span className={`block truncate ${studentForm.groupIds.length === 0 ? 'text-gray-500' : 'text-gray-900'}`}>
                                                {studentForm.groupIds.length > 0 
                                                    ? groups.filter(g => studentForm.groupIds.includes(g.id)).map(g => g.name).join(', ')
                                                    : 'Selecione os grupos...'}
                                            </span>
                                            <ChevronDown className="w-4 h-4 text-gray-400" />
                                         </button>
                                         
                                         {isGroupDropdownOpen && (
                                             <>
                                                 <div className="fixed inset-0 z-10" onClick={() => setIsGroupDropdownOpen(false)}></div>
                                                 <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                                                     {groups.length > 0 ? (
                                                         groups.map(group => {
                                                            const isChecked = studentForm.groupIds.includes(group.id);
                                                            return (
                                                             <div 
                                                                 key={group.id}
                                                                 onClick={() => toggleGroupSelection(group.id)}
                                                                 className={`flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer transition-colors ${isChecked ? 'bg-primary-50' : ''}`}
                                                             >
                                                                 <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isChecked ? 'bg-primary-600 border-primary-600' : 'border-gray-300 bg-white'}`}>
                                                                     {isChecked && <Check className="w-3.5 h-3.5 text-white" />}
                                                                 </div>
                                                                 <span className={`text-sm ${isChecked ? 'font-medium text-primary-900' : 'text-gray-700'}`}>{group.name}</span>
                                                             </div>
                                                            );
                                                         })
                                                     ) : (
                                                         <div className="p-4 text-sm text-gray-500 text-center">Nenhum grupo cadastrado.</div>
                                                     )}
                                                 </div>
                                             </>
                                         )}
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
                                                (typeof (studentForm.documents as any)[docKey] === 'boolean' 
                                                    ? (studentForm.documents as any)[docKey] 
                                                    : (studentForm.documents as any)[docKey]?.delivered);
                                             
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
                                                                    <>
                                                                        <button 
                                                                            onClick={() => {
                                                                                const phone = studentForm.guardian.phone.replace(/\D/g, '');
                                                                                if (phone) {
                                                                                    const msg = `Olá ${studentForm.guardian.name}, segue o link para pagamento referente a: *${tx.description}* (Venc: ${formatDate(tx.date)})\n\nLink: ${tx.paymentLink}`;
                                                                                    window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`, '_blank');
                                                                                } else {
                                                                                    alert("Telefone do responsável não cadastrado.");
                                                                                }
                                                                            }}
                                                                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors" 
                                                                            title="Enviar Link no WhatsApp"
                                                                        >
                                                                            <Send className="w-4 h-4" />
                                                                        </button>
                                                                        <a href={tx.paymentLink} target="_blank" rel="noreferrer" className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Abrir Link de Pagamento">
                                                                            <LinkIcon className="w-4 h-4" />
                                                                        </a>
                                                                    </>
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
      {showChargeModal && editingId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                <h3 className="font-bold text-lg mb-4 text-gray-900">Nova Cobrança Avulsa</h3>
                <form onSubmit={handleAddCharge} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Descrição</label>
                        <input type="text" className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary-500" placeholder="Ex: Uniforme" 
                            value={manualCharge.description} onChange={e => setManualCharge({...manualCharge, description: e.target.value})} disabled={isGeneratingCharge} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Valor (R$)</label>
                        <input type="number" className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary-500" placeholder="0.00" 
                            value={manualCharge.amount} onChange={e => setManualCharge({...manualCharge, amount: parseFloat(e.target.value)})} disabled={isGeneratingCharge} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Vencimento</label>
                        <input type="date" className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary-500" 
                            value={manualCharge.date} onChange={e => setManualCharge({...manualCharge, date: e.target.value})} disabled={isGeneratingCharge} />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={() => setShowChargeModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium" disabled={isGeneratingCharge}>Cancelar</button>
                        <button type="submit" disabled={isGeneratingCharge} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-bold shadow-lg shadow-primary-500/20 flex items-center gap-2">
                            {isGeneratingCharge ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Gerando Link...
                                </>
                            ) : (
                                'Criar Cobrança'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};
