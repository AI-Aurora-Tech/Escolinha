import React, { useState, useMemo } from 'react';
import { Activity, Student, Group, User, UserRole } from '../types';
import { Calendar as CalendarIcon, Clock, MapPin, Plus, Edit, Trash2, CheckCircle, XCircle, DollarSign, X } from 'lucide-react';

interface SchedulePageProps {
  activities: Activity[];
  students: Student[];
  groups: Group[];
  onAddActivity: (activity: any) => void;
  onUpdateActivity: (activity: any) => void;
  onUpdateAttendance: (activityId: string, studentId: string) => void;
  onUpdateFeePayment?: (activityId: string, studentId: string) => void;
  onDeleteActivity: (id: string) => void;
  currentUser?: User | null;
}

export const SchedulePage: React.FC<SchedulePageProps> = ({ 
  activities, 
  students, 
  groups, 
  onAddActivity, 
  onUpdateActivity, 
  onUpdateAttendance, 
  onUpdateFeePayment,
  onDeleteActivity,
  currentUser 
}) => {
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Form State
  const initialFormState = {
    title: '',
    type: 'TRAINING',
    date: new Date().toISOString().split('T')[0],
    startTime: '19:00',
    endTime: '20:30',
    groupId: '',
    location: '',
    fee: 0,
    recurrence: 'none'
  };
  const [form, setForm] = useState(initialFormState);
  const [editingId, setEditingId] = useState<string | null>(null);

  const isGuardian = currentUser?.role === UserRole.RESPONSAVEL;

  // Sorting activities
  const sortedActivities = useMemo(() => {
    return [...activities].sort((a, b) => {
        return new Date(a.date + 'T' + a.startTime).getTime() - new Date(b.date + 'T' + b.startTime).getTime();
    });
  }, [activities]);

  const getAttendeesList = (activity: Activity) => {
      if (activity.groupId) {
          // Check if student has this groupId in their groupIds array
          return students.filter(s => s.groupIds && s.groupIds.includes(activity.groupId!));
      }
      if (activity.participants) {
          return students.filter(s => activity.participants!.includes(s.id));
      }
      return [];
  };

  const calculateTotalCollected = (activity: Activity) => {
      if (!activity.fee || !activity.feePayments) return 0;
      return activity.feePayments.length * activity.fee;
  };

  const handleOpenNew = () => {
      setEditingId(null);
      setForm(initialFormState);
      setIsModalOpen(true);
  };

  const handleOpenEdit = (activity: Activity) => {
      setEditingId(activity.id);
      setForm({
          title: activity.title,
          type: activity.type,
          date: activity.date,
          startTime: activity.startTime,
          endTime: activity.endTime,
          groupId: activity.groupId || '',
          location: activity.location || '',
          fee: activity.fee || 0,
          recurrence: activity.recurrence || 'none'
      });
      setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const payload = { ...form, id: editingId };
      if (editingId) {
          onUpdateActivity(payload);
      } else {
          onAddActivity(payload);
      }
      setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
      if(confirm("Deseja excluir esta atividade?")) {
          onDeleteActivity(id);
          if (selectedActivity?.id === id) setSelectedActivity(null);
      }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
        {/* Left Panel: Activity List */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5 text-primary-600"/> Agenda de Treinos e Jogos
                </h3>
                {!isGuardian && (
                    <button 
                        onClick={handleOpenNew}
                        className="flex items-center gap-2 bg-primary-600 text-white px-3 py-1.5 rounded-lg hover:bg-primary-700 text-sm font-medium transition-colors"
                    >
                        <Plus className="w-4 h-4" /> Agendar
                    </button>
                )}
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {sortedActivities.length > 0 ? (
                    sortedActivities.map(activity => {
                        const dateObj = new Date(activity.date + 'T' + activity.startTime);
                        const isPast = dateObj < new Date();
                        const isSelected = selectedActivity?.id === activity.id;
                        
                        return (
                            <div 
                                key={activity.id} 
                                onClick={() => setSelectedActivity(activity)}
                                className={`p-4 rounded-xl border transition-all cursor-pointer flex justify-between items-center group ${
                                    isSelected 
                                    ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-200' 
                                    : 'border-gray-100 hover:border-primary-200 hover:bg-gray-50'
                                } ${isPast ? 'opacity-60 grayscale-[0.5]' : ''}`}
                            >
                                <div className="flex gap-4 items-center">
                                    <div className={`flex flex-col items-center justify-center w-14 h-14 rounded-lg border ${isSelected ? 'bg-white border-primary-200 text-primary-700' : 'bg-gray-100 border-gray-200 text-gray-500'}`}>
                                        <span className="text-xs font-bold uppercase">{dateObj.toLocaleString('pt-BR', { month: 'short' }).replace('.','')}</span>
                                        <span className="text-xl font-bold leading-none">{dateObj.getDate()}</span>
                                    </div>
                                    <div>
                                        <h4 className={`font-bold ${isSelected ? 'text-primary-900' : 'text-gray-900'}`}>{activity.title}</h4>
                                        <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                                            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5"/> {activity.startTime} - {activity.endTime}</span>
                                            {activity.location && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5"/> {activity.location}</span>}
                                        </div>
                                        {activity.groupId && (
                                            <span className="inline-block mt-2 text-xs font-medium px-2 py-0.5 rounded bg-gray-200 text-gray-600">
                                                {groups.find(g => g.id === activity.groupId)?.name || 'Grupo'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                
                                {!isGuardian && (
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleOpenEdit(activity); }}
                                            className="p-2 text-gray-400 hover:text-primary-600 hover:bg-white rounded-full transition-colors"
                                        >
                                            <Edit className="w-4 h-4" />
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleDelete(activity.id); }}
                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-white rounded-full transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400">
                        <CalendarIcon className="w-12 h-12 mb-2 opacity-20" />
                        <p>Nenhuma atividade agendada.</p>
                    </div>
                )}
            </div>
        </div>

        {/* Right Panel: Attendance */}
        <div className="lg:col-span-1">
            {selectedActivity ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 lg:sticky lg:top-4 max-h-[calc(100vh-2rem)] flex flex-col">
                    <div className="p-5 border-b border-gray-100 bg-gray-50 rounded-t-xl">
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <h3 className="font-bold text-gray-900">Lista de Presença</h3>
                                <p className="text-sm text-gray-500">{selectedActivity.title}</p>
                            </div>
                            {selectedActivity.type === 'GAME' && selectedActivity.fee && (
                                <div className="text-right">
                                    {!isGuardian && (
                                        <div className="text-xs text-gray-500 font-semibold bg-white border px-2 py-1 rounded">
                                            Total: R$ {calculateTotalCollected(selectedActivity).toFixed(2)}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2">
                        {getAttendeesList(selectedActivity).length > 0 ? (
                            getAttendeesList(selectedActivity).map(student => {
                                const isPresent = selectedActivity.attendance.includes(student.id);
                                const isFeePaid = selectedActivity.feePayments?.includes(student.id);
                                const showFeeButton = selectedActivity.type === 'GAME' && selectedActivity.fee && selectedActivity.fee > 0;
                                const goalCount = selectedActivity.scorers?.filter(id => id === student.id).length || 0;

                                return (
                                    <div key={student.id} 
                                        className={`flex items-center justify-between p-3 mb-1 rounded-lg transition-colors border border-gray-100 hover:bg-gray-50`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <img src={student.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(student.name)}`} className="w-8 h-8 rounded-full object-cover" alt="" />
                                            <div>
                                                <span className="text-sm font-medium text-gray-900 block flex items-center gap-1">
                                                    {student.name}
                                                    {goalCount > 0 && (
                                                        <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5 border border-yellow-200">
                                                            ⚽ {goalCount}
                                                        </span>
                                                    )}
                                                </span>
                                                {/* Status Text for Mobile */}
                                                <div className="flex gap-2 md:hidden mt-1">
                                                    {isPresent ? <span className="text-[10px] text-green-600 font-bold">Presente</span> : <span className="text-[10px] text-red-400">Ausente</span>}
                                                    {showFeeButton && isFeePaid && <span className="text-[10px] text-green-600 font-bold">Pago</span>}
                                                    {showFeeButton && !isFeePaid && <span className="text-[10px] text-orange-400">Pendente</span>}
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-2">
                                            {/* Attendance Toggle */}
                                            {!isGuardian ? (
                                                <button
                                                    onClick={() => onUpdateAttendance(selectedActivity.id, student.id)}
                                                    className={`p-2 rounded-full transition-colors ${isPresent ? 'bg-green-100 text-green-600 hover:bg-green-200' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                                                    title={isPresent ? "Marcar Ausente" : "Marcar Presente"}
                                                >
                                                    {isPresent ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                                                </button>
                                            ) : (
                                                <div className={`p-2 rounded-full ${isPresent ? 'bg-green-100 text-green-600' : 'bg-red-50 text-red-300'}`}>
                                                    {isPresent ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                                                </div>
                                            )}

                                            {/* Fee Payment Toggle (Only for Games with Fee) */}
                                            {showFeeButton && (
                                                !isGuardian ? (
                                                    <button
                                                        onClick={() => onUpdateFeePayment && onUpdateFeePayment(selectedActivity.id, student.id)}
                                                        className={`p-2 rounded-full transition-colors ${isFeePaid ? 'bg-green-100 text-green-600 hover:bg-green-200' : 'bg-orange-50 text-orange-300 hover:bg-orange-100'}`}
                                                        title={isFeePaid ? "Marcar como Não Pago" : "Marcar como Pago"}
                                                    >
                                                        <DollarSign className="w-5 h-5" />
                                                    </button>
                                                ) : (
                                                     // Guardian View of Fee
                                                    <div className={`p-2 rounded-full ${isFeePaid ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-300'}`}>
                                                        <DollarSign className="w-5 h-5" />
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    </div>
                                )
                            })
                        ) : (
                            <div className="p-4 text-center text-gray-400 text-sm">
                                Nenhum aluno vinculado a esta atividade.
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center h-64 flex flex-col items-center justify-center text-gray-400">
                    <CalendarIcon className="w-12 h-12 mb-2 opacity-20" />
                    <p>Selecione uma atividade para<br/>{isGuardian ? 'ver' : 'gerenciar'} a presença</p>
                </div>
            )}
        </div>

        {/* Modal for Add/Edit Activity */}
        {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-gray-900">{editingId ? 'Editar Atividade' : 'Nova Atividade'}</h3>
                        <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                    </div>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
                            <input required type="text" className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" 
                                placeholder="Ex: Treino Tático"
                                value={form.title} onChange={e => setForm({...form, title: e.target.value})} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                             <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                                <select className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 bg-white"
                                    value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                                    <option value="TRAINING">Treino</option>
                                    <option value="GAME">Jogo / Amistoso</option>
                                    <option value="EVENT">Evento</option>
                                </select>
                             </div>
                             <div>
                                 <label className="block text-sm font-medium text-gray-700 mb-1">Grupo</label>
                                 <select className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 bg-white"
                                    value={form.groupId} onChange={e => setForm({...form, groupId: e.target.value})}>
                                    <option value="">Selecione...</option>
                                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                 </select>
                             </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="col-span-1">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                                <input required type="date" className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none"
                                    value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
                            </div>
                            <div className="col-span-1">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Início</label>
                                <input required type="time" className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none"
                                    value={form.startTime} onChange={e => setForm({...form, startTime: e.target.value})} />
                            </div>
                            <div className="col-span-1">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Fim</label>
                                <input required type="time" className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none"
                                    value={form.endTime} onChange={e => setForm({...form, endTime: e.target.value})} />
                            </div>
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Local</label>
                            <input type="text" className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none"
                                placeholder="Ex: Campo A"
                                value={form.location} onChange={e => setForm({...form, location: e.target.value})} />
                        </div>

                        {form.type === 'GAME' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Taxa por Aluno (R$)</label>
                                <input type="number" step="0.50" className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none"
                                    value={form.fee} onChange={e => setForm({...form, fee: parseFloat(e.target.value)})} />
                            </div>
                        )}

                        {!editingId && (
                             <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Recorrência</label>
                                <select className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 bg-white"
                                    value={form.recurrence} onChange={e => setForm({...form, recurrence: e.target.value})}>
                                    <option value="none">Apenas uma vez</option>
                                    <option value="weekly">Semanalmente (até o fim do ano)</option>
                                </select>
                             </div>
                        )}

                        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                            <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors">
                                Cancelar
                            </button>
                            <button type="submit" className="px-5 py-2.5 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors shadow-lg shadow-primary-500/30">
                                Salvar Atividade
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )}
    </div>
  );
};