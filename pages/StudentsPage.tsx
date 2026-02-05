
import React, { useState, useMemo } from 'react';
import { Student, Group, Plan, Transaction, TransactionType, PaymentStatus, User, UserRole, Occurrence, PaymentMethod } from '../types';
import { Search, Plus, User as UserIcon, Edit, Clock, History, XCircle, AlertTriangle } from 'lucide-react';

interface StudentsPageProps {
  students: Student[];
  groups: Group[];
  plans: Plan[];
  transactions: Transaction[];
  activities: any[];
  occurrences: Occurrence[];
  onAddStudent: (s: Omit<Student, 'id'>) => void;
  onUpdateStudent: (s: Student) => void;
  onUpdateTransaction: (t: Partial<Transaction>) => void;
  onAddTransaction: (t: Omit<Transaction, 'id'>) => void;
  onAddOccurrence: (studentId: string, description: string, date: string) => Promise<boolean>;
  onGenerateTuitions: () => Promise<void>;
  initialFilter?: string;
  currentUser?: User | null;
  onBatchAddStudents: (s: Omit<Student, 'id'>[]) => void;
}

export const StudentsPage: React.FC<StudentsPageProps> = ({ students, transactions, plans, onAddStudent, onUpdateStudent, currentUser }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'DETAILS' | 'FINANCE'>('DETAILS');
  const [editingId, setEditingId] = useState<string | null>(null);

  const initialFormState: any = {
    name: '', birthDate: '', rg: '', cpf: '', phone: '', medicalCertificateExpiry: '', planId: '', active: true,
    guardian: { name: '', phone: '', email: '', cpf: '' }, address: { cep: '', street: '', number: '', district: '', city: '', state: '' },
    documents: { rg: false, cpf: false, medical: false, address: false, school: false }
  };

  const [studentForm, setStudentForm] = useState(initialFormState);
  const isGuardian = currentUser?.role === UserRole.RESPONSAVEL;
  const todayStr = new Date().toLocaleDateString('en-CA');

  const filteredStudents = useMemo(() => {
    return students.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [students, searchTerm]);

  const studentTransactions = transactions.filter(t => t.studentId === editingId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) onUpdateStudent({ ...studentForm, id: editingId } as Student);
    else onAddStudent(studentForm);
    setIsModalOpen(false);
  };

  const handleOpenEdit = (s: Student) => {
      setEditingId(s.id);
      setStudentForm(s);
      setActiveTab('DETAILS');
      setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input type="text" placeholder="Buscar atleta..." className="w-full pl-10 pr-4 py-2 border rounded-xl" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        {!isGuardian && <button onClick={() => { setEditingId(null); setStudentForm(initialFormState); setIsModalOpen(true); }} className="bg-primary-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2"><Plus className="w-4 h-4" /> Novo Aluno</button>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredStudents.map(s => (
              <div key={s.id} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer" onClick={() => handleOpenEdit(s)}>
                  <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 font-bold text-xl">{s.name[0]}</div>
                      <div>
                          <h3 className="font-bold text-gray-900">{s.name}</h3>
                          <p className="text-xs text-gray-500">Resp: {s.guardian.name}</p>
                      </div>
                      <span className={`ml-auto px-2 py-1 rounded-full text-[10px] font-black uppercase ${s.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{s.active ? 'Ativo' : 'Inativo'}</span>
                  </div>
              </div>
          ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b flex justify-between items-center bg-gray-50 rounded-t-3xl">
              <div className="flex gap-4">
                  <button onClick={() => setActiveTab('DETAILS')} className={`pb-2 font-bold text-sm border-b-2 transition-all ${activeTab === 'DETAILS' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-400'}`}>Cadastro</button>
                  {editingId && <button onClick={() => setActiveTab('FINANCE')} className={`pb-2 font-bold text-sm border-b-2 transition-all ${activeTab === 'FINANCE' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-400'}`}>Financeiro</button>}
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
                {activeTab === 'DETAILS' ? (
                    <form id="student-form" onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <h4 className="font-black text-xs uppercase text-primary-600 tracking-widest">Atleta</h4>
                                <div><label className="block text-xs font-bold mb-1">Nome Completo</label><input required className="w-full border rounded-xl p-3" value={studentForm.name} onChange={e => setStudentForm({...studentForm, name: e.target.value})} /></div>
                                <div><label className="block text-xs font-bold mb-1">Nascimento</label><input type="date" required className="w-full border rounded-xl p-3" value={studentForm.birthDate} onChange={e => setStudentForm({...studentForm, birthDate: e.target.value})} /></div>
                                <div><label className="block text-xs font-bold mb-1">Plano</label><select className="w-full border rounded-xl p-3 bg-white" value={studentForm.planId} onChange={e => setStudentForm({...studentForm, planId: e.target.value})}><option value="">Selecione...</option>{plans.map(p => <option key={p.id} value={p.id}>{p.name} - R$ {p.price}</option>)}</select></div>
                            </div>
                            <div className="space-y-4">
                                <h4 className="font-black text-xs uppercase text-primary-600 tracking-widest">Responsável</h4>
                                <div><label className="block text-xs font-bold mb-1">Nome</label><input required className="w-full border rounded-xl p-3" value={studentForm.guardian.name} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, name: e.target.value}})} /></div>
                                <div><label className="block text-xs font-bold mb-1">WhatsApp</label><input required className="w-full border rounded-xl p-3" value={studentForm.guardian.phone} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, phone: e.target.value}})} /></div>
                                <div><label className="block text-xs font-bold mb-1">CPF (Acesso)</label><input required className="w-full border rounded-xl p-3" value={studentForm.guardian.cpf} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, cpf: e.target.value}})} /></div>
                            </div>
                        </div>
                    </form>
                ) : (
                    <div className="space-y-3">
                        {studentTransactions.map(tx => {
                            const isCancelled = tx.status === PaymentStatus.CANCELLED;
                            const isLate = tx.status === PaymentStatus.PENDING && tx.date < todayStr;
                            return (
                                <div key={tx.id} className={`p-4 rounded-2xl border flex items-center justify-between transition-all ${isCancelled ? 'bg-red-50/30 border-red-100 opacity-60' : 'bg-white hover:border-primary-200'}`}>
                                    <div className="flex items-center gap-4">
                                        <div className={`p-3 rounded-xl ${tx.status === PaymentStatus.PAID ? 'bg-green-100 text-green-600' : isCancelled ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-400'}`}>
                                            {isCancelled ? <XCircle className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
                                        </div>
                                        <div>
                                            <p className={`font-bold ${isCancelled ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{tx.description}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-xs text-gray-400 font-medium">Venc: {tx.date.split('-').reverse().join('/')}</span>
                                                {tx.status === PaymentStatus.PAID && <span className="bg-green-100 text-green-700 text-[9px] px-2 py-0.5 rounded-full font-black uppercase">Pago</span>}
                                                {isCancelled && <span className="bg-red-600 text-white text-[9px] px-2 py-0.5 rounded-full font-black uppercase shadow-sm animate-pulse">Cancelado / Ignorado</span>}
                                                {isLate && <span className="bg-orange-100 text-orange-700 text-[9px] px-2 py-0.5 rounded-full font-black uppercase">Em Atraso</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className={`font-black text-lg ${isCancelled ? 'text-red-400 line-through' : 'text-gray-800'}`}>R$ {tx.amount.toFixed(2)}</div>
                                </div>
                            );
                        })}
                        {studentTransactions.length === 0 && <div className="p-12 text-center text-gray-400 bg-gray-50 rounded-3xl border-2 border-dashed">Nenhum lançamento encontrado.</div>}
                    </div>
                )}
            </div>
            
            <div className="p-6 border-t flex justify-end gap-3 bg-gray-50 rounded-b-3xl">
                <button onClick={() => setIsModalOpen(false)} className="px-6 py-2 font-bold text-gray-500 hover:bg-gray-200 rounded-xl transition-all">Fechar</button>
                {activeTab === 'DETAILS' && !isGuardian && <button type="submit" form="student-form" className="px-8 py-2 bg-primary-600 text-white rounded-xl font-bold shadow-lg shadow-primary-200 hover:bg-primary-700 transition-all">Salvar Dados</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
