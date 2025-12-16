import React, { useState, useMemo } from 'react';
import { Student, Group, Plan, Transaction, Activity, User, UserRole, PaymentStatus, DocumentItem, StudentDocuments, TransactionType, PaymentMethod } from '../types';
import { Plus, Search, Filter, Edit, FileText, CheckCircle, XCircle, Download, MessageCircle, DollarSign, Calendar, User as UserIcon, AlertCircle, Phone, X, Save } from 'lucide-react';
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
  students, 
  groups, 
  plans, 
  transactions, 
  activities,
  onAddStudent,
  onUpdateStudent,
  onAddTransaction,
  initialFilter,
  currentUser
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState(initialFilter || 'ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [currentStudent, setCurrentStudent] = useState<Student | null>(null);
  
  // State for the Add/Edit Form
  const initialFormState: Omit<Student, 'id'> = {
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
  const [formData, setFormData] = useState<Omit<Student, 'id'>>(initialFormState);

  // Filter Logic
  const filteredStudents = useMemo(() => {
      let result = students;
      
      // Text Search
      if (searchTerm) {
          const lower = searchTerm.toLowerCase();
          result = result.filter(s => 
              s.name.toLowerCase().includes(lower) || 
              s.guardian.name.toLowerCase().includes(lower)
          );
      }

      // Status Filter
      if (filter === 'ACTIVE') result = result.filter(s => s.active);
      if (filter === 'INACTIVE') result = result.filter(s => !s.active);
      if (filter === 'DEFAULTING') {
          const defaulters = new Set(
              transactions
                .filter(t => t.type === TransactionType.INCOME && t.status !== PaymentStatus.PAID && new Date(t.date) < new Date())
                .map(t => t.studentId)
          );
          result = result.filter(s => defaulters.has(s.id));
      }
      if (filter === 'MISSING_DOCS') {
          result = result.filter(s => {
              if (!s.active) return false;
              const check = (d: boolean | DocumentItem) => typeof d === 'boolean' ? d : d.delivered;
              const docs = s.documents;
              return !check(docs.rg) || !check(docs.cpf) || !check(docs.medical) || !check(docs.address) || !check(docs.school);
          });
      }

      return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [students, searchTerm, filter, transactions]);

  // Handlers
  const handleOpenAdd = () => {
      setFormData(initialFormState);
      setCurrentStudent(null);
      setIsModalOpen(true);
  };

  const handleOpenEdit = (student: Student) => {
      setFormData(student);
      setCurrentStudent(student);
      setIsModalOpen(true);
  };

  const handleOpenDetails = (student: Student) => {
      setCurrentStudent(student);
      setDetailModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (currentStudent) {
          await onUpdateStudent({ ...formData, id: currentStudent.id });
      } else {
          await onAddStudent(formData);
      }
      setIsModalOpen(false);
  };

  // --- REPORT GENERATION ---
  const handleSendReport = (student: Student) => {
      const today = new Date();
      const monthName = today.toLocaleString('pt-BR', { month: 'long' });
      const year = today.getFullYear();
      
      // Calculate Stats
      const relevantActivities = activities.filter(a => {
        const d = new Date(a.date);
        // Activities in current month
        return d.getMonth() === today.getMonth() && d.getFullYear() === year &&
               ((a.groupId && student.groupIds?.includes(a.groupId)) || a.participants?.includes(student.id));
      });
      
      const presentCount = relevantActivities.filter(a => a.attendance.includes(student.id)).length;
      const rate = relevantActivities.length > 0 ? Math.round((presentCount / relevantActivities.length) * 100) : 100;
      
      const games = relevantActivities.filter(a => a.type === 'GAME').length;
      const goals = relevantActivities
        .filter(a => a.type === 'GAME')
        .reduce((acc, game) => acc + (game.scorers?.filter(id => id === student.id).length || 0), 0);
      
      const stats = { games, goals };
      const studentForm = student;
      const phone = student.guardian.phone.replace(/\D/g, '');

      // Message Construction
      const message = `Olá ${studentForm.guardian.name}, tudo bem? ⚽\n\n` +
          `Estamos enviando o relatório detalhado de *${studentForm.name}* referente a *${monthName}/${year}*.\n\n` +
          `Resumo:\n` +
          `✅ Frequência: ${rate}%\n` +
          `🏆 Jogos: ${stats.games}\n` +
          `⚽ Gols: ${stats.goals}\n\n` +
          `Atenciosamente,\nGarotos do Martinica`;

      const encodedMessage = encodeURIComponent(message);
      
      setTimeout(() => {
          window.open(`https://wa.me/55${phone}?text=${encodedMessage}`, '_blank');
      }, 1000);
  };

  // --- DOCUMENT UPDATE ---
  const updateDoc = (student: Student, docType: keyof StudentDocuments, subField: 'delivered' | 'isDigital', value: boolean) => {
        const currentDoc = student.documents?.[docType];
        let newDocItem: DocumentItem;
        
        if (typeof currentDoc === 'boolean') {
             newDocItem = { delivered: currentDoc, isDigital: false };
        } else if (currentDoc) {
             newDocItem = { ...currentDoc };
        } else {
             newDocItem = { delivered: false, isDigital: false };
        }
        
        newDocItem[subField] = value;
        
        const newDocuments = { 
            ...student.documents, 
            [docType]: newDocItem 
        } as StudentDocuments;
        
        // Optimistic update in local state if viewing details
        if (currentStudent && currentStudent.id === student.id) {
            setCurrentStudent({ ...student, documents: newDocuments });
        }
        
        onUpdateStudent({ ...student, documents: newDocuments });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Alunos e Matrículas</h2>
        {currentUser?.role !== UserRole.RESPONSAVEL && (
            <button 
            onClick={handleOpenAdd}
            className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
            >
            <Plus className="w-4 h-4" />
            Novo Aluno
            </button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input 
                type="text" 
                placeholder="Buscar por nome ou responsável..." 
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
        <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
            <button onClick={() => setFilter('ALL')} className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${filter === 'ALL' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'}`}>Todos</button>
            <button onClick={() => setFilter('ACTIVE')} className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${filter === 'ACTIVE' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Ativos</button>
            <button onClick={() => setFilter('DEFAULTING')} className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${filter === 'DEFAULTING' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Inadimplentes</button>
            <button onClick={() => setFilter('MISSING_DOCS')} className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${filter === 'MISSING_DOCS' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`}>Doc. Pendente</button>
        </div>
      </div>

      {/* Student List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredStudents.map(student => {
              const plan = plans.find(p => p.id === student.planId);
              const isDefaulter = transactions.some(t => t.studentId === student.id && t.type === TransactionType.INCOME && t.status !== PaymentStatus.PAID && new Date(t.date) < new Date());
              
              return (
                  <div key={student.id} className="bg-white rounded-xl shadow-sm border border-gray-100 hover:border-primary-200 transition-colors overflow-hidden group">
                      <div className="p-5">
                          <div className="flex justify-between items-start mb-4">
                              <div className="flex gap-3">
                                  <img 
                                    src={student.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(student.name)}&background=random`} 
                                    alt={student.name} 
                                    className="w-12 h-12 rounded-lg object-cover bg-gray-100"
                                  />
                                  <div>
                                      <h3 className="font-bold text-gray-900 leading-tight">{student.name}</h3>
                                      <p className="text-xs text-gray-500 mt-0.5">{plan ? plan.name : 'Sem plano'}</p>
                                  </div>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${student.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                      {student.active ? 'Ativo' : 'Inativo'}
                                  </span>
                                  {isDefaulter && (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-50 text-red-600 flex items-center gap-1">
                                          <AlertCircle className="w-3 h-3" /> Débito
                                      </span>
                                  )}
                              </div>
                          </div>
                          
                          <div className="space-y-2 text-sm text-gray-600 mb-4">
                              <div className="flex items-center gap-2">
                                  <UserIcon className="w-4 h-4 text-gray-400" />
                                  <span className="truncate">{student.guardian.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                  <Phone className="w-4 h-4 text-gray-400" />
                                  <span>{student.guardian.phone}</span>
                              </div>
                          </div>

                          <div className="flex gap-2 pt-4 border-t border-gray-50">
                                <button 
                                    onClick={() => handleOpenDetails(student)}
                                    className="flex-1 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                                >
                                    <FileText className="w-4 h-4" /> Detalhes
                                </button>
                                {currentUser?.role !== UserRole.RESPONSAVEL && (
                                    <button 
                                        onClick={() => handleOpenEdit(student)}
                                        className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                                    >
                                        <Edit className="w-4 h-4" />
                                    </button>
                                )}
                          </div>
                      </div>
                  </div>
              );
          })}
      </div>

      {/* Details Modal */}
      {detailModalOpen && currentStudent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                  <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                      <div className="flex items-center gap-4">
                          <img 
                            src={currentStudent.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentStudent.name)}`} 
                            className="w-16 h-16 rounded-xl object-cover" 
                            alt="" 
                          />
                          <div>
                              <h3 className="text-xl font-bold text-gray-900">{currentStudent.name}</h3>
                              <p className="text-sm text-gray-500">Matrícula: {currentStudent.id.substring(0,8)}</p>
                          </div>
                      </div>
                      <button onClick={() => setDetailModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                          {/* Documents Section */}
                          <div className="space-y-4">
                              <h4 className="font-bold text-gray-800 flex items-center gap-2 border-b pb-2">
                                  <FileText className="w-5 h-5 text-primary-600" /> Documentação
                              </h4>
                              <div className="space-y-3">
                                  {(['rg', 'cpf', 'medical', 'address', 'school'] as const).map(doc => {
                                      const docLabels = { rg: 'RG/Certidão', cpf: 'CPF', medical: 'Atestado Médico', address: 'Comp. Residência', school: 'Decl. Escolar' };
                                      const docData = currentStudent.documents?.[doc] as DocumentItem | boolean;
                                      const isDelivered = typeof docData === 'boolean' ? docData : docData?.delivered;
                                      const isDigital = typeof docData === 'boolean' ? false : docData?.isDigital;

                                      return (
                                          <div key={doc} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                                              <span className="text-sm font-medium text-gray-700">{docLabels[doc]}</span>
                                              <div className="flex items-center gap-2">
                                                  {currentUser?.role !== UserRole.RESPONSAVEL ? (
                                                      <>
                                                        <button 
                                                            onClick={() => updateDoc(currentStudent, doc, 'delivered', !isDelivered)}
                                                            className={`p-1.5 rounded-md transition-colors ${isDelivered ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-400'}`}
                                                            title={isDelivered ? "Entregue" : "Pendente"}
                                                        >
                                                            <CheckCircle className="w-4 h-4" />
                                                        </button>
                                                        <button 
                                                            onClick={() => updateDoc(currentStudent, doc, 'isDigital', !isDigital)}
                                                            className={`p-1.5 rounded-md transition-colors ${isDigital ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-400'}`}
                                                            title={isDigital ? "Digitalizado" : "Físico apenas"}
                                                        >
                                                            <Upload className="w-4 h-4" />
                                                        </button>
                                                      </>
                                                  ) : (
                                                      <span className={`px-2 py-1 rounded text-xs font-bold ${isDelivered ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'}`}>
                                                          {isDelivered ? 'Entregue' : 'Pendente'}
                                                      </span>
                                                  )}
                                              </div>
                                          </div>
                                      )
                                  })}
                              </div>
                              {currentUser?.role !== UserRole.RESPONSAVEL && (
                                  <button 
                                      onClick={() => handleSendReport(currentStudent)}
                                      className="w-full mt-4 py-3 bg-green-50 text-green-700 hover:bg-green-100 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors border border-green-200"
                                  >
                                      <MessageCircle className="w-5 h-5" /> Enviar Relatório via WhatsApp
                                  </button>
                              )}
                          </div>

                          {/* Finance Section */}
                          <div className="space-y-4">
                              <h4 className="font-bold text-gray-800 flex items-center gap-2 border-b pb-2">
                                  <DollarSign className="w-5 h-5 text-green-600" /> Histórico Financeiro
                              </h4>
                              <div className="max-h-64 overflow-y-auto pr-2 space-y-2">
                                  {transactions
                                    .filter(t => t.studentId === currentStudent.id)
                                    .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                    .map(t => (
                                      <div key={t.id} className="flex justify-between items-center p-3 bg-white border rounded-lg text-sm">
                                          <div>
                                              <p className="font-medium text-gray-900">{t.description}</p>
                                              <p className="text-xs text-gray-500">{new Date(t.date).toLocaleDateString()}</p>
                                          </div>
                                          <div className="text-right">
                                              <p className="font-bold text-gray-900">R$ {t.amount.toFixed(2)}</p>
                                              <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${t.status === PaymentStatus.PAID ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'}`}>
                                                  {t.status === PaymentStatus.PAID ? 'Pago' : 'Pendente'}
                                              </span>
                                          </div>
                                      </div>
                                    ))
                                  }
                                  {transactions.filter(t => t.studentId === currentStudent.id).length === 0 && (
                                      <p className="text-center text-gray-400 py-4 text-sm">Nenhum registro financeiro.</p>
                                  )}
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Add/Edit Modal (Simplified for brevity, assumes standard implementation) */}
      {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 my-8">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-lg font-bold text-gray-900">{currentStudent ? 'Editar Aluno' : 'Novo Aluno'}</h3>
                      <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                  </div>
                  <form onSubmit={handleSubmit} className="space-y-4">
                      {/* Name & Guardian */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                              <label className="block text-sm font-medium mb-1">Nome do Aluno</label>
                              <input required type="text" className="w-full border rounded-lg p-2" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                          </div>
                          <div>
                              <label className="block text-sm font-medium mb-1">Data Nascimento</label>
                              <input required type="date" className="w-full border rounded-lg p-2" value={formData.birthDate} onChange={e => setFormData({...formData, birthDate: e.target.value})} />
                          </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                              <label className="block text-sm font-medium mb-1">Nome Responsável</label>
                              <input required type="text" className="w-full border rounded-lg p-2" value={formData.guardian.name} onChange={e => setFormData({...formData, guardian: {...formData.guardian, name: e.target.value}})} />
                          </div>
                          <div>
                              <label className="block text-sm font-medium mb-1">Telefone</label>
                              <input required type="text" className="w-full border rounded-lg p-2" value={formData.guardian.phone} onChange={e => setFormData({...formData, guardian: {...formData.guardian, phone: e.target.value}})} />
                          </div>
                      </div>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                              <label className="block text-sm font-medium mb-1">CPF Responsável</label>
                              <input type="text" className="w-full border rounded-lg p-2" value={formData.guardian.cpf} onChange={e => setFormData({...formData, guardian: {...formData.guardian, cpf: e.target.value}})} />
                          </div>
                          <div>
                              <label className="block text-sm font-medium mb-1">Email</label>
                              <input type="email" className="w-full border rounded-lg p-2" value={formData.guardian.email} onChange={e => setFormData({...formData, guardian: {...formData.guardian, email: e.target.value}})} />
                          </div>
                      </div>
                      
                      {/* Plan & Group */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                              <label className="block text-sm font-medium mb-1">Plano</label>
                              <select className="w-full border rounded-lg p-2 bg-white" value={formData.planId} onChange={e => setFormData({...formData, planId: e.target.value})}>
                                  <option value="">Selecione...</option>
                                  {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                          </div>
                          <div>
                               <label className="block text-sm font-medium mb-1">Status</label>
                               <select className="w-full border rounded-lg p-2 bg-white" value={formData.active ? "true" : "false"} onChange={e => setFormData({...formData, active: e.target.value === 'true'})}>
                                   <option value="true">Ativo</option>
                                   <option value="false">Inativo</option>
                               </select>
                          </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                          <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                          <button type="submit" className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">Salvar</button>
                      </div>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
};