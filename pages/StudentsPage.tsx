import React, { useState, useMemo, useEffect } from 'react';
import { Student, Group, Plan, Transaction, Activity, User, UserRole, PaymentStatus, TransactionType } from '../types';
import { Plus, Search, Filter, Download, User as UserIcon, Calendar, MapPin, Phone, FileText, CheckCircle, XCircle, AlertCircle, Wallet, History, Upload, Camera, X, Edit, Trash2, FileCheck } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface StudentsPageProps {
  students: Student[];
  groups: Group[];
  plans: Plan[];
  transactions: Transaction[];
  activities: Activity[];
  onAddStudent: (student: Omit<Student, 'id'>) => Promise<void>;
  onBatchAddStudents: (students: any[]) => Promise<void>;
  onUpdateStudent: (student: Student) => Promise<void>;
  onUpdateTransaction: (transaction: Transaction) => Promise<void>;
  onAddTransaction: (transaction: Omit<Transaction, 'id'>) => Promise<void>;
  initialFilter?: string;
  currentUser: User | null;
}

export const StudentsPage: React.FC<StudentsPageProps> = ({ 
  students, groups, plans, transactions, activities, 
  onAddStudent, onBatchAddStudents, onUpdateStudent, onUpdateTransaction, onAddTransaction, 
  initialFilter, currentUser 
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [showFinanceHistory, setShowFinanceHistory] = useState<string | null>(null);

  const isGuardian = currentUser?.role === UserRole.RESPONSAVEL;

  const initialStudentForm: Omit<Student, 'id'> = {
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
    groupId: '',
    active: true,
    documents: {
      rg: false, cpf: false, medical: false, address: false, school: false
    }
  };

  const [studentForm, setStudentForm] = useState(initialStudentForm);

  useEffect(() => {
    if (initialFilter) {
      setFilter(initialFilter);
    }
  }, [initialFilter]);

  const handleOpenNew = () => {
    setEditingId(null);
    setStudentForm(initialStudentForm);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (student: Student) => {
    setEditingId(student.id);
    // Ensure documents object structure exists even if old data is missing it
    const docs = typeof student.documents === 'object' ? student.documents : initialStudentForm.documents;
    
    setStudentForm({
      ...student,
      documents: {
         rg: docs.rg || false,
         cpf: docs.cpf || false,
         medical: docs.medical || false,
         address: docs.address || false,
         school: docs.school || false
      }
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      await onUpdateStudent({ ...studentForm, id: editingId });
    } else {
      await onAddStudent(studentForm);
    }
    setIsModalOpen(false);
  };

  const filteredStudents = useMemo(() => {
    return students.filter(student => {
      // 1. Search Logic
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = 
        student.name.toLowerCase().includes(searchLower) ||
        student.guardian.name.toLowerCase().includes(searchLower) ||
        (student.cpf && student.cpf.includes(searchLower));

      // 2. Filter Logic
      let matchesFilter = true;
      if (filter === 'ACTIVE') matchesFilter = student.active;
      if (filter === 'INACTIVE') matchesFilter = !student.active;
      
      // Filter: Inadimplentes (Defaulting)
      if (filter === 'DEFAULTING') {
          const todayStr = new Date().toISOString().split('T')[0];
          const hasLatePayments = transactions.some(t => 
             t.studentId === student.id && 
             t.type === TransactionType.INCOME && 
             t.status !== PaymentStatus.PAID && 
             t.status !== PaymentStatus.CANCELLED &&
             t.date < todayStr
          );
          matchesFilter = hasLatePayments;
      }

      // Filter: Missing Docs
      if (filter === 'MISSING_DOCS') {
         const d = student.documents;
         const getStatus = (doc: any) => (typeof doc === 'boolean' ? doc : (doc?.delivered || false));
         const isMissing = !getStatus(d.rg) || !getStatus(d.cpf) || !getStatus(d.medical) || !getStatus(d.address) || !getStatus(d.school);
         matchesFilter = isMissing;
      }

      // Filter: Docs OK
      if (filter === 'DOCS_OK') {
         const d = student.documents;
         const getStatus = (doc: any) => (typeof doc === 'boolean' ? doc : (doc?.delivered || false));
         const isOk = getStatus(d.rg) && getStatus(d.cpf) && getStatus(d.medical) && getStatus(d.address) && getStatus(d.school);
         matchesFilter = isOk;
      }

      return matchesSearch && matchesFilter;
    });
  }, [students, searchTerm, filter, transactions]);

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Relatório de Alunos - Garotos do Martinica", 14, 20);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 28);
    doc.text(`Total de Alunos na Lista: ${filteredStudents.length}`, 14, 34);

    const tableData = filteredStudents.map(s => {
        const groupName = groups.find(g => g.id === s.groupId)?.name || '-';
        return [
            s.name,
            groupName,
            s.phone || '-',
            s.guardian.name,
            s.active ? 'Ativo' : 'Inativo'
        ];
    });

    autoTable(doc, {
        startY: 40,
        head: [['Nome', 'Grupo', 'Telefone', 'Responsável', 'Status']],
        body: tableData,
        headStyles: { fillColor: [41, 128, 185] },
    });

    doc.save('Alunos.pdf');
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setStudentForm({ ...studentForm, photoUrl: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  // Finance History for Specific Student
  const getStudentHistory = (studentId: string) => {
      return transactions
        .filter(t => t.studentId === studentId)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
            <h2 className="text-2xl font-bold text-gray-800">
                {isGuardian ? 'Meus Filhos' : 'Gestão de Alunos'}
            </h2>
            <p className="text-gray-500 text-sm">
                {filteredStudents.length} {filteredStudents.length === 1 ? 'aluno encontrado' : 'alunos encontrados'}
            </p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
             {!isGuardian && (
                 <>
                    <button onClick={handleExportPDF} className="p-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 shadow-sm">
                        <Download className="w-5 h-5" />
                    </button>
                    <button 
                        onClick={handleOpenNew}
                        className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
                    >
                        <Plus className="w-4 h-4" /> Novo Aluno
                    </button>
                 </>
             )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4 justify-between">
          <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input 
                  type="text" 
                  placeholder="Buscar por nome, CPF ou responsável..." 
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
              />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
               <button 
                onClick={() => setFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${filter === 'ALL' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
               >
                   Todos
               </button>
               <button 
                onClick={() => setFilter('ACTIVE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${filter === 'ACTIVE' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}
               >
                   Ativos
               </button>
               {!isGuardian && (
                   <>
                    <button 
                        onClick={() => setFilter('DEFAULTING')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${filter === 'DEFAULTING' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'}`}
                    >
                        Inadimplentes
                    </button>
                    <button 
                        onClick={() => setFilter('MISSING_DOCS')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${filter === 'MISSING_DOCS' ? 'bg-orange-500 text-white' : 'bg-orange-50 text-orange-700 hover:bg-orange-100'}`}
                    >
                        Doc. Pendente
                    </button>
                   </>
               )}
          </div>
      </div>

      {/* LIST VIEW (Table) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold">
                      <tr>
                          <th className="px-6 py-4">Aluno</th>
                          <th className="px-6 py-4">Grupo</th>
                          <th className="px-6 py-4">Plano</th>
                          <th className="px-6 py-4">Responsável</th>
                          <th className="px-6 py-4">Contato</th>
                          <th className="px-6 py-4 text-center">Status</th>
                          <th className="px-6 py-4 text-right">Ações</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm">
                      {filteredStudents.length > 0 ? (
                          filteredStudents.map(student => {
                              const group = groups.find(g => g.id === student.groupId);
                              const plan = plans.find(p => p.id === student.planId);
                              
                              const todayStr = new Date().toISOString().split('T')[0];
                              const isDefaulter = transactions.some(t => 
                                 t.studentId === student.id && 
                                 t.type === TransactionType.INCOME && 
                                 t.status !== PaymentStatus.PAID && 
                                 t.status !== PaymentStatus.CANCELLED &&
                                 t.date < todayStr
                              );

                              return (
                                  <tr key={student.id} className="hover:bg-gray-50 transition-colors group">
                                      <td className="px-6 py-4">
                                          <div className="flex items-center gap-3">
                                              <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden border border-gray-200 flex-shrink-0">
                                                  {student.photoUrl ? (
                                                      <img src={student.photoUrl} alt={student.name} className="w-full h-full object-cover" />
                                                  ) : (
                                                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                                                          <UserIcon className="w-5 h-5" />
                                                      </div>
                                                  )}
                                              </div>
                                              <div>
                                                  <div className="font-bold text-gray-900">{student.name}</div>
                                                  {isDefaulter && (
                                                      <span className="text-[10px] text-red-600 font-bold flex items-center gap-1 mt-0.5">
                                                          <AlertCircle className="w-3 h-3" /> Pendência Financeira
                                                      </span>
                                                  )}
                                              </div>
                                          </div>
                                      </td>
                                      <td className="px-6 py-4 text-gray-600">
                                          {group ? (
                                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                                  {group.name}
                                              </span>
                                          ) : (
                                              <span className="text-gray-400 text-xs italic">Sem grupo</span>
                                          )}
                                      </td>
                                      <td className="px-6 py-4 text-gray-600">
                                          {plan ? plan.name : '-'}
                                      </td>
                                      <td className="px-6 py-4 text-gray-600 font-medium">
                                          {student.guardian.name}
                                      </td>
                                      <td className="px-6 py-4 text-gray-500">
                                          <div className="flex items-center gap-1.5">
                                              <Phone className="w-3.5 h-3.5 text-gray-400" />
                                              {student.phone || student.guardian.phone || '-'}
                                          </div>
                                      </td>
                                      <td className="px-6 py-4 text-center">
                                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${student.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                              {student.active ? 'Ativo' : 'Inativo'}
                                          </span>
                                      </td>
                                      <td className="px-6 py-4 text-right">
                                          <div className="flex justify-end gap-2">
                                              <button 
                                                onClick={() => setShowFinanceHistory(student.id)}
                                                className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors border border-transparent hover:border-green-100"
                                                title="Histórico Financeiro"
                                              >
                                                  <Wallet className="w-4 h-4" />
                                              </button>
                                              <button 
                                                onClick={() => handleOpenEdit(student)}
                                                className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors border border-transparent hover:border-primary-100"
                                                title={isGuardian ? "Ver Detalhes" : "Editar Aluno"}
                                              >
                                                  {isGuardian ? <FileText className="w-4 h-4" /> : <Edit className="w-4 h-4" />}
                                              </button>
                                          </div>
                                      </td>
                                  </tr>
                              );
                          })
                      ) : (
                          <tr>
                              <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                                  <div className="flex flex-col items-center gap-2">
                                      <UserIcon className="w-8 h-8 opacity-20" />
                                      <p>Nenhum aluno encontrado com os filtros atuais.</p>
                                  </div>
                              </td>
                          </tr>
                      )}
                  </tbody>
              </table>
          </div>
      </div>

      {/* ADD / EDIT MODAL */}
      {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl p-6 my-8">
                   <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-gray-900">{editingId ? 'Ficha do Aluno' : 'Novo Cadastro'}</h3>
                        <button onClick={() => setIsModalOpen(false)}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
                   </div>

                   <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                             {/* Photo Section */}
                             <div className="md:col-span-1 flex flex-col items-center">
                                  <div className="w-32 h-32 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden mb-3 relative group">
                                      {studentForm.photoUrl ? (
                                          <img src={studentForm.photoUrl} alt="" className="w-full h-full object-cover" />
                                      ) : (
                                          <Camera className="w-8 h-8 text-gray-400" />
                                      )}
                                      {!isGuardian && (
                                          <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                              <Upload className="w-6 h-6 text-white" />
                                              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                                          </label>
                                      )}
                                  </div>
                                  {!isGuardian && <p className="text-xs text-gray-500 text-center">Clique para alterar foto</p>}
                             </div>

                             {/* Main Info */}
                             <div className="md:col-span-3 space-y-4">
                                  <div>
                                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nome Completo do Aluno</label>
                                      <input required type="text" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary-500" 
                                        value={studentForm.name} onChange={e => setStudentForm({...studentForm, name: e.target.value})} disabled={isGuardian} />
                                  </div>

                                  <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Data Nascimento</label>
                                            <input required type="date" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none" 
                                                value={studentForm.birthDate} onChange={e => setStudentForm({...studentForm, birthDate: e.target.value})} disabled={isGuardian} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Grupo</label>
                                            <select className="w-full border border-gray-300 rounded-lg p-2.5 outline-none bg-white" 
                                                value={studentForm.groupId} onChange={e => setStudentForm({...studentForm, groupId: e.target.value})} disabled={isGuardian}>
                                                <option value="">Selecione...</option>
                                                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Telefone do Aluno</label>
                                            <input type="text" placeholder="(00) 00000-0000" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none" 
                                                value={studentForm.phone} onChange={e => setStudentForm({...studentForm, phone: e.target.value})} disabled={isGuardian} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">RG</label>
                                            <input type="text" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none" 
                                                value={studentForm.rg} onChange={e => setStudentForm({...studentForm, rg: e.target.value})} disabled={isGuardian} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">CPF</label>
                                            <input type="text" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none" 
                                                value={studentForm.cpf} onChange={e => setStudentForm({...studentForm, cpf: e.target.value})} disabled={isGuardian} />
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Atestado Médico (Validade)</label>
                                        <input type="date" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none" 
                                            value={studentForm.medicalCertificateExpiry} onChange={e => setStudentForm({...studentForm, medicalCertificateExpiry: e.target.value})} disabled={isGuardian} />
                                    </div>
                             </div>
                        </div>

                        {/* Guardian Info */}
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                             <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                                 <UserIcon className="w-4 h-4 text-primary-600" /> Dados do Responsável
                             </h4>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nome Completo</label>
                                      <input required type="text" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none bg-white" 
                                        value={studentForm.guardian.name} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, name: e.target.value}})} disabled={isGuardian} />
                                  </div>
                                  <div>
                                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">CPF (Login)</label>
                                      <input required type="text" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none bg-white" placeholder="Necessário para acesso ao app"
                                        value={studentForm.guardian.cpf} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, cpf: e.target.value}})} disabled={isGuardian} />
                                  </div>
                                  <div>
                                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Telefone / WhatsApp</label>
                                      <input required type="text" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none bg-white" 
                                        value={studentForm.guardian.phone} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, phone: e.target.value}})} disabled={isGuardian} />
                                  </div>
                                  <div>
                                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
                                      <input type="email" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none bg-white" 
                                        value={studentForm.guardian.email} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, email: e.target.value}})} />
                                  </div>
                             </div>
                        </div>

                        {/* Address */}
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                             <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                                 <MapPin className="w-4 h-4 text-primary-600" /> Endereço
                             </h4>
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                  <div>
                                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">CEP</label>
                                      <input type="text" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none bg-white" 
                                        value={studentForm.address.cep} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, cep: e.target.value}})} />
                                  </div>
                                  <div className="md:col-span-2">
                                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Rua</label>
                                      <input type="text" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none bg-white" 
                                        value={studentForm.address.street} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, street: e.target.value}})} />
                                  </div>
                                  <div>
                                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Número</label>
                                      <input type="text" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none bg-white" 
                                        value={studentForm.address.number} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, number: e.target.value}})} />
                                  </div>
                                  <div>
                                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Bairro</label>
                                      <input type="text" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none bg-white" 
                                        value={studentForm.address.district} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, district: e.target.value}})} />
                                  </div>
                                  <div>
                                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Cidade</label>
                                      <input type="text" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none bg-white" 
                                        value={studentForm.address.city} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, city: e.target.value}})} />
                                  </div>
                             </div>
                        </div>

                        {/* Plan & Documents (Admin Only View mostly) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                                 <h4 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
                                     <Wallet className="w-4 h-4" /> Plano & Status
                                 </h4>
                                 <div className="space-y-3">
                                     <div>
                                         <label className="block text-xs font-bold text-blue-800 uppercase mb-1">Plano Contratado</label>
                                         <select className="w-full border border-blue-200 rounded-lg p-2.5 outline-none bg-white" 
                                            value={studentForm.planId} onChange={e => setStudentForm({...studentForm, planId: e.target.value})} disabled={isGuardian}>
                                            <option value="">Selecione...</option>
                                            {plans.map(p => <option key={p.id} value={p.id}>{p.name} - R$ {p.price}</option>)}
                                         </select>
                                     </div>
                                     <div className="flex items-center gap-2">
                                         <input type="checkbox" id="activeCheck" className="w-5 h-5 text-blue-600 rounded" 
                                            checked={studentForm.active} onChange={e => setStudentForm({...studentForm, active: e.target.checked})} disabled={isGuardian} />
                                         <label htmlFor="activeCheck" className="text-sm font-medium text-blue-900">Aluno Ativo / Matriculado</label>
                                     </div>
                                 </div>
                            </div>

                            <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                                 <h4 className="font-bold text-orange-900 mb-3 flex items-center gap-2">
                                     <FileText className="w-4 h-4" /> Controle de Documentos
                                 </h4>
                                 <div className="grid grid-cols-2 gap-2 text-sm">
                                      {Object.keys(studentForm.documents).map((docKey) => {
                                           // Helper to get boolean value safely
                                           const getVal = (v: any) => (typeof v === 'boolean' ? v : (v?.delivered || false));
                                           const val = getVal((studentForm.documents as any)[docKey]);
                                           
                                           return (
                                               <label key={docKey} className="flex items-center gap-2 cursor-pointer">
                                                   <input type="checkbox" className="w-4 h-4 text-orange-600 rounded"
                                                       checked={val}
                                                       onChange={e => {
                                                           if (isGuardian) return; // Guardian cannot toggle
                                                           setStudentForm({
                                                               ...studentForm,
                                                               documents: { ...studentForm.documents, [docKey]: e.target.checked }
                                                           });
                                                       }}
                                                       disabled={isGuardian}
                                                   />
                                                   <span className="capitalize text-orange-800">{docKey === 'medical' ? 'Atestado' : docKey}</span>
                                               </label>
                                           );
                                      })}
                                 </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                             <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-3 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors">
                                 Cancelar
                             </button>
                             {!isGuardian && (
                                <button type="submit" className="px-6 py-3 bg-primary-600 text-white font-bold rounded-lg hover:bg-primary-700 transition-colors shadow-lg shadow-primary-500/20">
                                    Salvar Dados
                                </button>
                             )}
                        </div>
                   </form>
              </div>
          </div>
      )}

      {/* FINANCE HISTORY MODAL */}
      {showFinanceHistory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 h-[80vh] flex flex-col">
                   <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                            <History className="w-5 h-5 text-gray-500" /> Histórico Financeiro
                        </h3>
                        <button onClick={() => setShowFinanceHistory(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                   </div>
                   
                   <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                        {getStudentHistory(showFinanceHistory).length > 0 ? (
                            getStudentHistory(showFinanceHistory).map(t => (
                                <div key={t.id} className={`p-4 rounded-xl border flex justify-between items-center ${t.status === PaymentStatus.PAID ? 'bg-green-50 border-green-100' : 'bg-white border-gray-200'}`}>
                                     <div>
                                         <p className="font-bold text-gray-800">{t.description}</p>
                                         <p className="text-xs text-gray-500">Vencimento: {new Date(t.date).toLocaleDateString('pt-BR')}</p>
                                     </div>
                                     <div className="text-right">
                                         <p className="font-bold text-gray-900">R$ {t.amount.toFixed(2)}</p>
                                         {t.status === PaymentStatus.PAID ? (
                                             <span className="text-[10px] bg-green-200 text-green-800 px-2 py-0.5 rounded-full font-bold">PAGO</span>
                                         ) : (
                                             <div className="flex flex-col items-end gap-1">
                                                 <span className="text-[10px] bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-bold">PENDENTE</span>
                                                 {t.paymentLink && (
                                                     <a href={t.paymentLink} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                                                         Pagar Agora
                                                     </a>
                                                 )}
                                             </div>
                                         )}
                                     </div>
                                </div>
                            ))
                        ) : (
                            <p className="text-center text-gray-500 py-10">Nenhum registro financeiro encontrado.</p>
                        )}
                   </div>
              </div>
          </div>
      )}
    </div>
  );
};