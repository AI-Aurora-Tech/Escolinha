import React, { useState, useEffect } from 'react';
import { Transaction, TransactionType, PaymentStatus, Plan, PaymentMethod, Student } from '../types';
import { ArrowUpCircle, ArrowDownCircle, Plus, Filter, Download, Calendar, FileText, CheckCircle, X, Settings, Save, Lock, Smartphone, Search, Users, Repeat, Clock, CreditCard, AlertCircle, ChevronRight } from 'lucide-react';
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
  
  // Settings State
  const [mpToken, setMpToken] = useState('');
  const [zapiInstanceId, setZapiInstanceId] = useState('');
  const [zapiToken, setZapiToken] = useState('');
  const [zapiClientToken, setZapiClientToken] = useState('');
  const [loadingSettings, setLoadingSettings] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
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

  const todayStr = new Date().toISOString().split('T')[0];

  // Load Settings on Mount
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
          const settings = [
              { key: 'mp_access_token', value: mpToken },
              { key: 'zapi_instance_id', value: zapiInstanceId },
              { key: 'zapi_token', value: zapiToken },
              { key: 'zapi_client_token', value: zapiClientToken }
          ];
          const { error } = await supabase.from('app_settings').upsert(settings);
          if (error) throw error;
          alert('Configurações salvas com sucesso!');
      } catch (e) {
          console.error(e);
          alert('Erro ao salvar configurações.');
      } finally {
          setLoadingSettings(false);
      }
  };

  // --- LÓGICA DE FILTRAGEM ---
  
  // Base de transações no período (usada para os cards)
  const transactionsInPeriod = transactions.filter(t => {
      const matchesDate = t.date >= startDate && t.date <= endDate;
      let matchesSearch = true;
      if (studentSearchFilter.trim()) {
          if (t.studentId) {
              const student = students.find(s => s.id === t.studentId);
              matchesSearch = student?.name.toLowerCase().includes(studentSearchFilter.toLowerCase()) || false;
          } else {
              matchesSearch = t.description.toLowerCase().includes(studentSearchFilter.toLowerCase());
          }
      }
      return matchesDate && matchesSearch;
  });

  // Lista final exibida na tabela (aplica filtros de tipo e status)
  const filteredTransactionsList = transactionsInPeriod.filter(t => {
      const matchesType = filter === 'ALL' || t.type === filter;
      
      let matchesStatus = true;
      if (statusFilter !== 'ALL') {
          if (statusFilter === 'PENDING_ONLY') {
              matchesStatus = t.status === PaymentStatus.PENDING && t.date >= todayStr;
          } else if (statusFilter === 'LATE_ONLY') {
              matchesStatus = t.status === PaymentStatus.PENDING && t.date < todayStr;
          } else {
              matchesStatus = t.status === statusFilter;
          }
      }

      return matchesType && matchesStatus;
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // --- CÁLCULOS TOTAIS DOS CARDS (OBEDECEM AO PERÍODO FILTRADO) ---
  const totalIncome = transactionsInPeriod
    .filter(t => t.type === TransactionType.INCOME && t.status === PaymentStatus.PAID)
    .reduce((acc, curr) => acc + curr.amount, 0);

  const totalExpense = transactionsInPeriod
    .filter(t => t.type === TransactionType.EXPENSE && t.status === PaymentStatus.PAID)
    .reduce((acc, curr) => acc + curr.amount, 0);

  const realizedBalance = totalIncome - totalExpense;

  const pendingIncome = transactionsInPeriod
    .filter(t => t.type === TransactionType.INCOME && t.status === PaymentStatus.PENDING && t.date >= todayStr)
    .reduce((acc, curr) => acc + curr.amount, 0);

  const pendingExpense = transactionsInPeriod
    .filter(t => t.type === TransactionType.EXPENSE && t.status === PaymentStatus.PENDING)
    .reduce((acc, curr) => acc + curr.amount, 0);

  const lateIncomeTotal = transactionsInPeriod
    .filter(t => t.type === TransactionType.INCOME && t.status === PaymentStatus.PENDING && t.date < todayStr)
    .reduce((acc, curr) => acc + curr.amount, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTx.description && newTx.description.trim() !== "" && newTx.amount !== undefined && newTx.amount !== null) {
        onAddTransaction({
            ...newTx,
            amount: Number(newTx.amount),
            paymentDate: newTx.status === PaymentStatus.PAID ? newTx.date : undefined
        } as Omit<Transaction, 'id'>);
        setIsModalOpen(false);
        setNewTx({ description: '', category: 'Outros', amount: 0, type: TransactionType.EXPENSE, date: new Date().toISOString().split('T')[0], status: PaymentStatus.PAID, paymentMethod: PaymentMethod.CASH, recurrence: 'NONE', recurrenceMonths: 12 });
    } else {
        alert("Preencha a descrição e o valor do lançamento.");
    }
  };

  const handleOpenPayModal = (tx: Transaction) => {
      setTxToPay(tx); 
      setPayDate(new Date().toISOString().split('T')[0]); 
      setPayMethod(tx.paymentMethod || PaymentMethod.CASH);
      setPayModalOpen(true);
  };

  const handleConfirmPayment = () => {
      if (txToPay) {
          onUpdateTransaction({ 
              id: txToPay.id, 
              status: PaymentStatus.PAID, 
              paymentMethod: payMethod,
              paymentDate: payDate
          });
          setPayModalOpen(false); setTxToPay(null);
      }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    const parts = dateString.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateString;
  };

  const getPaymentMethodLabel = (method?: PaymentMethod) => {
      switch(method) {
          case PaymentMethod.CASH: return 'Dinheiro';
          case PaymentMethod.PIX_MERCADO_PAGO: return 'PIX (MP)';
          case PaymentMethod.PIX_MANUAL: return 'PIX (Manual)';
          case PaymentMethod.CREDIT_CARD: return 'Cartão Crédito';
          case PaymentMethod.DEBIT_CARD: return 'Cartão Débito';
          case PaymentMethod.BOLETO: return 'Boleto';
          case PaymentMethod.TRANSFER: return 'TED/DOC';
          case PaymentMethod.OTHER: return 'Outro';
          default: return '-';
      }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Fluxo de Caixa</h2>
        <div className="flex gap-2 w-full md:w-auto">
             <div className="flex bg-gray-100 p-1 rounded-lg w-full md:w-auto">
                <button onClick={() => setActiveTab('TRANSACTIONS')} className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'TRANSACTIONS' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>Transações</button>
                <button onClick={() => setActiveTab('SETTINGS')} className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${activeTab === 'SETTINGS' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}><Settings className="w-4 h-4" /> Configurações</button>
             </div>
        </div>
      </div>

      {activeTab === 'SETTINGS' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl mx-auto">
              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                  <div className="mb-6 border-b border-gray-100 pb-4">
                      <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2"><Smartphone className="w-5 h-5 text-primary-600" /> Mercado Pago</h3>
                      <p className="text-xs text-gray-500 mt-1">Configuração para links de pagamento PIX automáticos.</p>
                  </div>
                  <div className="space-y-4">
                      <div><label className="block text-xs font-medium text-gray-700 mb-1">Access Token (Produção)</label><div className="relative"><Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" /><input type="password" value={mpToken} onChange={(e) => setMpToken(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm" placeholder="APP_USR-..." /></div></div>
                  </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                  <div className="mb-6 border-b border-gray-100 pb-4">
                      <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2"><Smartphone className="w-5 h-5 text-green-600" /> Z-API (WhatsApp)</h3>
                      <p className="text-xs text-gray-500 mt-1">Integração para envios de comunicados e cobranças automáticas.</p>
                  </div>
                  <div className="space-y-4">
                      <div><label className="block text-xs font-medium text-gray-700 mb-1">ID da instancia</label><input type="text" value={zapiInstanceId} onChange={(e) => setZapiInstanceId(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm" placeholder="ID da sua instância" /></div>
                      <div><label className="block text-xs font-medium text-gray-700 mb-1">Token da instancia</label><input type="password" value={zapiToken} onChange={(e) => setZapiToken(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Token da instância" /></div>
                      <div><label className="block text-xs font-medium text-gray-700 mb-1">Client- Token</label><input type="password" value={zapiClientToken} onChange={(e) => setZapiClientToken(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Client-Token da Z-API" /></div>
                  </div>
              </div>

              <div className="lg:col-span-2 flex justify-center pt-4">
                  <button onClick={handleSaveSettings} disabled={loadingSettings} className="flex items-center gap-2 bg-primary-600 text-white px-8 py-3 rounded-lg hover:bg-primary-700 transition-colors shadow-lg font-bold disabled:opacity-50"><Save className="w-5 h-5" />{loadingSettings ? 'Salvando...' : 'Salvar Todas as Configurações'}</button>
              </div>
          </div>
      ) : (
      <>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg text-green-600"><ArrowUpCircle className="w-5 h-5" /></div>
                    <div><p className="text-[9px] font-black text-gray-400 uppercase">Recebido</p><h3 className="text-base font-black text-gray-900 truncate">R$ {totalIncome.toFixed(2)}</h3></div>
                </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-100 rounded-lg text-red-600"><ArrowDownCircle className="w-5 h-5" /></div>
                    <div><p className="text-[9px] font-black text-gray-400 uppercase">Despesas Pagas</p><h3 className="text-base font-black text-gray-900 truncate">R$ {totalExpense.toFixed(2)}</h3></div>
                </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${realizedBalance >= 0 ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'}`}><Filter className="w-5 h-5" /></div>
                    <div><p className="text-[9px] font-black text-gray-400 uppercase">Saldo Período</p><h3 className={`text-base font-black truncate ${realizedBalance >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>R$ {realizedBalance.toFixed(2)}</h3></div>
                </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-blue-50 shadow-sm ring-1 ring-blue-50">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 rounded-lg text-blue-600"><Clock className="w-5 h-5" /></div>
                    <div><p className="text-[9px] font-black text-blue-400 uppercase">A Receber</p><h3 className="text-base font-black text-blue-700 truncate">R$ {pendingIncome.toFixed(2)}</h3></div>
                </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-red-50 shadow-sm ring-1 ring-red-50">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-50 rounded-lg text-red-600"><CreditCard className="w-5 h-5" /></div>
                    <div><p className="text-[9px] font-black text-red-400 uppercase">A Pagar</p><h3 className="text-base font-black text-red-700 truncate">R$ {pendingExpense.toFixed(2)}</h3></div>
                </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-orange-50 shadow-sm ring-1 ring-orange-100">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-100 rounded-lg text-orange-600"><AlertCircle className="w-5 h-5" /></div>
                    <div><p className="text-[9px] font-black text-orange-500 uppercase">Total Atrasado</p><h3 className="text-base font-black text-orange-700 truncate">R$ {lateIncomeTotal.toFixed(2)}</h3></div>
                </div>
            </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col space-y-4">
            <div className="flex flex-col lg:flex-row gap-4 justify-between items-center">
                <div className="flex flex-wrap gap-2 justify-center lg:justify-start w-full lg:w-auto">
                    <button onClick={() => setFilter('ALL')} className={`flex-1 lg:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === 'ALL' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Todas</button>
                    <button onClick={() => setFilter('INCOME')} className={`flex-1 lg:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === 'INCOME' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Receitas</button>
                    <button onClick={() => setFilter('EXPENSE')} className={`flex-1 lg:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === 'EXPENSE' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Despesas</button>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-2 w-full lg:w-auto">
                    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 w-full sm:w-auto justify-center"><Calendar className="w-4 h-4 text-gray-400" /><input type="date" className="bg-transparent text-sm outline-none text-gray-600 w-full sm:w-auto" value={startDate} onChange={(e) => setStartDate(e.target.value)} /><span className="text-gray-400">-</span><input type="date" className="bg-transparent text-sm outline-none text-gray-600 w-full sm:w-auto" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
                    <button onClick={() => setIsModalOpen(true)} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 shadow-sm transition-colors text-sm font-medium whitespace-nowrap"><Plus className="w-4 h-4" /> Novo Lançamento</button>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input type="text" placeholder="Buscar por descrição ou atleta..." className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" value={studentSearchFilter} onChange={(e) => setStudentSearchFilter(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                    <Filter className="text-gray-400 w-4 h-4" />
                    <select className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
                        <option value="ALL">Todos os Status</option>
                        <option value={PaymentStatus.PAID}>Pago</option>
                        <option value="PENDING_ONLY">Pendente (A Vencer)</option>
                        <option value="LATE_ONLY">Atrasada (Vencida)</option>
                        <option value={PaymentStatus.CANCELLED}>Cancelado</option>
                    </select>
                </div>
            </div>
        </div>

        {/* LISTA DE TRANSAÇÕES - DESKTOP */}
        <div className="hidden lg:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto min-w-0">
                <table className="w-full text-left min-w-[1000px]">
                    <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase font-bold tracking-wider">
                        <tr>
                            <th className="px-6 py-3">Vencimento</th>
                            <th className="px-6 py-3">Pagamento</th>
                            <th className="px-6 py-3">Descrição / Categoria</th>
                            <th className="px-6 py-3">Tipo</th>
                            <th className="px-6 py-3">Forma</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3 text-right">Valor</th>
                            <th className="px-6 py-3 text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredTransactionsList.length > 0 ? (
                            filteredTransactionsList.map(t => {
                                const student = t.studentId ? students.find(s => s.id === t.studentId) : null;
                                const isLate = t.status === PaymentStatus.PENDING && t.date < todayStr;
                                return (
                                <tr key={t.id} className={`hover:bg-gray-50 transition-colors ${isLate ? 'bg-orange-50/30' : ''}`}>
                                    <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap font-medium">{formatDate(t.date)}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">{formatDate(t.paymentDate)}</td>
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-gray-900">{t.description}</div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-black uppercase">{t.category}</span>
                                            {student && (<span className="text-[10px] text-primary-600 font-bold flex items-center gap-1"><Users className="w-3 h-3" /> {student.name}</span>)}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">{t.type === TransactionType.INCOME ? (<span className="text-green-600 text-[10px] font-black bg-green-50 px-2 py-1 rounded uppercase">Receita</span>) : (<span className="text-red-600 text-[10px] font-black bg-red-50 px-2 py-1 rounded uppercase">Despesa</span>)}</td>
                                    <td className="px-6 py-4 text-xs text-gray-600 whitespace-nowrap font-medium">{getPaymentMethodLabel(t.paymentMethod)}</td>
                                    <td className="px-6 py-4">
                                        <span className={`text-[10px] font-black px-2 py-1 rounded uppercase ${
                                            t.status === PaymentStatus.PAID ? 'bg-green-100 text-green-700' : 
                                            t.status === PaymentStatus.CANCELLED ? 'bg-gray-100 text-gray-500' :
                                            isLate ? 'bg-orange-100 text-orange-700 animate-pulse' :
                                            'bg-yellow-50 text-yellow-600'
                                        }`}>
                                            {t.status === PaymentStatus.PAID ? 'Pago' : (t.status === PaymentStatus.CANCELLED ? 'Cancelado' : (isLate ? 'Atrasada' : 'Pendente'))}
                                        </span>
                                    </td>
                                    <td className={`px-6 py-4 text-right font-black whitespace-nowrap ${t.type === TransactionType.INCOME ? 'text-green-600' : 'text-red-600'}`}>{t.type === TransactionType.EXPENSE && '- '}R$ {t.amount.toFixed(2)}</td>
                                    <td className="px-6 py-4 text-right">{t.status === PaymentStatus.PENDING && (<button onClick={() => handleOpenPayModal(t)} className="text-green-600 hover:text-green-800 p-1.5 hover:bg-green-50 rounded-lg transition-colors" title="Dar Baixa"><CheckCircle className="w-6 h-6" /></button>)}</td>
                                </tr>
                                )})
                        ) : (<tr><td colSpan={8} className="p-12 text-center text-gray-400 font-medium italic">Nenhum registro no período.</td></tr>)}
                    </tbody>
                </table>
            </div>
        </div>

        {/* LISTA DE TRANSAÇÕES - MOBILE (ELIMINA ROLAGEM HORIZONTAL) */}
        <div className="lg:hidden space-y-4">
            {filteredTransactionsList.length > 0 ? (
                filteredTransactionsList.map(t => {
                    const student = t.studentId ? students.find(s => s.id === t.studentId) : null;
                    const isLate = t.status === PaymentStatus.PENDING && t.date < todayStr;
                    return (
                        <div key={t.id} className={`bg-white p-4 rounded-xl border shadow-sm transition-all ${isLate ? 'border-orange-200 bg-orange-50/10' : 'border-gray-100'}`}>
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase border ${t.type === TransactionType.INCOME ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                                        {t.type === TransactionType.INCOME ? 'Receita' : 'Despesa'}
                                    </span>
                                    <h4 className="font-bold text-gray-900 mt-1">{t.description}</h4>
                                    <div className="flex flex-wrap gap-2 mt-1">
                                        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-bold uppercase">{t.category}</span>
                                        {student && (<span className="text-[10px] text-primary-600 font-bold flex items-center gap-1"><Users className="w-3 h-3" /> {student.name.split(' ')[0]}</span>)}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className={`font-black text-base ${t.type === TransactionType.INCOME ? 'text-green-600' : 'text-red-600'}`}>
                                        {t.type === TransactionType.EXPENSE && '- '}R$ {t.amount.toFixed(2)}
                                    </p>
                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase block mt-1 ${
                                        t.status === PaymentStatus.PAID ? 'bg-green-100 text-green-700' : 
                                        isLate ? 'bg-orange-100 text-orange-700' : 'bg-yellow-50 text-yellow-600'
                                    }`}>
                                        {t.status === PaymentStatus.PAID ? 'Pago' : (isLate ? 'Atrasada' : 'Pendente')}
                                    </span>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-gray-50">
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-bold text-gray-400 uppercase">Vencimento</span>
                                    <span className="text-xs font-bold text-gray-600">{formatDate(t.date)}</span>
                                </div>
                                <div className="flex flex-col text-right">
                                    <span className="text-[9px] font-bold text-gray-400 uppercase">Forma de Pagto.</span>
                                    <span className="text-xs font-bold text-gray-600">{getPaymentMethodLabel(t.paymentMethod)}</span>
                                </div>
                            </div>

                            {t.status === PaymentStatus.PENDING && (
                                <button onClick={() => handleOpenPayModal(t)} className="w-full mt-3 py-2 bg-green-600 text-white rounded-lg font-black text-xs hover:bg-green-700 flex items-center justify-center gap-2 shadow-sm">
                                    <CheckCircle className="w-4 h-4" /> DAR BAIXA AGORA
                                </button>
                            )}
                        </div>
                    );
                })
            ) : (
                <div className="p-12 text-center text-gray-400 font-medium italic bg-white rounded-xl border border-dashed">
                    Nenhum registro no período.
                </div>
            )}
        </div>
      </>
      )}

      {/* MODAL BAIXA PAGAMENTO */}
      {payModalOpen && txToPay && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-sm p-6 animate-in zoom-in duration-200">
                  <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-black text-gray-800 uppercase">Confirmar Pagamento</h3><button onClick={() => setPayModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button></div>
                  <div className="space-y-4">
                      <p className="text-sm text-gray-600">Baixa em: <strong>{txToPay.description}</strong></p>
                      <p className="text-2xl font-black text-center py-4 bg-gray-50 rounded-xl text-primary-600">R$ {txToPay.amount.toFixed(2)}</p>
                      <div><label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Data do Pagamento</label><input type="date" className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary-500" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
                      <div><label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Forma de Pagamento</label><select className="w-full border rounded-lg p-2.5 bg-white outline-none focus:ring-2 focus:ring-primary-500" value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}><option value={PaymentMethod.CASH}>Dinheiro</option><option value={PaymentMethod.PIX_MANUAL}>PIX (Manual)</option><option value={PaymentMethod.CREDIT_CARD}>Cartão de Crédito</option><option value={PaymentMethod.DEBIT_CARD}>Cartão de Débito</option><option value={PaymentMethod.BOLETO}>Boleto</option><option value={PaymentMethod.TRANSFER}>Transferência</option><option value={PaymentMethod.OTHER}>Outro</option></select></div>
                      <button onClick={handleConfirmPayment} className="w-full py-3 bg-primary-600 text-white rounded-xl font-black hover:bg-primary-700 transition-all shadow-lg shadow-primary-100">CONFIRMAR BAIXA</button>
                  </div>
              </div>
          </div>
      )}

      {/* MODAL NOVO LANÇAMENTO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-xl w-full max-md p-6 my-8 animate-in zoom-in duration-200">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-black text-gray-800 uppercase tracking-tighter">Novo Lançamento Financeiro</h3>
                    <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
                        <button type="button" onClick={() => setNewTx({...newTx, type: TransactionType.INCOME, category: 'Receita Geral'})} className={`flex-1 py-2 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-2 uppercase ${newTx.type === TransactionType.INCOME ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500'}`}><ArrowUpCircle className="w-4 h-4" /> Receita</button>
                        <button type="button" onClick={() => setNewTx({...newTx, type: TransactionType.EXPENSE, category: 'Despesa Geral'})} className={`flex-1 py-2 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-2 uppercase ${newTx.type === TransactionType.EXPENSE ? 'bg-white text-red-700 shadow-sm' : 'text-gray-500'}`}><ArrowDownCircle className="w-4 h-4" /> Despesa</button>
                    </div>
                    <div><label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Descrição</label><input className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary-500" type="text" placeholder="Ex: Pagamento Juiz, Material..." required value={newTx.description} onChange={e => setNewTx({...newTx, description: e.target.value})} /></div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Categoria</label>
                            <select className="w-full border rounded-lg p-2.5 bg-white outline-none focus:ring-2 focus:ring-primary-500" value={newTx.category} onChange={e => setNewTx({...newTx, category: e.target.value})}>
                                {(newTx.type === TransactionType.INCOME ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                        </div>
                        <div><label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Valor (R$)</label><input className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary-500 font-bold" type="number" step="0.01" min="0" required value={newTx.amount} onChange={e => setNewTx({...newTx, amount: parseFloat(e.target.value)})} /></div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Vencimento</label><input className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary-500" type="date" required value={newTx.date} onChange={e => setNewTx({...newTx, date: e.target.value})} /></div>
                        <div><label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Forma de Pagto.</label><select className="w-full border rounded-lg p-2.5 bg-white outline-none focus:ring-2 focus:ring-primary-500" value={newTx.paymentMethod} onChange={(e) => setNewTx({...newTx, paymentMethod: e.target.value as PaymentMethod})}><option value={PaymentMethod.CASH}>Dinheiro</option><option value={PaymentMethod.PIX_MANUAL}>PIX (Manual)</option><option value={PaymentMethod.CREDIT_CARD}>Cartão</option></select></div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-xl space-y-3">
                         <div className="flex flex-col gap-4">
                             <label className="flex items-center gap-2 cursor-pointer">
                                 <input type="checkbox" checked={newTx.status === PaymentStatus.PAID} onChange={e => setNewTx({...newTx, status: e.target.checked ? PaymentStatus.PAID : PaymentStatus.PENDING})} className="rounded text-primary-600 w-4 h-4" />
                                 <span className="text-xs font-bold text-gray-700">Já está pago?</span>
                             </label>
                             {newTx.type === TransactionType.EXPENSE && (
                                 <div className="flex flex-col gap-2 pt-2 border-t border-gray-200">
                                     <label className="flex items-center gap-2 cursor-pointer">
                                         <input type="checkbox" checked={newTx.recurrence === 'MONTHLY'} onChange={e => setNewTx({...newTx, recurrence: e.target.checked ? 'MONTHLY' : 'NONE'})} className="rounded text-indigo-600 w-4 h-4" />
                                         <span className="text-xs font-bold text-gray-700 flex items-center gap-1 uppercase tracking-tighter"><Repeat className="w-3 h-3" /> Lançamento Recorrente</span>
                                     </label>
                                     {newTx.recurrence === 'MONTHLY' && (
                                         <div className="flex items-center gap-3 animate-in slide-in-from-top-2 duration-200 p-3 bg-indigo-50/50 rounded-lg">
                                             <span className="text-[10px] font-black text-indigo-600 uppercase">Repetir por</span>
                                             <input 
                                                type="number" 
                                                min="1" 
                                                max="60" 
                                                className="w-20 border-2 border-indigo-200 rounded-lg p-2 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" 
                                                value={newTx.recurrenceMonths} 
                                                onChange={e => setNewTx({...newTx, recurrenceMonths: parseInt(e.target.value) || 1})} 
                                             />
                                             <span className="text-[10px] font-black text-indigo-600 uppercase">meses</span>
                                         </div>
                                     )}
                                 </div>
                             )}
                         </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-6 border-t mt-4">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition-colors">Cancelar</button>
                        <button type="submit" className={`px-8 py-2.5 text-white font-black rounded-xl shadow-lg transition-all ${newTx.type === TransactionType.INCOME ? 'bg-green-600 hover:bg-green-700 shadow-green-100' : 'bg-red-600 hover:bg-red-700 shadow-red-100'}`}>
                            {newTx.type === TransactionType.INCOME ? 'LANÇAR RECEITA' : 'LANÇAR DESPESA'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};
