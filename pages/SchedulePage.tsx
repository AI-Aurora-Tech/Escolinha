
import React, { useState, useEffect, useRef } from 'react';
import { Activity, Student, Group, User, UserRole } from '../types';
import { Calendar as CalendarIcon, Clock, CheckCircle, Users, Repeat, CheckSquare, Square, Search, User as UserIcon, XCircle, Edit, Trophy, Coins, DollarSign, Trash2, MapPin, Megaphone, X, Play, Pause, ChevronLeft, ChevronRight, PlusCircle, Medal, Printer, ChevronDown } from 'lucide-react';
import { sendZApiMessage } from '../services/zapiService';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

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

  // Notificação State
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

  const getAttendeesList = (activity: Partial<Activity>) => {
    if (activity.groupId) {
      return students.filter(s => s.groupIds?.includes(activity.groupId!) && s.active);
    }
    if (activity.participants && activity.participants.length > 0) {
      return students.filter(s => activity.participants?.includes(s.id));
    }
    return [];
  };

  const handleExportDailyReport = () => {
    if (dailyActivities.length === 0) {
      alert("Nenhuma atividade para exportar nesta data.");
      return;
    }

    const doc = new jsPDF();
    const formattedDate = formatDate(selectedDate);

    doc.setFontSize(18);
    doc.text("Garotos do Martinica - Relatório de Atividades", 14, 20);
    doc.setFontSize(11);
    doc.text(`Data: ${formattedDate}`, 14, 28);
    doc.text(`Gerado por: ${currentUser?.name || 'Sistema'} em ${new Date().toLocaleString()}`, 14, 34);

    let currentY = 45;

    dailyActivities.forEach((act, index) => {
      // Verificar se cabe na página
      if (currentY > 250) {
        doc.addPage();
        currentY = 20;
      }

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      const typeLabel = act.type === 'GAME' ? 'JOGO' : 'TREINO';
      doc.text(`${index + 1}. ${typeLabel}: ${act.title}`, 14, currentY);
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Horário: ${act.startTime} às ${act.endTime} | Local: ${act.location || 'Não informado'}`, 14, currentY + 6);
      
      if (act.type === 'GAME') {
        const score = act.homeScore !== undefined ? `${act.homeScore} x ${act.awayScore}` : 'Sem placar';
        doc.text(`Adversário: ${act.opponent || 'N/A'} | Placar: ${score}`, 14, currentY + 11);
        currentY += 16;
      } else {
        currentY += 12;
      }

      const attendees = getAttendeesList(act);
      const tableRows = attendees.map(s => [
        s.name,
        act.attendance.includes(s.id) ? "PRESENTE" : "AUSENTE",
        act.type === 'GAME' && act.fee ? (act.feePayments?.includes(s.id) ? "PAGO" : "PENDENTE") : "N/A"
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [['Atleta', 'Presença', 'Taxa']],
        body: tableRows,
        margin: { left: 14 },
        theme: 'grid',
        headStyles: { fillColor: act.type === 'GAME' ? [234, 88, 12] : [59, 130, 246] },
        styles: { fontSize: 8 }
      });

      currentY = (doc as any).lastAutoTable.finalY + 15;
    });

    doc.save(`Relatorio_Martinica_${selectedDate}.pdf`);
  };

  const toggleStudentSelection = (id: string) => {
    const newSet = new Set(selectedStudentIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedStudentIds(newSet);
  };

  const handleOpenAdd = () => {
    setEditingId(null);
    setNewActivity({
      title: '', type: 'TRAINING', fee: 0, location: '', date: selectedDate, startTime: '14:00', endTime: '15:30', 
      groupId: '', participants: [], recurrence: 'none', attendance: [], feePayments: [], presentationTime: '',
      opponent: '', homeScore: 0, awayScore: 0, scorers: []
    });
    setTargetType('GROUP');
    setSelectedStudentIds(new Set());
    setShowAddModal(true);
  };

  const handleOpenEdit = (e: React.MouseEvent, act: Activity) => {
    e.stopPropagation();
    setEditingId(act.id);
    // Garantir que campos numéricos não venham nulos
    setNewActivity({
      ...act,
      homeScore: act.homeScore ?? 0,
      awayScore: act.awayScore ?? 0,
      fee: act.fee ?? 0,
      scorers: act.scorers || []
    });
    const isIndividual = !!(act.participants && act.participants.length > 0);
    setTargetType(isIndividual ? 'INDIVIDUAL' : 'GROUP');
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

  const handleOpenNotify = (e: React.MouseEvent, activity: Activity) => {
    e.stopPropagation();
    const targets = getAttendeesList(activity);
    if (targets.length === 0) {
      alert("Nenhum atleta convocado para esta atividade.");
      return;
    }
    setNotifyActivity(activity);
    setNotifyQueue(targets);
    setNotifyCurrentIndex(0);
    setNotifyLogs([`Iniciando disparos para ${targets.length} atletas...`]);
    setNotifyModalOpen(true);
    setNotifyIsRunning(false);
  };

  useEffect(() => {
    if (!notifyModalOpen || !notifyIsRunning || !notifyActivity) return;
    if (notifyCurrentIndex >= notifyQueue.length) {
      setNotifyIsRunning(false);
      setNotifyLogs(prev => ["✅ Finalizado com sucesso!", ...prev]);
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
          `*CONVOCAÇÃO: ${type}*\n` +
          `Atleta: *${student.name}*\n\n` +
          `📌 *${notifyActivity.title}*\n` +
          `📅 Data: ${formatDate(notifyActivity.date)}\n` +
          `⏰ Horário: ${notifyActivity.startTime} às ${notifyActivity.endTime}\n`;

      if (notifyActivity.type === 'GAME') {
        if (notifyActivity.opponent) msg += `⚔️ Adversário: ${notifyActivity.opponent}\n`;
        if (notifyActivity.presentationTime) msg += `🕒 Apresentação: ${notifyActivity.presentationTime}\n`;
        if (notifyActivity.fee && notifyActivity.fee > 0) msg += `💰 Taxa: R$ ${notifyActivity.fee.toFixed(2)}\n`;
      }

      if (notifyActivity.location) msg += `📍 Local: ${notifyActivity.location}\n`;
      msg += `\nFavor confirmar presença. Obrigado!`;

      const sent = await sendZApiMessage(phone, msg);
      setNotifyLogs(prev => [`${sent ? '✅' : '⚠️'} ${student.name}`, ...prev]);
      if (!sent) window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    }
    setNotifyCurrentIndex(prev => prev + 1);
    setNotifyCountdown(5);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Agenda Garotos do Martinica</h2>
        {!isGuardian && (
          <div className="flex gap-2 w-full sm:w-auto">
            <button 
              onClick={handleExportDailyReport}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-gray-100 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-200 transition-all text-sm font-bold border border-gray-200"
            >
              <Printer className="w-4 h-4" /> Relatório do Dia
            </button>
            <button onClick={handleOpenAdd} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 shadow-lg transition-all text-sm font-bold">
              <PlusCircle className="w-5 h-5" /> Agendar Atividade
            </button>
          </div>
        )}
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between gap-4">
        <button onClick={() => { const d = new Date(selectedDate + 'T00:00:00'); d.setDate(d.getDate()-1); setSelectedDate(d.toISOString().split('T')[0]); }} className="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition-colors"><ChevronLeft /></button>
        
        {/* Seletor de Data por Calendário */}
        <div className="relative group cursor-pointer flex flex-col items-center">
          <input 
            type="date" 
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10" 
            value={selectedDate} 
            onChange={(e) => setSelectedDate(e.target.value)}
          />
          <div className="flex flex-col items-center group-hover:bg-gray-50 px-6 py-1 rounded-xl transition-all border border-transparent group-hover:border-gray-100">
            <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest flex items-center gap-1.5 mb-1">
              <CalendarIcon className="w-3 h-3 text-primary-500" /> Selecionar Data
            </span>
            <span className="text-xl font-black text-primary-600 flex items-center gap-2">
              {formatDate(selectedDate)}
              <ChevronDown className="w-4 h-4 text-gray-300 group-hover:text-primary-400 transition-colors" />
            </span>
          </div>
        </div>

        <button onClick={() => { const d = new Date(selectedDate + 'T00:00:00'); d.setDate(d.getDate()+1); setSelectedDate(d.toISOString().split('T')[0]); }} className="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition-colors"><ChevronRight /></button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {dailyActivities.map(act => (
            <div key={act.id} onClick={() => setSelectedActivityId(act.id)} className={`bg-white p-5 rounded-2xl border transition-all cursor-pointer hover:shadow-xl ${selectedActivityId === act.id ? 'border-primary-500 ring-2 ring-primary-500/20' : 'border-gray-100 shadow-sm'}`}>
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${act.type === 'GAME' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                      {act.type === 'GAME' ? 'Jogo' : 'Treino'}
                    </span>
                    {act.recurrence === 'weekly' && <span title="Repete semanalmente"><Repeat className="w-3 h-3 text-gray-400" /></span>}
                  </div>
                  <h4 className="font-bold text-lg flex items-center gap-2 text-gray-900">
                    {act.type === 'GAME' ? <Trophy className="w-5 h-5 text-yellow-500" /> : <CalendarIcon className="w-5 h-5 text-primary-500" />}
                    {act.title}
                  </h4>
                  {act.type === 'GAME' && act.opponent && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center gap-4">
                       <div className="text-center px-4 border-r"><span className="text-[10px] uppercase font-bold text-gray-400 block">Garotos</span><span className="text-xl font-black text-primary-600">{act.homeScore ?? 0}</span></div>
                       <div className="text-xs font-bold text-gray-400">VS</div>
                       <div className="flex-1">
                          <span className="text-[10px] uppercase font-bold text-gray-400 block">Adversário</span>
                          <span className="text-sm font-bold text-gray-800">{act.opponent}</span>
                       </div>
                       <div className="text-center px-4 border-l"><span className="text-[10px] uppercase font-bold text-gray-400 block">Eles</span><span className="text-xl font-black text-gray-700">{act.awayScore ?? 0}</span></div>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-4 mt-4 text-xs font-bold text-gray-500">
                    <span className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded"><Clock className="w-3.5 h-3.5" /> {act.startTime} - {act.endTime}</span>
                    {act.presentationTime && <span className="flex items-center gap-1 bg-orange-50 text-orange-600 px-2 py-1 rounded"><MapPin className="w-3.5 h-3.5" /> Chegar: {act.presentationTime}</span>}
                    {act.fee && act.fee > 0 && <span className="flex items-center gap-1 bg-green-50 text-green-700 px-2 py-1 rounded"><Coins className="w-3.5 h-3.5" /> Taxa: R$ {act.fee.toFixed(2)}</span>}
                  </div>
                </div>
                {!isGuardian && (
                  <div className="flex flex-col gap-2">
                    <button onClick={(e) => handleOpenNotify(e, act)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 shadow-sm" title="Disparar via WhatsApp"><Megaphone className="w-5 h-5" /></button>
                    <button onClick={(e) => handleOpenEdit(e, act)} className="p-2 bg-gray-50 text-gray-500 rounded-lg hover:bg-gray-100 shadow-sm" title="Editar"><Edit className="w-5 h-5" /></button>
                    <button onClick={(e) => { e.stopPropagation(); if(confirm('Excluir atividade?')) onDeleteActivity?.(act.id); }} className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 shadow-sm" title="Excluir"><Trash2 className="w-5 h-5" /></button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {dailyActivities.length === 0 && <div className="p-20 text-center text-gray-400 bg-white rounded-2xl border-2 border-dashed border-gray-100 flex flex-col items-center gap-4"><CalendarIcon className="w-16 h-16 opacity-10" /><p className="font-medium text-gray-400 italic">Nenhuma atividade agendada para hoje.</p></div>}
        </div>

        {/* Painel de Presença e Taxas */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden h-fit sticky top-6">
          <div className="p-5 border-b bg-gray-50">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
               <CheckSquare className="w-5 h-5 text-primary-600" /> 
               {selectedActivity ? 'Chamada & Taxas' : 'Lista de Presença'}
            </h3>
            <p className="text-[10px] text-gray-400 uppercase font-bold mt-1 tracking-tighter">{selectedActivity?.title || 'Selecione ao lado'}</p>
          </div>
          <div className="p-2 max-h-[600px] overflow-y-auto">
            {selectedActivity ? (
              getAttendeesList(selectedActivity).map(s => {
                const isPresent = selectedActivity.attendance.includes(s.id);
                const isPaid = selectedActivity.feePayments?.includes(s.id);
                const goalCount = selectedActivity.scorers?.filter(id => id === s.id).length || 0;
                
                return (
                  <div key={s.id} className="flex flex-col p-3 hover:bg-gray-50 rounded-xl transition-all border-b border-gray-50 last:border-0">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                        <span className="text-sm font-bold text-gray-800 flex items-center gap-1">
                            {s.name}
                            {goalCount > 0 && <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1 rounded-full font-black">⚽ {goalCount}</span>}
                        </span>
                        <span className="text-[9px] text-gray-400 font-medium">Resp: {s.guardian.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                        {selectedActivity.type === 'GAME' && (selectedActivity.fee || 0) > 0 && (
                            <button 
                                onClick={() => onUpdateFeePayment?.(selectedActivity.id, s.id)}
                                disabled={isGuardian}
                                className={`p-2 rounded-lg transition-all ${isPaid ? 'bg-green-100 text-green-700' : 'bg-orange-50 text-orange-300'}`}
                                title={isPaid ? 'Taxa Paga' : 'Pendente de Pagamento'}
                            >
                                <DollarSign className="w-5 h-5" />
                            </button>
                        )}
                        <button 
                            onClick={() => onUpdateAttendance(selectedActivity.id, s.id)} 
                            disabled={isGuardian}
                            className={`p-2 rounded-lg transition-all ${isPresent ? 'bg-green-600 text-white shadow-md' : 'bg-gray-100 text-gray-300'}`}
                            title={isPresent ? 'Presente' : 'Ausente'}
                        >
                            <CheckCircle className="w-5 h-5" />
                        </button>
                        </div>
                    </div>

                    {/* Controle de Gols no Card da Chamada */}
                    {selectedActivity.type === 'GAME' && isPresent && !isGuardian && (
                         <div className="mt-3 flex items-center justify-end gap-3 pt-2 border-t border-dashed border-gray-200">
                             <span className="text-[10px] font-black uppercase text-gray-400 tracking-tighter mr-2">Registrar Gols:</span>
                             <div className="flex items-center gap-2 bg-yellow-50 rounded-lg p-1 border border-yellow-100">
                                 <button 
                                    onClick={() => {
                                        const scorers = selectedActivity.scorers || [];
                                        const idx = scorers.indexOf(s.id);
                                        if (idx > -1) {
                                            const next = [...scorers];
                                            next.splice(idx, 1);
                                            onUpdateActivity({ ...selectedActivity, scorers: next });
                                        }
                                    }}
                                    className="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm text-yellow-700 font-black hover:bg-yellow-100 disabled:opacity-30"
                                    disabled={goalCount === 0}
                                 >
                                    -
                                 </button>
                                 <span className="text-xs font-black text-yellow-900 w-4 text-center">{goalCount}</span>
                                 <button 
                                    onClick={() => {
                                        const next = [...(selectedActivity.scorers || []), s.id];
                                        onUpdateActivity({ ...selectedActivity, scorers: next });
                                    }}
                                    className="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm text-yellow-700 font-black hover:bg-yellow-100"
                                 >
                                    +
                                 </button>
                             </div>
                         </div>
                    )}
                  </div>
                );
              })
            ) : <div className="text-center py-12 px-6 text-gray-300 flex flex-col items-center gap-2"><Users className="w-12 h-12 opacity-10" /><p className="text-xs font-bold italic">Selecione uma atividade para gerenciar presença e pagamentos.</p></div>}
          </div>
        </div>
      </div>

      {/* Modal de Agendamento */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8 my-8 relative animate-in zoom-in duration-200">
            <button onClick={() => setShowAddModal(false)} className="absolute top-6 right-6 text-gray-400 hover:text-gray-600"><X /></button>
            <h3 className="text-xl font-black mb-8 text-gray-900 border-b pb-4 flex items-center gap-2">
              <PlusCircle className="text-primary-600" /> {editingId ? 'Alterar Atividade' : 'Nova Atividade'}
            </h3>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-xs font-black uppercase text-gray-400 mb-2">Tipo de Evento</label>
                <div className="grid grid-cols-2 gap-4">
                  <button type="button" onClick={() => setNewActivity({...newActivity, type: 'TRAINING'})} className={`py-3 rounded-2xl border-2 font-bold transition-all ${newActivity.type === 'TRAINING' ? 'bg-blue-50 border-blue-600 text-blue-700' : 'bg-white border-gray-100 text-gray-400'}`}>Treino</button>
                  <button type="button" onClick={() => setNewActivity({...newActivity, type: 'GAME'})} className={`py-3 rounded-2xl border-2 font-bold transition-all ${newActivity.type === 'GAME' ? 'bg-orange-50 border-orange-600 text-orange-700' : 'bg-white border-gray-100 text-gray-400'}`}>Jogo</button>
                </div>
              </div>

              <div><label className="block text-xs font-black uppercase text-gray-400 mb-1">Título</label><input required className="w-full border-2 border-gray-100 rounded-xl p-3 focus:border-primary-500 outline-none font-medium" value={newActivity.title} onChange={e => setNewActivity({...newActivity, title: e.target.value})} placeholder="Ex: Treino de Finalização" /></div>
              
              {newActivity.type === 'GAME' && (
                <div className="bg-orange-50 p-6 rounded-2xl space-y-4 border border-orange-100">
                  <div><label className="block text-[10px] font-black uppercase text-orange-800 mb-1">Adversário</label><input className="w-full border-0 rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-orange-500" value={newActivity.opponent} onChange={e => setNewActivity({...newActivity, opponent: e.target.value})} placeholder="Nome do Clube/Escolinha" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-[10px] font-black uppercase text-orange-800 mb-1">Apresentação</label><input type="time" className="w-full border-0 rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-orange-500" value={newActivity.presentationTime} onChange={e => setNewActivity({...newActivity, presentationTime: e.target.value})} /></div>
                    <div><label className="block text-[10px] font-black uppercase text-orange-800 mb-1">Taxa por Atleta</label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-400 font-bold text-xs">R$</span><input type="number" step="0.01" className="w-full border-0 rounded-xl p-3 pl-8 text-sm font-bold focus:ring-2 focus:ring-orange-500" value={newActivity.fee} onChange={e => setNewActivity({...newActivity, fee: parseFloat(e.target.value) || 0})} /></div></div>
                  </div>
                  
                  <div className="pt-2 border-t border-orange-200/50">
                    <label className="block text-[10px] font-black uppercase text-orange-800 mb-2">Placar Final</label>
                    <div className="flex items-center justify-center gap-4">
                      <div className="flex-1 text-center">
                        <span className="text-[9px] font-bold text-orange-600 uppercase block mb-1">Garotos</span>
                        <input 
                          type="number" 
                          className="w-full border-0 rounded-xl p-3 text-center text-xl font-black bg-white focus:ring-2 focus:ring-orange-500 shadow-sm" 
                          value={newActivity.homeScore ?? 0} 
                          onChange={e => {
                            const val = parseInt(e.target.value) || 0;
                            setNewActivity({...newActivity, homeScore: val, scorers: (newActivity.scorers || []).slice(0, val)});
                          }} 
                        />
                      </div>
                      <div className="text-orange-300 font-black text-xl self-end mb-3">X</div>
                      <div className="flex-1 text-center">
                        <span className="text-[9px] font-bold text-orange-600 uppercase block mb-1">Eles</span>
                        <input 
                          type="number" 
                          className="w-full border-0 rounded-xl p-3 text-center text-xl font-black bg-white focus:ring-2 focus:ring-orange-500 shadow-sm" 
                          value={newActivity.awayScore ?? 0} 
                          onChange={e => setNewActivity({...newActivity, awayScore: parseInt(e.target.value) || 0})} 
                        />
                      </div>
                    </div>
                  </div>

                  {/* Campo dinâmico para indicar quem fez os gols */}
                  {newActivity.homeScore !== undefined && newActivity.homeScore > 0 && (
                    <div className="mt-4 pt-4 border-t border-orange-200/50">
                      <label className="block text-[10px] font-black uppercase text-orange-800 mb-2">Quem marcou os gols?</label>
                      <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-1">
                        {Array.from({ length: newActivity.homeScore }).map((_, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="text-[9px] font-bold text-orange-400 w-12 shrink-0">Gol {idx + 1}:</span>
                            <select 
                              className="flex-1 border-0 rounded-xl p-2 text-xs font-bold bg-white focus:ring-2 focus:ring-orange-500 shadow-sm"
                              value={newActivity.scorers?.[idx] || ''}
                              onChange={(e) => {
                                const newScorers = [...(newActivity.scorers || [])];
                                newScorers[idx] = e.target.value;
                                setNewActivity({...newActivity, scorers: newScorers});
                              }}
                            >
                              <option value="">Selecione o artilheiro...</option>
                              {getAttendeesList(newActivity).map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-black uppercase text-gray-400 mb-1">Data</label><input type="date" required className="w-full border-2 border-gray-100 rounded-xl p-3 text-sm font-bold" value={newActivity.date} onChange={e => setNewActivity({...newActivity, date: e.target.value})} /></div>
                <div><label className="block text-xs font-black uppercase text-gray-400 mb-1">Horário Início</label><input type="time" required className="w-full border-2 border-gray-100 rounded-xl p-3 text-sm font-bold" value={newActivity.startTime} onChange={e => setNewActivity({...newActivity, startTime: e.target.value})} /></div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-gray-400 mb-2">Convocação / Alvos</label>
                <div className="bg-gray-50 p-4 rounded-2xl space-y-4">
                   <div className="flex gap-2 p-1 bg-white rounded-xl border border-gray-100 shadow-sm">
                      <button type="button" onClick={() => setTargetType('GROUP')} className={`flex-1 py-2 text-xs font-black uppercase rounded-lg transition-all ${targetType === 'GROUP' ? 'bg-primary-600 text-white' : 'text-gray-400'}`}>Por Grupo</button>
                      <button type="button" onClick={() => setTargetType('INDIVIDUAL')} className={`flex-1 py-2 text-xs font-black uppercase rounded-lg transition-all ${targetType === 'INDIVIDUAL' ? 'bg-primary-600 text-white' : 'text-gray-400'}`}>Individual</button>
                   </div>
                   
                   {targetType === 'GROUP' ? (
                      <select className="w-full border-2 border-gray-100 rounded-xl p-3 bg-white text-sm font-bold" value={newActivity.groupId} onChange={e => setNewActivity({...newActivity, groupId: e.target.value})}>
                        <option value="">Escolher Grupo...</option>
                        {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                   ) : (
                      <div className="space-y-2">
                        <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" /><input type="text" placeholder="Filtrar atletas..." className="w-full pl-10 pr-4 py-2 text-xs border rounded-xl" value={studentSearch} onChange={e => setStudentSearch(e.target.value)} /></div>
                        <div className="max-h-40 overflow-y-auto border rounded-xl p-2 bg-white grid grid-cols-1 gap-1">
                          {students.filter(s => s.name.toLowerCase().includes(studentSearch.toLowerCase())).map(s => (
                            <button key={s.id} type="button" onClick={() => toggleStudentSelection(s.id)} className={`flex items-center gap-2 p-2 rounded-lg text-xs font-bold transition-all ${selectedStudentIds.has(s.id) ? 'bg-primary-50 text-primary-700' : 'text-gray-500 hover:bg-gray-50'}`}>
                              {selectedStudentIds.has(s.id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />} {s.name}
                            </button>
                          ))}
                        </div>
                        <p className="text-[10px] text-gray-400 text-right font-bold">{selectedStudentIds.size} atletas selecionados</p>
                      </div>
                   )}
                </div>
              </div>

              <div className="pt-6 border-t flex justify-end gap-3">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-6 py-3 border-2 border-gray-100 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-all">Cancelar</button>
                <button type="submit" className="px-10 py-3 bg-primary-600 text-white rounded-xl font-black shadow-xl shadow-primary-500/20 hover:bg-primary-700 hover:scale-[1.02] active:scale-95 transition-all">Salvar Agendamento</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Disparos Z-API */}
      {notifyModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 text-center animate-in slide-in-from-bottom-4 duration-300">
            <div className="bg-blue-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
               <Megaphone className="w-10 h-10 text-blue-600" />
            </div>
            <h3 className="text-xl font-black mb-2 text-gray-900">Comunicado WhatsApp</h3>
            <p className="text-sm text-gray-500 mb-8 font-medium">Os responsáveis receberão os detalhes da convocação diretamente via Z-API.</p>
            
            <div className="bg-gray-900 text-green-400 p-4 rounded-2xl h-48 overflow-y-auto text-[10px] font-mono text-left mb-6 shadow-inner border border-gray-700">
              {notifyLogs.map((log, i) => <div key={i} className="mb-1">{log}</div>)}
              {notifyIsRunning && <div className="animate-pulse">_</div>}
            </div>
            
            <div className="flex flex-col gap-3">
              {!notifyIsRunning && notifyCurrentIndex < notifyQueue.length ? (
                <button onClick={() => setNotifyIsRunning(true)} className="w-full py-4 bg-green-600 text-white rounded-2xl font-black shadow-lg shadow-green-200 hover:bg-green-700 transition-all">Começar Envio</button>
              ) : notifyIsRunning ? (
                <button onClick={() => setNotifyIsRunning(false)} className="w-full py-4 bg-red-100 text-red-700 rounded-2xl font-black hover:bg-red-200 transition-all">Pausar Disparos</button>
              ) : (
                <div className="py-4 bg-green-100 text-green-700 rounded-2xl font-black">Disparos Concluídos</div>
              )}
              <button onClick={() => setNotifyModalOpen(false)} className="w-full py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-2xl transition-all">Fechar Janela</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
