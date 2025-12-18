
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Student, Group, Plan, Transaction, TransactionType, PaymentStatus, PaymentMethod, Activity, User, UserRole } from '../types';
import { Search, Plus, Phone, User as UserIcon, Edit, Camera, X, CheckSquare, Square, FileSpreadsheet, FileText, Filter, HeartPulse, ShieldCheck, MessageCircle, MapPin, Loader2, Printer, Wallet, QrCode, CheckCircle, Clock, Link as LinkIcon, History, CalendarCheck, XCircle, Download, Calculator, AlertTriangle, FileWarning, FolderCheck, Upload, RefreshCw, Copy, Send, Lock, PlusCircle, Calendar, Ban, Zap, Play, Pause, Ticket, Trophy, Medal, ChevronDown, Layers } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { checkMPPaymentStatus, createPixPayment, getPaymentStatus, createMPPreference } from '../services/mercadoPago';
import { sendZApiMessage } from '../services/zapiService';

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
  const [planFilter, setPlanFilter] = useState('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'DETAILS' | 'FINANCE' | 'ATTENDANCE'>('DETAILS');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sendingPixId, setSendingPixId] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoadingCep, setIsLoadingCep] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initialFormState: any = {
    name: '', birthDate: '', rg: '', cpf: '', phone: '', medicalCertificateExpiry: '', groupIds: [], planId: '', active: true,
    photoUrl: `https://ui-avatars.com/api/?name=Novo+Aluno&background=random`,
    address: { cep: '', street: '', number: '', complement: '', district: '', city: '', state: '' },
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
  const isGuardian = currentUser?.role === UserRole.RESPONSAVEL;

  const calculateAge = (birthDateString: string) => {
    if (!birthDateString) return 0;
    const birthDate = new Date(birthDateString);
    let age = new Date().getFullYear() - birthDate.getFullYear();
    const m = new Date().getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && new Date().getDate() < birthDate.getDate())) age--;
    return age;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const parts = dateString.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateString;
  };

  const fetchAddressByCep = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length === 8) {
      setIsLoadingCep(true);
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await response.json();
        if (!data.erro) {
          setStudentForm({
            ...studentForm,
            address: {
              ...studentForm.address,
              cep: cleanCep,
              street: data.logradouro,
              district: data.bairro,
              city: data.localidade,
              state: data.uf
            }
          });
        }
      } catch (err) { console.error("Erro ao buscar CEP"); }
      finally { setIsLoadingCep(false); }
    }
  };

  const handleRequestDocuments = async (student: Student) => {
    const phone = student.guardian.phone.replace(/\D/g, '');
    if (!phone) return;
    const d = student.documents as any;
    const missingList = [];
    if (!d.rg?.delivered) missingList.push("RG");
    if (!d.cpf?.delivered) missingList.push("CPF");
    if (!d.medical?.delivered) missingList.push("Atestado Médico");
    if (!d.address?.delivered) missingList.push("Comp. de Endereço");
    if (!d.school?.delivered) missingList.push("Declaração Escolar");
    
    if (missingList.length === 0) return;

    const message = `Olá ${student.guardian.name}, tudo bem? ⚽\nAqui é da Garotos do Martinica.\nDocumentação pendente de *${student.name}*:\n${missingList.map(item => `- ${item}`).join('\n')}\nFavor regularizar assim que possível. Obrigado!`;
    const sent = await sendZApiMessage(phone, message);
    if (!sent) window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleSendPixToWhatsApp = async (tx: Transaction) => {
    const phone = studentForm.guardian.phone.replace(/\D/g, '');
    if (!phone || !studentForm.guardian.cpf) { alert("Telefone ou CPF do responsável ausente."); return; }
    setSendingPixId(tx.id);
    try {
      const externalRef = tx.externalReference || crypto.randomUUID();
      const mpResult = await createPixPayment({ 
        title: tx.description, price: tx.amount, externalReference: externalRef, 
        payer: { name: studentForm.guardian.name, email: studentForm.guardian.email, phone: studentForm.guardian.phone, identification: { type: 'CPF', number: studentForm.guardian.cpf } } 
      });
      if (mpResult?.qrCode) {
        const message = `Olá ${studentForm.guardian.name}, Garotos do Martinica aqui. ⚽\nReferente a: *${tx.description}*\nValor: R$ ${tx.amount.toFixed(2)}\n\nCódigo PIX Copia e Cola:\n\n${mpResult.qrCode}`;
        const sent = await sendZApiMessage(phone, message);
        if (!sent) window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(message)}`, '_blank');
      } else { alert("Erro ao gerar PIX."); }
    } catch (e) { alert("Erro de comunicação."); } finally { setSendingPixId(null); }
  };

  const handleOpenEdit = (s: Student) => {
    setEditingId(s.id);
    setStudentForm(s);
    setActiveTab('DETAILS');
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      onUpdateStudent({ ...studentForm, id: editingId });
    } else {
      onAddStudent(studentForm);
    }
    setIsModalOpen(false);
  };

  const toggleGroupSelection = (groupId: string) => {
    const current = studentForm.groupIds || [];
    if (current.includes(groupId)) {
      setStudentForm({ ...studentForm, groupIds: current.filter(id => id !== groupId) });
    } else {
      setStudentForm({ ...studentForm, groupIds: [...current, groupId] });
    }
  };

  const filteredStudents = students.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         s.guardian.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? s.active : !s.active);
    const matchesPlan = planFilter === 'ALL' || s.planId === planFilter;
    return matchesSearch && matchesStatus && matchesPlan;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-xl md:text-2xl font-bold text-gray-800">{isGuardian ? 'Meus Filhos' : 'Alunos e Responsáveis'}</h2>
        {!isGuardian && (
          <div className="flex gap-2 w-full md:w-auto">
            <button onClick={() => fileInputRef.current?.click()} className="flex-1 md:flex-none justify-center flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-sm"><Upload className="w-4 h-4" /> Importar</button>
            <button onClick={() => { setEditingId(null); setStudentForm(initialFormState); setIsModalOpen(true); }} className="w-full md:w-auto flex items-center justify-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 shadow-sm text-sm"><Plus className="w-4 h-4" /> Novo Aluno</button>
          </div>
        )}
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-4 relative"><Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" /><input type="text" placeholder="Buscar atleta ou responsável..." className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
        <div className="md:col-span-4"><select className="w-full p-2 border rounded-lg bg-white outline-none" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="ALL">Status: Todos</option><option value="ACTIVE">Ativos</option><option value="INACTIVE">Inativos</option></select></div>
        <div className="md:col-span-4"><select className="w-full p-2 border rounded-lg bg-white outline-none" value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}><option value="ALL">Plano: Todos</option>{plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Aluno</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Idade</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Responsável</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredStudents.map((student) => (
                <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4"><div className="flex items-center gap-3"><img src={student.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover bg-gray-200" /><p className="font-medium text-gray-900">{student.name}</p></div></td>
                  <td className="px-6 py-4 text-sm text-gray-600 font-medium">{calculateAge(student.birthDate)} anos</td>
                  <td className="px-6 py-4"><span className="text-sm font-medium text-gray-900">{student.guardian.name}</span></td>
                  <td className="px-6 py-4"><span className={`px-3 py-1 rounded-full text-xs font-medium border ${student.active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{student.active ? 'Ativo' : 'Inativo'}</span></td>
                  <td className="px-6 py-4 text-right"><div className="flex justify-end gap-2"><button onClick={() => handleOpenEdit(student)} className="text-primary-600 hover:text-primary-800 p-2 bg-primary-50 rounded-lg"><Edit className="w-4 h-4" /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl my-8 flex flex-col">
            <div className="p-6 border-b flex justify-between items-center bg-gray-50 rounded-t-2xl">
              <div>
                <h3 className="text-xl font-bold text-gray-800">{editingId ? 'Editar Cadastro' : 'Novo Aluno'}</h3>
                <div className="flex gap-4 mt-4">
                  <button onClick={() => setActiveTab('DETAILS')} className={`pb-2 px-2 text-sm font-medium border-b-2 ${activeTab === 'DETAILS' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500'}`}>Dados Cadastrais</button>
                  {editingId && (
                    <>
                      <button onClick={() => setActiveTab('FINANCE')} className={`pb-2 px-2 text-sm font-medium border-b-2 ${activeTab === 'FINANCE' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500'}`}>Financeiro</button>
                      <button onClick={() => setActiveTab('ATTENDANCE')} className={`pb-2 px-2 text-sm font-medium border-b-2 ${activeTab === 'ATTENDANCE' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500'}`}>Frequência</button>
                    </>
                  )}
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
            </div>

            <div className="p-6 overflow-y-auto">
              {activeTab === 'DETAILS' ? (
                <form onSubmit={handleSave} className="space-y-8">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Coluna 1: Foto e Dados Aluno */}
                    <div className="space-y-6">
                      <div className="flex flex-col items-center gap-4">
                         <div className="relative group">
                            <img src={studentForm.photoUrl} className="w-40 h-40 rounded-full object-cover border-4 border-white shadow-md bg-gray-100" />
                            <button type="button" onClick={() => setIsCameraOpen(true)} className="absolute bottom-1 right-1 bg-primary-600 text-white p-2 rounded-full shadow-lg hover:bg-primary-700 transition-transform active:scale-95"><Camera className="w-5 h-5" /></button>
                         </div>
                         <h4 className="font-bold text-gray-700 uppercase text-xs tracking-wider">Identificação do Atleta</h4>
                      </div>
                      <div className="space-y-4">
                        <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nome Completo</label><input type="text" required className="w-full border rounded-lg p-2" value={studentForm.name} onChange={e => setStudentForm({...studentForm, name: e.target.value})} /></div>
                        <div className="grid grid-cols-2 gap-4">
                          <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nascimento</label><input type="date" required className="w-full border rounded-lg p-2" value={studentForm.birthDate} onChange={e => setStudentForm({...studentForm, birthDate: e.target.value})} /></div>
                          <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Plano</label><select required className="w-full border rounded-lg p-2 bg-white" value={studentForm.planId} onChange={e => setStudentForm({...studentForm, planId: e.target.value})}><option value="">Selecione...</option>{plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">RG</label><input type="text" className="w-full border rounded-lg p-2" value={studentForm.rg} onChange={e => setStudentForm({...studentForm, rg: e.target.value})} /></div>
                          <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">CPF</label><input type="text" className="w-full border rounded-lg p-2" value={studentForm.cpf} onChange={e => setStudentForm({...studentForm, cpf: e.target.value})} /></div>
                        </div>
                      </div>
                    </div>

                    {/* Coluna 2: Endereço e Responsável */}
                    <div className="space-y-6 border-x px-8">
                       <h4 className="font-bold text-gray-700 uppercase text-xs tracking-wider flex items-center gap-2"><MapPin className="w-4 h-4 text-primary-500" /> Endereço Residencial</h4>
                       <div className="grid grid-cols-1 gap-4">
                          <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">CEP</label><input type="text" className="w-full border rounded-lg p-2" value={studentForm.address.cep} onChange={e => { setStudentForm({...studentForm, address: {...studentForm.address, cep: e.target.value}}); if(e.target.value.length === 8) fetchAddressByCep(e.target.value); }} /></div>
                          <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Rua/Logradouro</label><input type="text" className="w-full border rounded-lg p-2" value={studentForm.address.street} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, street: e.target.value}})} /></div>
                          <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Número</label><input type="text" className="w-full border rounded-lg p-2" value={studentForm.address.number} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, number: e.target.value}})} /></div>
                            <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Bairro</label><input type="text" className="w-full border rounded-lg p-2" value={studentForm.address.district} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, district: e.target.value}})} /></div>
                          </div>
                       </div>

                       <h4 className="font-bold text-gray-700 uppercase text-xs tracking-wider flex items-center gap-2 mt-8"><UserIcon className="w-4 h-4 text-primary-500" /> Dados do Responsável</h4>
                       <div className="space-y-4">
                          <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nome</label><input type="text" required className="w-full border rounded-lg p-2" value={studentForm.guardian.name} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, name: e.target.value}})} /></div>
                          <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">WhatsApp</label><input type="text" required className="w-full border rounded-lg p-2" value={studentForm.guardian.phone} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, phone: e.target.value}})} /></div>
                            <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">CPF Resp.</label><input type="text" required className="w-full border rounded-lg p-2" value={studentForm.guardian.cpf} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, cpf: e.target.value}})} /></div>
                          </div>
                       </div>
                    </div>

                    {/* Coluna 3: Grupos e Docs */}
                    <div className="space-y-6">
                       <h4 className="font-bold text-gray-700 uppercase text-xs tracking-wider flex items-center gap-2"><Layers className="w-4 h-4 text-primary-500" /> Grupos Vinculados</h4>
                       <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 bg-gray-50 rounded-lg">
                          {groups.map(g => (
                            <button key={g.id} type="button" onClick={() => toggleGroupSelection(g.id)} className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors flex items-center gap-2 ${studentForm.groupIds?.includes(g.id) ? 'bg-primary-600 border-primary-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{studentForm.groupIds?.includes(g.id) ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />} {g.name}</button>
                          ))}
                       </div>

                       <h4 className="font-bold text-gray-700 uppercase text-xs tracking-wider flex items-center gap-2 mt-8"><FolderCheck className="w-4 h-4 text-primary-500" /> Documentação</h4>
                       <div className="space-y-2 bg-gray-50 p-4 rounded-xl">
                          {Object.keys(studentForm.documents).map(docKey => (
                            <label key={docKey} className="flex items-center justify-between p-2 hover:bg-white rounded-lg transition-colors cursor-pointer border border-transparent hover:border-gray-100">
                               <div className="flex items-center gap-3">
                                  <input type="checkbox" className="w-4 h-4 text-primary-600" checked={studentForm.documents[docKey].delivered} onChange={e => setStudentForm({...studentForm, documents: {...studentForm.documents, [docKey]: {...studentForm.documents[docKey], delivered: e.target.checked}}})} />
                                  <span className="text-sm text-gray-700 capitalize">{docKey === 'medical' ? 'Atestado Médico' : docKey === 'address' ? 'Comp. Endereço' : docKey === 'school' ? 'Declaração Escolar' : docKey.toUpperCase()}</span>
                               </div>
                            </label>
                          ))}
                       </div>
                       <button type="button" onClick={() => handleRequestDocuments(studentForm)} className="w-full flex items-center justify-center gap-2 text-xs font-bold text-primary-600 bg-primary-50 py-2 rounded-lg hover:bg-primary-100"><MessageCircle className="w-4 h-4" /> Cobrar Pendências via WhatsApp</button>
                    </div>
                  </div>
                  <div className="pt-6 border-t flex justify-end gap-3"><button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2 border rounded-lg hover:bg-gray-50 transition-colors">Cancelar</button><button type="submit" className="px-10 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 shadow-lg shadow-primary-200">Salvar Alterações</button></div>
                </form>
              ) : activeTab === 'FINANCE' ? (
                <div className="space-y-4">
                  {transactions.filter(t => t.studentId === editingId).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(tx => (
                    <div key={tx.id} className="p-4 border rounded-xl flex justify-between items-center hover:bg-gray-50">
                      <div><p className="font-bold text-gray-900">{tx.description}</p><p className="text-xs text-gray-500">Vencimento: {formatDate(tx.date)}</p></div>
                      <div className="flex items-center gap-4">
                         <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase border ${tx.status === PaymentStatus.PAID ? 'bg-green-50 text-green-700 border-green-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>{tx.status === PaymentStatus.PAID ? 'Pago' : 'Pendente'}</span>
                         <span className="font-black text-gray-800">R$ {tx.amount.toFixed(2)}</span>
                         {tx.status !== PaymentStatus.PAID && <button onClick={() => handleSendPixToWhatsApp(tx)} className="p-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100"><QrCode className="w-4 h-4" /></button>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {activities.filter(a => a.attendance.includes(editingId || '')).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(act => (
                    <div key={act.id} className="p-4 border rounded-xl flex justify-between items-center">
                       <div className="flex items-center gap-4"><div className={`p-2 rounded-lg ${act.type === 'GAME' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>{act.type === 'GAME' ? <Trophy className="w-5 h-5" /> : <Calendar className="w-5 h-5" />}</div><div><p className="font-bold text-gray-900">{act.title}</p><p className="text-xs text-gray-500">{formatDate(act.date)} às {act.startTime}</p></div></div>
                       <span className="text-green-600 font-bold text-sm flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Presente</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Câmera Mock */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg text-center space-y-6">
             <h3 className="text-xl font-bold">Capturar Foto</h3>
             <div className="aspect-square bg-gray-200 rounded-xl flex items-center justify-center"><Camera className="w-20 h-20 text-gray-400" /></div>
             <p className="text-sm text-gray-500">A câmera seria ativada aqui. Escolha um arquivo para simular:</p>
             <input type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if(file) { const reader = new FileReader(); reader.onload = (re) => { setStudentForm({...studentForm, photoUrl: re.target?.result as string}); setIsCameraOpen(false); }; reader.readAsDataURL(file); } }} className="w-full text-sm p-2 border rounded" />
             <div className="flex gap-4"><button onClick={() => setIsCameraOpen(false)} className="flex-1 py-3 bg-gray-100 rounded-xl">Cancelar</button></div>
          </div>
        </div>
      )}
      
      {sendingPixId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm"><div className="bg-white p-6 rounded-xl shadow-xl flex flex-col items-center gap-4"><Loader2 className="w-8 h-8 text-green-600 animate-spin" /><p className="font-medium text-gray-700">Integrando via Z-API...</p></div></div>
      )}
      <input type="file" ref={fileInputRef} className="hidden" />
    </div>
  );
};
