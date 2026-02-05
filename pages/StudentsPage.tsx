
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Student, Group, Plan, Transaction, TransactionType, PaymentStatus, PaymentMethod, Activity, User, UserRole, Occurrence } from '../types';
import { Search, Plus, Phone, User as UserIcon, Edit, Camera, X, CheckSquare, Square, FileSpreadsheet, FileText, Filter, HeartPulse, ShieldCheck, MessageCircle, MapPin, Loader2, Printer, Wallet, QrCode, CheckCircle, Clock, Link as LinkIcon, History, XCircle, Download, Calculator, AlertTriangle, FileWarning, FolderCheck, Upload, RefreshCw, Copy, Send, Lock, PlusCircle, Calendar, CalendarCheck, Ban, Zap, Play, Pause, Ticket, Trophy, Medal, ChevronDown, Layers, Settings2, Banknote as CashIcon, Share2, MessageSquareWarning } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createPixPayment, createMPPreference } from '../services/mercadoPago';
import { sendZApiMessage } from '../services/zapiService';

interface StudentsPageProps {
  students: Student[];
  groups: Group[];
  plans: Plan[];
  transactions: Transaction[];
  activities: Activity[];
  occurrences: Occurrence[];
  onAddStudent: (s: Omit<Student, 'id'>) => void;
  onBatchAddStudents: (s: Omit<Student, 'id'>[]) => void;
  onUpdateStudent: (s: Student) => void;
  onUpdateTransaction: (t: Partial<Transaction>) => void;
  onAddTransaction: (t: Omit<Transaction, 'id'>) => void;
  onAddOccurrence: (studentId: string, description: string, date: string) => Promise<boolean>;
  onGenerateTuitions: () => Promise<void>;
  initialFilter?: string;
  currentUser?: User | null;
}

