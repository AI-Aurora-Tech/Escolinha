
import React, { useState, useEffect, useRef } from 'react';
import { Activity, Student, Group, User, UserRole } from '../types';
import { Calendar as CalendarIcon, Clock, CheckCircle, Users, Repeat, CheckSquare, Square, Search, User as UserIcon, FileText, XCircle, Edit, Trophy, Coins, DollarSign, Trash2, MapPin, Megaphone, X, Play, Pause, Zap, ChevronLeft, ChevronRight, Filter, Minus, PlusCircle, Medal, BarChart3, Loader2 } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { sendZApiMessage } from '../services/zapiService';

interface SchedulePageProps {
  activities: Activity[];
  students: Student[];
  groups: Group[];
  onAddActivity: (activity: Omit<Activity, 'id'>) => void;
  onUpdateActivity: (activity: Activity) => void;
  onUpdateAttendance: (activityId: string, studentId: string) => void;
  onUpdateFeePayment?: (activityId: string, studentId: string) => void; 
  onDeleteActivity?: (activityId: string) => void;
  currentUser?: User | null;
}

export const SchedulePage: React.FC<SchedulePageProps> = ({ activities, students, groups, onAddActivity, onUpdateActivity, onUpdateAttendance, onUpdateFeePayment, onDeleteActivity, currentUser }) => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [targetType, setTargetType] = useState<'GROUP' | 'INDIVIDUAL'>('GROUP');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [studentSearch, setStudentSearch] = useState('');
  const [hasFee, setHasFee] = useState(false);

  const [showReportModal, setShowReportModal] = useState(false);
  const [reportStartDate, setReportStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [reportEndDate, setReportEndDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]);

  const [notifyModalOpen, setNotifyModalOpen] = useState(false);
  const [notifyQueue, setNotifyQueue] = useState<Student[]>([]);
  const [notifyCurrentIndex, setNotifyCurrentIndex] = useState(0);
  const [notifyIsRunning, setNotifyIsRunning] = useState(false);
  const [notifyCountdown, setNotifyCountdown] = useState(10);
  const [notifyLogs, setNotifyLogs] = useState<string[]>([]);
  const [notifyActivity, setNotifyActivity] = useState<Activity | null>(null);
  const notifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [newActivity, setNewActivity] = useState<Partial<Activity>>({
      title: '', type: 'TRAINING', fee: 0, location: '', date: new Date().toISOString().split('T')[0],
      startTime: '14:00', endTime: '15:30', groupId: '', participants: [], recurrence: 'none',
      attendance: [], feePayments: [], presentationTime: '', opponent: '', homeScore: 0, awayScore: 0, scorers: []
  });

  const isGuardian = currentUser?.role === UserRole.RESPONSAVEL;
  const selectedActivity = selectedActivityId ? activities.find(a => a.id === selectedActivityId) || null : null;
  const dailyActivities = activities.filter(a => a.date === selectedDate).sort((a, b) => a.startTime.localeCompare(b.startTime));

  const formatDate = (dateString: string) => {
      if (!dateString) return '';
      const parts = dateString.split('-');
      return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateString;
  };

  const handleNavigateDate = (days: number) => {
      const current = new Date(selectedDate + 'T00:00:00');
      current.setDate(current.getDate() + days);
      setSelectedDate(current.toISOString().split('T')[0]);
      setSelectedActivityId(null);
  };

  const handleGoToday = () => {
      setSelectedDate(new Date().toISOString().split('T')[0]);
      setSelectedActivityId(null);
  };

  const handleOpenAdd = () => {
      setEditingId(null);
      setNewActivity({ ...newActivity, title: '', date: selectedDate, type: 'TRAINING', attendance: [], feePayments: [], scorers: [] });
      setTargetType('GROUP');
      setSelectedStudentIds(new Set());
      setHasFee(false);
      setShowAddModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const activityData = { ...newActivity, fee: hasFee ? newActivity.fee : 0, groupId: targetType === 'GROUP' ? newActivity.groupId : undefined, participants: targetType === 'INDIVIDUAL' ? Array.from(selectedStudentIds) : [] };
      if (editingId) onUpdateActivity({ ...activityData, id: editingId } as Activity);
      else onAddActivity(activityData as Omit<Activity, 'id'>);
      setShowAddModal(false);
  };

  const getAttendeesList = (activity: Activity) => {
      if (activity.groupId) return students.filter(s => s.groupIds?.includes(activity.groupId!) && s.active);
      if (activity.participants?.length) return students.filter(s => activity.participants?.includes(s.id));
      return [];
  };

  // Fix: Adding handleOpenNotify function to fix Error in file pages/SchedulePage.tsx on line 150
  const handleOpenNotify = (e: React.MouseEvent, activity: Activity) => {
      e.stopPropagation();
      const attendees = getAttendeesList(activity);
      if (attendees.length === 0) {
          alert("Nenhum atleta na lista para notificar.");
          return;
      }
      setNotifyActivity(activity);
      setNotifyQueue(attendees);
      setNotifyCurrentIndex(0);
      setNotifyIsRunning(false);
      setNotifyLogs([`Pronto para enviar avisos para ${attendees.length} atletas.`]);
      setNotifyModalOpen(true);
      setNotifyCountdown(1);
  };

  // Fix: Adding logic to process notification queue
  useEffect(() => {
      if (!notifyModalOpen || !notifyIsRunning) {
          if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
          return;
      }

      if (notifyCurrentIndex >= notifyQueue.length) {
          setNotifyIsRunning(false);
          setNotifyLogs(prev => [...prev, "✅ Processo finalizado!"]);
          return;
      }

      if (notifyCountdown > 0) {
          notifyTimerRef.current = setTimeout(() => {
              setNotifyCountdown(prev => prev - 1);
          }, 1000);
      } else {
          processNotifyItem(notifyQueue[notifyCurrentIndex]);
      }

      return () => {
          if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
      };
  }, [notifyModalOpen, notifyIsRunning, notifyCountdown, notifyCurrentIndex, notifyQueue]);

  const processNotifyItem = async (student: Student) => {
      if (!notifyActivity) return;

      const phone = student.guardian.phone.replace(/\D/g, '');
      if (!phone) {
          setNotifyLogs(prev => [`⚠️ Sem telefone para ${student.name}`, ...prev]);
          nextNotifyItem();
          return;
      }

      const message = `Olá ${student.guardian.name}, somos da Escolinha Garotos do Martinica. ⚽\n\n` +
          `Lembramos que temos uma atividade agendada para *${student.name}*:\n\n` +
          `📌 *${notifyActivity.title}*\n` +
          `📅 Data: ${formatDate(notifyActivity.date)}\n` +
          `⏰ Horário: ${notifyActivity.startTime}\n` +
          (notifyActivity.location ? `📍 Local: ${notifyActivity.location}\n` : '') +
          `Contamos com a presença! Obrigado.`;

      const sent = await sendZApiMessage(phone, message);
      if (sent) {
          setNotifyLogs(prev => [`✅ Enviado (API) para ${student.name}`, ...prev]);
      } else {
          const encodedMessage = encodeURIComponent(message);
          window.open(`https://wa.me/55${phone}?text=${encodedMessage}`, '_blank');
          setNotifyLogs(prev => [`✅ Aberto manual para ${student.name}`, ...prev]);
      }

      nextNotifyItem();
  };

  const nextNotifyItem = () => {
      setNotifyCurrentIndex(prev => prev + 1);
      setNotifyCountdown(10);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Agenda de Atividades</h2>
        {!isGuardian && (
            <div className="flex gap-2 w-full md:w-auto">
                <button onClick={() => setShowReportModal(true)} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors shadow-sm text-sm"><BarChart3 className="w-4 h-4" /> Relatórios</button>
                <button onClick={handleOpenAdd} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors shadow-sm text-sm"><PlusCircle className="w-4 h-4" /> Nova Atividade</button>
            </div>
        )}
      </div>

      <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-2">
            <button onClick={() => handleNavigateDate(-1)} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><ChevronLeft className="w-5 h-5 text-gray-600" /></button>
            <div className="text-center min-w-[150px]">
                <p className="text-xs font-bold text-primary-600 uppercase tracking-wider">{new Date(selectedDate + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long' })}</p>
                <p className="text-lg font-bold text-gray-900">{formatDate(selectedDate)}</p>
            </div>
            <button onClick={() => handleNavigateDate(1)} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><ChevronRight className="w-5 h-5 text-gray-600" /></button>
          </div>
          <button onClick={handleGoToday} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors border border-gray-200">Hoje</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
            <h3 className="font-bold text-gray-700 flex items-center gap-2 px-1"><CalendarIcon className="w-4 h-4" /> Atividades do Dia</h3>
            {dailyActivities.length > 0 ? (
                dailyActivities.map(activity => (
                    <div key={activity.id} onClick={() => setSelectedActivityId(activity.id)} className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedActivityId === activity.id ? 'bg-primary-50 border-primary-300 ring-1 ring-primary-300 shadow-md' : 'bg-white border-gray-100 hover:border-primary-200 shadow-sm'}`}>
                        <div className="flex justify-between items-start mb-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${activity.type === 'GAME' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>{activity.type === 'GAME' ? 'Jogo' : 'Treino'}</span>
                            <span className="text-xs font-bold text-gray-500 flex items-center gap-1"><Clock className="w-3 h-3" /> {activity.startTime}</span>
                        </div>
                        <h4 className="font-bold text-gray-900 truncate">{activity.title}</h4>
                        <p className="text-xs text-gray-500 mt-1 truncate">{activity.groupId ? groups.find(g => g.id === activity.groupId)?.name : `${activity.participants?.length} Atletas`}</p>
                    </div>
                ))
            ) : (
                <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-8 text-center"><CalendarIcon className="w-10 h-10 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-500 font-medium">Nenhuma atividade para este dia.</p></div>
            )}
        </div>

        <div className="lg:col-span-2">
            {selectedActivity ? (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-6 border-b border-gray-50 bg-gray-50/50 flex justify-between items-start">
                        <div>
                            <h3 className="text-xl font-bold text-gray-900">{selectedActivity.title}</h3>
                            <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
                                <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {selectedActivity.startTime} - {selectedActivity.endTime}</span>
                                {selectedActivity.location && <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {selectedActivity.location}</span>}
                            </div>
                        </div>
                        {!isGuardian && (
                            <button onClick={(e) => handleOpenNotify(e, selectedActivity)} className="flex items-center gap-2 bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-green-100 transition-colors border border-green-200"><Megaphone className="w-4 h-4" /> Notificar</button>
                        )}
                    </div>
                    <div className="p-6">
                        <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Users className="w-5 h-5 text-primary-500" /> Lista de Atletas ({getAttendeesList(selectedActivity).length})</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {getAttendeesList(selectedActivity).map(student => (
                                <div key={student.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-50 bg-gray-50/30">
                                    <div className="flex items-center gap-3">
                                        <img src={student.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                                        <span className="text-sm font-medium text-gray-700">{student.name}</span>
                                    </div>
                                    <button onClick={() => onUpdateAttendance(selectedActivity.id, student.id)} className={`p-1 rounded-lg transition-colors ${selectedActivity.attendance.includes(student.id) ? 'text-green-600 bg-green-50' : 'text-gray-300 hover:text-primary-500'}`}>{selectedActivity.attendance.includes(student.id) ? <CheckSquare className="w-6 h-6" /> : <Square className="w-6 h-6" />}</button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center h-full flex flex-col items-center justify-center text-gray-400"><CalendarIcon className="w-16 h-16 opacity-10 mb-4" /><p>Selecione uma atividade para ver os detalhes e fazer a chamada.</p></div>
            )}
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="bg-white rounded-2xl w-full max-w-lg p-6 overflow-y-auto max-h-[90vh]">
            <h3 className="text-lg font-bold mb-4">Nova Atividade</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div><label className="block text-sm font-medium mb-1">Título</label><input required className="w-full border rounded-lg p-2" type="text" value={newActivity.title} onChange={e => setNewActivity({...newActivity, title: e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-sm font-medium mb-1">Tipo</label><select className="w-full border rounded-lg p-2" value={newActivity.type} onChange={e => setNewActivity({...newActivity, type: e.target.value as any})}><option value="TRAINING">Treino</option><option value="GAME">Jogo/Evento</option></select></div>
                    <div><label className="block text-sm font-medium mb-1">Grupo</label><select className="w-full border rounded-lg p-2" value={newActivity.groupId} onChange={e => setNewActivity({...newActivity, groupId: e.target.value})}><option value="">Selecione...</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-sm font-medium mb-1">Hora Início</label><input required className="w-full border rounded-lg p-2" type="time" value={newActivity.startTime} onChange={e => setNewActivity({...newActivity, startTime: e.target.value})} /></div>
                    <div><label className="block text-sm font-medium mb-1">Hora Fim</label><input required className="w-full border rounded-lg p-2" type="time" value={newActivity.endTime} onChange={e => setNewActivity({...newActivity, endTime: e.target.value})} /></div>
                </div>
                <div className="flex justify-end gap-2 pt-4"><button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-gray-500">Cancelar</button><button type="submit" className="bg-primary-600 text-white px-6 py-2 rounded-lg">Salvar</button></div>
            </form>
        </div></div>
      )}

      {/* Fix: Adding Notify Modal JSX */}
      {notifyModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
               <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                   <Megaphone className="w-5 h-5 text-green-600" /> Notificar Atletas
               </h3>
               {!notifyIsRunning && <button onClick={() => setNotifyModalOpen(false)}><X className="w-5 h-5 text-gray-400" /></button>}
            </div>

            <div className="mb-6">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>Progresso:</span>
                    <span>{Math.min(notifyCurrentIndex + 1, notifyQueue.length)} de {notifyQueue.length}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                    <div className="bg-green-600 h-2.5 rounded-full transition-all duration-500" style={{ width: `${((notifyCurrentIndex) / notifyQueue.length) * 100}%` }}></div>
                </div>
                
                {notifyIsRunning ? (
                    <div className="bg-green-50 text-green-800 p-3 rounded-lg text-sm font-medium text-center flex flex-col items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-green-600 border-t-transparent"></div>
                        Próximo envio em {notifyCountdown}s...
                    </div>
                ) : (
                    <div className="bg-green-50 text-green-800 p-3 rounded-lg text-sm font-medium text-center">
                        {notifyCurrentIndex >= notifyQueue.length ? 'Processo Finalizado' : 'Aguardando Início'}
                    </div>
                )}
            </div>
            
            <div className="bg-gray-900 text-green-400 p-4 rounded-lg h-40 overflow-y-auto text-xs font-mono mb-4">
                {notifyLogs.map((log, i) => (
                    <div key={i} className="mb-1">{log}</div>
                ))}
            </div>

            <div className="flex justify-end gap-2">
                {!notifyIsRunning && notifyCurrentIndex < notifyQueue.length ? (
                    <button onClick={() => setNotifyIsRunning(true)} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
                        <Play className="w-4 h-4" /> Iniciar Envios
                    </button>
                ) : notifyIsRunning ? (
                    <button onClick={() => setNotifyIsRunning(false)} className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm font-medium">
                        <Pause className="w-4 h-4" /> Pausar
                    </button>
                ) : null}
                <button onClick={() => setNotifyModalOpen(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium">
                    Fechar
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
