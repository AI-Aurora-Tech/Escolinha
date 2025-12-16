
import React, { useState, useEffect } from 'react';
import { Student, Plan, Group, Transaction, TransactionType, PaymentStatus, PaymentMethod } from '../types';
import { Plus, Edit, Trash2, DollarSign, Search, X, CheckCircle, AlertCircle, FileText, Filter } from 'lucide-react';
import { createMPPreference } from '../services/mercadoPago';

interface StudentsPageProps {
  students: Student[];
  plans: Plan[];
  groups: Group[];
  onAddStudent: (student: any) => Promise<void>;
  onUpdateStudent: (student: any) => Promise<void>;
  onDeleteStudent: (id: string) => Promise<void>;
  onAddTransaction: (transaction: Omit<Transaction, 'id'>) => void;
}

export const StudentsPage: React.FC<StudentsPageProps> = ({ 
  students, plans, groups, onAddStudent, onUpdateStudent, onDeleteStudent, onAddTransaction 
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showChargeModal, setShowChargeModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE' | 'DEFAULTING' | 'MISSING_DOCS'>('ALL');

  const initialFormState: Partial<Student> = {
    name: '',
    birthDate: '',
    rg: '',
    cpf: '',
    phone: '',
    medicalCertificateExpiry: '',
    photoUrl: `https://ui-avatars.com/api/?name=Novo+Aluno&background=random`,
    address: { cep: '', street: '', number: '', complement: '', district: '', city: '', state: '' },
    guardian: { name: '', phone: '', email: '', cpf: '' },
    planId: '',
    groupIds: [],
    active: true,
    documents: { rg: false, cpf: false, medical: false, address: false, school: false }
  };

  const [studentForm, setStudentForm] = useState<Partial<Student>>(initialFormState);
  
  const [manualCharge, setManualCharge] = useState({
    description: '', amount: 0, date: new Date().toISOString().split('T')[0]
  });

  const handleOpenNew = () => {
    setEditingId(null);
    setStudentForm(initialFormState);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (student: Student) => {
    setEditingId(student.id);
    setStudentForm(student);
    setIsModalOpen(true);
  };

  const handleOpenCharge = (student: Student) => {
      setEditingId(student.id);
      setStudentForm(student);
      setManualCharge({ description: 'Taxa Extra / Material', amount: 0, date: new Date().toISOString().split('T')[0] });
      setShowChargeModal(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
        await onUpdateStudent({ ...studentForm, id: editingId });
    } else {
        await onAddStudent(studentForm);
    }
    setIsModalOpen(false);
  };

  const handleSaveManualCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !studentForm.guardian) return;

    const externalReference = crypto.randomUUID();
    let paymentLink = '';
    const fullDescription = `${studentForm.name} - ${manualCharge.description}`;

    try {
        if (studentForm.guardian.cpf) {
            const mpResult = await createMPPreference({
                title: fullDescription,
                price: manualCharge.amount,
                externalReference: externalReference,
                payer: {
                    name: studentForm.guardian.name,
                    email: studentForm.guardian.email,
                    phone: studentForm.guardian.phone,
                    identification: { type: 'CPF', number: studentForm.guardian.cpf }
                }
            });
            if (mpResult) {
                paymentLink = mpResult.init_point;
            }
        }
    } catch (e) { console.warn("Could not generate MP Link for manual charge"); }

    onAddTransaction({
        description: fullDescription,
        amount: manualCharge.amount,
        type: TransactionType.INCOME,
        date: manualCharge.date,
        status: PaymentStatus.PENDING,
        studentId: editingId,
        paymentMethod: PaymentMethod.PIX_MERCADO_PAGO, 
        paymentLink: paymentLink,
        externalReference: externalReference
    });

    setShowChargeModal(false);
    setManualCharge({ description: '', amount: 0, date: new Date().toISOString().split('T')[0] });
    alert("Cobrança criada com sucesso!");
  };

  const handleDelete = async (id: string) => {
      if (confirm("Tem certeza que deseja excluir este aluno?")) {
          await onDeleteStudent(id);
      }
  };

  const filteredStudents = students.filter(s => {
      const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.guardian.name.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;

      if (filter === 'ACTIVE') return s.active;
      if (filter === 'INACTIVE') return !s.active;
      // Note: DEFAULTING and MISSING_DOCS logic would usually be passed as props or calculated here if transaction data was available
      // For now, simple filtering
      return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Gerenciar Alunos</h2>
        <button onClick={handleOpenNew} className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> Novo Aluno
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input 
                  type="text" 
                  placeholder="Buscar por aluno ou responsável..." 
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
              />
          </div>
          <div className="flex gap-2 w-full md:w-auto overflow-x-auto">
              <button onClick={() => setFilter('ALL')} className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap ${filter === 'ALL' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'}`}>Todos</button>
              <button onClick={() => setFilter('ACTIVE')} className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap ${filter === 'ACTIVE' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Ativos</button>
              <button onClick={() => setFilter('INACTIVE')} className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap ${filter === 'INACTIVE' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Inativos</button>
          </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
          {filteredStudents.map(student => (
              <div key={student.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-center gap-4 hover:border-primary-200 transition-all">
                  <img src={student.photoUrl} alt={student.name} className="w-16 h-16 rounded-full object-cover bg-gray-200" />
                  <div className="flex-1 text-center md:text-left">
                      <h3 className="font-bold text-gray-900">{student.name}</h3>
                      <p className="text-sm text-gray-500">{student.guardian.name} • {student.phone}</p>
                      <div className="flex flex-wrap gap-2 justify-center md:justify-start mt-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${student.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {student.active ? 'Ativo' : 'Inativo'}
                          </span>
                          {student.planId && (
                              <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700 font-medium">
                                  {plans.find(p => p.id === student.planId)?.name || 'Plano Desconhecido'}
                              </span>
                          )}
                      </div>
                  </div>
                  <div className="flex gap-2">
                      <button onClick={() => handleOpenCharge(student)} className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Gerar Cobrança Avulsa">
                          <DollarSign className="w-5 h-5" />
                      </button>
                      <button onClick={() => handleOpenEdit(student)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar">
                          <Edit className="w-5 h-5" />
                      </button>
                      <button onClick={() => handleDelete(student.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir">
                          <Trash2 className="w-5 h-5" />
                      </button>
                  </div>
              </div>
          ))}
          {filteredStudents.length === 0 && (
              <div className="text-center py-10 text-gray-400">Nenhum aluno encontrado.</div>
          )}
      </div>

      {/* Manual Charge Modal */}
      {showChargeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-bold text-gray-900">Cobrança Avulsa</h3>
                      <button onClick={() => setShowChargeModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
                  </div>
                  <form onSubmit={handleSaveManualCharge} className="space-y-4">
                      <div>
                          <p className="text-sm text-gray-600 mb-2">Aluno: <strong>{studentForm.name}</strong></p>
                          <label className="block text-sm font-medium mb-1">Descrição</label>
                          <input type="text" className="w-full border rounded-lg p-2" required 
                              value={manualCharge.description} onChange={e => setManualCharge({...manualCharge, description: e.target.value})} />
                      </div>
                      <div>
                          <label className="block text-sm font-medium mb-1">Valor (R$)</label>
                          <input type="number" step="0.01" className="w-full border rounded-lg p-2" required 
                              value={manualCharge.amount} onChange={e => setManualCharge({...manualCharge, amount: parseFloat(e.target.value)})} />
                      </div>
                      <div>
                          <label className="block text-sm font-medium mb-1">Data de Vencimento</label>
                          <input type="date" className="w-full border rounded-lg p-2" required 
                              value={manualCharge.date} onChange={e => setManualCharge({...manualCharge, date: e.target.value})} />
                      </div>
                      <button type="submit" className="w-full bg-green-600 text-white py-2 rounded-lg font-medium hover:bg-green-700 transition-colors">
                          Gerar Cobrança e Link Pix
                      </button>
                  </form>
              </div>
          </div>
      )}

      {/* Student Form Modal */}
      {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 my-8">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-lg font-bold text-gray-900">{editingId ? 'Editar Aluno' : 'Novo Aluno'}</h3>
                      <button onClick={() => setIsModalOpen(false)}><X className="w-5 h-5 text-gray-400" /></button>
                  </div>
                  <form onSubmit={handleSaveStudent} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                              <label className="block text-sm font-medium mb-1">Nome Completo</label>
                              <input type="text" className="w-full border rounded-lg p-2" required 
                                  value={studentForm.name} onChange={e => setStudentForm({...studentForm, name: e.target.value})} />
                          </div>
                          <div>
                              <label className="block text-sm font-medium mb-1">Data de Nascimento</label>
                              <input type="date" className="w-full border rounded-lg p-2" required 
                                  value={studentForm.birthDate} onChange={e => setStudentForm({...studentForm, birthDate: e.target.value})} />
                          </div>
                          <div>
                              <label className="block text-sm font-medium mb-1">Plano</label>
                              <select className="w-full border rounded-lg p-2 bg-white" 
                                  value={studentForm.planId} onChange={e => setStudentForm({...studentForm, planId: e.target.value})}>
                                  <option value="">Selecione...</option>
                                  {plans.map(p => <option key={p.id} value={p.id}>{p.name} - R$ {p.price}</option>)}
                              </select>
                          </div>
                          <div>
                              <label className="block text-sm font-medium mb-1">Status</label>
                              <select className="w-full border rounded-lg p-2 bg-white" 
                                  value={studentForm.active ? 'true' : 'false'} onChange={e => setStudentForm({...studentForm, active: e.target.value === 'true'})}>
                                  <option value="true">Ativo</option>
                                  <option value="false">Inativo</option>
                              </select>
                          </div>
                      </div>

                      <div className="border-t border-gray-100 pt-4">
                          <h4 className="font-bold text-gray-700 mb-3">Dados do Responsável</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                  <label className="block text-sm font-medium mb-1">Nome do Responsável</label>
                                  <input type="text" className="w-full border rounded-lg p-2" required 
                                      value={studentForm.guardian?.name} 
                                      onChange={e => setStudentForm({...studentForm, guardian: { ...studentForm.guardian!, name: e.target.value }})} />
                              </div>
                              <div>
                                  <label className="block text-sm font-medium mb-1">CPF (Responsável)</label>
                                  <input type="text" className="w-full border rounded-lg p-2" placeholder="000.000.000-00"
                                      value={studentForm.guardian?.cpf} 
                                      onChange={e => setStudentForm({...studentForm, guardian: { ...studentForm.guardian!, cpf: e.target.value }})} />
                              </div>
                              <div>
                                  <label className="block text-sm font-medium mb-1">Telefone / WhatsApp</label>
                                  <input type="text" className="w-full border rounded-lg p-2" required 
                                      value={studentForm.guardian?.phone} 
                                      onChange={e => setStudentForm({...studentForm, guardian: { ...studentForm.guardian!, phone: e.target.value }})} />
                              </div>
                              <div>
                                  <label className="block text-sm font-medium mb-1">Email</label>
                                  <input type="email" className="w-full border rounded-lg p-2" 
                                      value={studentForm.guardian?.email} 
                                      onChange={e => setStudentForm({...studentForm, guardian: { ...studentForm.guardian!, email: e.target.value }})} />
                              </div>
                          </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-4">
                          <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                          <button type="submit" className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 shadow-sm font-medium">Salvar Aluno</button>
                      </div>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
};
