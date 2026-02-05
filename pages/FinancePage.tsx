
import React, { useState } from 'react';
import { Transaction, TransactionType, PaymentStatus, Student } from '../types';
import { XCircle, CheckCircle, Clock, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';

interface FinancePageProps {
  students: Student[];
  transactions: Transaction[];
  plans: any[];
  onAddTransaction: (t: any) => void;
  onUpdateTransaction: (t: Partial<Transaction>) => void;
}

export const FinancePage: React.FC<FinancePageProps> = ({ transactions, students }) => {
  const [filter, setFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');

  const filteredList = transactions
    .filter(t => filter === 'ALL' || t.type === filter)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="space-y-6">
      <div className="flex gap-2 p-1 bg-gray-100 rounded-xl w-fit">
          <button onClick={() => setFilter('ALL')} className={`px-6 py-2 text-sm font-bold rounded-lg transition-all ${filter === 'ALL' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>Tudo</button>
          <button onClick={() => setFilter('INCOME')} className={`px-6 py-2 text-sm font-bold rounded-lg transition-all ${filter === 'INCOME' ? 'bg-white shadow-sm text-green-600' : 'text-gray-500'}`}>Receitas</button>
          <button onClick={() => setFilter('EXPENSE')} className={`px-6 py-2 text-sm font-bold rounded-lg transition-all ${filter === 'EXPENSE' ? 'bg-white shadow-sm text-red-600' : 'text-gray-500'}`}>Despesas</button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <table className="w-full text-left">
              <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase font-black tracking-widest border-b">
                  <tr>
                      <th className="px-6 py-4">Vencimento</th>
                      <th className="px-6 py-4">Descrição</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Valor</th>
                  </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                  {filteredList.map(t => {
                      const isCancelled = t.status === PaymentStatus.CANCELLED;
                      const student = students.find(s => s.id === t.studentId);
                      return (
                          <tr key={t.id} className={`hover:bg-gray-50 transition-colors ${isCancelled ? 'bg-red-50/20' : ''}`}>
                              <td className="px-6 py-4 text-sm font-medium text-gray-500">{t.date.split('-').reverse().join('/')}</td>
                              <td className="px-6 py-4">
                                  <div className={`font-bold ${isCancelled ? 'line-through text-gray-300' : 'text-gray-900'}`}>{t.description}</div>
                                  {student && <div className="text-[10px] text-primary-600 font-bold uppercase mt-0.5">{student.name}</div>}
                              </td>
                              <td className="px-6 py-4">
                                  {isCancelled ? (
                                      <span className="bg-red-600 text-white text-[9px] px-2 py-1 rounded-full font-black uppercase flex items-center gap-1 w-fit shadow-sm">
                                          <XCircle className="w-3 h-3" /> Cancelada
                                      </span>
                                  ) : (
                                      <span className={`text-[9px] font-black px-2 py-1 rounded-full uppercase border flex items-center gap-1 w-fit ${t.status === PaymentStatus.PAID ? 'bg-green-50 text-green-700 border-green-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}`}>
                                          {t.status === PaymentStatus.PAID ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                          {t.status === PaymentStatus.PAID ? 'Pago' : 'Pendente'}
                                      </span>
                                  )}
                              </td>
                              <td className={`px-6 py-4 text-right font-black ${isCancelled ? 'text-gray-300' : t.type === TransactionType.INCOME ? 'text-green-600' : 'text-red-600'}`}>
                                  {t.type === TransactionType.EXPENSE ? '- ' : '+ '} R$ {t.amount.toFixed(2)}
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
