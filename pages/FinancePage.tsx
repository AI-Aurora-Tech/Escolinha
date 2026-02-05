
import React, { useState } from 'react';
import { Transaction, TransactionType, PaymentStatus, Plan, PaymentMethod, Student } from '../types';
import { ArrowUpCircle, ArrowDownCircle, Plus, Filter, FileText, CheckCircle, X, Search, Users, Clock, AlertCircle, Edit, XCircle } from 'lucide-react';

interface FinancePageProps {
  students: Student[];
  transactions: Transaction[];
  plans: Plan[];
  onAddTransaction: (t: Omit<Transaction, 'id'>) => void;
  onUpdateTransaction: (t: Partial<Transaction>) => void;
}

export const FinancePage: React.FC<FinancePageProps> = ({ transactions, plans, students, onAddTransaction, onUpdateTransaction }) => {
  const [filter, setFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');
  const todayStr = new Date().toLocaleDateString('en-CA');

  const filteredTransactionsList = transactions.filter(t => filter === 'ALL' || t.type === filter)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    const parts = dateString.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateString;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
            <button onClick={() => setFilter('ALL')} className={`px-4 py-2 text-sm font-bold rounded-md ${filter === 'ALL' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Tudo</button>
            <button onClick={() => setFilter('INCOME')} className={`px-4 py-2 text-sm font-bold rounded-md ${filter === 'INCOME' ? 'bg-white shadow-sm text-green-600' : 'text-gray-500'}`}>Receitas</button>
            <button onClick={() => setFilter('EXPENSE')} className={`px-4 py-2 text-sm font-bold rounded-md ${filter === 'EXPENSE' ? 'bg-white shadow-sm text-red-600' : 'text-gray-500'}`}>Despesas</button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <table className="w-full text-left">
              <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase font-black tracking-widest border-b">
                  <tr>
                      <th className="px-6 py-4">Data Venc.</th>
                      <th className="px-6 py-4">Descrição</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Valor</th>
                  </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                  {filteredTransactionsList.map(t => {
                      const isCancelled = t.status === PaymentStatus.CANCELLED;
                      const student = students.find(s => s.id === t.studentId);
                      return (
                          <tr key={t.id} className={`hover:bg-gray-50 transition-colors ${isCancelled ? 'opacity-50' : ''}`}>
                              <td className="px-6 py-4 text-sm font-medium">{formatDate(t.date)}</td>
                              <td className="px-6 py-4">
                                  <div className={`font-bold ${isCancelled ? 'line-through text-gray-400' : 'text-gray-900'}`}>{t.description}</div>
                                  {student && <div className="text-[10px] text-primary-600 font-bold uppercase">{student.name}</div>}
                              </td>
                              <td className="px-6 py-4">
                                  {isCancelled ? (
                                      <span className="bg-red-600 text-white text-[10px] px-2 py-1 rounded-full font-black uppercase flex items-center gap-1 w-fit">
                                          <XCircle className="w-3 h-3" /> Cancelada
                                      </span>
                                  ) : (
                                      <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase border ${t.status === PaymentStatus.PAID ? 'bg-green-50 text-green-700 border-green-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}`}>
                                          {t.status === PaymentStatus.PAID ? 'Pago' : 'Pendente'}
                                      </span>
                                  )}
                              </td>
                              <td className={`px-6 py-4 text-right font-black ${t.type === TransactionType.INCOME ? 'text-green-600' : 'text-red-600'}`}>
                                  R$ {t.amount.toFixed(2)}
                              </td>
                          </tr>
                      );
                  })}
              </tbody>
          </table>
      </div>
    </div>
  );
};
