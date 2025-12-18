
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
  // --- DATE SELECTION STATE ---
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [targetType, setTargetType] = useState<'GROUP' | 'INDIVIDUAL'>('GROUP');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [studentSearch, setStudentSearch] = useState('');
  const [hasFee, setHasFee] = useState(false);

  // --- REPORT STATE ---
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportStartDate, setReportStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [reportEndDate, setReportEndDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]);

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

  // Keep full sorted list for Report Export
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
          // Changed check for array inclusion
          return students.filter(s => s.groupIds && s.groupIds.includes(activity.groupId!) && s.active);
      }
      if (activity.participants && activity.participants.length > 0) {
          return students.filter(s => activity.participants?.includes(s.id));
      }
      return [];
  };

  // --- REPORT GENERATION LOGIC ---
  const getFilteredActivitiesForReport = (type?: 'TRAINING' | 'GAME') => {
      return allSortedActivities.filter(a => {
          const inDateRange = a.date >= reportStartDate && a.date <= reportEndDate;
          const matchType = type ? a.type === type : true;
          return inDateRange && matchType;
      });
  };

  const generateTrainingReport = () => {
      const trainingActivities = getFilteredActivitiesForReport('TRAINING');
      if (trainingActivities.length === 0) { alert("Nenhum treino encontrado no período."); return; }

      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('Relatório de Frequência - TREINOS', 14, 20);
      doc.setFontSize(10);
      doc.text(`Período: ${formatDate(reportStartDate)} a ${formatDate(reportEndDate)}`, 14, 28);
      doc.text(`Total de Treinos Realizados: ${trainingActivities.length}`, 14, 34);

      const tableRows: any[] = [];

      students.filter(s => s.active).sort((a,b) => a.name.localeCompare(b.name)).forEach(student => {
          // Find trainings assigned to this student
          const relevantTrainings = trainingActivities.filter(a => 
              (a.groupId && student.groupIds && student.groupIds.includes(a.groupId)) || 
              (a.participants && a.participants.includes(student.id))
          );

          if (relevantTrainings.length > 0) {
              const presentCount = relevantTrainings.filter(a => a.attendance.includes(student.id)).length;
              const frequency = Math.round((presentCount / relevantTrainings.length) * 100);
              const groupNames = student.groupIds.map(gid => groups.find(g => g.id === gid)?.name).filter(Boolean).join(', ') || '-';

              tableRows.push([
                  student.name,
                  groupNames,
                  relevantTrainings.length,
                  presentCount,
                  `${frequency}%`
              ]);
          }
      });

      autoTable(doc, {
          startY: 40,
          head: [['Atleta', 'Grupos', 'Treinos Previstos', 'Presenças', 'Frequência']],
          body: tableRows,
          headStyles: { fillColor: [234, 88, 12] }, // Orange
          styles: { fontSize: 9 },
      });

      doc.save(`Frequencia_Treinos_${reportStartDate}_${reportEndDate}.pdf`);
  };

  const generateGameAttendanceReport = () => {
      const gameActivities = getFilteredActivitiesForReport('GAME');
      if (gameActivities.length === 0) { alert("Nenhum jogo encontrado no período."); return; }

      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('Relatório de Frequência - JOGOS', 14, 20);
      doc.setFontSize(10);
      doc.text(`Período: ${formatDate(reportStartDate)} a ${formatDate(reportEndDate)}`, 14, 28);
      doc.text(`Total de Jogos Realizados: ${gameActivities.length}`, 14, 34);

      const tableRows: any[] = [];

      students.filter(s => s.active).sort((a,b) => a.name.localeCompare(b.name)).forEach(student => {
          const relevantGames = gameActivities.filter(a => 
              (a.groupId && student.groupIds && student.groupIds.includes(a.groupId)) || 
              (a.participants && a.participants.includes(student.id))
          );

          if (relevantGames.length > 0) {
              const presentCount = relevantGames.filter(a => a.attendance.includes(student.id)).length;
              const frequency = Math.round((presentCount / relevantGames.length) * 100);
              const groupNames = student.groupIds.map(gid => groups.find(g => g.id === gid)?.name).filter(Boolean).join(', ') || '-';

              tableRows.push([
                  student.name,
                  groupNames,
                  relevantGames.length,
                  presentCount,
                  `${frequency}%`
              ]);
          }
      });

      autoTable(doc, {
          startY: 40,
          head: [['Atleta', 'Grupos', 'Convocções', 'Jogos (Presença)', 'Frequência']],
          body: tableRows,
          headStyles: { fillColor: [37, 99, 235] }, // Blue
          styles: { fontSize: 9 },
      });

      doc.save(`Frequencia_Jogos_${reportStartDate}_${reportEndDate}.pdf`);
  };

  const generateTeamStatsReport = () => {
      const gameActivities = getFilteredActivitiesForReport('GAME');
      if (gameActivities.length === 0) { alert("Nenhum jogo encontrado no período."); return; }

      let wins = 0, draws = 0, losses = 0;
      let goalsFor = 0, goalsAgainst = 0;

      const gameResultsRows = gameActivities.map(game => {
          const home = game.homeScore || 0;
          const away = game.awayScore || 0;
          
          goalsFor += home;
          goalsAgainst += away;

          let result = 'E';
          if (home > away) { wins++; result = 'V'; }
          else if (away > home) { losses++; result = 'D'; }
          else { draws++; }

          return [
              formatDate(game.date),
              game.title,
              game.opponent || '(Sem adv.)',
              `${home} x ${away}`,
              result
          ];
      });

      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('Estatísticas do Time - Resultados', 14, 20);
      doc.setFontSize(10);
      doc.text(`Período: ${formatDate(reportStartDate)} a ${formatDate(reportEndDate)}`, 14, 28);

      // Summary Box
      doc.setFillColor(245, 245, 245);
      doc.roundedRect(14, 35, 180, 25, 3, 3, 'F');
      doc.setFont("helvetica", "bold");
      doc.text(`Jogos: ${gameActivities.length}`, 20, 45);
      doc.setTextColor(22, 163, 74); doc.text(`Vitórias: ${wins}`, 60, 45);
      doc.setTextColor(234, 179, 8); doc.text(`Empates: ${draws}`, 100, 45);
      doc.setTextColor(220, 38, 38); doc.text(`Derrotas: ${losses}`, 140, 45);
      
      doc.setTextColor(0,0,0);
      doc.text(`Gols Pró: ${goalsFor} | Gols Contra: ${goalsAgainst} | Saldo: ${goalsFor - goalsAgainst}`, 20, 53);
      doc.setFont("helvetica", "normal");

      autoTable(doc, {
          startY: 65,
          head: [['Data', 'Competição/Evento', 'Adversário', 'Placar', 'Res.']],
          body: gameResultsRows,
          headStyles: { fillColor: [22, 163, 74] }, // Green
          didParseCell: (data) => {
              if (data.section === 'body' && data.column.index === 4) {
                  if (data.cell.raw === 'V') data.cell.styles.textColor = [22, 163, 74];
                  if (data.cell.raw === 'D') data.cell.styles.textColor = [220, 38, 38];
                  if (data.cell.raw === 'E') data.cell.styles.textColor = [234, 179, 8];
                  data.cell.styles.fontStyle = 'bold';
              }
          }
      });

      doc.save(`Estatisticas_Time_${reportStartDate}_${reportEndDate}.pdf`);
  };

  const generateAthleteStatsReport = () => {
      const gameActivities = getFilteredActivitiesForReport('GAME');
      if (gameActivities.length === 0) { alert("Nenhum jogo encontrado no período."); return; }

      const statsMap: Record<string, { name: string, groups: string, games: number, goals: number }> = {};

      // Initialize all active students
      students.forEach(s => {
          if (s.active) {
              statsMap[s.id] = { 
                  name: s.name, 
                  groups: s.groupIds.map(gid => groups.find(g => g.id === gid)?.name).filter(Boolean).join(', ') || '-', 
                  games: 0, 
                  goals: 0 
              };
          }
      });

      // Compute stats
      gameActivities.forEach(game => {
          // Attendance = Games Played
          game.attendance.forEach(studentId => {
              if (statsMap[studentId]) {
                  statsMap[studentId].games++;
              }
          });
          // Scorers
          if (game.scorers) {
              game.scorers.forEach(studentId => {
                  if (statsMap[studentId]) {
                      statsMap[studentId].goals++;
                  }
              });
          }
      });

      // Convert to array and sort
      const sortedStats = Object.values(statsMap)
          .filter(s => s.games > 0 || s.goals > 0) // Only show students who played or scored
          .sort((a, b) => {
              if (b.goals !== a.goals) return b.goals - a.goals; // Goals first
              return b.games - a.games; // Then games played
          });

      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('Estatísticas Individuais - Atletas (Artilharia)', 14, 20);
      doc.setFontSize(10);
      doc.text(`Período: ${formatDate(reportStartDate)} a ${formatDate(reportEndDate)}`, 14, 28);

      const tableRows = sortedStats.map((s, index) => [
          index + 1,
          s.name,
          s.groups,
          s.games,
          s.goals,
          s.games > 0 ? (s.goals / s.games).toFixed(2) : '0.00'
      ]);

      autoTable(doc, {
          startY: 35,
          head: [['Rank', 'Atleta', 'Grupos', 'Jogos', 'Gols', 'Média Gols/Jogo']],
          body: tableRows,
          headStyles: { fillColor: [234, 179, 8] }, // Gold/Yellow
          styles: { fontSize: 9 },
          columnStyles: {
              0: { fontStyle: 'bold', halign: 'center' },
              4: { fontStyle: 'bold', textColor: [22, 163, 74] }
          }
      });

      doc.save(`Estatisticas_Atletas_${reportStartDate}_${reportEndDate}.pdf`);
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
      
      if (confirm(`Deseja enviar ${typeLabel} para ${targetStudents.length} atletas?\n\nO sistema tentará envio automático via API.`)) {
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

  const processNotifyItem = async (student: Student) => {
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
          
          const sent = await sendZApiMessage(phone, message);
          if (sent) {
              setNotifyLogs(prev => [`✅ Enviado (API) para ${student.name}`, ...prev]);
          } else {
              // Fallback manual
              const encodedMessage = encodeURIComponent(message);
              const url = `https://wa.me/55${phone}?text=${encodedMessage}`;
              const win = window.open(url, '_blank');
              if (win) {
                  setNotifyLogs(prev => [`✅ Aberto manual para ${student.name}`, ...prev]);
              } else {
                  setNotifyLogs(prev => [`⚠️ Falha no envio para ${student.name}`, ...prev]);
              }
          }
      } else {
          setNotifyLogs(prev => [`❌ Sem telefone para ${student.name}`, ...prev]);
      }

      setNotifyCurrentIndex(prev => prev + 1);
      setNotifyCountdown(10); // 10s delay for next
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
          // Changed check for array inclusion
          return students.filter(s => s.groupIds && s.groupIds.includes(newActivity.groupId!) && s.active);
      } else if (targetType === 'INDIVIDUAL') {
          return students.filter(s => selectedStudentIds.has(s.id));
      }
      return [];
  };

  return (
    <div className="space-y-6">
      {/* (Rest of component remains unchanged) */}
    </div>
  );
};
