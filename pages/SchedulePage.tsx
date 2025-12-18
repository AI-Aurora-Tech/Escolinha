
import React, { useState, useEffect, useRef } from 'react';
import { Activity, Student, Group, User, UserRole } from '../types';
import { Calendar as CalendarIcon, Clock, CheckCircle, Users, Repeat, CheckSquare, Square, Search, User as UserIcon, FileText, XCircle, Edit, Trophy, Coins, DollarSign, Trash2, MapPin, Megaphone, X, Play, Pause, Zap, ChevronLeft, ChevronRight, Filter, Minus, PlusCircle, Medal, BarChart3 } from 'lucide-react';
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

  // --- NOTIFICATION STATE ---
  const [notifyModalOpen, setNotifyModalOpen] = useState(false);
  const [notifyQueue, setNotifyQueue] = useState<Student[]>([]);
  const [notifyCurrentIndex, setNotifyCurrentIndex] = useState(0);
  const [notifyIsRunning, setNotifyIsRunning] = useState(false);
  const [notifyCountdown, setNotifyCountdown] = useState(10);
  const [notifyLogs, setNotifyLogs] = useState<string[]>([]);
  const [notifyActivity, setNotifyActivity] = useState<Activity | null>(null);
  const notifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [newActivity, setNewActivity] = useState<Partial<Activity>>({
    title: '',
    type: 'TRAINING',
    fee: 0,
    location: '',
    date: selectedDate,
    startTime: '14:00',
    endTime: '15:30',
    groupId: '',
    participants: [],
    recurrence: 'none',
    attendance: [],
    feePayments: [],
    presentationTime: '',
    opponent: '',
    homeScore: 0,
    awayScore: 0,
    scorers: []
  });

  const isGuardian = currentUser?.role === UserRole.RESPONSAVEL;
  const selectedActivity = selectedActivityId ? activities.find(a => a.id === selectedActivityId) || null : null;

  const dailyActivities = activities
    .filter(a => a.date === selectedDate)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const parts = dateString.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateString;
  };

  const getAttendeesList = (activity: Activity) => {
    if (activity.groupId) {
      return students.filter(s => s.groupIds?.includes(activity.groupId!) && s.active);
    }
    if (activity.participants && activity.participants.length > 0) {
      return students.filter(s => activity.participants?.includes(s.id));
    }
    return [];
  };

  // --- NOTIFICATION LOGIC ---
  const handleOpenNotify = (e: React.MouseEvent, activity: Activity) => {
    e.stopPropagation();
    const targets = getAttendeesList(activity);
    if (targets.length === 0) {
      alert("Nenhum atleta vinculado a esta atividade.");
      return;
    }
    setNotifyActivity(activity);
    setNotifyQueue(targets);
    setNotifyCurrentIndex(0);
    setNotifyLogs([`Fila preparada para ${targets.length} atletas.`]);
    setNotifyModalOpen(true);
    setNotifyCountdown(1);
  };

  useEffect(() => {
    if (!notifyModalOpen || !notifyIsRunning || !notifyActivity) return;
    if (notifyCurrentIndex >= notifyQueue.length) {
      setNotifyIsRunning(false);
      setNotifyLogs(prev => ["✅ Disparos finalizados!", ...prev]);
      return;
    }
    if (notifyCountdown > 0) {
      notifyTimerRef.current = setTimeout(() => setNotifyCountdown(prev => prev - 1), 1000);
    } else {
      processNotifyItem(notifyQueue[notifyCurrentIndex]);
    }
    return () => { if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current); };
  }, [notifyModalOpen, notifyIsRunning, notifyCountdown, notifyCurrentIndex]);

  const processNotifyItem = async (student: Student) => {
    if (!notifyActivity) return;
    const phone = student.guardian.phone.replace(/\D/g, '');
    if (phone) {
      const type = notifyActivity.type === 'GAME' ? 'JOGO' : 'TREINO';
      const emoji = notifyActivity.type === 'GAME' ? '🏆' : '⚽';
      
      let msg = `Olá ${student.guardian.name}, aqui é da Garotos do Martinica! ${emoji}\n\n` +
          `*COMUNICADO: ${type}*\n` +
          `Atleta: *${student.name}*\n\n` +
          `📌 *${notifyActivity.title}*\n` +
          `📅 Data: ${formatDate(notifyActivity.date)}\n` +
          `⏰ Horário: ${notifyActivity.startTime} às ${notifyActivity.endTime}\n`;

      if (notifyActivity.type === 'GAME') {
        if (notifyActivity.opponent) msg += `⚔️ Adversário: ${notifyActivity.opponent}\n`;
        if (notifyActivity.presentationTime) msg += `🕒 Chegar às: ${notifyActivity.presentationTime}\n`;
        if (notifyActivity.fee && notifyActivity.fee > 0) msg += `💰 Taxa: R$ ${notifyActivity.fee.toFixed(2)}\n`;
      }

      if (notifyActivity.location) msg += `📍 Local: ${notifyActivity.location}\n`;
      msg += `\nContamos com a presença! Por favor, confirme.\nObrigado!`;

      const sent = await sendZApiMessage(phone, msg);
      setNotifyLogs(prev => [`${sent ? '✅' : '⚠️'} ${student.name}`, ...prev]);
      if (!sent) window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    }
    setNotifyCurrentIndex(prev => prev + 1);
    setNotifyCountdown(10);
  };

  const handleOpenEdit = (e: React.MouseEvent, act: Activity) => {
    e.stopPropagation();
    setEditingId(act.id);
    setNewActivity(act);
    setTargetType(act.groupId ? 'GROUP' : 'INDIVIDUAL');
    setSelectedStudentIds(new Set(act.participants || []));
    setShowAddModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      ...newActivity,
      groupId: targetType === 'GROUP' ? newActivity.groupId : undefined,
      participants: targetType === 'INDIVIDUAL' ? Array.from(selectedStudentIds) : []
    };
    if (editingId) onUpdateActivity({ ...data, id: editingId } as Activity);
    else onAddActivity(data as Omit<Activity, 'id'>);
    setShowAddModal(false);
  };

  const toggleStudentSelection = (id: string) => {
    const newSet = new Set(selectedStudentIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedStudentIds(newSet);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Agenda de Atividades</h2>
        {!isGuardian && (
          <button onClick={() => { setEditingId(null); setShowAddModal(true); }} className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 shadow-sm transition-colors text-sm font-medium">
            <PlusCircle className="w-4 h-4" /> Agendar Atividade
          </button>
        )}
      </div>

      <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
        <button onClick={() => { const d = new Date(selectedDate + 'T00:00:00'); d.setDate(d.getDate()-1); setSelectedDate(d.toISOString().split('T')[0]); }} className="p-2 hover:bg-gray-100 rounded-lg text-gray-600"><ChevronLeft /></button>
        <div className="flex-1 text-center font-bold text-primary-600 text-lg">{formatDate(selectedDate)}</div>
        <button onClick={() => { const d = new Date(selectedDate + 'T00:00:00'); d.setDate(d.getDate()+1); setSelectedDate(d.toISOString().split('T')[0]); }} className="p-2 hover:bg-gray-100 rounded-lg text-gray-600"><ChevronRight /></button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {dailyActivities.map(act => (
            <div key={act.id} onClick={() => setSelectedActivityId(act.id)} className={`bg-white p-5 rounded-xl border transition-all cursor-pointer hover:shadow-md ${selectedActivityId === act.id ? 'border-primary-500 ring-1 ring-primary-500' : 'border-gray-100'}`}>
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                  <h4 className="font-bold text-lg flex items-center gap-2">
                    {act.type === 'GAME' ? <Trophy className="w-5 h-5 text-yellow-500" /> : <CalendarIcon className="w-5 h-5 text-primary-500" />}
                    {act.title}
                  </h4>
                  {act.type === 'GAME' && act.opponent && (
                    <div className="mt-2 text-sm font-semibold text-gray-700 bg-orange-50 px-3 py-1 rounded-lg border border-orange-100 w-fit">
                      🆚 {act.opponent} 
                      {act.homeScore !== undefined && ` | ${act.homeScore} x ${act.awayScore}`}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-500 font-medium">
                    <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {act.startTime} - {act.endTime}</span>
                    {act.presentationTime && <span className="flex items-center gap-1 text-orange-600"><MapPin className="w-4 h-4" /> Apres: {act.presentationTime}</span>}
                    {act.fee && act.fee > 0 && <span className="flex items-center gap-1 text-green-600 font-bold"><Coins className="w-4 h-4" /> R$ {act.fee.toFixed(2)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!isGuardian && (
                    <>
                      <button onClick={(e) => handleOpenNotify(e, act)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors" title="Notificar via WhatsApp"><Megaphone className="w-4 h-4" /></button>
                      <button onClick={(e) => handleOpenEdit(e, act)} className="p-2 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors" title="Editar"><Edit className="w-4 h-4" /></button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
          {dailyActivities.length === 0 && <div className="p-12 text-center text-gray-400 bg-white rounded-xl border border-dashed border-gray-200"><CalendarIcon className="w-12 h-12 mx-auto mb-2 opacity-20" /><p>Nenhuma atividade para este dia.</p></div>}
        </div>

        {/* Painel de Presença */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden h-fit">
          <div className="p-4 border-b bg-gray-50 font-bold text-gray-800">
            {selectedActivity ? `Lista: ${selectedActivity.title}` : 'Selecione uma atividade'}
          </div>
          <div className="p-2 max-h-[500px] overflow-y-auto">
            {selectedActivity ? (
              getAttendeesList(selectedActivity).map(s => {
                const isPresent = selectedActivity.attendance.includes(s.id);
                return (
                  <div key={s.id} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg transition-colors border-b border-gray-50 last:border-0">
                    <span className="text-sm font-medium text-gray-700">{s.name}</span>
                    {!isGuardian ? (
                      <button onClick={() => onUpdateAttendance(selectedActivity.id, s.id)} className={`p-1 rounded-full transition-colors ${isPresent ? 'text-green-600 bg-green-50' : 'text-gray-300 bg-gray-50'}`}>
                        <CheckCircle className="w-7 h-7" />
                      </button>
                    ) : (
                      <div className={isPresent ? 'text-green-600' : 'text-gray-300'}><CheckCircle className="w-7 h-7" /></div>
                    )}
                  </div>
                );
              })
            ) : <p className="text-xs text-gray-400 text-center py-8">Clique em uma atividade para ver a lista de presença.</p>}
          </div>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 my-8">
            <h3 className="text-lg font-bold mb-6 text-gray-900 border-b pb-4 flex items-center gap-2">
              <CalendarIcon className="text-primary-600" /> {editingId ? 'Editar Atividade' : 'Agendar Nova Atividade'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><label className="block text-sm font-medium mb-1">Título da Atividade</label><input required className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-primary-500" value={newActivity.title} onChange={e => setNewActivity({...newActivity, title: e.target.value})} placeholder="Ex: Treino Tático ou Jogo Contra..." /></div>
              
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium mb-1">Tipo</label><select className="w-full border rounded-lg p-2 bg-white" value={newActivity.type} onChange={e => setNewActivity({...newActivity, type: e.target.value as 'TRAINING' | 'GAME'})}><option value="TRAINING">Treino</option><option value="GAME">Jogo</option></select></div>
                <div><label className="block text-sm font-medium mb-1">Grupo Alvo</label><select className="w-full border rounded-lg p-2 bg-white" value={newActivity.groupId} onChange={e => {setNewActivity({...newActivity, groupId: e.target.value}); setTargetType('GROUP');}}><option value="">Selecione...</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
              </div>

              {newActivity.type === 'GAME' && (
                <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 space-y-4 animate-in fade-in zoom-in duration-300">
                  <div><label className="block text-xs font-bold text-orange-800 uppercase mb-1">Adversário</label><input className="w-full border-orange-200 rounded-lg p-2 text-sm focus:ring-primary-500" value={newActivity.opponent} onChange={e => setNewActivity({...newActivity, opponent: e.target.value})} placeholder="Nome do time adversário" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-bold text-orange-800 uppercase mb-1">Apresentação</label><input type="time" className="w-full border-orange-200 rounded-lg p-2 text-sm" value={newActivity.presentationTime} onChange={e => setNewActivity({...newActivity, presentationTime: e.target.value})} /></div>
                    <div><label className="block text-xs font-bold text-orange-800 uppercase mb-1">Taxa Jogo (R$)</label><input type="number" step="0.01" className="w-full border-orange-200 rounded-lg p-2 text-sm" value={newActivity.fee} onChange={e => setNewActivity({...newActivity, fee: parseFloat(e.target.value) || 0})} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-orange-200/50">
                    <div><label className="block text-[10px] font-bold text-orange-800 uppercase text-center">Nós</label><input type="number" className="w-full border-orange-200 rounded-lg p-2 text-center text-xl font-bold" value={newActivity.homeScore} onChange={e => setNewActivity({...newActivity, homeScore: parseInt(e.target.value) || 0})} /></div>
                    <div><label className="block text-[10px] font-bold text-orange-800 uppercase text-center">Eles</label><input type="number" className="w-full border-orange-200 rounded-lg p-2 text-center text-xl font-bold" value={newActivity.awayScore} onChange={e => setNewActivity({...newActivity, awayScore: parseInt(e.target.value) || 0})} /></div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium mb-1">Data</label><input type="date" className="w-full border rounded-lg p-2" value={newActivity.date} onChange={e => setNewActivity({...newActivity, date: e.target.value})} /></div>
                <div><label className="block text-sm font-medium mb-1">Início</label><input type="time" className="w-full border rounded-lg p-2" value={newActivity.startTime} onChange={e => setNewActivity({...newActivity, startTime: e.target.value})} /></div>
                <div><label className="block text-sm font-medium mb-1">Fim</label><input type="time" className="w-full border rounded-lg p-2" value={newActivity.endTime} onChange={e => setNewActivity({...newActivity, endTime: e.target.value})} /></div>
              </div>

              <div><label className="block text-sm font-medium mb-1">Local</label><div className="relative"><MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><input className="w-full pl-10 border rounded-lg p-2" value={newActivity.location} onChange={e => setNewActivity({...newActivity, location: e.target.value})} placeholder="Local da atividade" /></div></div>

              <div className="pt-6 border-t flex justify-end gap-3">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-6 py-2 border rounded-lg hover:bg-gray-50 font-medium text-gray-600 transition-colors">Cancelar</button>
                <button type="submit" className="px-8 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 shadow-lg shadow-primary-200 font-bold transition-all">Salvar Agenda</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Disparos Z-API */}
      {notifyModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 text-center">
            <h3 className="text-lg font-bold mb-4 flex items-center justify-center gap-2 text-blue-600">
              <Megaphone /> Notificando via Z-API
            </h3>
            <div className="bg-gray-900 text-green-400 p-4 rounded-lg h-48 overflow-y-auto text-xs font-mono text-left mb-6 shadow-inner">
              {notifyLogs.map((log, i) => <div key={i} className="mb-1">{log}</div>)}
            </div>
            <div className="flex justify-center gap-3">
              {!notifyIsRunning && notifyCurrentIndex < notifyQueue.length ? (
                <button onClick={() => setNotifyIsRunning(true)} className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold shadow-lg shadow-green-200 hover:bg-green-700 transition-all">Iniciar Disparos</button>
              ) : (
                <button onClick={() => setNotifyIsRunning(false)} className="flex-1 py-3 bg-red-100 text-red-700 rounded-xl font-bold hover:bg-red-200 transition-all" disabled={notifyCurrentIndex >= notifyQueue.length}>Pausar</button>
              )}
              <button onClick={() => setNotifyModalOpen(false)} className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-all">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
