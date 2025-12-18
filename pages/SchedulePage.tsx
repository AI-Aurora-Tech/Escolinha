
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
  const [notifyModalOpen, setNotifyModalOpen] = useState(false);
  const [notifyQueue, setNotifyQueue] = useState<Student[]>([]);
  const [notifyCurrentIndex, setNotifyCurrentIndex] = useState(0);
  const [notifyIsRunning, setNotifyIsRunning] = useState(false);
  const [notifyCountdown, setNotifyCountdown] = useState(10);
  const [notifyLogs, setNotifyLogs] = useState<string[]>([]);
  const [notifyActivity, setNotifyActivity] = useState<Activity | null>(null);
  const notifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [newActivity, setNewActivity] = useState<Partial<Activity>>({
    title: '', type: 'TRAINING', fee: 0, location: '', date: selectedDate, startTime: '14:00', endTime: '15:30', groupId: '', participants: [], recurrence: 'none', attendance: [], feePayments: [], presentationTime: '', opponent: '', homeScore: 0, awayScore: 0, scorers: []
  });

  const isGuardian = currentUser?.role === UserRole.RESPONSAVEL;
  const dailyActivities = activities.filter(a => a.date === selectedDate).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const selectedActivity = selectedActivityId ? activities.find(a => a.id === selectedActivityId) || null : null;

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const parts = dateString.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateString;
  };

  const handleOpenNotify = (e: React.MouseEvent, activity: Activity) => {
    e.stopPropagation();
    const targets = activity.groupId ? students.filter(s => s.groupIds?.includes(activity.groupId!) && s.active) : students.filter(s => activity.participants?.includes(s.id));
    if (targets.length === 0) return;
    setNotifyActivity(activity);
    setNotifyQueue(targets);
    setNotifyCurrentIndex(0);
    setNotifyLogs([`Fila pronta para ${targets.length} atletas.`]);
    setNotifyModalOpen(true);
  };

  useEffect(() => {
    if (!notifyModalOpen || !notifyIsRunning || !notifyActivity) return;
    if (notifyCurrentIndex >= notifyQueue.length) { setNotifyIsRunning(false); setNotifyLogs(prev => ["✅ Finalizado!", ...prev]); return; }
    if (notifyCountdown > 0) { notifyTimerRef.current = setTimeout(() => setNotifyCountdown(prev => prev - 1), 1000); }
    else { processNotifyItem(notifyQueue[notifyCurrentIndex]); }
    return () => { if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current); };
  }, [notifyModalOpen, notifyIsRunning, notifyCountdown, notifyCurrentIndex]);

  const processNotifyItem = async (student: Student) => {
    if (!notifyActivity) return;
    const phone = student.guardian.phone.replace(/\D/g, '');
    if (phone) {
      const msg = `Olá ${student.guardian.name}, somos da Garotos do Martinica. ⚽\nLembrete de ${notifyActivity.type === 'GAME' ? 'JOGO' : 'TREINO'}: *${notifyActivity.title}*\n📅 Data: ${formatDate(notifyActivity.date)}\n⏰ Horário: ${notifyActivity.startTime}\n📍 Local: ${notifyActivity.location || 'Campo Oficial'}`;
      const sent = await sendZApiMessage(phone, msg);
      setNotifyLogs(prev => [`${sent ? '✅' : '⚠️'} ${student.name}`, ...prev]);
      if (!sent) window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    }
    setNotifyCurrentIndex(prev => prev + 1);
    setNotifyCountdown(10);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = { ...newActivity, groupId: targetType === 'GROUP' ? newActivity.groupId : undefined, participants: targetType === 'INDIVIDUAL' ? Array.from(selectedStudentIds) : [] };
    if (editingId) onUpdateActivity({ ...data, id: editingId } as Activity);
    else onAddActivity(data as Omit<Activity, 'id'>);
    setShowAddModal(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Agenda de Atividades</h2>
        {!isGuardian && <button onClick={() => { setEditingId(null); setShowAddModal(true); }} className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg text-sm"><PlusCircle className="w-4 h-4" /> Agendar</button>}
      </div>

      <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
        <button onClick={() => { const d = new Date(selectedDate + 'T00:00:00'); d.setDate(d.getDate()-1); setSelectedDate(d.toISOString().split('T')[0]); }} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft /></button>
        <div className="flex-1 text-center font-bold text-primary-600">{formatDate(selectedDate)}</div>
        <button onClick={() => { const d = new Date(selectedDate + 'T00:00:00'); d.setDate(d.getDate()+1); setSelectedDate(d.toISOString().split('T')[0]); }} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronRight /></button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {dailyActivities.map(act => (
            <div key={act.id} onClick={() => setSelectedActivityId(act.id)} className={`bg-white p-5 rounded-xl border cursor-pointer transition-all ${selectedActivityId === act.id ? 'border-primary-500 shadow-md' : 'border-gray-100'}`}>
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-lg flex items-center gap-2">{act.type === 'GAME' ? <Trophy className="text-yellow-500 w-5 h-5" /> : <CalendarIcon className="text-primary-500 w-5 h-5" />}{act.title}</h4>
                  <p className="text-sm text-gray-500 mt-1 flex items-center gap-2"><Clock className="w-4 h-4" /> {act.startTime} - {act.endTime}</p>
                  {act.location && <p className="text-xs text-gray-400 mt-1 flex items-center gap-2"><MapPin className="w-3 h-3" /> {act.location}</p>}
                </div>
                {!isGuardian && <button onClick={(e) => handleOpenNotify(e, act)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"><Megaphone className="w-4 h-4" /></button>}
              </div>
            </div>
          ))}
          {dailyActivities.length === 0 && <div className="p-12 text-center text-gray-400 bg-white rounded-xl border border-dashed border-gray-200">Sem atividades para hoje.</div>}
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-100 h-fit">
          <h3 className="font-bold text-gray-800 mb-4">Presença: {selectedActivity?.title || 'Selecione...'}</h3>
          {selectedActivity ? (
            <div className="space-y-2">
              {students.filter(s => selectedActivity.groupId ? s.groupIds?.includes(selectedActivity.groupId!) : selectedActivity.participants?.includes(s.id)).map(s => (
                <div key={s.id} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg">
                  <span className="text-sm font-medium">{s.name}</span>
                  <button onClick={() => onUpdateAttendance(selectedActivity.id, s.id)} className={`p-1 rounded-full ${selectedActivity.attendance.includes(s.id) ? 'text-green-600' : 'text-gray-300'}`}><CheckCircle className="w-7 h-7" /></button>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-gray-400 text-center">Clique em uma atividade ao lado para gerenciar a frequência.</p>}
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">Agendar Atividade</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><label className="block text-sm font-medium mb-1">Título</label><input required className="w-full border rounded-lg p-2" value={newActivity.title} onChange={e => setNewActivity({...newActivity, title: e.target.value})} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium mb-1">Tipo</label><select className="w-full border rounded-lg p-2 bg-white" value={newActivity.type} onChange={e => setNewActivity({...newActivity, type: e.target.value as 'TRAINING' | 'GAME'})}><option value="TRAINING">Treino</option><option value="GAME">Jogo</option></select></div>
                <div><label className="block text-sm font-medium mb-1">Grupo</label><select className="w-full border rounded-lg p-2 bg-white" value={newActivity.groupId} onChange={e => {setNewActivity({...newActivity, groupId: e.target.value}); setTargetType('GROUP');}}><option value="">Selecione...</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium mb-1">Data</label><input type="date" className="w-full border rounded-lg p-2" value={newActivity.date} onChange={e => setNewActivity({...newActivity, date: e.target.value})} /></div>
                <div><label className="block text-sm font-medium mb-1">Horário</label><input type="time" className="w-full border rounded-lg p-2" value={newActivity.startTime} onChange={e => setNewActivity({...newActivity, startTime: e.target.value})} /></div>
              </div>
              <div className="pt-4 border-t flex justify-end gap-2"><button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 border rounded-lg">Cancelar</button><button type="submit" className="px-6 py-2 bg-primary-600 text-white rounded-lg">Salvar</button></div>
            </form>
          </div>
        </div>
      )}

      {notifyModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 text-center">
            <h3 className="text-lg font-bold mb-4 flex items-center justify-center gap-2 text-blue-600"><Megaphone /> Envio via Z-API</h3>
            <div className="bg-gray-900 text-green-400 p-4 rounded-lg h-40 overflow-y-auto text-xs font-mono text-left mb-4">{notifyLogs.map((log, i) => <div key={i}>{log}</div>)}</div>
            <div className="flex justify-center gap-2">
              {!notifyIsRunning && notifyCurrentIndex < notifyQueue.length ? <button onClick={() => setNotifyIsRunning(true)} className="px-8 py-2 bg-green-600 text-white rounded-lg font-bold">Iniciar Disparos</button> : <button onClick={() => setNotifyIsRunning(false)} className="px-8 py-2 bg-red-100 text-red-700 rounded-lg font-bold">Pausar</button>}
              <button onClick={() => setNotifyModalOpen(false)} className="px-4 py-2 bg-gray-100 rounded-lg">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