export const StudentsPage: React.FC<StudentsPageProps> = ({ students, groups, plans, transactions, activities, occurrences, onAddStudent, onBatchAddStudents, onUpdateStudent, onUpdateTransaction, onAddTransaction, onAddOccurrence, onGenerateTuitions, initialFilter, currentUser }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'DETAILS' | 'FINANCE' | 'ATTENDANCE' | 'OCCURRENCES'>('DETAILS');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedFinanceIds, setSelectedFinanceIds] = useState<Set<string>>(new Set());
  const [isLoadingCep, setIsLoadingCep] = useState(false);

  const isGuardian = currentUser?.role === UserRole.RESPONSAVEL;
  const todayStr = new Date().toLocaleDateString('en-CA');

  const initialFormState: any = {
    name: '', birthDate: '', rg: '', cpf: '', phone: '', medicalCertificateExpiry: '', groupIds: [], planId: '', active: true,
    address: { cep: '', street: '', number: '', complement: '', district: '', city: '', state: '' },
    guardian: { name: '', phone: '', email: '', cpf: '' },
    documents: { rg: { delivered: false, isDigital: false }, cpf: { delivered: false, isDigital: false }, medical: { delivered: false, isDigital: false }, address: { delivered: false, isDigital: false }, school: { delivered: false, isDigital: false } }
  };

  const [studentForm, setStudentForm] = useState(initialFormState);

  const calculateAge = (birthDateString: string) => {
    if (!birthDateString) return 0;
    const today = new Date(); const birthDate = new Date(birthDateString);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const parts = dateString.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateString;
  };

  const handleOpenEdit = (student: Student) => {
      setEditingId(student.id);
      setStudentForm({ ...student });
      setActiveTab('DETAILS');
      setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) onUpdateStudent({ ...studentForm, id: editingId } as Student);
    else onAddStudent(studentForm);
    setIsModalOpen(false);
  };

  const studentTransactions = transactions.filter(t => t.studentId === editingId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const matchSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? s.active : !s.active);
      return matchSearch && matchStatus;
    });
  }, [students, searchTerm, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex gap-4">
            <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" /><input type="text" placeholder="Buscar..." className="pl-10 pr-4 py-2 border rounded-lg" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
            <select className="border rounded-lg px-4 py-2" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="ALL">Todos Status</option>
                <option value="ACTIVE">Ativos</option>
                <option value="INACTIVE">Inativos</option>
            </select>
        </div>
        {!isGuardian && <button onClick={() => { setEditingId(null); setStudentForm(initialFormState); setIsModalOpen(true); }} className="bg-primary-600 text-white px-4 py-2 rounded-lg flex items-center gap-2"><Plus className="w-4 h-4" /> Novo Aluno</button>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredStudents.map(student => (
              <div key={student.id} className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => handleOpenEdit(student)}>
                  <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-primary-600 font-bold text-xl">{student.name[0]}</div>
                      <div>
                          <h3 className="font-bold text-gray-900">{student.name}</h3>
                          <p className="text-xs text-gray-500">{calculateAge(student.birthDate)} anos • {student.guardian.name}</p>
                      </div>
                      <span className={`ml-auto px-2 py-1 rounded-full text-[10px] font-black uppercase ${student.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{student.active ? 'Ativo' : 'Inat.'}</span>
                  </div>
              </div>
          ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b flex justify-between items-center bg-gray-50 rounded-t-2xl">
              <div className="flex gap-4">
                  <button onClick={() => setActiveTab('DETAILS')} className={`pb-2 font-bold text-sm border-b-2 ${activeTab === 'DETAILS' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-400'}`}>Dados Cadastrais</button>
                  {editingId && <button onClick={() => setActiveTab('FINANCE')} className={`pb-2 font-bold text-sm border-b-2 ${activeTab === 'FINANCE' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-400'}`}>Financeiro</button>}
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400">✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
                {activeTab === 'DETAILS' ? (
                    <form id="student-form" onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <h4 className="font-bold text-sm uppercase text-gray-400 border-b">Atleta</h4>
                                <div><label className="block text-xs font-bold mb-1">Nome Completo</label><input required className="w-full border rounded-lg p-2" value={studentForm.name} onChange={e => setStudentForm({...studentForm, name: e.target.value})} /></div>
                                <div><label className="block text-xs font-bold mb-1">Data Nascimento</label><input type="date" required className="w-full border rounded-lg p-2" value={studentForm.birthDate} onChange={e => setStudentForm({...studentForm, birthDate: e.target.value})} /></div>
                            </div>
                            <div className="space-y-4">
                                <h4 className="font-bold text-sm uppercase text-gray-400 border-b">Responsável</h4>
                                <div><label className="block text-xs font-bold mb-1">Nome do Responsável</label><input required className="w-full border rounded-lg p-2" value={studentForm.guardian.name} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, name: e.target.value}})} /></div>
                                <div><label className="block text-xs font-bold mb-1">WhatsApp</label><input required className="w-full border rounded-lg p-2" value={studentForm.guardian.phone} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, phone: e.target.value}})} /></div>
                                <div><label className="block text-xs font-bold mb-1">CPF (Login)</label><input required className="w-full border rounded-lg p-2" value={studentForm.guardian.cpf} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, cpf: e.target.value}})} /></div>
                            </div>
                        </div>
                    </form>
                ) : (
                    <div className="space-y-4">
                        {studentTransactions.map(tx => {
                            const isCancelled = tx.status === PaymentStatus.CANCELLED;
                            const isLate = tx.status === PaymentStatus.PENDING && tx.date < todayStr;
                            return (
                                <div key={tx.id} className={`p-4 rounded-xl border flex items-center justify-between ${isCancelled ? 'bg-gray-50 border-gray-200' : 'bg-white'}`}>
                                    <div className="flex items-center gap-4">
                                        <div className={`p-2 rounded-lg ${tx.status === PaymentStatus.PAID ? 'bg-green-100 text-green-600' : isCancelled ? 'bg-red-50 text-red-300' : 'bg-gray-100 text-gray-400'}`}>
                                            {isCancelled ? <XCircle className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
                                        </div>
                                        <div>
                                            <p className={`font-bold ${isCancelled ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{tx.description}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-xs text-gray-500">Venc: {formatDate(tx.date)}</span>
                                                {tx.status === PaymentStatus.PAID && <span className="bg-green-100 text-green-700 text-[10px] px-2 py-0.5 rounded-full font-black uppercase">PAGO</span>}
                                                {isCancelled && <span className="bg-red-600 text-white text-[10px] px-2 py-0.5 rounded-full font-black uppercase animate-pulse">CANCELADA</span>}
                                                {isLate && <span className="bg-orange-100 text-orange-700 text-[10px] px-2 py-0.5 rounded-full font-black uppercase">ATRASADA</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className={`font-black text-lg ${isCancelled ? 'text-gray-300' : 'text-gray-800'}`}>R$ {tx.amount.toFixed(2)}</div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            
            <div className="p-6 border-t flex justify-end gap-3 bg-gray-50 rounded-b-2xl">
                <button onClick={() => setIsModalOpen(false)} className="px-6 py-2 font-bold text-gray-500">Fechar</button>
                {activeTab === 'DETAILS' && <button type="submit" form="student-form" className="px-8 py-2 bg-primary-600 text-white rounded-xl font-bold shadow-lg shadow-primary-200">Salvar Dados</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
