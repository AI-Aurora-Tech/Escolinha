import React, { useState, useEffect, useRef } from 'react';
import { Activity, Student, Group, User, UserRole } from '../types';
import { Calendar as CalendarIcon, Clock, CheckCircle, Users, Repeat, CheckSquare, Square, Search, User as UserIcon, FileText, XCircle, Edit, Trophy, Coins, DollarSign, Trash2, MapPin, Megaphone, X, Play, Pause, Zap, ChevronLeft, ChevronRight, Filter, Minus, PlusCircle, Medal } from 'lucide-react';
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
  // --- DATE SELECTION STATE ---
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [targetType, setTargetType] = useState<'GROUP' | 'INDIVIDUAL'>('GROUP');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [studentSearch, setStudentSearch] = useState('');
  const [hasFee, setHasFee] = useState(false);

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
      date: new Date().toISOString().split('T')[0],
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

  // Filter activities by the SELECTED DATE
  const dailyActivities = activities
    .filter(a => a.date === selectedDate)
    .sort((a, b) => new Date(a.date + 'T' + a.startTime).getTime() - new Date(b.date + 'T' + b.startTime).getTime());

  // Keep full sorted list for Report Export if needed, or filter report by day/month later
  const allSortedActivities = [...activities].sort((a, b) => {
      return new Date(a.date + 'T' + a.startTime).getTime() - new Date(b.date + 'T' + b.startTime).getTime();
  });

  const filteredStudents = students.filter(s => 
    s.active && 
    (s.name.toLowerCase().includes(studentSearch.toLowerCase()) || 
     s.guardian.name.toLowerCase().includes(studentSearch.toLowerCase()))
  );

  // Helper para formatar data sem fuso horário
  const formatDate = (dateString: string) => {
      if (!dateString) return '';
      const parts = dateString.split('-');
      if (parts.length === 3) {
          return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return dateString;
  };

  const handleNavigateDate = (days: number) => {
      const current = new Date(selectedDate + 'T00:00:00');
      current.setDate(current.getDate() + days);
      setSelectedDate(current.toISOString().split('T')[0]);
      setSelectedActivityId(null); // Clear selection when changing days
  };

  const handleGoToday = () => {
      setSelectedDate(new Date().toISOString().split('T')[0]);
      setSelectedActivityId(null);
  };

  const toggleStudentSelection = (id: string) => {
      const newSet = new Set(selectedStudentIds);
      if (newSet.has(id)) {
          newSet.delete(id);
      } else {
          newSet.add(id);
      }
      setSelectedStudentIds(newSet);
  };

  const handleOpenAdd = () => {
      setEditingId(null);
      setNewActivity({
          title: '',
          type: 'TRAINING',
          fee: 0,
          location: '',
          date: selectedDate, // Use currently selected date
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
      setTargetType('GROUP');
      setSelectedStudentIds(new Set());
      setStudentSearch('');
      setHasFee(false);
      setShowAddModal(true);
  }

  const handleOpenEdit = (e: React.MouseEvent, activity: Activity) => {
      e.stopPropagation(); 
      setEditingId(activity.id);
      setNewActivity({
          title: activity.title,
          type: activity.type || 'TRAINING',
          fee: activity.fee || 0,
          location: activity.location || '',
          date: activity.date,
          startTime: activity.startTime,
          endTime: activity.endTime,
          groupId: activity.groupId || '',
          participants: activity.participants || [],
          recurrence: activity.recurrence || 'none',
          attendance: activity.attendance,
          feePayments: activity.feePayments || [],
          presentationTime: activity.presentationTime || '',
          opponent: activity.opponent || '',
          homeScore: activity.homeScore,
          awayScore: activity.awayScore,
          scorers: activity.scorers || []
      });

      if (activity.participants && activity.participants.length > 0) {
          setTargetType('INDIVIDUAL');
          setSelectedStudentIds(new Set(activity.participants));
      } else {
          setTargetType('GROUP');
          setSelectedStudentIds(new Set());
      }
      
      setHasFee(!!activity.fee && activity.fee > 0);
      setStudentSearch('');
      setShowAddModal(true);
  };

  const handleDelete = (e: React.MouseEvent, activityId: string) => {
      e.stopPropagation();
      if (confirm('Tem certeza que deseja excluir esta atividade?')) {
          if (onDeleteActivity) {
              onDeleteActivity(activityId);
          }
          if (selectedActivityId === activityId) {
              setSelectedActivityId(null);
          }
      }
  };

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      
      const activityData = {
          ...newActivity,
          fee: hasFee ? newActivity.fee : 0,
          groupId: targetType === 'GROUP' ? newActivity.groupId : undefined,
          participants: targetType === 'INDIVIDUAL' ? Array.from(selectedStudentIds) : [],
          // Clean up scores if not game
          homeScore: newActivity.type === 'GAME' ? newActivity.homeScore : 0,
          awayScore: newActivity.type === 'GAME' ? newActivity.awayScore : 0,
          opponent: newActivity.type === 'GAME' ? newActivity.opponent : '',
          scorers: newActivity.type === 'GAME' ? newActivity.scorers : [],
          presentationTime: newActivity.type === 'GAME' ? newActivity.presentationTime : ''
      };

      if(activityData.title && (activityData.groupId || activityData.participants?.length)) {
          if (editingId) {
              onUpdateActivity({ ...activityData, id: editingId } as Activity);
          } else {
              onAddActivity(activityData as Omit<Activity, 'id'>);
          }
          setShowAddModal(false);
      } else {
          alert("Preencha o título e selecione um grupo ou alunos participantes.");
      }
  };

  const getAttendeesList = (activity: Activity) => {
      if (activity.groupId) {
          return students.filter(s => s.groupId === activity.groupId && s.active);
      }
      if (activity.participants && activity.participants.length > 0) {
          return students.filter(s => activity.participants?.includes(s.id));
      }
      return [];
  };

  // --- NOTIFICATION LOGIC ---
  const handleOpenNotify = (e: React.MouseEvent, activity: Activity) => {
      e.stopPropagation();
      const targetStudents = getAttendeesList(activity);
      
      if (targetStudents.length === 0) {
          alert("Não há alunos vinculados a esta atividade.");
          return;
      }

      const typeLabel = activity.type === 'GAME' ? 'Convocação para Jogo' : 'Lembrete de Treino';
      
      if (confirm(`Deseja enviar ${typeLabel} para ${targetStudents.length} atletas via WhatsApp?\n\nO sistema abrirá uma janela por vez com intervalo de 10 segundos.`)) {
          setNotifyActivity(activity);
          setNotifyQueue(targetStudents);
          setNotifyCurrentIndex(0);
          setNotifyIsRunning(true);
          setNotifyModalOpen(true);
          setNotifyLogs([`Iniciando envio para ${targetStudents.length} atletas...`]);
          setNotifyCountdown(1);
      }
  };

  useEffect(() => {
      if (!notifyModalOpen || !notifyIsRunning || !notifyActivity) {
          if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
          return;
      }

      if (notifyCurrentIndex >= notifyQueue.length) {
          setNotifyIsRunning(false);
          setNotifyLogs(prev => [...prev, "✅ Todos os comunicados foram enviados!"]);
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
  }, [notifyModalOpen, notifyIsRunning, notifyCountdown, notifyCurrentIndex, notifyQueue, notifyActivity]);

  const processNotifyItem = (student: Student) => {
      if (!notifyActivity) return;

      const phone = student.guardian.phone.replace(/\D/g, '');
      
      if (phone) {
          const type = notifyActivity.type === 'GAME' ? 'JOGO' : 'TREINO';
          const emoji = notifyActivity.type === 'GAME' ? '🏆' : '⚽';
          const date = formatDate(notifyActivity.date);
          
          let message = `Olá ${student.guardian.name}, aqui é da Escolinha Garotos do Martinica! ${emoji}\n\n` +
              `*COMUNICADO: ${type}*\n` +
              `Atleta: *${student.name}*\n\n` +
              `📌 *${notifyActivity.title}*\n` +
              `📅 Data: ${date}\n` +
              `⏰ Horário: ${notifyActivity.startTime} às ${notifyActivity.endTime}\n`;

          if (notifyActivity.type === 'GAME') {
              if (notifyActivity.opponent) message += `⚔️ Adversário: ${notifyActivity.opponent}\n`;
              if (notifyActivity.presentationTime) message += `🕒 Chegar às: ${notifyActivity.presentationTime}\n`;
          }

          if (notifyActivity.location) {
              message += `📍 Local: ${notifyActivity.location}\n`;
          }

          if (notifyActivity.type === 'GAME' && notifyActivity.fee && notifyActivity.fee > 0) {
              message += `💰 Taxa: R$ ${notifyActivity.fee.toFixed(2)}\n`;
          }

          message += `\nContamos com a presença! Por favor, confirme.\nObrigado!`;
          
          const encodedMessage = encodeURIComponent(message);
          const url = `https://wa.me/55${phone}?text=${encodedMessage}`;
          
          const win = window.open(url, '_blank');
          if (win) {
              setNotifyLogs(prev => [`✅ Enviado para ${student.name}`, ...prev]);
          } else {
              setNotifyLogs(prev => [`⚠️ Pop-up bloqueado para ${student.name}`, ...prev]);
          }
      } else {
          setNotifyLogs(prev => [`❌ Sem telefone para ${student.name}`, ...prev]);
      }

      setNotifyCurrentIndex(prev => prev + 1);
      setNotifyCountdown(10); // 10s delay for next
  };


  const handleExportAttendanceReport = () => {
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text('Relatório Geral de Frequência', 14, 20);
      doc.setFontSize(10);
      doc.text(`Gerado em: ${new Date().toLocaleDateString()}`, 14, 28);

      const reportRows: any[] = [];
      const activitiesToExport = allSortedActivities; // Use All Sorted for Global Report

      activitiesToExport.forEach(activity => {
          const expectedStudents = getAttendeesList(activity);
          const isPast = new Date(activity.date + 'T' + activity.endTime) <= new Date();

          expectedStudents.forEach(student => {
              const isPresent = activity.attendance.includes(student.id);
              const groupName = groups.find(g => g.id === activity.groupId)?.name || 'Individual';
              const type = activity.type === 'GAME' ? 'JOGO' : 'TREINO';
              
              let status = isPresent ? 'PRESENTE' : 'AUSENTE';
              if (!isPast && !isPresent) status = 'AGENDADO';

              reportRows.push([
                  formatDate(activity.date),
                  `${type}: ${activity.title}`,
                  groupName,
                  student.name,
                  status
              ]);
          });
      });

      if (reportRows.length === 0) {
          alert("Não há dados de atividades para exportar.");
          return;
      }

      autoTable(doc, {
          startY: 35,
          head: [['Data', 'Atividade', 'Grupo/Tipo', 'Aluno', 'Status']],
          body: reportRows,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [249, 115, 22] }, // Orange-500
          didParseCell: (data) => {
              if (data.section === 'body' && data.column.index === 4) {
                  const status = data.cell.raw;
                  if (status === 'AUSENTE') {
                      data.cell.styles.textColor = [220, 38, 38];
                      data.cell.styles.fontStyle = 'bold';
                  } else if (status === 'PRESENTE') {
                      data.cell.styles.textColor = [22, 163, 74];
                  } else {
                      data.cell.styles.textColor = [100, 116, 139];
                  }
              }
          }
      });

      doc.save('Relatorio_Presenca_Geral.pdf');
  };
  
  // Cálculo do total arrecadado na atividade selecionada
  const calculateTotalCollected = (activity: Activity) => {
      if (!activity.fee || activity.fee <= 0 || !activity.feePayments) return 0;
      return activity.feePayments.length * activity.fee;
  };

  const dayOfWeekNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const getDayName = (dateStr: string) => {
      const d = new Date(dateStr + 'T00:00:00');
      return dayOfWeekNames[d.getDay()];
  };

  // Helper for adding scorer
  const addScorer = (studentId: string) => {
      const current = newActivity.scorers || [];
      setNewActivity({ ...newActivity, scorers: [...current, studentId] });
  };

  const removeScorer = (indexToRemove: number) => {
      const current = newActivity.scorers || [];
      setNewActivity({ ...newActivity, scorers: current.filter((_, idx) => idx !== indexToRemove) });
  };

  // Get eligible students for scoring (those in the group/participants)
  const getEligibleScorers = () => {
      if (targetType === 'GROUP' && newActivity.groupId) {
          return students.filter(s => s.groupId === newActivity.groupId && s.active);
      } else if (targetType === 'INDIVIDUAL') {
          return students.filter(s => selectedStudentIds.has(s.id));
      }
      return [];
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Agenda de Atividades</h2>
        {!isGuardian && (
            <div className="flex gap-2 w-full md:w-auto">
                <button 
                    onClick={handleExportAttendanceReport}
                    className="flex-1 md:flex-none justify-center flex items-center gap-2 bg-white text-gray-700 border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 shadow-sm transition-colors text-sm"
                >
                    <FileText className="w-4 h-4" />
                    Relatório
                </button>
                <button 
                    onClick={handleOpenAdd}
                    className="flex-1 md:flex-none justify-center flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 shadow-sm transition-colors text-sm"
                >
                    <CalendarIcon className="w-4 h-4" />
                    Agendar
                </button>
            </div>
        )}
      </div>

      {/* --- DATE NAVIGATION BAR --- */}
      <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 w-full sm:w-auto">
              <button 
                onClick={() => handleNavigateDate(-1)} 
                className="p-2 hover:bg-gray-100 rounded-lg text-gray-600"
                title="Dia Anterior"
              >
                  <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-gray-50 px-4 py-2 rounded-lg border border-gray-200 min-w-[200px]">
                  <CalendarIcon className="w-4 h-4 text-primary-600" />
                  <input 
                      type="date" 
                      className="bg-transparent outline-none text-gray-800 font-medium text-sm"
                      value={selectedDate}
                      onChange={(e) => {
                          if (e.target.value) {
                              setSelectedDate(e.target.value);
                              setSelectedActivityId(null);
                          }
                      }}
                  />
                  <span className="text-xs text-gray-400 font-normal">| {getDayName(selectedDate)}</span>
              </div>
              <button 
                onClick={() => handleNavigateDate(1)} 
                className="p-2 hover:bg-gray-100 rounded-lg text-gray-600"
                title="Próximo Dia"
              >
                  <ChevronRight className="w-5 h-5" />
              </button>
          </div>
          <button 
            onClick={handleGoToday}
            className="text-sm text-primary-600 font-medium hover:bg-primary-50 px-3 py-1.5 rounded-lg transition-colors"
          >
              Ir para Hoje
          </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity List */}
        <div className="lg:col-span-2 space-y-4">
            {dailyActivities.length > 0 ? (
                dailyActivities.map(activity => {
                    const group = groups.find(g => g.id === activity.groupId);
                    const isPast = new Date(activity.date + 'T' + activity.endTime) < new Date();
                    const participantCount = activity.groupId 
                        ? students.filter(s => s.groupId === activity.groupId).length 
                        : (activity.participants?.length || 0);
                    const isGame = activity.type === 'GAME';
                    
                    // Summarize scorers if any
                    const scorerCounts: Record<string, number> = {};
                    activity.scorers?.forEach(sid => {
                        scorerCounts[sid] = (scorerCounts[sid] || 0) + 1;
                    });
                    
                    return (
                        <div 
                            key={activity.id} 
                            className={`bg-white p-5 rounded-xl border transition-all cursor-pointer hover:shadow-md relative group ${
                                selectedActivityId === activity.id ? 'border-primary-500 ring-1 ring-primary-500' : 'border-gray-100'
                            }`}
                            onClick={() => setSelectedActivityId(activity.id)}
                        >
                            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                                <div className="flex-1">
                                    <h4 className="font-bold text-gray-900 flex items-center gap-2 flex-wrap text-lg">
                                        {isGame ? <Trophy className="w-5 h-5 text-yellow-500" /> : <CalendarIcon className="w-5 h-5 text-primary-500" />}
                                        {activity.title}
                                        {activity.recurrence === 'weekly' && (
                                            <span title="Recorrente (Semanal)" className="bg-blue-100 text-blue-700 p-1 rounded-full">
                                                <Repeat className="w-3 h-3" />
                                            </span>
                                        )}
                                    </h4>
                                    
                                    {/* Game Specific Info */}
                                    {isGame && (
                                        <div className="mt-3 p-3 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg border border-yellow-100">
                                            {activity.opponent && (
                                                <div className="font-bold text-gray-800 text-sm mb-2 flex items-center gap-2">
                                                    <span className="text-gray-500 font-normal">VS</span> {activity.opponent}
                                                </div>
                                            )}
                                            
                                            {/* Scoreboard */}
                                            {(activity.homeScore !== undefined || activity.awayScore !== undefined) && (
                                                <div className="flex items-center gap-4 mb-2">
                                                    <div className="flex flex-col items-center">
                                                        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Garotos</span>
                                                        <span className="text-2xl font-black text-primary-600">{activity.homeScore ?? 0}</span>
                                                    </div>
                                                    <span className="text-gray-400 font-light text-xl">X</span>
                                                    <div className="flex flex-col items-center">
                                                        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Adversário</span>
                                                        <span className="text-2xl font-black text-gray-700">{activity.awayScore ?? 0}</span>
                                                    </div>
                                                </div>
                                            )}
                                            
                                            {/* Scorers List */}
                                            {Object.keys(scorerCounts).length > 0 && (
                                                <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-yellow-200/50">
                                                    {Object.keys(scorerCounts).map((sid) => {
                                                        const s = students.find(stu => stu.id === sid);
                                                        if (!s) return null;
                                                        return (
                                                            <span key={sid} className="bg-white border border-yellow-200 text-yellow-800 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                                                                ⚽ {s.name.split(' ')[0]} {scorerCounts[sid] > 1 ? `(${scorerCounts[sid]})` : ''}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
                                                {activity.presentationTime && (
                                                    <div className="flex items-center gap-1 text-orange-700 font-bold bg-orange-100 px-2 py-0.5 rounded">
                                                        <Clock className="w-3 h-3" /> Chegar: {activity.presentationTime}
                                                    </div>
                                                )}
                                                {activity.fee && activity.fee > 0 && (
                                                    <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded font-bold flex items-center gap-1">
                                                        <Coins className="w-3 h-3" /> R$ {activity.fee}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {activity.location && (
                                        <div className="flex items-center gap-1 mt-2 text-xs text-gray-600">
                                            <MapPin className="w-3 h-3 text-red-500" />
                                            {activity.location}
                                        </div>
                                    )}
                                    <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-500">
                                        <span className="flex items-center gap-1 font-medium text-gray-700">
                                            <Clock className="w-4 h-4" />
                                            {activity.startTime} - {activity.endTime}
                                        </span>
                                        <span className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded-md text-gray-600 text-xs">
                                            {group ? (
                                                <>
                                                    <Users className="w-3 h-3" />
                                                    {group.name}
                                                </>
                                            ) : (
                                                <>
                                                    <UserIcon className="w-3 h-3" />
                                                    {participantCount} Convocados
                                                </>
                                            )}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 self-end sm:self-auto">
                                    <div className={`px-3 py-1 rounded-full text-xs font-semibold ${isPast ? 'bg-gray-100 text-gray-500' : 'bg-green-50 text-green-700'}`}>
                                        {isPast ? 'Concluído' : 'Agendado'}
                                    </div>
                                    {!isGuardian && (
                                        <>
                                            <button 
                                                onClick={(e) => handleOpenNotify(e, activity)}
                                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                title={isGame ? "Convocar para Jogo" : "Notificar Treino"}
                                            >
                                                <Megaphone className="w-4 h-4" />
                                            </button>
                                            <button 
                                                onClick={(e) => handleOpenEdit(e, activity)}
                                                className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-gray-50 rounded-lg transition-colors"
                                                title="Editar Atividade"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            <button 
                                                onClick={(e) => handleDelete(e, activity.id)}
                                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-gray-50 rounded-lg transition-colors"
                                                title="Excluir Atividade"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="mt-4 flex items-center gap-2 border-t border-gray-50 pt-2">
                                <div className="flex -space-x-2 overflow-hidden">
                                    {activity.attendance.slice(0, 5).map(studentId => {
                                        const st = students.find(s => s.id === studentId);
                                        if(!st) return null;
                                        return <img key={st.id} className="inline-block h-6 w-6 rounded-full ring-2 ring-white object-cover" src={st.photoUrl} alt={st.name} title={st.name} />
                                    })}
                                    {activity.attendance.length > 5 && (
                                        <div className="h-6 w-6 rounded-full bg-gray-100 ring-2 ring-white flex items-center justify-center text-[10px] font-medium text-gray-600">
                                            +{activity.attendance.length - 5}
                                        </div>
                                    )}
                                </div>
                                <span className="text-xs text-gray-500 font-medium">
                                    {activity.attendance.length > 0 ? `${activity.attendance.length} confirmados` : 'Nenhuma presença confirmada'}
                                </span>
                            </div>
                        </div>
                    );
                })
            ) : (
                <div className="bg-white p-12 rounded-xl border border-gray-100 text-center flex flex-col items-center justify-center h-64">
                    <CalendarIcon className="w-12 h-12 text-gray-300 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900">Dia Livre</h3>
                    <p className="text-gray-500">Nenhuma atividade agendada para {formatDate(selectedDate)}.</p>
                    {!isGuardian && (
                         <button 
                            onClick={handleOpenAdd}
                            className="mt-4 text-primary-600 font-medium hover:text-primary-700 hover:underline"
                        >
                            Agendar uma atividade agora
                        </button>
                    )}
                </div>
            )}
        </div>

        {/* Attendance & Fee Panel */}
        <div className="lg:col-span-1">
            {selectedActivity ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 sticky top-4 max-h-[calc(100vh-2rem)] flex flex-col">
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
                                            <img src={student.photoUrl} className="w-8 h-8 rounded-full object-cover" alt="" />
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
      </div>

      {showAddModal && !isGuardian && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
             <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
                <h3 className="text-lg font-bold mb-4">{editingId ? 'Editar Atividade' : 'Agendar Atividade'}</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    
                    {/* Tipo de Atividade */}
                    <div>
                        <label className="block text-sm font-medium mb-2">Tipo de Atividade</label>
                        <div className="flex gap-4">
                            <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${newActivity.type === 'TRAINING' ? 'bg-primary-50 border-primary-500 text-primary-700 ring-1 ring-primary-500' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                                <input type="radio" name="type" value="TRAINING" checked={newActivity.type === 'TRAINING'} onChange={() => setNewActivity({...newActivity, type: 'TRAINING'})} className="hidden" />
                                <CalendarIcon className="w-4 h-4" /> Treino
                            </label>
                            <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${newActivity.type === 'GAME' ? 'bg-yellow-50 border-yellow-500 text-yellow-700 ring-1 ring-yellow-500' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                                <input type="radio" name="type" value="GAME" checked={newActivity.type === 'GAME'} onChange={() => setNewActivity({...newActivity, type: 'GAME'})} className="hidden" />
                                <Trophy className="w-4 h-4" /> Jogo
                            </label>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Título</label>
                        <input className="w-full border rounded-lg p-2" type="text" placeholder={newActivity.type === 'GAME' ? "Ex: Campeonato Regional" : "Ex: Treino Tático"} 
                            required value={newActivity.title} onChange={e => setNewActivity({...newActivity, title: e.target.value})} />
                    </div>

                    {newActivity.type === 'GAME' && (
                        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-100 space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                             <div className="flex items-center gap-2 pb-2 border-b border-yellow-200">
                                <Trophy className="w-4 h-4 text-yellow-600" />
                                <h4 className="font-bold text-yellow-800 text-sm">Detalhes da Partida</h4>
                             </div>
                             
                             <div>
                                <label className="block text-xs font-bold text-yellow-800 mb-1">Nome do Adversário</label>
                                <input 
                                    type="text" 
                                    className="w-full border border-yellow-300 rounded-lg p-2 bg-white focus:ring-2 focus:ring-yellow-500 outline-none"
                                    placeholder="Ex: Escolinha do Futuro"
                                    value={newActivity.opponent}
                                    onChange={(e) => setNewActivity({...newActivity, opponent: e.target.value})}
                                />
                             </div>

                             <div className="flex items-center gap-4 bg-white p-3 rounded-lg border border-yellow-200">
                                 <div className="flex-1 text-center">
                                     <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Garotos</label>
                                     <input type="number" min="0" className="w-16 mx-auto border rounded-lg p-2 text-center font-black text-2xl outline-none focus:ring-2 focus:ring-yellow-500" 
                                        value={newActivity.homeScore} onChange={e => setNewActivity({...newActivity, homeScore: parseInt(e.target.value) || 0})} />
                                 </div>
                                 <div className="text-gray-400 font-light text-2xl">X</div>
                                 <div className="flex-1 text-center">
                                     <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Visitante</label>
                                     <input type="number" min="0" className="w-16 mx-auto border rounded-lg p-2 text-center font-black text-2xl outline-none focus:ring-2 focus:ring-yellow-500" 
                                        value={newActivity.awayScore} onChange={e => setNewActivity({...newActivity, awayScore: parseInt(e.target.value) || 0})} />
                                 </div>
                             </div>

                             <div>
                                <label className="block text-xs font-bold text-yellow-800 mb-1 flex items-center gap-1"><Medal className="w-3 h-3"/> Artilheiros (Gols)</label>
                                <select 
                                    className="w-full border border-yellow-300 rounded-lg p-2 bg-white mb-2 text-sm focus:ring-2 focus:ring-yellow-500 outline-none"
                                    onChange={(e) => {
                                        if (e.target.value) {
                                            addScorer(e.target.value);
                                            e.target.value = ''; // Reset select
                                        }
                                    }}
                                >
                                    <option value="">+ Adicionar quem fez gol...</option>
                                    {getEligibleScorers().map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                                <div className="flex flex-wrap gap-2">
                                    {newActivity.scorers?.map((sid, idx) => {
                                        const s = students.find(stu => stu.id === sid);
                                        return (
                                            <span key={idx} className="bg-white border border-yellow-300 text-yellow-900 text-xs px-2 py-1 rounded-full flex items-center gap-1 shadow-sm">
                                                ⚽ {s ? s.name.split(' ')[0] : 'Desconhecido'}
                                                <button type="button" onClick={() => removeScorer(idx)} className="hover:text-red-500 ml-1"><X className="w-3 h-3" /></button>
                                            </span>
                                        );
                                    })}
                                    {newActivity.scorers?.length === 0 && <span className="text-xs text-yellow-600/50 italic">Nenhum gol registrado.</span>}
                                </div>
                             </div>

                             <div className="grid grid-cols-2 gap-4 pt-2 border-t border-yellow-200">
                                <div>
                                    <label className="block text-xs font-bold text-yellow-800 mb-1">Horário Apresentação</label>
                                    <input type="time" className="w-full border border-yellow-300 rounded-lg p-2 bg-white focus:ring-2 focus:ring-yellow-500 outline-none"
                                        value={newActivity.presentationTime} onChange={e => setNewActivity({...newActivity, presentationTime: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-yellow-800 mb-1">Taxa do Jogo (R$)</label>
                                    <input 
                                        type="number" min="0" step="0.01" className="w-full border border-yellow-300 rounded-lg p-2 bg-white focus:ring-2 focus:ring-yellow-500 outline-none" placeholder="0,00"
                                        value={newActivity.fee === 0 ? '' : newActivity.fee}
                                        onChange={(e) => {
                                            const val = parseFloat(e.target.value);
                                            setNewActivity({...newActivity, fee: isNaN(val) ? 0 : val});
                                            setHasFee(val > 0);
                                        }}
                                    />
                                </div>
                             </div>
                        </div>
                    )}
                    
                    {/* Common Fields */}
                    <div>
                        <label className="block text-sm font-medium mb-1">Local / Endereço</label>
                        <div className="relative">
                            <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input 
                                type="text" 
                                className="w-full pl-9 border rounded-lg p-2"
                                placeholder="Ex: Rua das Flores, 123 - Campo do Real"
                                value={newActivity.location}
                                onChange={(e) => setNewActivity({...newActivity, location: e.target.value})}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                             <label className="block text-sm font-medium mb-1">Repetição</label>
                             <select className="w-full border rounded-lg p-2 bg-white" 
                                value={newActivity.recurrence} 
                                onChange={e => setNewActivity({...newActivity, recurrence: e.target.value as 'weekly' | 'none'})}>
                                 <option value="none">Pontual</option>
                                 <option value="weekly">Recorrente (Semanal - Ano todo)</option>
                             </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Público Alvo</label>
                            <div className="flex border rounded-lg overflow-hidden">
                                <button type="button" 
                                    onClick={() => setTargetType('GROUP')}
                                    className={`flex-1 py-2 text-sm font-medium transition-colors ${targetType === 'GROUP' ? 'bg-gray-100 text-gray-900 shadow-inner' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                >
                                    Grupo
                                </button>
                                <div className="w-px bg-gray-200"></div>
                                <button type="button" 
                                    onClick={() => setTargetType('INDIVIDUAL')}
                                    className={`flex-1 py-2 text-sm font-medium transition-colors ${targetType === 'INDIVIDUAL' ? 'bg-gray-100 text-gray-900 shadow-inner' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                >
                                    Individual
                                </button>
                            </div>
                        </div>
                    </div>

                    {targetType === 'GROUP' ? (
                        <div>
                            <label className="block text-sm font-medium mb-1">Selecionar Grupo</label>
                            <select className="w-full border rounded-lg p-2 bg-white"
                                value={newActivity.groupId} onChange={e => setNewActivity({...newActivity, groupId: e.target.value})}>
                                <option value="">Selecione...</option>
                                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </select>
                        </div>
                    ) : (
                        <div>
                            <label className="block text-sm font-medium mb-1">Selecionar Alunos ({selectedStudentIds.size})</label>
                            <div className="border rounded-lg p-2 bg-gray-50">
                                <div className="relative mb-2">
                                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                    <input 
                                        type="text" 
                                        className="w-full pl-8 pr-2 py-1.5 text-sm border rounded bg-white"
                                        placeholder="Buscar aluno..."
                                        value={studentSearch}
                                        onChange={e => setStudentSearch(e.target.value)}
                                    />
                                </div>
                                <div className="max-h-40 overflow-y-auto space-y-1">
                                    {filteredStudents.map(s => (
                                        <div key={s.id} onClick={() => toggleStudentSelection(s.id)} 
                                            className="flex items-center gap-2 p-1.5 hover:bg-white rounded cursor-pointer transition-colors"
                                        >
                                            {selectedStudentIds.has(s.id) ? (
                                                <CheckSquare className="w-4 h-4 text-primary-600" />
                                            ) : (
                                                <Square className="w-4 h-4 text-gray-300" />
                                            )}
                                            <span className="text-sm text-gray-700">{s.name}</span>
                                        </div>
                                    ))}
                                    {filteredStudents.length === 0 && (
                                        <p className="text-xs text-gray-400 text-center py-2">Nenhum aluno encontrado</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Data</label>
                            <input className="w-full border rounded-lg p-2" type="date" required
                                value={newActivity.date} onChange={e => setNewActivity({...newActivity, date: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Horário</label>
                            <div className="flex gap-2">
                                <input className="w-full border rounded-lg p-2 text-sm" type="time" required
                                    value={newActivity.startTime} onChange={e => setNewActivity({...newActivity, startTime: e.target.value})} />
                                <span className="self-center text-gray-400">-</span>
                                <input className="w-full border rounded-lg p-2 text-sm" type="time" required
                                    value={newActivity.endTime} onChange={e => setNewActivity({...newActivity, endTime: e.target.value})} />
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                        <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancelar</button>
                        <button type="submit" className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors shadow-lg shadow-primary-500/20 font-medium">
                            {editingId ? 'Salvar Alterações' : 'Agendar Atividade'}
                        </button>
                    </div>
                </form>
             </div>
        </div>
      )}

      {/* Notification Modal */}
      {notifyModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
               <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                   <Megaphone className="w-5 h-5 text-blue-600" /> Comunicado em Massa
               </h3>
               {!notifyIsRunning && <button onClick={() => setNotifyModalOpen(false)}><X className="w-5 h-5 text-gray-400" /></button>}
            </div>

            <div className="mb-6">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>Progresso:</span>
                    <span>{Math.min(notifyCurrentIndex + 1, notifyQueue.length)} de {notifyQueue.length}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                    <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-500" style={{ width: `${((notifyCurrentIndex) / notifyQueue.length) * 100}%` }}></div>
                </div>
                
                {notifyIsRunning ? (
                    <div className="bg-blue-50 text-blue-800 p-3 rounded-lg text-sm font-medium text-center flex flex-col items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
                        Próximo envio em {notifyCountdown}s...
                        <span className="text-xs font-normal text-gray-500">Mantenha esta janela aberta e permita pop-ups!</span>
                    </div>
                ) : (
                    <div className="bg-green-50 text-green-800 p-3 rounded-lg text-sm font-medium text-center">
                        Processo Finalizado
                    </div>
                )}
            </div>
            
            <div className="bg-gray-900 text-green-400 p-4 rounded-lg h-40 overflow-y-auto text-xs font-mono mb-4">
                {notifyLogs.map((log, i) => (
                    <div key={i} className="mb-1">{log}</div>
                ))}
                {notifyLogs.length === 0 && <div className="text-gray-500">Aguardando início...</div>}
            </div>

            <div className="flex justify-end gap-2">
                {notifyIsRunning ? (
                    <button onClick={() => setNotifyIsRunning(false)} className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm font-medium">
                        <Pause className="w-4 h-4" /> Pausar
                    </button>
                ) : (
                    <button onClick={() => setNotifyIsRunning(true)} className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-sm font-medium" disabled={notifyCurrentIndex >= notifyQueue.length}>
                        <Play className="w-4 h-4" /> Continuar
                    </button>
                )}
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