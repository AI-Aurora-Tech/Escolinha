
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Activity, Student, Group, User, UserRole, Transaction, TransactionType, PaymentStatus, PaymentMethod } from '../types';
import { Calendar as CalendarIcon, Clock, CheckCircle, Users, Repeat, CheckSquare, Square, Search, User as UserIcon, FileText, XCircle, Edit, Trophy, Coins, DollarSign, Trash2, MapPin, Megaphone, X, Play, Pause, Zap, ChevronLeft, ChevronRight, Filter, Minus, PlusCircle, Medal, BarChart3, ChevronDown, DollarSign as CashIcon, Goal, ChevronRight as ChevronRightIcon, Flag } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { sendZApiMessage } from '../services/zapiService';
import { createMPPreference } from '../services/mercadoPago';

interface SchedulePageProps {
  activities: Activity[];
  students: Student[];
  groups: Group[];
  transactions: Transaction[];
  onAddActivity: (activity: Omit<Activity, 'id'>) => void;
  onUpdateActivity: (activity: Activity) => void;
  onUpdateAttendance: (activityId: string, studentId: string) => void;
  onUpdateFeePayment?: (activityId: string, studentId: string) => void; 
  onDeleteActivity?: (activityId: string) => void;
  onAddTransaction: (transaction: Omit<Transaction, 'id'>) => void;
  onUpdateTransaction: (transaction: Partial<Transaction>) => void;
  currentUser?: User | null;
}

