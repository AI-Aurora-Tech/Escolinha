import React, { useState, useEffect } from 'react';
import { Transaction, TransactionType, PaymentStatus, Plan, PaymentMethod } from '../types';
import { ArrowUpCircle, ArrowDownCircle, Plus, Filter, Download, Calendar, FileText, CheckCircle, X } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface FinancePageProps {
  transactions: Transaction[];
  plans: Plan[];
  onAddTransaction: (t: Omit<Transaction, 'id'>) => void;
  onUpdateTransaction: (t: Transaction) => void;
}

export const FinancePage: React.FC<FinancePageProps> = ({ transactions, plans, onAddTransaction, onUpdateTransaction }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');
  
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [txToPay, setTxToPay] = useState<Transaction | null>(null);
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payMethod, setPayMethod] = useState<PaymentMethod>(PaymentMethod.CASH);

  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]);

  const [newTx, setNewTx] = useState<Partial<Transaction>>({
    description: '',
    amount: 0,
    type: TransactionType.EXPENSE,
    date: new Date().toISOString().split('T')[0],
    status: PaymentStatus.PAID,
    paymentMethod: PaymentMethod.CASH
  });

  const [installments, setInstallments] = useState(1);
  const [installmentDates, setInstallmentDates] = useState<string[]>([]);

  const totalIncome = transactions
    .filter(t => t.type === TransactionType.INCOME && t.status === PaymentStatus.PAID)
    .reduce((acc, curr) => acc + curr.amount, 0);

  const totalExpense = transactions
    .filter(t => t.type === TransactionType.EXPENSE)
    .reduce((acc, curr) => acc + curr.amount, 0);

  const balance = totalIncome - totalExpense;

  const getFilteredTransactions = () => {
      return transactions.filter(t => {
          const txDate = t.date;
          const matchesType = filter === 'ALL' || t.type === filter;
          const matchesDate = txDate >= startDate && txDate <= endDate;
          return matchesType && matchesDate;
      }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const filteredTransactions = getFilteredTransactions();

  useEffect(() => {
    if (newTx.date && installments >= 1) {
        const dates: string[] = [];
        const start = new Date(newTx.date);
        for (let i = 0; i < installments; i++) {
            const d = new Date(start);
            d.setMonth(start.getMonth() + i);
            dates.push(d.toISOString().split('T')[0]);
        }
        setInstallmentDates(dates);
    }
  }, [installments, newTx.date]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTx.description && newTx.amount) {
        if (newTx.type === TransactionType.EXPENSE && installments > 1) {
            const amountPerInstallment = newTx.amount / installments;
            installmentDates.forEach((date, index) => {
                 onAddTransaction({
                     ...newTx,
                     description: `${newTx.description} (${index + 1}/${installments})`,
                     amount: amountPerInstallment,
                     date: date,
                 } as Omit<Transaction, 'id'>);
            });
        } else {
            onAddTransaction(newTx as Omit<Transaction, 'id'>);
        }

        setIsModalOpen(false);
        setNewTx({ 
            description: '', 
            amount: 0, 
            type: TransactionType.EXPENSE, 
            date: new Date().toISOString().split('T')[0], 
            status: PaymentStatus.PAID,
            paymentMethod: PaymentMethod.CASH
        });
        setInstallments(1);
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
              ...txToPay,
              status: PaymentStatus.PAID,
              date: payDate,
              paymentMethod: payMethod
          });
          setPayModalOpen(false);
          setTxToPay(null);
      }
  };

  const handleExportReport = () => {
    const doc = new jsPDF();
    const exportData = getFilteredTransactions();

    const periodIncome = exportData
        .filter(t => t.type === TransactionType.INCOME && t.status === PaymentStatus.PAID)
        .reduce((acc, curr) => acc + curr.amount, 0);
    
    const periodExpense = exportData
        .filter(t => t.type === TransactionType.EXPENSE)
        .reduce((acc, curr) => acc + curr.amount, 0);
    
    const periodBalance = periodIncome - periodExpense;

    doc.setFontSize(18);
    doc.text("Relatório Financeiro - Garotos do Martinica", 14, 20);
    doc.setFontSize(10);
    doc.text(`Período: ${new Date(startDate).toLocaleDateString('pt-BR')} a ${new Date(endDate).toLocaleDateString('pt-BR')}`, 14, 28);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 34);

    doc.setDrawColor(200, 200, 200);
    doc.setFillColor(245, 245, 245);
    doc.rect(14, 40, 180, 25, 'FD');

    doc.setFont("helvetica", "bold");
    doc.text("Resumo do Período", 18, 48);
    
    doc.setFont("helvetica", "normal");
    doc.setTextColor(22, 163, 74); 
    doc.text(`Receitas: R$ ${periodIncome.toFixed(2)}`, 18, 58);
    
    doc.setTextColor(220, 38, 38); 
    doc.text(`Despesas: R$ ${periodExpense.toFixed(2)}`, 80, 58);
    
    doc.setTextColor(periodBalance >= 0 ? 37 : 220, periodBalance >= 0 ? 99 : 38, periodBalance >= 0 ? 235 : 38); 
    doc.text(`Saldo: R$ ${periodBalance.toFixed(2)}`, 140, 58);

    doc.setTextColor(0, 0, 0); 

    const tableRows = exportData.map(t => [
        new Date(t.date).toLocaleDateString('pt-BR'),
        t.description,
        t.type === TransactionType.INCOME ? 'Receita' : 'Despesa',
        t.status === PaymentStatus.PAID ? 'Pago' : 'Pendente',
        `R$ ${t.amount.toFixed(2)}`
    ]);

    autoTable(doc, {
        startY: 70,
        head: [['Data', 'Descrição', 'Tipo', 'Status', 'Valor']],
        body: tableRows,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [249, 115, 22] }, // Orange-500
        didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 4) {
                const row = exportData[data.row.index];
                if (row.type === TransactionType.INCOME) {
                    data.cell.styles.textColor = [22, 163, 74];
                } else {
                    data.cell.styles.textColor = [220, 38, 38];
                }
            }
        }
    });

    doc.save(`Relatorio_Financeiro_${startDate}_${endDate}.pdf`);
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
            <button 
                onClick={() => setIsModalOpen(true)} 
                className="w-full md:w-auto flex items-center justify-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 shadow-sm transition-colors"
            >
                <Plus className="w-4 h-4" /> Novo Lançamento
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 rounded-full text-green-600">
                    <ArrowUpCircle className="w-6 h-6" />
                </div>
                <div>
                    <p className="text-sm text-gray-500">Total Recebido (Geral)</p>
                    <h3 className="text-2xl font-bold text-gray-900">R$ {totalIncome.toFixed(2)}</h3>
                </div>
            </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-red-100 rounded-full text-red-600">
                    <ArrowDownCircle className="w-6 h-6" />
                </div>
                <div>
                    <p className="text-sm text-gray-500">Total Despesas (Geral)</p>
                    <h3 className="text-2xl font-bold text-gray-900">R$ {totalExpense.toFixed(2)}</h3>
                </div>
            </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-4">
                <div className={`p-3 rounded-full ${balance >= 0 ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'}`}>
                    <Filter className="w-6 h-6" />
                </div>
                <div>
                    <p className="text-sm text-gray-500">Saldo Atual (Geral)</p>
                    <h3 className={`text-2xl font-bold ${balance >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                        R$ {balance.toFixed(2)}
                    </h3>
                </div>
            </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="flex flex-wrap gap-2 justify-center md:justify-start">
            <button onClick={() => setFilter('ALL')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === 'ALL' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Todas</button>
            <button onClick={() => setFilter('INCOME')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === 'INCOME' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Receitas</button>
            <button onClick={() => setFilter('EXPENSE')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === 'EXPENSE' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Despesas</button>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto">
             <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 w-full sm:w-auto justify-center">
                <Calendar className="w-4 h-4 text-gray-400" />
                <input 
                    type="date" 
                    className="bg-transparent text-sm outline-none text-gray-600 w-28 sm:w-32"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                />
                <span className="text-gray-400">-</span>
                <input 
                    type="date" 
                    className="bg-transparent text-sm outline-none text-gray-600 w-28 sm:w-32"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                />
             </div>
             <button 
                onClick={handleExportReport}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 shadow-sm transition-colors text-sm font-medium whitespace-nowrap"
             >
                 <FileText className="w-4 h-4" /> Exportar Relatório
             </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[700px]">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-semibold">
                    <tr>
                        <th className="px-6 py-3">Data</th>
                        <th className="px-6 py-3">Descrição</th>
                        <th className="px-6 py-3">Tipo</th>
                        <th className="px-6 py-3">Pagamento</th>
                        <th className="px-6 py-3">Status</th>
                        <th className="px-6 py-3 text-right">Valor</th>
                        <th className="px-6 py-3 text-right">Ações</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {filteredTransactions.length > 0 ? (
                        filteredTransactions.map(t => (
                        <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 text-sm text-gray-600">{new Date(t.date).toLocaleDateString()}</td>
                            <td className="px-6 py-4 font-medium text-gray-900">{t.description}</td>
                            <td className="px-6 py-4">
                                {t.type === TransactionType.INCOME ? (
                                    <span className="inline-flex items-center text-green-600 text-xs font-medium bg-green-50 px-2 py-1 rounded border border-green-100">
                                        <ArrowUpCircle className="w-3 h-3 mr-1" /> Receita
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center text-red-600 text-xs font-medium bg-red-50 px-2 py-1 rounded border border-red-100">
                                        <ArrowDownCircle className="w-3 h-3 mr-1" /> Despesa
                                    </span>
                                )}
                            </td>
                             <td className="px-6 py-4 text-sm text-gray-600">
                                {getPaymentMethodLabel(t.paymentMethod)}
                            </td>
                            <td className="px-6 py-4">
                                <span className={`text-xs font-medium px-2 py-1 rounded ${
                                    t.status === PaymentStatus.PAID ? 'bg-gray-100 text-gray-600' : 'bg-yellow-50 text-yellow-600'
                                }`}>
                                    {t.status === PaymentStatus.PAID ? 'Pago' : 'Pendente'}
                                </span>
                            </td>
                            <td className={`px-6 py-4 text-right font-bold ${t.type === TransactionType.INCOME ? 'text-green-600' : 'text-red-600'}`}>
                                {t.type === TransactionType.EXPENSE && '- '}
                                R$ {t.amount.toFixed(2)}
                            </td>
                            <td className="px-6 py-4 text-right">
                                {t.status === PaymentStatus.PENDING && (
                                    <button 
                                        onClick={() => handleOpenPayModal(t)}
                                        className="text-green-600 hover:text-green-800 p-1.5 hover:bg-green-50 rounded-lg transition-colors"
                                        title="Dar Baixa (Marcar como Pago)"
                                    >
                                        <CheckCircle className="w-5 h-5" />
                                    </button>
                                )}
                            </td>
                        </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan={7} className="p-8 text-center text-gray-500">
                                Nenhuma transação encontrada no período selecionado.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
      </div>

      {/* Pay Modal */}
      {payModalOpen && txToPay && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-bold text-gray-900">Confirmar Baixa</h3>
                      <button onClick={() => setPayModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                  </div>
                  <div className="space-y-4">
                      <p className="text-sm text-gray-600">
                          Confirmar pagamento de: <strong>{txToPay.description}</strong>
                      </p>
                      <p className="text-lg font-bold text-center py-2 bg-gray-50 rounded-lg">
                          R$ {txToPay.amount.toFixed(2)}
                      </p>
                      <div>
                          <label className="block text-sm font-medium mb-1">Data do Pagamento</label>
                          <input 
                              type="date" 
                              className="w-full border rounded-lg p-2"
                              value={payDate}
                              onChange={(e) => setPayDate(e.target.value)}
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-medium mb-1">Forma de Pagamento</label>
                          <select 
                              className="w-full border rounded-lg p-2 bg-white"
                              value={payMethod}
                              onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                          >
                                 <option value={PaymentMethod.CASH}>Dinheiro</option>
                                 <option value={PaymentMethod.PIX_MANUAL}>PIX (Manual)</option>
                                 <option value={PaymentMethod.CREDIT_CARD}>Cartão de Crédito</option>
                                 <option value={PaymentMethod.DEBIT_CARD}>Cartão de Débito</option>
                                 <option value={PaymentMethod.BOLETO}>Boleto</option>
                                 <option value={PaymentMethod.TRANSFER}>Transferência (TED/DOC)</option>
                                 <option value={PaymentMethod.OTHER}>Outro</option>
                          </select>
                      </div>
                      <button 
                          onClick={handleConfirmPayment}
                          className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                      >
                          Confirmar Pagamento
                      </button>
                  </div>
              </div>
          </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 my-8">
                <h3 className="text-lg font-bold mb-4">Novo Lançamento</h3>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
                        <button
                            type="button"
                            onClick={() => { setNewTx({...newTx, type: TransactionType.INCOME}); setInstallments(1); }}
                            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2 ${
                                newTx.type === TransactionType.INCOME 
                                ? 'bg-white text-green-700 shadow-sm ring-1 ring-gray-200' 
                                : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            <ArrowUpCircle className="w-4 h-4" /> Receita
                        </button>
                        <button
                            type="button"
                            onClick={() => setNewTx({...newTx, type: TransactionType.EXPENSE})}
                            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2 ${
                                newTx.type === TransactionType.EXPENSE 
                                ? 'bg-white text-red-700 shadow-sm ring-1 ring-gray-200' 
                                : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            <ArrowDownCircle className="w-4 h-4" /> Despesa
                        </button>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Descrição</label>
                        <input className="w-full border rounded-lg p-2" type="text" placeholder={newTx.type === TransactionType.INCOME ? "Ex: Patrocínio, Venda de Uniforme..." : "Ex: Conta de Luz, Material..."}
                            required value={newTx.description} onChange={e => setNewTx({...newTx, description: e.target.value})} />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Valor Total (R$)</label>
                            <input className="w-full border rounded-lg p-2" type="number" step="0.01" min="0"
                                required value={newTx.amount} onChange={e => setNewTx({...newTx, amount: parseFloat(e.target.value)})} />
                        </div>
                        <div>
                             <label className="block text-sm font-medium mb-1">Forma de Pagamento</label>
                             <select className="w-full border rounded-lg p-2 bg-white" 
                                value={newTx.paymentMethod} 
                                onChange={e => setNewTx({...newTx, paymentMethod: e.target.value as PaymentMethod})}>
                                 <option value={PaymentMethod.CASH}>Dinheiro</option>
                                 <option value={PaymentMethod.PIX_MANUAL}>PIX (Manual)</option>
                                 <option value={PaymentMethod.CREDIT_CARD}>Cartão de Crédito</option>
                                 <option value={PaymentMethod.DEBIT_CARD}>Cartão de Débito</option>
                                 <option value={PaymentMethod.BOLETO}>Boleto</option>
                                 <option value={PaymentMethod.TRANSFER}>Transferência (TED/DOC)</option>
                                 <option value={PaymentMethod.OTHER}>Outro</option>
                             </select>
                        </div>
                    </div>

                    <div className="space-y-4">
                         <div className="flex gap-4">
                             <div className="flex-1">
                                <label className="block text-sm font-medium mb-1">
                                    {installments > 1 ? 'Vencimento (1ª Parcela)' : 'Data de Vencimento/Pagamento'}
                                </label>
                                <input className="w-full border rounded-lg p-2" type="date" 
                                    required value={newTx.date} onChange={e => setNewTx({...newTx, date: e.target.value})} />
                             </div>
                             
                             {newTx.type === TransactionType.EXPENSE && (
                                <div className="w-1/3">
                                    <label className="block text-sm font-medium mb-1">Parcelas</label>
                                    <input className="w-full border rounded-lg p-2" type="number" min="1" max="60"
                                        value={installments} onChange={e => setInstallments(parseInt(e.target.value) || 1)} />
                                </div>
                             )}
                         </div>

                        <div className="flex items-center gap-2">
                             <label className="text-sm font-medium mr-2">Status:</label>
                             <div className="flex gap-2">
                                <button type="button" 
                                    onClick={() => setNewTx({...newTx, status: PaymentStatus.PAID})}
                                    className={`px-3 py-1 rounded-md text-sm border ${newTx.status === PaymentStatus.PAID ? 'bg-green-50 border-green-200 text-green-700 font-semibold' : 'bg-white border-gray-200 text-gray-500'}`}
                                >
                                    Pago
                                </button>
                                <button type="button" 
                                    onClick={() => setNewTx({...newTx, status: PaymentStatus.PENDING})}
                                    className={`px-3 py-1 rounded-md text-sm border ${newTx.status === PaymentStatus.PENDING ? 'bg-yellow-50 border-yellow-200 text-yellow-700 font-semibold' : 'bg-white border-gray-200 text-gray-500'}`}
                                >
                                    Pendente
                                </button>
                             </div>
                        </div>

                         {newTx.type === TransactionType.EXPENSE && installments > 1 && (
                             <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 max-h-40 overflow-y-auto">
                                 <p className="text-xs font-bold text-gray-500 mb-2 uppercase">Detalhamento das Parcelas</p>
                                 <div className="space-y-2">
                                     {installmentDates.map((date, idx) => (
                                         <div key={idx} className="flex items-center gap-2 text-sm">
                                             <span className="w-8 font-medium text-gray-400">{idx + 1}x</span>
                                             <input 
                                                type="date" 
                                                className="border rounded px-2 py-1 text-xs bg-white"
                                                value={date}
                                                onChange={(e) => {
                                                    const newDates = [...installmentDates];
                                                    newDates[idx] = e.target.value;
                                                    setInstallmentDates(newDates);
                                                }}
                                             />
                                             <span className="text-gray-600">
                                                 R$ {(newTx.amount! / installments).toFixed(2)}
                                             </span>
                                         </div>
                                     ))}
                                 </div>
                             </div>
                         )}
                    </div>
                    
                    <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                        <button 
                            type="submit" 
                            className={`px-4 py-2 text-white rounded-lg transition-colors ${
                                newTx.type === TransactionType.INCOME 
                                ? 'bg-green-600 hover:bg-green-700' 
                                : 'bg-red-600 hover:bg-red-700'
                            }`}
                        >
                            {newTx.type === TransactionType.INCOME ? 'Lançar Receita' : 'Lançar Despesa'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};