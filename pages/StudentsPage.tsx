
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Student, Group, Plan, Transaction, Activity, User, UserRole, TransactionType, PaymentStatus, PaymentMethod, DocumentItem } from '../types';
import { Plus, Search, Edit, User as UserIcon, FileText, DollarSign, CheckCircle, XCircle, AlertCircle, FileWarning, Send, Link as LinkIcon, Download, X, Save, Phone, MapPin, Camera, CalendarCheck, TrendingUp, Users, Shirt, ChevronDown, Check, Loader2 } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface StudentsPageProps {
  students: Student[];
  groups: Group[];
  plans: Plan[];
  transactions: Transaction[];
  activities: Activity[];
  onAddStudent: (student: Omit<Student, 'id'>) => void;
  onBatchAddStudents: (students: any[]) => void;
  onUpdateStudent: (student: Student) => void;
  onUpdateTransaction: (transaction: Transaction) => void;
  onAddTransaction: (transaction: Omit<Transaction, 'id'>) => void;
  initialFilter?: string;
  currentUser: User | null;
}

export const StudentsPage: React.FC<StudentsPageProps> = ({ 
    students, groups, plans, transactions, activities, 
    onAddStudent, onBatchAddStudents, onUpdateStudent, onUpdateTransaction, onAddTransaction, 
    initialFilter, currentUser 
}) => {
  const [viewMode, setViewMode] = useState<'LIST' | 'EDIT' | 'NEW'>('LIST');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'INFO' | 'FINANCE' | 'ATTENDANCE'>('INFO');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>(initialFilter || 'ALL');
  
  const [showChargeModal, setShowChargeModal] = useState(false);
  const [newCharge, setNewCharge] = useState({
      description: '',
      amount: 0,
      date: new Date().toISOString().split('T')[0]
  });

  const isGuardian = currentUser?.role === UserRole.RESPONSAVEL;

  // Initial Form State
  const initialStudentState: Omit<Student, 'id'> = {
      name: '',
      birthDate: '',
      rg: '',
      cpf: '',
      phone: '',
      medicalCertificateExpiry: '',
      photoUrl: '',
      address: {
          cep: '', street: '', number: '', complement: '', district: '', city: '', state: ''
      },
      guardian: {
          name: '', phone: '', email: '', cpf: ''
      },
      planId: '',
      groupIds: [],
      active: true,
      documents: {
          rg: false, cpf: false, medical: false, address: false, school: false
      }
  };

  const [studentForm, setStudentForm] = useState<Omit<Student, 'id'>>(initialStudentState);

  // Effect to handle initialFilter changes from Dashboard navigation
  useEffect(() => {
      if (initialFilter) {
          setFilterStatus(initialFilter);
      }
  }, [initialFilter]);

  // Populate form when editing
  useEffect(() => {
      if (editingId) {
          const student = students.find(s => s.id === editingId);
          if (student) {
              setStudentForm({
                  name: student.name,
                  birthDate: student.birthDate,
                  rg: student.rg || '',
                  cpf: student.cpf || '',
                  phone: student.phone || '',
                  medicalCertificateExpiry: student.medicalCertificateExpiry || '',
                  photoUrl: student.photoUrl,
                  address: { ...student.address },
                  guardian: { ...student.guardian },
                  planId: student.planId || '',
                  groupIds: student.groupIds || [],
                  active: student.active,
                  documents: { ...student.documents }
              });
          }
      } else {
          setStudentForm(initialStudentState);
      }
  }, [editingId, students]);

  const formatDate = (dateString: string) => {
      if (!dateString) return '';
      const parts = dateString.split('-');
      if (parts.length === 3) {
          return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return dateString;
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

  const handleSave = (e: React.FormEvent) => {
      e.preventDefault();
      if (viewMode === 'NEW') {
          onAddStudent(studentForm);
      } else if (viewMode === 'EDIT' && editingId) {
          onUpdateStudent({ ...studentForm, id: editingId });
      }
      setViewMode('LIST');
      setEditingId(null);
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

  const handleAddCharge = (e: React.FormEvent) => {
      e.preventDefault();
      if (editingId && newCharge.description && newCharge.amount > 0) {
          onAddTransaction({
              description: newCharge.description,
              amount: newCharge.amount,
              type: TransactionType.INCOME,
              date: newCharge.date,
              status: PaymentStatus.PENDING,
              studentId: editingId,
              paymentMethod: PaymentMethod.PIX_MERCADO_PAGO 
          });
          setShowChargeModal(false);
          setNewCharge({ description: '', amount: 0, date: new Date().toISOString().split('T')[0] });
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

  // Check Document Status Helper
  const checkDoc = (doc: boolean | DocumentItem) => {
      if (typeof doc === 'boolean') return doc;
      return doc?.delivered;
  };

  // Filter Logic
  const filteredStudents = useMemo(() => {
      return students.filter(student => {
          // 1. Text Search
          const searchLower = searchTerm.toLowerCase();
          const matchesSearch = 
            student.name.toLowerCase().includes(searchLower) || 
            student.guardian.name.toLowerCase().includes(searchLower);

          if (!matchesSearch) return false;

          // 2. Status Filter
          if (filterStatus === 'ALL') return true;
          if (filterStatus === 'ACTIVE') return student.active;
          if (filterStatus === 'INACTIVE') return !student.active;
          
          if (filterStatus === 'DEFAULTING') {
              // Check for overdue transactions
              const today = new Date();
              const hasOverdue = transactions.some(t => 
                  t.studentId === student.id && 
                  t.type === TransactionType.INCOME && 
                  t.status !== PaymentStatus.PAID &&
                  new Date(t.date) < today
              );
              return hasOverdue;
          }

          if (filterStatus === 'MISSING_DOCS') {
              const d = student.documents;
              return !checkDoc(d.rg) || !checkDoc(d.cpf) || !checkDoc(d.medical) || !checkDoc(d.address) || !checkDoc(d.school);
          }

          return true;
      });
  }, [students, searchTerm, filterStatus, transactions]);

  // Handle Photo Upload
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const reader = new FileReader();
          reader.onload = (ev) => {
              if (ev.target?.result) {
                  setStudentForm(prev => ({ ...prev, photoUrl: ev.target!.result as string }));
              }
          };
          reader.readAsDataURL(e.target.files[0]);
      }
  };

  // Main Render
  return (
      <div className="space-y-6">
          {viewMode === 'LIST' && (
              <>
                {/* Header Controls */}
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <div className="flex flex-1 w-full gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input 
                                type="text" 
                                placeholder="Buscar aluno ou responsável..." 
                                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <select 
                            className="border rounded-lg px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                        >
                            <option value="ALL">Todos</option>
                            <option value="ACTIVE">Ativos</option>
                            <option value="INACTIVE">Inativos</option>
                            <option value="DEFAULTING">Inadimplentes</option>
                            <option value="MISSING_DOCS">Doc. Pendente</option>
                        </select>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleExportPDF} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg border border-gray-200" title="Exportar PDF">
                            <Download className="w-5 h-5" />
                        </button>
                        {!isGuardian && (
                            <button 
                                onClick={() => { setViewMode('NEW'); setEditingId(null); setActiveTab('INFO'); }}
                                className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors shadow-sm font-medium"
                            >
                                <Plus className="w-4 h-4" /> Novo Aluno
                            </button>
                        )}
                    </div>
                </div>

                {/* Grid of Students */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredStudents.map(student => (
                        <div 
                            key={student.id} 
                            onClick={() => { setViewMode('EDIT'); setEditingId(student.id); setActiveTab('INFO'); }}
                            className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 cursor-pointer hover:shadow-md hover:border-primary-200 transition-all group"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-100 border border-gray-200">
                                        {student.photoUrl ? (
                                            <img src={student.photoUrl} alt={student.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <UserIcon className="w-full h-full p-2 text-gray-400" />
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900 leading-tight group-hover:text-primary-600 transition-colors">{student.name}</h3>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {student.active ? (
                                                <span className="text-green-600 font-medium flex items-center gap-1">● Ativo</span>
                                            ) : (
                                                <span className="text-gray-400 font-medium flex items-center gap-1">● Inativo</span>
                                            )}
                                        </p>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="space-y-2 text-sm text-gray-600">
                                <div className="flex items-center gap-2">
                                    <UserIcon className="w-3.5 h-3.5 text-gray-400" />
                                    <span className="truncate">{student.guardian.name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Phone className="w-3.5 h-3.5 text-gray-400" />
                                    <span>{student.phone || student.guardian.phone || '-'}</span>
                                </div>
                                {(!checkDoc(student.documents.medical)) && (
                                     <div className="flex items-center gap-2 text-orange-600 bg-orange-50 px-2 py-1 rounded text-xs font-medium">
                                        <FileWarning className="w-3 h-3" /> Atestado Pendente
                                     </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {filteredStudents.length === 0 && (
                        <div className="col-span-full py-12 text-center text-gray-500">
                            Nenhum aluno encontrado com os filtros atuais.
                        </div>
                    )}
                </div>
              </>
          )}

          {/* Edit/New Modal Overlay */}
          {(viewMode === 'EDIT' || viewMode === 'NEW') && (
              <div className="fixed inset-0 z-40 bg-gray-900/50 backdrop-blur-sm flex justify-end">
                  <div className="w-full max-w-2xl bg-white h-full shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300">
                        {/* Header */}
                        <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-gray-800">
                                {viewMode === 'NEW' ? 'Cadastrar Novo Aluno' : studentForm.name}
                            </h2>
                            <div className="flex gap-2">
                                <button onClick={() => { setViewMode('LIST'); setEditingId(null); }} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                        </div>
                        
                        {/* Tabs */}
                        <div className="px-6 border-b border-gray-100 flex gap-6 overflow-x-auto">
                            <button onClick={() => setActiveTab('INFO')} className={`py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'INFO' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                                Dados do Aluno
                            </button>
                            {editingId && (
                                <>
                                    <button onClick={() => setActiveTab('FINANCE')} className={`py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'FINANCE' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                                        Financeiro
                                    </button>
                                    <button onClick={() => setActiveTab('ATTENDANCE')} className={`py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'ATTENDANCE' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                                        Frequência
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Content */}
                        <div className="p-6">
                            {activeTab === 'INFO' && (
                                <form onSubmit={handleSave} className="space-y-6">
                                    {/* Photo & Basic Info */}
                                    <div className="flex flex-col sm:flex-row gap-6 items-start">
                                        <div className="relative group">
                                            <div className="w-32 h-32 rounded-xl bg-gray-100 overflow-hidden border-2 border-dashed border-gray-300 flex items-center justify-center">
                                                {studentForm.photoUrl ? (
                                                    <img src={studentForm.photoUrl} alt="Foto" className="w-full h-full object-cover" />
                                                ) : (
                                                    <Camera className="w-8 h-8 text-gray-300" />
                                                )}
                                            </div>
                                            {!isGuardian && (
                                                <input type="file" accept="image/*" onChange={handlePhotoChange} className="absolute inset-0 opacity-0 cursor-pointer" title="Alterar foto" />
                                            )}
                                        </div>
                                        <div className="flex-1 w-full space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                                                <input required type="text" className="w-full border rounded-lg p-2.5" 
                                                    value={studentForm.name} onChange={e => setStudentForm({...studentForm, name: e.target.value})} disabled={isGuardian} />
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">Data Nasc.</label>
                                                    <input required type="date" className="w-full border rounded-lg p-2.5" 
                                                        value={studentForm.birthDate} onChange={e => setStudentForm({...studentForm, birthDate: e.target.value})} disabled={isGuardian} />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                                                    <select className="w-full border rounded-lg p-2.5 bg-white" 
                                                        value={studentForm.active ? 'true' : 'false'} 
                                                        onChange={e => setStudentForm({...studentForm, active: e.target.value === 'true'})}
                                                        disabled={isGuardian}
                                                    >
                                                        <option value="true">Ativo</option>
                                                        <option value="false">Inativo</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Documents */}
                                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                        <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                                            <FileText className="w-4 h-4" /> Documentação
                                        </h4>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                            {['rg', 'cpf', 'medical', 'address', 'school'].map((docKey) => (
                                                <label key={docKey} className="flex items-center gap-2 text-sm cursor-pointer">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={checkDoc((studentForm.documents as any)[docKey])} 
                                                        onChange={(e) => setStudentForm({
                                                            ...studentForm, 
                                                            documents: { ...studentForm.documents, [docKey]: e.target.checked }
                                                        })}
                                                        disabled={isGuardian}
                                                        className="rounded text-primary-600 focus:ring-primary-500"
                                                    />
                                                    <span className="capitalize">{docKey === 'medical' ? 'Atestado' : docKey === 'address' ? 'Comp. Residência' : docKey === 'school' ? 'Decl. Escolar' : docKey.toUpperCase()}</span>
                                                </label>
                                            ))}
                                        </div>
                                        <div className="mt-3">
                                            <label className="block text-xs font-medium text-gray-500 mb-1">Validade Atestado Médico</label>
                                            <input type="date" className="w-full border rounded-lg p-2 text-sm" 
                                                value={studentForm.medicalCertificateExpiry} onChange={e => setStudentForm({...studentForm, medicalCertificateExpiry: e.target.value})} disabled={isGuardian} />
                                        </div>
                                    </div>

                                    {/* Guardian Info */}
                                    <div className="space-y-4">
                                        <h4 className="font-bold text-gray-800 flex items-center gap-2 border-b pb-2">
                                            <UserIcon className="w-4 h-4" /> Dados do Responsável
                                        </h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div className="col-span-2">
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Responsável</label>
                                                <input required type="text" className="w-full border rounded-lg p-2.5" 
                                                    value={studentForm.guardian.name} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, name: e.target.value}})} disabled={isGuardian} />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone / WhatsApp</label>
                                                <input required type="text" className="w-full border rounded-lg p-2.5" placeholder="(00) 00000-0000"
                                                    value={studentForm.guardian.phone} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, phone: e.target.value}})} disabled={isGuardian} />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">CPF Responsável</label>
                                                <input type="text" className="w-full border rounded-lg p-2.5" placeholder="000.000.000-00"
                                                    value={studentForm.guardian.cpf} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, cpf: e.target.value}})} disabled={isGuardian} />
                                            </div>
                                            <div className="col-span-2">
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                                <input type="email" className="w-full border rounded-lg p-2.5" 
                                                    value={studentForm.guardian.email} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, email: e.target.value}})} disabled={isGuardian} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Plan & Group */}
                                    <div className="space-y-4">
                                        <h4 className="font-bold text-gray-800 flex items-center gap-2 border-b pb-2">
                                            <DollarSign className="w-4 h-4" /> Plano e Grupo
                                        </h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Plano de Mensalidade</label>
                                                <select className="w-full border rounded-lg p-2.5 bg-white" 
                                                    value={studentForm.planId} onChange={e => setStudentForm({...studentForm, planId: e.target.value})} disabled={isGuardian}>
                                                    <option value="">Selecione um plano...</option>
                                                    {plans.map(p => <option key={p.id} value={p.id}>{p.name} - R$ {p.price}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Grupos/Categorias</label>
                                                <div className="border rounded-lg p-2 max-h-32 overflow-y-auto bg-white">
                                                    {groups.map(g => (
                                                        <label key={g.id} className="flex items-center gap-2 p-1 hover:bg-gray-50 cursor-pointer">
                                                            <input 
                                                                type="checkbox"
                                                                checked={studentForm.groupIds?.includes(g.id)}
                                                                onChange={(e) => {
                                                                    if (isGuardian) return;
                                                                    const current = studentForm.groupIds || [];
                                                                    if (e.target.checked) setStudentForm({...studentForm, groupIds: [...current, g.id]});
                                                                    else setStudentForm({...studentForm, groupIds: current.filter(id => id !== g.id)});
                                                                }}
                                                                disabled={isGuardian}
                                                                className="rounded text-primary-600"
                                                            />
                                                            <span className="text-sm">{g.name}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {!isGuardian && (
                                        <div className="pt-4 flex justify-end">
                                            <button type="submit" className="flex items-center gap-2 bg-primary-600 text-white px-6 py-3 rounded-lg hover:bg-primary-700 transition-colors shadow-lg shadow-primary-500/20 font-bold">
                                                <Save className="w-5 h-5" /> Salvar Dados
                                            </button>
                                        </div>
                                    )}
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
                                                                                    className="p-2 text-white bg-green-500 hover:bg-green-600 rounded-lg transition-colors shadow-sm" 
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
                                                 {transactions.filter(t => t.studentId === editingId && t.type === TransactionType.INCOME).length === 0 && (
                                                     <tr><td colSpan={5} className="p-8 text-center text-gray-400">Nenhuma cobrança registrada.</td></tr>
                                                 )}
                                             </tbody>
                                         </table>
                                     </div>
                                 </div>
                             )}

                             {activeTab === 'ATTENDANCE' && editingId && (
                                 <div className="space-y-4">
                                     <h3 className="font-bold text-gray-800">Histórico de Frequência</h3>
                                     <div className="border border-gray-200 rounded-xl overflow-hidden">
                                        <table className="w-full text-sm text-left">
                                             <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200">
                                                 <tr>
                                                     <th className="p-4">Data</th>
                                                     <th className="p-4">Atividade</th>
                                                     <th className="p-4">Tipo</th>
                                                     <th className="p-4">Status</th>
                                                 </tr>
                                             </thead>
                                             <tbody className="divide-y divide-gray-100 bg-white">
                                                {activities
                                                    .filter(a => 
                                                        (a.attendance.includes(editingId) || 
                                                        (a.participants && a.participants.includes(editingId)) ||
                                                        (a.groupId && students.find(s => s.id === editingId)?.groupIds?.includes(a.groupId))) 
                                                        && new Date(a.date) <= new Date()
                                                    )
                                                    .sort((a,b) => new Date(b.date + 'T' + b.startTime).getTime() - new Date(a.date + 'T' + a.startTime).getTime())
                                                    .map(activity => {
                                                        const isPresent = activity.attendance.includes(editingId);
                                                        return (
                                                            <tr key={activity.id}>
                                                                <td className="p-4 text-gray-600">{formatDate(activity.date)}</td>
                                                                <td className="p-4 font-medium">{activity.title}</td>
                                                                <td className="p-4 text-xs uppercase">{activity.type === 'GAME' ? 'Jogo' : 'Treino'}</td>
                                                                <td className="p-4">
                                                                    {isPresent ? (
                                                                        <span className="text-green-600 font-bold flex items-center gap-1"><CheckCircle className="w-4 h-4"/> Presente</span>
                                                                    ) : (
                                                                        <span className="text-red-500 font-medium flex items-center gap-1"><XCircle className="w-4 h-4"/> Ausente</span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        )
                                                    })
                                                }
                                                {activities.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-gray-400">Nenhum registro encontrado.</td></tr>}
                                             </tbody>
                                        </table>
                                     </div>
                                 </div>
                             )}
                        </div>
                  </div>
              </div>
          )}

          {/* Charge Modal */}
          {showChargeModal && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                  <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
                      <h3 className="text-lg font-bold text-gray-900 mb-4">Nova Cobrança Avulsa</h3>
                      <form onSubmit={handleAddCharge} className="space-y-4">
                          <div>
                              <label className="block text-sm font-medium mb-1">Descrição</label>
                              <input required type="text" className="w-full border rounded-lg p-2" placeholder="Ex: Uniforme, Taxa de Inscrição..."
                                  value={newCharge.description} onChange={e => setNewCharge({...newCharge, description: e.target.value})} />
                          </div>
                          <div>
                              <label className="block text-sm font-medium mb-1">Valor (R$)</label>
                              <input required type="number" step="0.01" min="0" className="w-full border rounded-lg p-2"
                                  value={newCharge.amount} onChange={e => setNewCharge({...newCharge, amount: parseFloat(e.target.value)})} />
                          </div>
                          <div>
                              <label className="block text-sm font-medium mb-1">Data de Vencimento</label>
                              <input required type="date" className="w-full border rounded-lg p-2"
                                  value={newCharge.date} onChange={e => setNewCharge({...newCharge, date: e.target.value})} />
                          </div>
                          <div className="flex justify-end gap-2 pt-2">
                              <button type="button" onClick={() => setShowChargeModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                              <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium">Gerar Cobrança</button>
                          </div>
                      </form>
                  </div>
              </div>
          )}
      </div>
  );
};