export const SchedulePage: React.FC<SchedulePageProps> = ({ activities, students, groups, transactions, onAddActivity, onUpdateActivity, onUpdateAttendance, onUpdateFeePayment, onDeleteActivity, onAddTransaction, onUpdateTransaction, currentUser }) => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [targetType, setTargetType] = useState<'GROUP' | 'INDIVIDUAL'>('GROUP');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [studentSearch, setStudentSearch] = useState('');
  const [hasFee, setHasFee] = useState(false);

  // Use local time for YYYY-MM-DD comparison
  const todayStr = useMemo(() => {
    return new Date().toLocaleDateString('en-CA');
  }, []);

  // --- AUTO FOCUS ON NEXT ACTIVITY FOR GUARDIANS ---
  useEffect(() => {
    if (currentUser?.role === UserRole.RESPONSAVEL && activities.length > 0) {
        const now = new Date();
        const futureActivities = activities
            .filter(a => new Date(a.date + 'T' + a.startTime) >= now)
            .sort((a, b) => new Date(a.date + 'T' + a.startTime).getTime() - new Date(b.date + 'T' + b.startTime).getTime());
        
        if (futureActivities.length > 0) {
            setSelectedDate(futureActivities[0].date);
            setSelectedActivityId(futureActivities[0].id);
        }
    }
  }, [activities.length, currentUser?.role]);

  // --- REPORT STATE ---
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportStartDate, setReportStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [reportEndDate, setReportEndDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]);
  const [reportSelectedGameId, setReportSelectedGameId] = useState<string>('ALL');

  // --- NOTIFICATION STATE ---
  const [notifyModalOpen, setNotifyModalOpen] = useState(false);
  const [notifyQueue, setNotifyQueue] = useState<Student[]>([]);
  const [notifyCurrentIndex, setNotifyCurrentIndex] = useState(0);
  const [notifyIsRunning, setNotifyIsRunning] = useState(false);
  const [notifyCountdown, setNotifyCountdown] = useState(10);
  const [notifyLogs, setNotifyLogs] = useState<string[]>([]);
  const [notifyActivity, setNotifyActivity] = useState<Activity | null>(null);
  const [notifyIsFeeCharging, setNotifyIsFeeCharging] = useState(false); 
  const notifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [newActivity, setNewActivity] = useState<Partial<Activity>>({
      title: '', type: 'TRAINING', fee: 0, location: '', date: new Date().toISOString().split('T')[0], startTime: '14:00', endTime: '15:30', groupId: '', participants: [], recurrence: 'none', attendance: [], feePayments: [], presentationTime: '', opponent: '', homeScore: 0, awayScore: 0, scorers: []
  });

  const isGuardian = currentUser?.role === UserRole.RESPONSAVEL;
  const selectedActivity = selectedActivityId ? activities.find(a => a.id === selectedActivityId) || null : null;
  const dailyActivities = activities.filter(a => a.date === selectedDate).sort((a, b) => new Date(a.date + 'T' + a.startTime).getTime() - new Date(b.date + 'T' + b.startTime).getTime());
  const allSortedActivities = [...activities].sort((a, b) => new Date(a.date + 'T' + a.startTime).getTime() - new Date(b.date + 'T' + b.startTime).getTime());
  const filteredStudents = students.filter(s => s.active && (s.name.toLowerCase().includes(studentSearch.toLowerCase()) || s.guardian.name.toLowerCase().includes(studentSearch.toLowerCase()))).sort((a, b) => a.name.localeCompare(b.name));

  const formatDate = (dateString: string) => {
      if (!dateString) return ''; const parts = dateString.split('-');
      return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateString;
  };

  const handleNavigateDate = (days: number) => { const current = new Date(selectedDate + 'T00:00:00'); current.setDate(current.getDate() + days); setSelectedDate(current.toISOString().split('T')[0]); setSelectedActivityId(null); };
  const handleGoToday = () => { setSelectedDate(new Date().toISOString().split('T')[0]); setSelectedActivityId(null); };

  const toggleStudentSelection = (id: string) => {
      const next = new Set(selectedStudentIds); if (next.has(id)) next.delete(id); else next.add(id); setSelectedStudentIds(next);
  };

  const handleOpenAdd = () => {
      setEditingId(null);
      setNewActivity({ title: '', type: 'TRAINING', fee: 0, location: '', date: selectedDate, startTime: '14:00', endTime: '15:30', groupId: '', participants: [], recurrence: 'none', attendance: [], feePayments: [], presentationTime: '', opponent: '', homeScore: 0, awayScore: 0, scorers: [] });
      setTargetType('GROUP'); setSelectedStudentIds(new Set()); setStudentSearch(''); setHasFee(false); setShowAddModal(true);
  }

  const handleOpenEdit = (e: React.MouseEvent, activity: Activity) => {
      e.stopPropagation(); setEditingId(activity.id);
      setNewActivity({ ...activity, type: activity.type || 'TRAINING', scorers: activity.scorers || [] });
      if (activity.participants?.length) { setTargetType('INDIVIDUAL'); setSelectedStudentIds(new Set(activity.participants)); } 
      else { setTargetType('GROUP'); setSelectedStudentIds(new Set()); }
      setHasFee(!!activity.fee && activity.fee > 0); setShowAddModal(true);
  };

  const handleOpenFinishMatch = (e: React.MouseEvent, activity: Activity) => {
    e.stopPropagation();
    setEditingId(activity.id);
    // Se o placar for null (não finalizado), inicia com 0. Se já for 0 ou mais, mantém o valor.
    setNewActivity({ 
      ...activity, 
      homeScore: typeof activity.homeScore === 'number' ? activity.homeScore : 0,
      awayScore: typeof activity.awayScore === 'number' ? activity.awayScore : 0,
      scorers: activity.scorers || [] 
    });
    setShowFinishModal(true);
  };

  const handleDelete = (id: string) => { if (confirm('Excluir atividade?')) { onDeleteActivity?.(id); if (selectedActivityId === id) setSelectedActivityId(null); } };

  const updateScorer = (index: number, studentId: string) => {
    const newScorers = [...(newActivity.scorers || [])];
    newScorers[index] = studentId;
    setNewActivity({ ...newActivity, scorers: newScorers });
  };

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      
      const currentAttendees = getAttendeesList(newActivity);
      const isFinishing = newActivity.type === 'GAME' && typeof newActivity.homeScore === 'number';

      const activityData = { 
          ...newActivity, 
          fee: hasFee ? (newActivity.fee || 0) : 0, 
          groupId: targetType === 'GROUP' ? newActivity.groupId : undefined, 
          // Se estiver finalizando, fixa o roster para sempre
          participants: isFinishing ? currentAttendees.map(s => s.id) : (targetType === 'INDIVIDUAL' ? Array.from(selectedStudentIds) : (newActivity.participants || [])), 
          scorers: newActivity.type === 'GAME' ? (newActivity.scorers || []).slice(0, newActivity.homeScore || 0) : [] 
      };
      
      if(activityData.title && (activityData.groupId || activityData.participants?.length)) {
          if (editingId) onUpdateActivity({ ...activityData, id: editingId } as Activity);
          else onAddActivity(activityData as Omit<Activity, 'id'>);
          setShowAddModal(false);
      } else alert("Dados incompletos.");
  };

  const handleFinishMatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;

    const currentAttendees = getAttendeesList(newActivity);

    const activityData = {
      ...newActivity,
      id: editingId,
      participants: currentAttendees.map(s => s.id), 
      scorers: (newActivity.scorers || []).slice(0, newActivity.homeScore || 0)
    } as Activity;

    if (activityData.type === 'GAME' && activityData.fee && activityData.fee > 0) {
      currentAttendees.forEach(student => {
        const isPresent = (activityData.attendance || []).includes(student.id);
        if (!isPresent) {
          const targetRef = `game_fee_${editingId}_${student.id}`;
          const linkedTx = transactions.find(t => t.externalReference === targetRef && t.status === PaymentStatus.PENDING);
          if (linkedTx) {
            onUpdateTransaction({ id: linkedTx.id, status: PaymentStatus.CANCELLED });
          }
        }
      });
    }

    onUpdateActivity(activityData);
    setShowFinishModal(false);

    if (activityData.type === 'GAME' && activityData.fee && activityData.fee > 0) {
        if (confirm("Resultado salvo!\nDeseja realizar a cobrança via WhatsApp das taxas de jogo para os atletas PRESENTES que ainda não pagaram?")) {
            const debtors = currentAttendees.filter(s => 
                (activityData.attendance || []).includes(s.id) && 
                !(activityData.feePayments || []).includes(s.id)
            );
            
            if (debtors.length > 0) {
                setNotifyActivity(activityData);
                setNotifyQueue(debtors);
                setNotifyCurrentIndex(0);
                setNotifyIsFeeCharging(true);
                setNotifyIsRunning(true);
                setNotifyModalOpen(true);
                setNotifyLogs([`Iniciando cobrança de taxas para ${debtors.length} atletas PRESENTES com pendência...`]);
                setNotifyCountdown(1);
            } else {
                alert("Nenhuma taxa pendente para os atletas que compareceram ao jogo.");
            }
        }
    } else if (confirm("Resultado salvo!\nDeseja disparar o comunicado do resultado via WhatsApp para os responsáveis?")) {
        if (currentAttendees.length > 0) {
            setNotifyActivity(activityData);
            setNotifyQueue(currentAttendees);
            setNotifyCurrentIndex(0);
            setNotifyIsFeeCharging(false);
            setNotifyIsRunning(true);
            setNotifyModalOpen(true);
            setNotifyLogs([`Iniciando envio de resultados para ${currentAttendees.length} atletas...`]);
            setNotifyCountdown(1);
        }
    }
  };

  const getAttendeesList = (activity: Partial<Activity>) => {
      const unifiedIds = new Set<string>();
      
      // 1. Snapshot histórico (Obrigatório para manter os ausentes após finalização ou remoção do grupo)
      (activity.participants || []).forEach(id => unifiedIds.add(id));
      
      // 2. Registros dinâmicos (presença, gols, pagamentos)
      (activity.attendance || []).forEach(id => unifiedIds.add(id));
      (activity.feePayments || []).forEach(id => unifiedIds.add(id));
      (activity.scorers || []).forEach(id => unifiedIds.add(id));

      // 3. Se não estiver finalizado, inclui os membros ATUAIS do grupo para chamada
      const isFinished = activity.type === 'GAME' && typeof activity.homeScore === 'number';
      if (!isFinished && activity.groupId) {
          students
            .filter(s => s.active && (s.groupIds || []).includes(activity.groupId!))
            .forEach(s => unifiedIds.add(s.id));
      }

      return students.filter(s => unifiedIds.has(s.id)).sort((a, b) => a.name.localeCompare(b.name));
  };

  const getFilteredActivitiesForReport = (type?: 'TRAINING' | 'GAME') => allSortedActivities.filter(a => a.date >= reportStartDate && a.date <= reportEndDate && (type ? a.type === type : true));

  // --- LOGICA DE RELATORIOS ---

  const generateTrainingReport = () => {
      const training = getFilteredActivitiesForReport('TRAINING'); if (!training.length) return alert("Nenhum treino no período.");
      const doc = new jsPDF(); 
      doc.text('Relatório de Frequência - TREINOS', 14, 20);
      doc.setFontSize(10);
      doc.text(`Período: ${formatDate(reportStartDate)} a ${formatDate(reportEndDate)}`, 14, 28);

      const sortedStudents = [...students].filter(s => s.active).sort((a, b) => a.name.localeCompare(b.name));

      const rows = sortedStudents.map(s => {
          const rel = training.filter(a => (a.groupId && (s.groupIds || []).includes(a.groupId)) || a.participants?.includes(s.id));
          if (!rel.length) return null;
          const pres = rel.filter(a => a.attendance.includes(s.id)).length;
          return [s.name, rel.length, pres, `${Math.round((pres/rel.length)*100)}%`];
      }).filter(Boolean);

      autoTable(doc, { startY: 35, head: [['Atleta', 'Treinos', 'Presenças', '%']], body: rows as any[], headStyles: { fillColor: [249, 115, 22] } });
      doc.save(`Frequencia_Treinos_${reportStartDate}.pdf`);
  };

  const generateGameAttendanceAndPaymentReport = () => {
    const games = reportSelectedGameId === 'ALL' 
      ? getFilteredActivitiesForReport('GAME')
      : activities.filter(a => a.id === reportSelectedGameId);

    if (!games.length) return alert("Nenhum jogo encontrado para os critérios selecionados.");
    
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text('Relatório de Presença e Taxas - JOGOS', 14, 20);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const subtitle = reportSelectedGameId === 'ALL' 
      ? `Período: ${formatFriendlyDate(reportStartDate)} a ${formatFriendlyDate(reportEndDate)}`
      : `Jogo: ${games[0].title} (${formatFriendlyDate(games[0].date)})`;
    doc.text(subtitle, 14, 28);

    const tableData: any[] = [];
    let totalCollected = 0;
    let totalPending = 0;
    let totalPresent = 0;
    let totalAbsent = 0;

    games.forEach(game => {
      const attendees = getAttendeesList(game);
      attendees.forEach(student => {
        const isPresent = game.attendance.includes(student.id);
        const isPaid = game.feePayments?.includes(student.id);
        const fee = game.fee || 0;
        const groupName = groups.find(g => g.id === game.groupId)?.name || 'Lista Avulsa';

        if (isPresent) totalPresent++; else totalAbsent++;
        if (fee > 0) {
            if (isPaid) totalCollected += fee; else totalPending += fee;
        }

        tableData.push([
          formatFriendlyDate(game.date),
          game.title,
          student.name,
          groupName,
          isPresent ? 'PRESENTE' : 'AUSENTE',
          fee > 0 ? (isPaid ? `PAGO (R$ ${fee.toFixed(2)})` : `PENDENTE (R$ ${fee.toFixed(2)})`) : '-'
        ]);
      });
    });

    autoTable(doc, {
        startY: 35,
        head: [['Resumo do Relatório', 'Valor/Qtd']],
        body: [
            ['Jogos Selecionados', games.length.toString()],
            ['Total Presenças / Faltas', `${totalPresent} / ${totalAbsent}`],
            ['Total Arrecadado (Taxas)', `R$ ${totalCollected.toFixed(2)}`],
            ['Total Pendente (Taxas)', `R$ ${totalPending.toFixed(2)}`],
        ],
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229] },
        styles: { fontSize: 9 },
    });

    const finalY = (doc as any).lastAutoTable.finalY;

    autoTable(doc, { 
      startY: finalY + 10, 
      head: [['Data', 'Jogo', 'Atleta', 'Grupo', 'Presença', 'Status Taxa']], 
      body: tableData,
      headStyles: { fillColor: [249, 115, 22] },
      styles: { fontSize: 7, cellPadding: 2, valign: 'middle' },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 35 },
        2: { cellWidth: 40 },
        3: { cellWidth: 25 },
        4: { cellWidth: 25, halign: 'center', fontStyle: 'bold' },
        5: { cellWidth: 45, halign: 'center', fontStyle: 'bold' }
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          const text = data.cell.text[0];
          if (text === 'AUSENTE') {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.text = ['[X] AUSENTE'];
          } else {
            data.cell.styles.textColor = [22, 163, 74];
            data.cell.text = ['[V] PRESENTE'];
          }
        }
        if (data.section === 'body' && data.column.index === 5) {
          const text = data.cell.text[0];
          if (text.includes('PENDENTE')) {
            data.cell.styles.textColor = [217, 119, 6];
          } else if (text.includes('PAGO')) {
            data.cell.styles.textColor = [79, 70, 229];
          }
        }
      }
    });

    doc.save(`Relatorio_Frequencia_Taxas_Jogos_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const formatFriendlyDate = (dateString: string) => {
    if (!dateString) return '';
    const parts = dateString.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateString;
  };

  const generateGameGeneralReport = () => {
    const games = getFilteredActivitiesForReport('GAME'); if (!games.length) return alert("Nenhum jogo no período.");
    const doc = new jsPDF();
    doc.text('Relatório Geral de JOGOS', 14, 20);
    doc.setFontSize(10);
    doc.text(`Período: ${formatDate(reportStartDate)} a ${formatDate(reportEndDate)}`, 14, 28);

    let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;
    const tableData = games.map(a => {
        const h = a.homeScore || 0; const v = a.awayScore || 0;
        goalsFor += h; goalsAgainst += v;
        if (h > v) wins++; else if (h < v) losses++; else draws++;
        return [formatDate(a.date), a.title, a.opponent || '-', `${h} x ${v}`];
    });

    autoTable(doc, { startY: 35, head: [['Data', 'Atividade', 'Adversário', 'Placar']], body: tableData, headStyles: { fillColor: [249, 115, 22] } });
    
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFont("helvetica", "bold");
    doc.text('RESUMO DO PERÍODO:', 14, finalY);
    doc.setFont("helvetica", "normal");
    doc.text(`Total de Jogos: ${games.length} | Vitórias: ${wins} | Empates: ${draws} | Derrotas: ${losses}`, 14, finalY + 7);
    doc.text(`Gols Marcados: ${goalsFor} | Gols Sofridos: ${goalsAgainst} | Saldo: ${goalsFor - goalsAgainst}`, 14, finalY + 14);

    doc.save(`Relatorio_Geral_Jogos_${reportStartDate}.pdf`);
  };

  const generateStudentStatsReport = () => {
    const games = getFilteredActivitiesForReport('GAME'); if (!games.length) return alert("Nenhum jogo no período.");
    const doc = new jsPDF();
    doc.text('Estatísticas dos Atletas (Alfabética)', 14, 20);
    doc.setFontSize(10);
    doc.text(`Período: ${formatDate(reportStartDate)} a ${formatDate(reportEndDate)}`, 14, 28);

    const sortedStudents = [...students].filter(s => s.active).sort((a, b) => a.name.localeCompare(b.name));

    const stats = sortedStudents.map(s => {
        const goals = games.reduce((acc, g) => acc + (g.scorers?.filter(id => id === s.id).length || 0), 0);
        const matches = games.filter(g => g.attendance.includes(s.id)).length;
        if (goals === 0 && matches === 0) return null;
        return [s.name, matches, goals];
    }).filter(Boolean);

    autoTable(doc, { startY: 35, head: [['Atleta', 'Jogos Disputados', 'Gols Marcados']], body: stats as any[], headStyles: { fillColor: [249, 115, 22] } });
    doc.save(`Estatisticas_Alfabeticas_${reportStartDate}.pdf`);
  };

  const handleOpenNotify = (e: React.MouseEvent, activity: Activity) => {
      e.stopPropagation();
      const targetStudents = getAttendeesList(activity); if (!targetStudents.length) return alert("Sem alunos vinculados.");
      if (confirm(`Convocar ${targetStudents.length} atletas via Z-API?\n(Será aplicado um intervalo de 10 segundos entre cada envio por segurança)`)) {
          setNotifyActivity(activity); setNotifyQueue(targetStudents); setNotifyCurrentIndex(0); setNotifyIsRunning(true); setNotifyModalOpen(true); setNotifyIsFeeCharging(false); setNotifyLogs([`Fila iniciada para ${targetStudents.length} atletas...`]); setNotifyCountdown(1);
      }
  };

  useEffect(() => {
      if (!notifyModalOpen || !notifyIsRunning || !notifyActivity) return;
      if (notifyCurrentIndex >= notifyQueue.length) { setNotifyIsRunning(false); setNotifyLogs(prev => ["✅ Todos os comunicados enviados!", ...prev]); return; }
      
      if (notifyCountdown > 0) {
          notifyTimerRef.current = setTimeout(() => setNotifyCountdown(prev => prev - 1), 1000);
      } else {
          processNotifyItem(notifyQueue[notifyCurrentIndex]);
      }
      return () => { if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current); };
  }, [notifyModalOpen, notifyIsRunning, notifyCountdown, notifyCurrentIndex, notifyActivity, notifyQueue]);

  const processNotifyItem = async (student: Student) => {
      if (!notifyActivity) return;
      const phone = student.guardian.phone.replace(/\D/g, '');
      const extRef = `game_fee_${notifyActivity.id}_${student.id}`;

      if (phone) {
          let msg = '';
          
          if (notifyIsFeeCharging) {
              msg = `⚽ *COBRANÇA DE TAXA - Garotos do Martinica*\n\nOlá *${student.guardian.name}*! Notamos que a taxa referente ao jogo *${notifyActivity.title}* do atleta *${student.name}* (presente na partida) ainda não foi regularizada.\n\n💰 Valor: *R$ ${notifyActivity.fee?.toFixed(2)}*\n\n*Pagamento via PIX (Celular):* 11987019721\nNome: CLUBE DESPORTIVO MUNICIPAL JARDIM MARTINICA\n\nPor favor, realize o pagamento para mantermos o histórico financeiro em dia. Caso já tenha pago, favor desconsiderar.`;
          } else if (notifyLogs.some(l => l.includes('resultados'))) {
              msg = `⚽ *RESULTADO DE JOGO - Garotos do Martinica*\n\nOlá ${student.guardian.name}, o jogo de hoje terminou! 🏆\nAtleta: *${student.name}*\n\n📌 *${notifyActivity.title}*\n⚔️ Adversário: *${notifyActivity.opponent || 'Não informado'}*\n\n📊 *PLACAR FINAL:* \n*GAROTOS ${notifyActivity.homeScore} X ${notifyActivity.awayScore} ${notifyActivity.opponent || 'ADVERSÁRIO'}*\n`;
              if ((notifyActivity.homeScore || 0) > 0 && notifyActivity.scorers && notifyActivity.scorers.length > 0) {
                  msg += `\n⚽ *NOSSOS GOLS:*`;
                  const goalCounts = notifyActivity.scorers.reduce((acc, sid) => { acc[sid] = (acc[sid] || 0) + 1; return acc; }, {} as Record<string, number>);
                  Object.entries(goalCounts).forEach(([sid, count]) => {
                      const sName = students.find(s => s.id === sid)?.name || 'Atleta';
                      msg += `\n• ${sName} (${count}x)`;
                  });
              }
              msg += `\n\nParabéns a todos os atletas pelo empenho! ⚽🔥`;
          } else {
              const type = notifyActivity.type === 'GAME' ? 'JOGO' : 'TREINO';
              const emoji = notifyActivity.type === 'GAME' ? '🏆' : '⚽';
              msg = `Olá ${student.guardian.name}, aqui é da Garotos do Martinica! ${emoji}\n\n*COMUNICADO: ${type}*\nAtleta: *${student.name}*\n\n📌 *${notifyActivity.title}*\n📅 Data: ${formatDate(notifyActivity.date)}\n`;
              if (notifyActivity.type === 'GAME') msg += `⏰ Horário do Jogo: ${notifyActivity.startTime}\n`; else msg += `⏰ Horário: ${notifyActivity.startTime} às ${notifyActivity.endTime}\n`;
              if (notifyActivity.type === 'GAME') {
                  if (notifyActivity.opponent) msg += `⚔️ Adversário: ${notifyActivity.opponent}\n`;
                  if (notifyActivity.presentationTime) msg += `🕒 Chegar às: ${notifyActivity.presentationTime}\n`;
                  if (notifyActivity.fee && notifyActivity.fee > 0) {
                      msg += `💰 Taxa: R$ ${notifyActivity.fee.toFixed(2)}\n\n*Pagamento da Taxa:* \n🔑 Chave PIX (Celular): *11987019721*\n👤 Nome: CLUBE DESPORTIVO MUNICIPAL JARDIM MARTINICA\n`;
                      try {
                          const pref = await createMPPreference({ title: `Taxa Jogo: ${notifyActivity.title}`, price: notifyActivity.fee, externalReference: extRef, payer: { name: student.guardian.name, email: student.guardian.email || 'financeiro@martinica.com', phone: student.guardian.phone, identification: { type: 'CPF', number: (student.guardian.cpf || '').replace(/\D/g, '') } } });
                          if (pref) msg += `\n💳 Ou pague com Cartão:\n${pref.init_point}\n`;
                      } catch (e) { console.error("Erro MP", e); }
                  }
              }
              if (notifyActivity.location) msg += `📍 Local: ${notifyActivity.location}\n`;
              if (notifyActivity.type === 'GAME') msg += `\n✅ *Por favor, confirme a participação do atleta respondendo a este convite.*`;
              msg += `\n\nContamos com a presença!`;
          }
          
          const sent = await sendZApiMessage(phone, msg);
          setNotifyLogs(prev => [`${sent ? '✅' : '❌'} ${student.name}`, ...prev]);
      } else {
          setNotifyLogs(prev => [`⚠️ Sem telefone para ${student.name}`, ...prev]);
      }
      
      setNotifyCurrentIndex(prev => prev + 1); 
      setNotifyCountdown(10);
  };

  const gamesForSelect = activities.filter(a => 
    a.type === 'GAME' && 
    a.date >= reportStartDate && 
    a.date <= reportEndDate
  ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Agenda de Atividades</h2>
        {!isGuardian && (
            <div className="flex gap-2 w-full md:w-auto">
                <button onClick={() => setShowReportModal(true)} className="flex-1 md:flex-none justify-center flex items-center gap-2 bg-white text-gray-700 border px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"><FileText className="w-4 h-4" />Relatórios</button>
                <button onClick={handleOpenAdd} className="flex-1 md:flex-none justify-center flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg text-sm shadow-sm hover:bg-primary-700 transition-colors"><CalendarIcon className="w-4 h-4" />Agendar</button>
            </div>
        )}
      </div>

      <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 w-full sm:w-auto">
              <button onClick={() => handleNavigateDate(-1)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors"><ChevronLeft /></button>
              <div className="relative group flex-1 sm:flex-none flex items-center justify-center gap-2 bg-gray-50 px-4 py-2 rounded-lg border cursor-pointer overflow-hidden transition-colors hover:bg-gray-100">
                  <CalendarIcon className="w-4 h-4 text-primary-600 pointer-events-none" />
                  <span className="text-gray-800 font-bold text-sm pointer-events-none">{formatDate(selectedDate)}</span>
                  <ChevronDown className="w-3 h-3 text-gray-400 pointer-events-none" />
                  <input type="date" className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10" value={selectedDate} title="Mudar Data" onChange={(e) => { if (e.target.value) { setSelectedDate(e.target.value); setSelectedActivityId(null); } }} />
              </div>
              <button onClick={() => handleNavigateDate(1)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors"><ChevronRight /></button>
          </div>
          <button onClick={handleGoToday} className="text-sm text-primary-600 font-medium hover:bg-primary-50 px-3 py-1.5 rounded-lg">Hoje</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
            {dailyActivities.length > 0 ? dailyActivities.map(a => {
                    const g = groups.find(x => x.id === a.groupId); 
                    const attendeesCount = getAttendeesList(a).length;
                    const presenceCount = a.attendance.length;
                    const isFinished = a.type === 'GAME' && typeof a.homeScore === 'number' && typeof a.awayScore === 'number';

                    return (
                      <div key={a.id} className={`bg-white p-5 rounded-xl border transition-all cursor-pointer ${selectedActivityId === a.id ? 'border-primary-500 ring-1 ring-primary-500 shadow-md' : 'border-gray-100 hover:border-primary-200'}`} onClick={() => setSelectedActivityId(a.id)}>
                        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                            <div className="flex-1">
                                <h4 className="font-bold flex items-center gap-2 text-lg">
                                  {a.type === 'GAME' ? <Trophy className="text-yellow-500 w-5 h-5" /> : <CalendarIcon className="text-primary-500 w-5 h-5" />}
                                  {a.title}
                                  {a.fee ? <span className="bg-orange-100 text-orange-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-2 uppercase">Taxa: R$ {a.fee}</span> : null}
                                  {isFinished && <span className="bg-green-100 text-green-700 text-[10px] px-1.5 py-0.5 rounded-full font-black ml-2 uppercase border border-green-200">Finalizado</span>}
                                </h4>
                                {a.type === 'GAME' && (<div className="mt-3 p-3 bg-yellow-50 rounded-lg border border-yellow-100">
                                    <div className="font-bold text-sm mb-2 text-gray-600 uppercase tracking-tight">{a.opponent || 'Adversário não informado'}</div>
                                    <div className="flex items-center gap-4"><div className="text-center"><span className="text-[10px] text-gray-400 block font-bold">GAROTOS</span><span className="text-2xl font-black text-primary-600">{a.homeScore}</span></div><span className="text-gray-300 font-bold text-lg">X</span><div className="text-center"><span className="text-[10px] text-gray-400 block font-bold">VISITANTE</span><span className="text-2xl font-black text-gray-700">{a.awayScore}</span></div></div>
                                </div>)}
                                <div className="flex flex-wrap gap-3 mt-3 text-sm text-gray-500">
                                    <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{a.startTime}</span>
                                    <span className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded text-xs"><Users className="w-3 h-3" />{g?.name || 'Individual'}</span>
                                    {!isGuardian && (
                                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tight border ${presenceCount === attendeesCount ? 'bg-green-100 text-green-700 border-green-200' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
                                            <CheckCircle className="w-3 h-3" /> Frequência: {presenceCount}/{attendeesCount}
                                        </span>
                                    )}
                                    {a.location && <span className="flex items-center gap-1 truncate max-w-[150px]"><MapPin className="w-3 h-3" />{a.location}</span>}
                                </div>
                            </div>
                            {!isGuardian && (
                                <div className="flex gap-2">
                                    {a.type === 'GAME' && (
                                      <button onClick={(e) => handleOpenFinishMatch(e, a)} className="p-1.5 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors" title="Encerrar Partida (Lançar Placar)">
                                        <Flag className="w-4 h-4" />
                                      </button>
                                    )}
                                    <button onClick={(e) => handleOpenNotify(e, a)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Convocar via WhatsApp">
                                        <Megaphone className="w-4 h-4" />
                                    </button>
                                    <button onClick={(e) => handleOpenEdit(e, a)} className="p-1.5 text-primary-600 hover:bg-gray-50 rounded-lg transition-colors" title="Editar">
                                        <Edit className="w-4 h-4" />
                                    </button>
                                    <button onClick={(e) => handleDelete(a.id)} className="p-1.5 text-red-600 hover:bg-gray-50 rounded-lg transition-colors" title="Excluir">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </div>
                      </div>);
                }) : (<div className="bg-white p-12 rounded-xl border border-dashed text-center flex flex-col items-center justify-center h-64 text-gray-400"><CalendarIcon className="w-12 h-12 mb-2 opacity-20" /><p>Nenhuma atividade para este dia.</p></div>)}
        </div>
        <div className="lg:col-span-1">
            {selectedActivity ? (
                <div className="bg-white rounded-xl border border-gray-100 flex flex-col shadow-sm">
                    <div className="p-4 border-b bg-gray-50 rounded-t-xl font-bold flex justify-between items-center text-sm">
                      <span className="truncate mr-2">Lista: {selectedActivity.title}</span>
                      {selectedActivity.fee ? <span className="text-[10px] text-orange-600 font-black bg-orange-100 px-2 py-1 rounded whitespace-nowrap uppercase">R$ {selectedActivity.fee.toFixed(2)}</span> : null}
                    </div>
                    <div className="p-2 max-h-[500px] overflow-y-auto">
                        {getAttendeesList(selectedActivity).map(s => {
                            const pres = selectedActivity.attendance.includes(s.id); 
                            const goals = selectedActivity.scorers?.filter(x => x === s.id).length || 0;
                            const isFeePaid = selectedActivity.feePayments?.includes(s.id);
                            return (
                                <div key={s.id} className="flex items-center justify-between p-3 border-b last:border-0 hover:bg-gray-50 transition-colors rounded-lg">
                                    <div className="flex items-center gap-2 min-w-0"><span className="text-sm font-medium truncate">{s.name}</span>{goals > 0 && <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 rounded-full font-bold">⚽ {goals}</span>}</div>
                                    <div className="flex items-center gap-2">
                                        {!isGuardian ? (
                                            <><button onClick={() => onUpdateAttendance(selectedActivity.id, s.id)} className={`p-1.5 rounded-full transition-colors ${pres ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`} title={pres ? "Marcar Falta" : "Marcar Presença"}>{pres ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}</button>{selectedActivity.fee && selectedActivity.fee > 0 && (<button onClick={() => onUpdateFeePayment?.(selectedActivity.id, s.id)} className={`p-1.5 rounded-full transition-colors ${isFeePaid ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' : 'bg-gray-100 text-gray-300 hover:bg-gray-200'}`} title={isFeePaid ? "Cancelar Pagamento da Taxa" : "Dar Baixa na Taxa"}><DollarSign className="w-5 h-5" /></button>)}</>
                                        ) : (
                                            <div className="flex items-center gap-2"><div className={pres ? 'text-green-600' : 'text-gray-300'}>{pres ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}</div>{selectedActivity.fee && selectedActivity.fee > 0 && (<div className={isFeePaid ? 'text-indigo-600' : 'text-gray-300'} title={isFeePaid ? "Taxa Paga" : "Taxa Pendente"}><DollarSign className="w-5 h-5" /></div>)}</div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="p-4 bg-gray-50 border-t rounded-b-xl space-y-2">
                        <div className="flex justify-between items-center text-[10px] font-black text-gray-500 uppercase tracking-wider"><div className="flex gap-4"><span className="flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5 text-green-600" /> {selectedActivity.attendance.length} Presentes</span><span className="flex items-center gap-1"><XCircle className="w-3.5 h-3.5 text-red-500" /> {getAttendeesList(selectedActivity).length - selectedActivity.attendance.length} Ausentes</span></div></div>
                        {selectedActivity.fee && !isGuardian && (<div className="text-[10px] text-gray-500 font-bold flex justify-between pt-2 border-t border-gray-200 uppercase"><span>Arrecadação:</span><span className="text-primary-600">R$ {(selectedActivity.fee * (selectedActivity.feePayments?.length || 0)).toFixed(2)}</span></div>)}
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-xl border p-8 text-center h-64 flex flex-col items-center justify-center text-gray-400"><CalendarIcon className="w-12 h-12 mb-2 opacity-20" /><p>Selecione uma atividade para ver a lista.</p></div>
            )}
        </div>
      </div>
      {/* Restante do código dos modais omitido para brevidade, sem alterações */}
    </div>
  );
};
