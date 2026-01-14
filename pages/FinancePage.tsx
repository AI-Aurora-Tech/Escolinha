import React, { useState, useEffect } from 'react';
import { Transaction, TransactionType, PaymentStatus, Plan, PaymentMethod, Student } from '../types';
import { ArrowUpCircle, ArrowDownCircle, Plus, Filter, Download, Calendar, FileText, CheckCircle, X, Settings, Save, Lock, Smartphone, Search, Users, Repeat, Clock, CreditCard, AlertCircle, ChevronRight, Edit } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabaseClient';

interface FinancePageProps {
  students: Student[];
  transactions: Transaction[];
  plans: Plan[];
  onAddTransaction: (t: Omit<Transaction, 'id'> & { recurrenceMonths?: number }) => void;
  onUpdateTransaction: (t: Partial<Transaction>) => void;
}

export const FinancePage: React.FC<FinancePageProps> = ({ transactions, plans, students, onAddTransaction, onUpdateTransaction }) => {
  const [activeTab, setActiveTab] = useState<'TRANSACTIONS' | 'SETTINGS'>('TRANSACTIONS');
  const [mpToken, setMpToken] = useState('');
  const [zapiInstanceId, setZapiInstanceId] = useState('');
  const [zapiToken, setZapiToken] = useState('');
  const [zapiClientToken, setZapiClientToken] = useState('');
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | PaymentStatus | 'PENDING_ONLY' | 'LATE_ONLY'>('ALL');
  const [studentSearchFilter, setStudentSearchFilter] = useState('');
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [txToPay, setTxToPay] = useState<Transaction | null>(null);
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payMethod, setPayMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]);

  const INCOME_CATEGORIES = ['Mensalidade', 'Uniforme', 'Taxa de Torneio', 'Patrocínio', 'Doação', 'Outros'];
  const EXPENSE_CATEGORIES = ['Aluguel Campo', 'Salário Professor', 'Energia/Água', 'Material Esportivo', 'Marketing', 'Manutenção', 'Outros'];

  const [newTx, setNewTx] = useState<Partial<Transaction> & { recurrenceMonths?: number }>({
    description: '', category: 'Outros', amount: 0, type: TransactionType.EXPENSE, date: new Date().toISOString().split('T')[0], status: PaymentStatus.PAID, paymentMethod: PaymentMethod.CASH, recurrence: 'NONE', recurrenceMonths: 12
  });

  const checkIsLate = (dateStr: string) => {
    if (!dateStr) return false;
    const due = new Date(dateStr + 'T12:00:00');
    let effectiveDue = new Date(due);
    if (effectiveDue.getDay() === 6) effectiveDue.setDate(effectiveDue.getDate() + 2);
    else if (effectiveDue.getDay() === 0) effectiveDue.setDate(effectiveDue.getDate() + 1);

    let graceDate = new Date(effectiveDue);
    graceDate.setDate(graceDate.getDate() + 1);
    
    if (graceDate.getDay() === 6) graceDate.setDate(graceDate.getDate() + 2);
    else if (graceDate.getDay() === 0) graceDate.setDate(graceDate.getDate() + 1);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    graceDate.setHours(0, 0, 0, 0);

    return today > graceDate;
  };

  useEffect(() => {
    const loadSettings = async () => {
        const { data } = await supabase.from('app_settings').select('*');
        if (data) {
            data.forEach(s => {
                if (s.key === 'mp_access_token') setMpToken(s.value);
                if (s.key === 'zapi_instance_id') setZapiInstanceId(s.value);
                if (s.key === 'zapi_token') setZapiToken(s.value);
                if (s.key === 'zapi_client_token') setZapiClientToken(s.value);
            });
        }
    };
    loadSettings();
  }, []);

  const handleSaveSettings = async () => {
      setLoadingSettings(true);
      try {
          const settings = [{ key: 'mp_access_token', value: mpToken }, { key: 'zapi_instance_id', value: zapiInstanceId }, { key: 'zapi_token', value: zapiToken }, { key: 'zapi_client_token', value: zapiClientToken }];
          await supabase.from('app_settings').upsert(settings);
          alert('Configurações salvas!');
      } catch (e) { alert('Erro ao salvar.'); } finally { setLoadingSettings(false); }
  };

  const transactionsInPeriod = transactions.filter(t => {
      const matchesDate = t.date >= startDate && t.date <= endDate;
      let matchesSearch = true;
      if (studentSearchFilter.trim()) {
          const student = t.studentId ? students.find(s => s.id === t.studentId) : null;
          matchesSearch = student?.name.toLowerCase().includes(studentSearchFilter.toLowerCase()) || t.description.toLowerCase().includes(studentSearchFilter.toLowerCase()) || false;
      }
      return matchesDate && matchesSearch;
  });

  const filteredTransactionsList = transactionsInPeriod.filter(t => {
      const matchesType = filter === 'ALL' || t.type === filter;
      let matchesStatus = true;
      if (statusFilter !== 'ALL') {
          if (statusFilter === 'PENDING_ONLY') matchesStatus = t.status === PaymentStatus.PENDING && !checkIsLate(t.date);
          else if (statusFilter === 'LATE_ONLY') matchesStatus = t.status === PaymentStatus.PENDING && checkIsLate(t.date);
          else matchesStatus = t.status === statusFilter;
      }
      return matchesType && matchesStatus;
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalIncome = transactionsInPeriod.filter(t => t.type === TransactionType.INCOME && t.status === PaymentStatus.PAID).reduce((acc, curr) => acc + curr.amount, 0);
  const totalExpense = transactionsInPeriod.filter(t => t.type === TransactionType.EXPENSE && t.status === PaymentStatus.PAID).reduce((acc, curr) => acc + curr.amount, 0);
  const realizedBalance = totalIncome - totalExpense;
  const pendingIncome = transactionsInPeriod.filter(t => t.type === TransactionType.INCOME && t.status === PaymentStatus.PENDING && !checkIsLate(t.date)).reduce((acc, curr) => acc + curr.amount, 0);
  const pendingExpense = transactionsInPeriod.filter(t => t.type === TransactionType.EXPENSE && t.status === PaymentStatus.PENDING).reduce((acc, curr) => acc + curr.amount, 0);
  const lateIncomeTotal = transactionsInPeriod.filter(t => t.type === TransactionType.INCOME && t.status === PaymentStatus.PENDING && checkIsLate(t.date)).reduce((acc, curr) => acc + curr.amount, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTx.description || newTx.description.trim() === "" || newTx.amount === undefined) {
        alert("Preencha a descrição e o valor.");
        return;
    }

    if (editingTxId) {
        // Lógica de Edição
        const originalTx = transactions.find(tx => tx.id === editingTxId);
        
        // Verifica se é recorrente (tem parênteses como (1/12))
        const isRecurrent = originalTx?.description?.includes('(') && originalTx?.description?.includes('/');
        let applyToFuture = false;

        if (isRecurrent && originalTx?.type === TransactionType.EXPENSE) {
            applyToFuture = window.confirm("Este lançamento parece ser recorrente. Deseja aplicar as alterações de VALOR e DESCRIÇÃO a todos os lançamentos FUTUROS desta série?");
        }

        if (applyToFuture && originalTx) {
            // Extrai o prefixo da descrição (antes do parenteses)
            const descPrefix = originalTx.description.split(' (')[0];
            const futureTxs = transactions.filter(tx => 
                tx.type === originalTx.type && 
                tx.description.startsWith(descPrefix) && 
                tx.date >= originalTx.date &&
                tx.id !== originalTx.id
            );

            // Atualiza o atual
            onUpdateTransaction({ ...newTx, id: editingTxId });

            // Atualiza os futuros
            for (const fTx of futureTxs) {
                // Mantém o sufixo (X/Y) original do futuro
                const suffix = fTx.description.split(' (')[1];
                const newFullDesc = suffix ? `${newTx.description} (${suffix}` : newTx.description;
                
                onUpdateTransaction({
                    id: fTx.id,
                    amount: Number(newTx.amount),
                    description: newFullDesc,
                    category: newTx.category
                });
            }
        } else {
            onUpdateTransaction({ ...newTx, id: editingTxId });
        }
        
        setEditingTxId(null);
    } else {
        // Lógica de Adição
        onAddTransaction({ ...newTx, amount: Number(newTx.amount), paymentDate: newTx.status === PaymentStatus.PAID ? newTx.date : undefined } as Omit<Transaction, 'id'>);
    }

    setIsModalOpen(false);
    setNewTx({ description: '', category: 'Outros', amount: 0, type: TransactionType.EXPENSE, date: new Date().toISOString().split('T')[0], status: PaymentStatus.PAID, paymentMethod: PaymentMethod.CASH, recurrence: 'NONE', recurrenceMonths: 12 });
  };

  const handleOpenEditModal = (tx: Transaction) => {
      setEditingTxId(tx.id);
      // Remove o prefixo de categoria se existir para o campo descrição não duplicar
      let cleanDesc = tx.description;
      if (cleanDesc.startsWith('[') && cleanDesc.includes('] ')) {
          cleanDesc = cleanDesc.split('] ')[1];
      }
      // Remove o sufixo (X/Y) para edição
      if (cleanDesc.includes(' (')) {
          cleanDesc = cleanDesc.split(' (')[0];
      }

      setNewTx({
          description: cleanDesc,
          amount: tx.amount,
          type: tx.type,
          date: tx.date,
          status: tx.status,
          paymentMethod: tx.paymentMethod || PaymentMethod.CASH,
          category: tx.category || 'Outros'
      });
      setIsModalOpen(true);
  };

  const handleOpenPayModal = (tx: Transaction) => { setTxToPay(tx); setPayDate(new Date().toISOString().split('T')[0]); setPayMethod(tx.paymentMethod || PaymentMethod.CASH); setPayModalOpen(true); };
  const handleConfirmPayment = () => { if (txToPay) { onUpdateTransaction({ id: txToPay.id, status: PaymentStatus.PAID, paymentMethod: payMethod, paymentDate: payDate }); setPayModalOpen(false); } };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-'; const parts = dateString.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateString;
  };

  const getPaymentMethodLabel = (method?: PaymentMethod) => {
      switch(method) {
          case PaymentMethod.CASH: return 'Dinheiro';
          case PaymentMethod.PIX_MERCADO_PAGO: return 'PIX (MP)';
          case PaymentMethod.PIX_MANUAL: return 'PIX (Manual)';
          default: return '-';
      }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Fluxo de Caixa</h2>
        <div className="flex bg-gray-100 p-1 rounded-lg">
           <button onClick={() => { setActiveTab('TRANSACTIONS'); setEditingTxId(null); }} className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'TRANSACTIONS' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>Transações</button>
           <button onClick={() => { setActiveTab('SETTINGS'); setEditingTxId(null); }} className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'SETTINGS' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}><Settings className="w-4 h-4" /> Configurações</button>
        </div>
      </div>

      {activeTab === 'SETTINGS' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl mx-auto">
              <div className="bg-white p-6 rounded-xl border shadow-sm">
                  <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Smartphone className="w-5 h-5 text-primary-600" /> Mercado Pago</h3>
                  <div className="space-y-4">
                      <div><label className="block text-xs font-medium text-gray-700 mb-1">Access Token</label><input type="password" value={mpToken} onChange={(e) => setMpToken(e.target.value)} className="w-full px-4 py-2 border rounded-lg" /></div>
                  </div>
              </div>
              <div className="bg-white p-6 rounded-xl border shadow-sm">
                  <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Smartphone className="w-5 h-5 text-green-600" /> Z-API (WhatsApp)</h3>
                  <div className="space-y-4">
                      <div><label className="block text-xs font-medium text-gray-700 mb-1">ID Instancia</label><input type="text" value={zapiInstanceId} onChange={(e) => setZapiInstanceId(e.target.value)} className="w-full px-4 py-2 border rounded-lg" /></div>
                      <div><label className="block text-xs font-medium text-gray-700 mb-1">Token Instancia</label><input type="password" value={zapiToken} onChange={(e) => setZapiToken(e.target.value)} className="w-full px-4 py-2 border rounded-lg" /></div>
                  </div>
              </div>
              <button onClick={handleSaveSettings} disabled={loadingSettings} className="lg:col-span-2 bg-primary-600 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg">{loadingSettings ? 'Salvando...' : <Save className="w-5 h-5" /> && 'Salvar Configurações'}</button>
          </div>
      ) : (
      <>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-white p-4 rounded-xl border shadow-sm"><div className="flex items-center gap-3"><div className="p-2 bg-green-100 rounded-lg text-green-600"><ArrowUpCircle className="w-5 h-5" /></div><div><p className="text-[9px] font-black text-gray-400 uppercase">Recebido</p><h3 className="text-base font-black">R$ {totalIncome.toFixed(2)}</h3></div></div></div>
            <div className="bg-white p-4 rounded-xl border shadow-sm"><div className="flex items-center gap-3"><div className="p-2 bg-red-100 rounded-lg text-red-600"><ArrowDownCircle className="w-5 h-5" /></div><div><p className="text-[9px] font-black text-gray-400 uppercase">Despesas Pagas</p><h3 className="text-base font-black">R$ {totalExpense.toFixed(2)}</h3></div></div></div>
            <div className="bg-white p-4 rounded-xl border shadow-sm"><div className="flex items-center gap-3"><div className={`p-2 rounded-lg ${realizedBalance >= 0 ? 'bg-blue-100' : 'bg-orange-100'}`}><Filter className="w-5 h-5" /></div><div><p className="text-[9px] font-black text-gray-400 uppercase">Saldo</p><h3 className="text-base font-black">R$ {realizedBalance.toFixed(2)}</h3></div></div></div>
            <div className="bg-white p-4 rounded-xl border shadow-sm border-blue-100"><div className="flex items-center gap-3"><div className="p-2 bg-blue-50 text-blue-600"><Clock className="w-5 h-5" /></div><div><p className="text-[9px] font-black text-blue-400 uppercase">A Receber</p><h3 className="text-base font-black">R$ {pendingIncome.toFixed(2)}</h3></div></div></div>
            <div className="bg-white p-4 rounded-xl border shadow-sm border-red-100"><div className="flex items-center gap-3"><div className="p-2 bg-red-50 text-red-600"><CreditCard className="w-5 h-5" /></div><div><p className="text-[9px] font-black text-red-400 uppercase">A Pagar</p><h3 className="text-base font-black">R$ {pendingExpense.toFixed(2)}</h3></div></div></div>
            <div className="bg-white p-4 rounded-xl border shadow-sm border-orange-100"><div className="flex items-center gap-3"><div className="p-2 bg-orange-100 text-orange-600"><AlertCircle className="w-5 h-5" /></div><div><p className="text-[9px] font-black text-orange-500 uppercase">Atrasado (+1d util)</p><h3 className="text-base font-black">R$ {lateIncomeTotal.toFixed(2)}</h3></div></div></div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border flex flex-col space-y-4">
            <div className="flex flex-col lg:flex-row gap-4 justify-between items-center">
                <div className="flex gap-2"><button onClick={() => setFilter('ALL')} className={`px-4 py-2 rounded-lg text-sm font-medium ${filter === 'ALL' ? 'bg-gray-800 text-white' : 'bg-gray-100'}`}>Todas</button><button onClick={() => setFilter('INCOME')} className={`px-4 py-2 rounded-lg text-sm font-medium ${filter === 'INCOME' ? 'bg-green-600 text-white' : 'bg-gray-100'}`}>Receitas</button><button onClick={() => setFilter('EXPENSE')} className={`px-4 py-2 rounded-lg text-sm font-medium ${filter === 'EXPENSE' ? 'bg-red-600 text-white' : 'bg-gray-100'}`}>Despesas</button></div>
                <div className="flex items-center gap-2 w-full lg:w-auto">
                    <div className="flex items-center gap-2 bg-gray-50 border rounded-lg px-3 py-1.5 flex-1"><Calendar className="w-4 h-4 text-gray-400" /><input type="date" className="bg-transparent text-sm outline-none w-full" value={startDate} onChange={e => setStartDate(e.target.value)} /><span className="text-gray-400">-</span><input type="date" className="bg-transparent text-sm outline-none w-full" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
                    <button onClick={() => { setEditingTxId(null); setIsModalOpen(true); }} className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm"><Plus className="w-4 h-4" /> Novo Lançamento</button>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" /><input type="text" placeholder="Buscar..." className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm" value={studentSearchFilter} onChange={e => setStudentSearchFilter(e.target.value)} /></div>
                <div className="flex items-center gap-2"><Filter className="text-gray-400 w-4 h-4" /><select className="flex-1 bg-white border rounded-lg px-3 py-2 text-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}><option value="ALL">Todos os Status</option><option value={PaymentStatus.PAID}>Pago</option><option value="PENDING_ONLY">Pendente (No Prazo)</option><option value="LATE_ONLY">Atrasado (+1 dia útil)</option></select></div>
            </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden lg:block bg-white rounded-xl shadow-sm border overflow-hidden">
            <table className="w-full text-left min-w-[1000px]">
                <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase font-bold tracking-wider">
                    <tr><th className="px-6 py-3">Vencimento</th><th className="px-6 py-3">Descrição</th><th className="px-6 py-3">Tipo</th><th className="px-6 py-3">Forma</th><th className="px-6 py-3">Status</th><th className="px-6 py-3 text-right">Valor</th><th className="px-6 py-3 text-right">Ações</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {filteredTransactionsList.map(t => {
                        const student = t.studentId ? students.find(s => s.id === t.studentId) : null;
                        const isLate = t.status === PaymentStatus.PENDING && checkIsLate(t.date);
                        return (
                        <tr key={t.id} className={`hover:bg-gray-50 ${isLate ? 'bg-orange-50/30' : ''}`}>
                            <td className="px-6 py-4 text-sm text-gray-600 font-medium">{formatDate(t.date)}</td>
                            <td className="px-6 py-4"><div className="font-bold text-gray-900">{t.description}</div>{student && <span className="text-[10px] text-primary-600 font-bold">{student.name}</span>}</td>
                            <td className="px-6 py-4">{t.type === TransactionType.INCOME ? <span className="text-green-600 text-[10px] font-black bg-green-50 px-2 py-1 rounded">Receita</span> : <span className="text-red-600 text-[10px] font-black bg-red-50 px-2 py-1 rounded">Despesa</span>}</td>
                            <td className="px-6 py-4 text-xs">{getPaymentMethodLabel(t.paymentMethod)}</td>
                            <td className="px-6 py-4"><span className={`text-[10px] font-black px-2 py-1 rounded uppercase ${t.status === PaymentStatus.PAID ? 'bg-green-100 text-green-700' : isLate ? 'bg-orange-100 text-orange-700 animate-pulse' : 'bg-yellow-50 text-yellow-600'}`}>{t.status === PaymentStatus.PAID ? 'Pago' : isLate ? 'Atrasada' : 'Pendente'}</span></td>
                            <td className={`px-6 py-4 text-right font-black ${t.type === TransactionType.INCOME ? 'text-green-600' : 'text-red-600'}`}>R$ {t.amount.toFixed(2)}</td>
                            <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-1">
                                    <button onClick={() => handleOpenEditModal(t)} className="text-primary-600 p-1.5 hover:bg-primary-50 rounded-lg"><Edit className="w-4 h-4" /></button>
                                    {t.status === PaymentStatus.PENDING && <button onClick={() => handleOpenPayModal(t)} className="text-green-600 p-1.5 hover:bg-green-50 rounded-lg"><CheckCircle className="w-6 h-6" /></button>}
                                </div>
                            </td>
                        </tr>
                    )})}
                </tbody>
            </table>
        </div>

        {/* Mobile Card View */}
        <div className="lg:hidden space-y-4">
            {filteredTransactionsList.map(t => {
                const student = t.studentId ? students.find(s => s.id === t.studentId) : null;
                const isLate = t.status === PaymentStatus.PENDING && checkIsLate(t.date);
                return (
                    <div key={t.id} className={`bg-white p-4 rounded-xl border shadow-sm ${isLate ? 'border-orange-200 bg-orange-50/10' : 'border-gray-100'}`}>
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase border ${t.type === TransactionType.INCOME ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                    {t.type === TransactionType.INCOME ? 'Receita' : 'Despesa'}
                                </span>
                                <h4 className="font-bold text-gray-900 mt-1">{t.description}</h4>
                                {student && <p className="text-[10px] text-primary-600 font-bold">{student.name}</p>}
                            </div>
                            <div className="text-right">
                                <p className={`font-black ${t.type === TransactionType.INCOME ? 'text-green-600' : 'text-red-600'}`}>R$ {t.amount.toFixed(2)}</p>
                                <span className="text-[9px] font-bold text-gray-400 block">{formatDate(t.date)}</span>
                            </div>
                        </div>
                        <div className="flex gap-2 border-t pt-3 mt-3">
                            <button onClick={() => handleOpenEditModal(t)} className="flex-1 py-2 bg-gray-50 text-primary-600 rounded-lg font-bold text-xs flex items-center justify-center gap-1 border"><Edit className="w-3 h-3" /> EDITAR</button>
                            {t.status === PaymentStatus.PENDING && (
                                <button onClick={() => handleOpenPayModal(t)} className="flex-1 py-2 bg-green-600 text-white rounded-lg font-black text-xs flex items-center justify-center gap-1"><CheckCircle className="w-3 h-3" /> BAIXA</button>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
      </>
      )}

      {payModalOpen && txToPay && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-sm p-6 animate-in zoom-in duration-200">
                  <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-black">Confirmar Pagamento</h3><button onClick={() => setPayModalOpen(false)}><X className="w-5 h-5 text-gray-400" /></button></div>
                  <div className="space-y-4">
                      <p className="text-sm text-gray-600">Lançamento: <strong>{txToPay.description}</strong></p>
                      <p className="text-2xl font-black text-center py-4 bg-gray-50 rounded-xl text-primary-600">R$ {txToPay.amount.toFixed(2)}</p>
                      <div><label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Data</label><input type="date" className="w-full border rounded-lg p-2.5" value={payDate} onChange={e => setPayDate(e.target.value)} /></div>
                      <div><label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Forma</label><select className="w-full border rounded-lg p-2.5 bg-white" value={payMethod} onChange={e => setPayMethod(e.target.value as PaymentMethod)}><option value={PaymentMethod.CASH}>Dinheiro</option><option value={PaymentMethod.PIX_MANUAL}>PIX (Manual)</option></select></div>
                      <button onClick={handleConfirmPayment} className="w-full py-3 bg-primary-600 text-white rounded-xl font-black shadow-lg">CONFIRMAR BAIXA</button>
                  </div>
              </div>
          </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-xl w-full max-md p-6 animate-in zoom-in duration-200">
                <div className="flex justify-between items-center mb-6"><h3 className="text-lg font-black uppercase">{editingTxId ? 'Editar Lançamento' : 'Novo Lançamento'}</h3><button onClick={() => setIsModalOpen(false)}><X className="w-6 h-6 text-gray-400" /></button></div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
                        <button type="button" onClick={() => setNewTx({...newTx, type: TransactionType.INCOME})} className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${newTx.type === TransactionType.INCOME ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500'}`} disabled={!!editingTxId}>RECEITA</button>
                        <button type="button" onClick={() => setNewTx({...newTx, type: TransactionType.EXPENSE})} className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${newTx.type === TransactionType.EXPENSE ? 'bg-white text-red-700 shadow-sm' : 'text-gray-500'}`} disabled={!!editingTxId}>DESPESA</button>
                    </div>
                    <div><label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Descrição</label><input className="w-full border rounded-lg p-2.5" type="text" required value={newTx.description} onChange={e => setNewTx({...newTx, description: e.target.value})} /></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Categoria</label>
                            <select className="w-full border rounded-lg p-2.5 bg-white" value={newTx.category} onChange={e => setNewTx({...newTx, category: e.target.value})}>
                                {(newTx.type === TransactionType.INCOME ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                        </div>
                        <div><label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Valor</label><input className="w-full border rounded-lg p-2.5 font-bold" type="number" step="0.01" min="0" required value={newTx.amount} onChange={e => setNewTx({...newTx, amount: parseFloat(e.target.value)})} /></div>
                    </div>
                    <div><label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Vencimento</label><input className="w-full border rounded-lg p-2.5" type="date" required value={newTx.date} onChange={e => setNewTx({...newTx, date: e.target.value})} /></div>
                    
                    {!editingTxId && (
                        <>
                            <label className="flex items-center gap-2 cursor-pointer pt-2"><input type="checkbox" checked={newTx.status === PaymentStatus.PAID} onChange={e => setNewTx({...newTx, status: e.target.checked ? PaymentStatus.PAID : PaymentStatus.PENDING})} className="rounded text-primary-600" /><span className="text-xs font-bold text-gray-700">Já está pago?</span></label>
                            {newTx.type === TransactionType.EXPENSE && (
                                <label className="flex items-center gap-2 cursor-pointer pt-2 border-t mt-2"><input type="checkbox" checked={newTx.recurrence === 'MONTHLY'} onChange={e => setNewTx({...newTx, recurrence: e.target.checked ? 'MONTHLY' : 'NONE'})} className="rounded text-indigo-600" /><span className="text-xs font-bold text-gray-700">Recorrente mensal?</span></label>
                            )}
                        </>
                    )}

                    <div className="flex justify-end gap-3 pt-6 border-t mt-4">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 text-gray-500 font-bold">Cancelar</button>
                        <button type="submit" className={`px-8 py-2.5 text-white font-black rounded-xl shadow-lg ${newTx.type === TransactionType.INCOME ? 'bg-green-600' : 'bg-red-600'}`}>{editingTxId ? 'SALVAR' : 'LANÇAR'}</button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};
