import React, { useState, useMemo } from 'react';
import { Plan, Student } from '../types';
import { Plus, Edit, Trash2, Ticket, X, Users } from 'lucide-react';

interface PlansPageProps {
  plans: Plan[];
  students: Student[];
  onAddPlan: (plan: Omit<Plan, 'id'>) => void;
  onUpdatePlan: (plan: Plan) => void;
  onDeletePlan: (id: string) => void;
}

export const PlansPage: React.FC<PlansPageProps> = ({ plans, students, onAddPlan, onUpdatePlan, onDeletePlan }) => {
  // Alunos ativos por plano; o percentual é sobre o total de alunos ativos.
  const { countByPlan, totalActive, withoutPlan } = useMemo(() => {
    const active = students.filter(s => s.active);
    const planIds = new Set(plans.map(p => p.id));
    const counts: Record<string, number> = {};
    let noPlan = 0;
    active.forEach(s => {
      if (s.planId && planIds.has(s.planId)) counts[s.planId] = (counts[s.planId] || 0) + 1;
      else noPlan++;
    });
    return { countByPlan: counts, totalActive: active.length, withoutPlan: noPlan };
  }, [students, plans]);

  const percentOf = (n: number) => totalActive > 0 ? (n / totalActive) * 100 : 0;
  const formatPercent = (n: number) => `${percentOf(n).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const initialFormState = {
    name: '',
    price: 0,
    dueDay: 10,
    description: ''
  };

  const [form, setForm] = useState(initialFormState);

  const handleOpenNew = () => {
    setEditingId(null);
    setForm(initialFormState);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (plan: Plan) => {
    setEditingId(plan.id);
    setForm({
        name: plan.name,
        price: plan.price,
        dueDay: plan.dueDay || 10,
        description: plan.description || ''
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
        onUpdatePlan({ ...form, id: editingId });
    } else {
        onAddPlan(form);
    }
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este plano?')) {
        onDeletePlan(id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Planos e Mensalidades</h2>
        <button 
          onClick={handleOpenNew}
          className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Novo Plano
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nome do Plano</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Vencimento</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Observações</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Valor Mensal</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Alunos Ativos</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Ações</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                {plans.map((plan) => (
                    <tr key={plan.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                                <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600">
                                    <Ticket className="w-5 h-5" />
                                </div>
                                <div>
                                    <span className="font-medium text-gray-900 block">{plan.name}</span>
                                </div>
                            </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                            Dia {plan.dueDay}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                            {plan.description || '-'}
                        </td>
                        <td className="px-6 py-4 font-bold text-gray-900">
                            R$ {plan.price.toFixed(2)}
                        </td>
                        <td className="px-6 py-4">
                            <div className="flex items-center gap-2 text-sm">
                                <Users className="w-4 h-4 text-gray-400" />
                                <span className="font-bold text-gray-900">{countByPlan[plan.id] || 0}</span>
                                <span className="text-gray-500">({formatPercent(countByPlan[plan.id] || 0)})</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1.5 overflow-hidden min-w-[80px]">
                                <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${percentOf(countByPlan[plan.id] || 0)}%` }}></div>
                            </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                                <button onClick={() => handleOpenEdit(plan)} className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                                    <Edit className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleDelete(plan.id)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </td>
                    </tr>
                ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-100 text-sm">
                    {withoutPlan > 0 && (
                        <tr>
                            <td colSpan={4} className="px-6 py-3 text-gray-500">Sem plano</td>
                            <td className="px-6 py-3 text-gray-700"><span className="font-bold">{withoutPlan}</span> <span className="text-gray-500">({formatPercent(withoutPlan)})</span></td>
                            <td></td>
                        </tr>
                    )}
                    <tr>
                        <td colSpan={4} className="px-6 py-3 font-bold text-gray-700">Total de alunos ativos</td>
                        <td className="px-6 py-3 font-bold text-gray-900">{totalActive} <span className="text-gray-500 font-normal">(100%)</span></td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-gray-900">{editingId ? 'Editar Plano' : 'Novo Plano'}</h3>
                    <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Plano</label>
                        <input required type="text" className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" 
                            placeholder="Ex: Básico"
                            value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Valor Mensal (R$)</label>
                            <input required type="number" min="0" step="0.01" className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" 
                                value={form.price} onChange={e => setForm({...form, price: parseFloat(e.target.value)})} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Dia de Vencimento</label>
                            <input required type="number" min="1" max="31" className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" 
                                value={form.dueDay} onChange={e => setForm({...form, dueDay: parseInt(e.target.value)})} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Observação</label>
                        <textarea rows={3} className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" 
                            placeholder="Detalhes do que está incluso..."
                            value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">Salvar</button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};