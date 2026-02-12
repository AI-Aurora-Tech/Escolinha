
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Activity, Student, Group, User, UserRole, Transaction, TransactionType, PaymentStatus, PaymentMethod } from '../types';
import { Calendar as CalendarIcon, Clock, CheckCircle, Users, Repeat, CheckSquare, Square, Search, User as UserIcon, FileText, XCircle, Edit, Trophy, Coins, DollarSign, Trash2, MapPin, Megaphone, X, Play, Pause, Zap, ChevronLeft, ChevronRight, Filter, Minus, PlusCircle, Medal, BarChart3, ChevronDown, DollarSign as CashIcon, Goal, ChevronRight as ChevronRightIcon, Flag, AlertTriangle } from 'lucide-react';
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

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

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
      title: '', type: 'TRAINING', fee: 0, location: '', date: new Date().toISOString().split('T')[0], startTime: '14:00', endTime: '15:30', groupId: '', participants: [], recurrence: 'none', attendance: [], feePayments: [], presentationTime: '', opponent: '', homeScore: undefined, awayScore: undefined, scorers: []
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
      setNewActivity({ title: '', type: 'TRAINING', fee: 0, location: '', date: selectedDate, startTime: '14:00', endTime: '15:30', groupId: '', participants: [], recurrence: 'none', attendance: [], feePayments: [], presentationTime: '', opponent: '', homeScore: undefined, awayScore: undefined, scorers: [] });
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
      const activityData = { 
          ...newActivity, 
          fee: hasFee ? (newActivity.fee || 0) : 0, 
          groupId: targetType === 'GROUP' ? newActivity.groupId : undefined, 
          participants: targetType === 'INDIVIDUAL' ? Array.from(selectedStudentIds) : [], 
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

    // Clonamos os dados atuais para o payload de atualização
    const activityData = {
      ...newActivity,
      id: editingId,
      scorers: (newActivity.scorers || []).slice(0, newActivity.homeScore || 0)
    } as Activity;

    // REGRA DE HISTÓRICO: Se o jogo pertencia a um grupo, agora que acabou,
    // capturamos quem eram os atletas e transformamos em lista individual (estática).
    // Isso evita que mudanças futuras no grupo alterem o histórico deste jogo finalizado.
    if (activityData.groupId) {
        const currentGroupMembers = students.filter(s => (s.groupIds || []).includes(activityData.groupId!) && s.active);
        activityData.participants = currentGroupMembers.map(s => s.id);
        activityData.groupId = undefined; // Remove a ligação dinâmica com o grupo
    }

    // REGRA DE NEGÓCIO: Cancelar taxa de atletas ausentes
    if (activityData.type === 'GAME' && activityData.fee && activityData.fee > 0) {
      const participants = getAttendeesList(activityData);
      participants.forEach(student => {
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

    // Fluxo de cobrança de taxas pós-jogo
    if (activityData.type === 'GAME' && activityData.fee && activityData.fee > 0) {
        if (confirm("Resultado salvo!\nDeseja realizar a cobrança via WhatsApp das taxas de jogo para os atletas PRESENTES que ainda não pagaram?")) {
            const participants = getAttendeesList(activityData);
            const debtors = participants.filter(s => 
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
        const targetStudents = getAttendeesList(activityData);
        if (targetStudents.length > 0) {
            setNotifyActivity(activityData);
            setNotifyQueue(targetStudents);
            setNotifyCurrentIndex(0);
            setNotifyIsFeeCharging(false);
            setNotifyIsRunning(true);
            setNotifyModalOpen(true);
            setNotifyLogs([`Iniciando envio de resultados para ${targetStudents.length} atletas...`]);
            setNotifyCountdown(1);
        }
    }
  };

  const handleManualSearchChange = (val: string) => {
    setStudentSearch(val);
  };

  const getAttendeesList = (activity: Partial<Activity>) => {
      let list: Student[] = [];
      if (activity.groupId) {
          list = students.filter(s => (s.groupIds || []).includes(activity.groupId!) && s.active);
      } else if (activity.participants?.length) {
          list = students.filter(s => activity.participants?.includes(s.id));
      }
      return list.sort((a, b) => a.name.localeCompare(b.name));
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
                                {a.type === 'GAME' && isFinished && (<div className="mt-3 p-3 bg-yellow-50 rounded-lg border border-yellow-100">
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
                            
                            // Cálculo de inadimplência crítica (3 ou mais mensalidades)
                            const overdueCount = transactions.filter(t => 
                                t.studentId === s.id && 
                                t.type === TransactionType.INCOME && 
                                t.status === PaymentStatus.PENDING && 
                                t.date < todayStr
                            ).length;
                            const isCriticalDefaulter = overdueCount >= 3;

                            return (
                                <div key={s.id} className={`flex items-center justify-between p-3 border-b last:border-0 transition-colors rounded-lg ${isCriticalDefaulter ? 'bg-red-50 hover:bg-red-100 border-red-200 shadow-inner' : 'hover:bg-gray-50'}`}>
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className="relative">
                                            <span className={`text-sm font-medium truncate block ${isCriticalDefaulter ? 'text-red-700 font-black uppercase' : ''}`}>{s.name}</span>
                                            {isCriticalDefaulter && (
                                                <div className="flex items-center gap-1 mt-0.5">
                                                    <AlertTriangle className="w-3 h-3 text-red-600 animate-pulse" />
                                                    <span className="text-[9px] font-black text-red-600 uppercase tracking-tighter">{overdueCount} MENSALIDADES EM ATRASO</span>
                                                </div>
                                            )}
                                        </div>
                                        {goals > 0 && <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded-full font-bold shadow-sm">⚽ {goals}</span>}
                                    </div>
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

      {/* MODAL DE RELATÓRIOS */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold text-gray-900 flex items-center gap-2"><FileText className="text-primary-600" /> Exportar Relatórios</h3><button onClick={() => setShowReportModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><X className="w-6 h-6" /></button></div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Data Inicial</label><input type="date" className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-primary-500" value={reportStartDate} onChange={e => setReportStartDate(e.target.value)} /></div>
                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Data Final</label><input type="date" className="w-full border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-primary-500" value={reportEndDate} onChange={e => setReportEndDate(e.target.value)} /></div>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100"><label className="block text-xs font-bold text-gray-500 uppercase mb-2">Filtrar por Jogo (Opcional)</label><select className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-primary-500" value={reportSelectedGameId} onChange={(e) => setReportSelectedGameId(e.target.value)}><option value="ALL">Todos os Jogos do Período</option>{gamesForSelect.map(game => (<option key={game.id} value={game.id}>{formatFriendlyDate(game.date)} - {game.title}</option>))}</select></div>
              <div className="pt-4 border-t space-y-3 h-[300px] overflow-y-auto pr-2">
                <button onClick={generateTrainingReport} className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-orange-50 border border-gray-100 hover:border-orange-200 rounded-xl transition-all group text-left">
                  <div className="flex items-center gap-3"><div className="p-2 bg-orange-100 rounded-lg group-hover:bg-orange-200 transition-colors"><CheckSquare className="w-5 h-5 text-orange-600" /></div><div><span className="font-bold text-gray-800 block group-hover:text-orange-700">Frequência nos Treinos</span><span className="text-[10px] text-gray-500 uppercase font-bold tracking-tight">Presenças vs Faltas</span></div></div><ChevronRightIcon className="w-5 h-5 text-gray-300 group-hover:text-orange-500" />
                </button>
                <button onClick={generateGameAttendanceAndPaymentReport} className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-indigo-50 border border-gray-100 hover:border-indigo-200 rounded-xl transition-all group text-left">
                  <div className="flex items-center gap-3"><div className="p-2 bg-indigo-100 rounded-lg group-hover:bg-indigo-200 transition-colors"><DollarSign className="w-5 h-5 text-indigo-600" /></div><div><span className="font-bold text-gray-800 block group-hover:text-indigo-700">Taxas e Presença em Jogos</span><span className="text-[10px] text-gray-500 uppercase font-bold tracking-tight">Status de Pagamento por Jogo</span></div></div><ChevronRightIcon className="w-5 h-5 text-gray-300 group-hover:text-indigo-500" />
                </button>
                <button onClick={generateGameGeneralReport} className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-yellow-50 border border-gray-100 hover:border-yellow-200 rounded-xl transition-all group text-left">
                  <div className="flex items-center gap-3"><div className="p-2 bg-yellow-100 rounded-lg group-hover:bg-yellow-200 transition-colors"><BarChart3 className="w-5 h-5 text-yellow-600" /></div><div><span className="font-bold text-gray-800 block group-hover:text-yellow-700">Geral dos Jogos</span><span className="text-[10px] text-gray-500 uppercase font-bold tracking-tight">Vitórias, Derrotas e Gols</span></div></div><ChevronRightIcon className="w-5 h-5 text-gray-300 group-hover:text-orange-500" />
                </button>
                <button onClick={generateStudentStatsReport} className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-blue-50 border border-gray-100 hover:border-blue-200 rounded-xl transition-all group text-left">
                  <div className="flex items-center gap-3"><div className="p-2 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors"><Goal className="w-5 h-5 text-blue-600" /></div><div><span className="font-bold text-gray-800 block group-hover:text-blue-700">Estatísticas de Atletas</span><span className="text-[10px] text-gray-500 uppercase font-bold tracking-tight">Artilharia e Participações</span></div></div><ChevronRightIcon className="w-5 h-5 text-gray-300 group-hover:text-blue-500" />
                </button>
              </div>
            </div>
            <div className="flex justify-end mt-8"><button onClick={() => setShowReportModal(false)} className="px-6 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-lg transition-colors">Cancelar</button></div>
          </div>
        </div>
      )}

      {/* MODAL ENCERRAR JOGO (RESULTADO) */}
      {showFinishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
             <div className="bg-white rounded-2xl shadow-xl w-full max-md p-6 animate-in zoom-in duration-200">
                <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Flag className="text-orange-600" /> Encerrar Partida</h3><button onClick={() => setShowFinishModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><X className="w-6 h-6" /></button></div>
                <form onSubmit={handleFinishMatchSubmit} className="space-y-6">
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                      <p className="text-xs font-bold text-gray-400 uppercase mb-3 text-center tracking-widest">Placar Final</p>
                      <div className="flex items-center gap-4">
                          <div className="flex-1 text-center"><label className="block text-[10px] font-black text-primary-600 mb-1 uppercase">Garotos</label><input type="number" min="0" className="w-20 mx-auto border-2 border-gray-200 rounded-xl p-3 text-center text-3xl font-black focus:border-primary-500 outline-none transition-all" value={newActivity.homeScore} onChange={e => setNewActivity({...newActivity, homeScore: parseInt(e.target.value) || 0})} /></div>
                          <div className="text-2xl font-light text-gray-300 pt-4">X</div>
                          <div className="flex-1 text-center"><label className="block text-[10px] font-black text-gray-400 mb-1 uppercase truncate">{newActivity.opponent || 'Visitante'}</label><input type="number" min="0" className="w-20 mx-auto border-2 border-gray-200 rounded-xl p-3 text-center text-3xl font-black focus:border-gray-400 outline-none transition-all" value={newActivity.awayScore} onChange={e => setNewActivity({...newActivity, awayScore: parseInt(e.target.value) || 0})} /></div>
                      </div>
                    </div>
                    {(newActivity.homeScore || 0) > 0 && (<div className="space-y-3"><label className="block text-xs font-black text-gray-500 uppercase tracking-wider">Artilheiros (Garotos)</label><div className="max-h-48 overflow-y-auto pr-2 space-y-2">{Array.from({ length: Math.min(newActivity.homeScore || 0, 20) }).map((_, idx) => (<div key={idx} className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg border border-gray-100"><span className="text-[10px] font-black text-primary-600 w-8">GOL {idx + 1}</span><select className="flex-1 border rounded-lg p-2 bg-white text-xs outline-none focus:ring-2 focus:ring-primary-500" value={newActivity.scorers?.[idx] || ''} onChange={e => updateScorer(idx, e.target.value)} required><option value="">Quem marcou?</option>{getAttendeesList(newActivity).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>))}</div></div>)}
                    <div className="flex flex-col gap-3 pt-4 border-t"><button type="submit" className="w-full py-4 bg-primary-600 text-white rounded-xl font-black shadow-lg shadow-primary-200 hover:bg-primary-700 transition-all uppercase tracking-tighter">SALVAR RESULTADO</button><button type="button" onClick={() => setShowFinishModal(false)} className="w-full py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition-colors">Voltar</button></div>
                </form>
             </div>
        </div>
      )}

      {showAddModal && !isGuardian && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
             <div className="bg-white rounded-2xl shadow-xl w-full max-lg p-6 overflow-y-auto max-h-[90vh] animate-in zoom-in duration-200">
                <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold text-gray-900">{editingId ? 'Editar Atividade' : 'Novo Agendamento'}</h3><button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><X className="w-6 h-6" /></button></div>
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="flex gap-4"><label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all cursor-pointer font-bold ${newActivity.type === 'TRAINING' ? 'bg-primary-50 border-primary-500 text-primary-700 shadow-sm' : 'bg-white border-gray-100 text-gray-400 hover:border-primary-200'}`}><input type="radio" checked={newActivity.type === 'TRAINING'} onChange={() => setNewActivity({...newActivity, type: 'TRAINING'})} className="hidden" /> <Zap className="w-4 h-4" /> Treino</label><label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all cursor-pointer font-bold ${newActivity.type === 'GAME' ? 'bg-yellow-50 border-yellow-500 text-yellow-700 shadow-sm' : 'bg-white border-gray-100 text-gray-400 hover:border-primary-200'}`}><input type="radio" checked={newActivity.type === 'GAME'} onChange={() => setNewActivity({...newActivity, type: 'GAME'})} className="hidden" /> <Trophy className="w-4 h-4" /> Jogo</label></div>
                    <div><label className="block text-sm font-bold text-gray-700 mb-1">Título da Atividade</label><input className="w-full border border-gray-200 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary-500 transition-shadow" placeholder="Ex: Treino Técnico, Amistoso..." required value={newActivity.title} onChange={e => setNewActivity({...newActivity, title: e.target.value})} /></div>
                    {newActivity.type === 'GAME' && (<div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100 space-y-4">
                             <div><label className="block text-[10px] font-black text-yellow-800 uppercase mb-1">Equipe Adversária</label><input type="text" className="w-full border border-yellow-200 rounded-lg p-2 bg-white outline-none focus:ring-2 focus:ring-yellow-500" placeholder="Nome do time..." value={newActivity.opponent} onChange={e => setNewActivity({...newActivity, opponent: e.target.value})} /></div>
                             <div className="flex items-center gap-4 bg-white p-3 rounded-xl border border-yellow-100 shadow-sm">
                                 <div className="flex-1 text-center"><label className="block text-[10px] font-black text-primary-600 mb-1">GAROTOS</label><input type="number" min="0" className="w-16 mx-auto border rounded-lg p-2 text-center text-2xl font-black" value={newActivity.homeScore ?? ''} onChange={e => setNewActivity({...newActivity, homeScore: e.target.value === '' ? undefined : parseInt(e.target.value)})} /></div>
                                 <div className="text-2xl font-light text-gray-300">X</div>
                                 <div className="flex-1 text-center"><label className="block text-[10px] font-black text-gray-400 mb-1">VISITANTE</label><input type="number" min="0" className="w-16 mx-auto border rounded-lg p-2 text-center text-2xl font-black" value={newActivity.awayScore ?? ''} onChange={e => setNewActivity({...newActivity, awayScore: e.target.value === '' ? undefined : parseInt(e.target.value)})} /></div>
                             </div>
                             <div><label className="block text-[10px] font-black text-yellow-800 uppercase mb-1">Horário de Apresentação</label><input type="time" className="w-full border border-yellow-200 rounded-lg p-2 bg-white outline-none focus:ring-2 focus:ring-yellow-500" value={newActivity.presentationTime} onChange={e => setNewActivity({...newActivity, presentationTime: e.target.value})} /></div>
                        </div>)}
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="block text-sm font-bold text-gray-700 mb-1">Data</label><input className="w-full border border-gray-200 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary-500" type="date" required value={newActivity.date} onChange={e => setNewActivity({...newActivity, date: e.target.value})} /></div>
                      <div><label className="block text-sm font-bold text-gray-700 mb-1">Início</label><input className="w-full border border-gray-200 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary-500" type="time" required value={newActivity.startTime} onChange={e => setNewActivity({...newActivity, startTime: e.target.value})} /></div>
                    </div>
                    {newActivity.type === 'TRAINING' && (<div className="animate-in fade-in slide-in-from-top-1 duration-200"><label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-2"><Repeat className="w-4 h-4 text-primary-600" />Recorrência</label><select className="w-full border border-gray-200 rounded-lg p-2.5 bg-white outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer text-sm" value={newActivity.recurrence} onChange={e => setNewActivity({...newActivity, recurrence: e.target.value as any})}><option value="none">Evento Único</option><option value="weekly">Semanalmente (até o fim do ano)</option></select></div>)}
                    <div className="bg-gray-50 p-4 rounded-xl space-y-3"><div className="flex items-center gap-2"><input type="checkbox" id="modal-has-fee" checked={hasFee} onChange={e => setHasFee(e.target.checked)} className="rounded text-primary-600 focus:ring-primary-500 w-4 h-4 cursor-pointer" /><label htmlFor="modal-has-fee" className="text-sm font-bold text-gray-700 cursor-pointer">Possui taxa extra?</label></div>{hasFee && (<div className="animate-in fade-in slide-in-from-top-1 duration-200"><label className="block text-[10px] font-black text-primary-600 uppercase mb-1 tracking-wider">Valor da Taxa (R$)</label><input type="number" step="0.01" className="w-full border border-primary-200 rounded-lg p-2 bg-white outline-none focus:ring-2 focus:ring-primary-500 font-bold" placeholder="0,00" value={newActivity.fee} onChange={e => setNewActivity({...newActivity, fee: parseFloat(e.target.value) || 0})} /></div>)}</div>
                    <div><label className="block text-sm font-bold text-gray-700 mb-1">Localização</label><input className="w-full border border-gray-200 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary-500 transition-shadow" placeholder="Ex: Quadra 01, Estádio Municipal..." value={newActivity.location} onChange={e => setNewActivity({...newActivity, location: e.target.value})} /></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div><label className="block text-sm font-bold text-gray-700 mb-1">Público Alvo</label><select className="w-full border border-gray-200 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-primary-500 outline-none cursor-pointer" value={targetType} onChange={e => setTargetType(e.target.value as any)}><option value="GROUP">Grupo Específico</option><option value="INDIVIDUAL">Lista Manual</option></select></div>
                      {targetType === 'GROUP' ? (<div><label className="block text-sm font-bold text-gray-700 mb-1">Grupo</label><select className="w-full border border-gray-200 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-primary-500 outline-none cursor-pointer" value={newActivity.groupId} onChange={e => setNewActivity({...newActivity, groupId: e.target.value})}><option value="">Escolha um grupo...</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>) : (
                        <div>
                          <label className="block text-sm font-bold text-gray-700 mb-1 flex justify-between items-center">
                            <span>Alunos ({selectedStudentIds.size})</span>
                            {selectedStudentIds.size > 0 && <button type="button" onClick={() => setSelectedStudentIds(new Set())} className="text-[10px] text-red-500 hover:underline uppercase font-black">Limpar</button>}
                          </label>
                          <div className="relative mb-2">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input 
                              type="text" 
                              placeholder="Buscar atleta por nome..." 
                              className="w-full pl-9 pr-4 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 outline-none shadow-sm"
                              value={studentSearch}
                              onChange={e => handleManualSearchChange(e.target.value)}
                            />
                          </div>
                          <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-1 bg-gray-50 shadow-inner">
                            {filteredStudents.length > 0 ? filteredStudents.map(s => (
                              <div key={s.id} onClick={() => toggleStudentSelection(s.id)} className={`flex items-center gap-2 p-2 cursor-pointer rounded transition-colors mb-1 last:border-0 ${selectedStudentIds.has(s.id) ? 'bg-primary-50 text-primary-900 border border-primary-100' : 'hover:bg-white text-gray-700'}`}>
                                {selectedStudentIds.has(s.id) ? <CheckSquare className="text-primary-600 w-4 h-4" /> : <Square className="text-gray-300 w-4 h-4" />}
                                <span className={`text-xs font-bold ${selectedStudentIds.has(s.id) ? 'font-black' : ''}`}>{s.name}</span>
                              </div>
                            )) : <div className="p-4 text-center text-xs text-gray-400 italic">Nenhum atleta ativo encontrado.</div>}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex justify-end gap-3 pt-6 border-t mt-6"><button type="button" onClick={() => setShowAddModal(false)} className="px-5 py-2.5 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition-colors">Cancelar</button><button type="submit" className="px-8 py-2.5 bg-primary-600 text-white rounded-xl font-black shadow-lg shadow-primary-200 hover:bg-primary-700 transition-all">SALVAR AGENDAMENTO</button></div>
                </form>
             </div>
        </div>
      )}

      {notifyModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-md p-6 border-t-4 border-blue-500">
            <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-black flex items-center gap-2 text-gray-800 uppercase tracking-tighter"><Megaphone className="w-5 h-5 text-blue-600" /> Disparos Z-API</h3>{!notifyIsRunning && <button onClick={() => setNotifyModalOpen(false)}><X className="text-gray-400" /></button>}</div>
            <div className="mb-6"><div className="flex justify-between text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider"><span>Progresso da Fila:</span><span>{notifyCurrentIndex} de {notifyQueue.length}</span></div><div className="w-full bg-gray-100 rounded-full h-2.5 mb-4 overflow-hidden"><div className="bg-blue-600 h-2.5 rounded-full transition-all duration-500 shadow-sm" style={{ width: `${(notifyCurrentIndex / notifyQueue.length) * 100}%` }}></div></div>{notifyIsRunning ? (<div className="bg-blue-50 text-blue-800 p-3 rounded-xl text-sm text-center font-bold animate-pulse">Enviando em {notifyCountdown}s...</div>) : (<div className="bg-green-50 text-green-800 p-3 rounded-xl text-sm text-center font-bold">Processo Concluído!</div>)}</div>
            <div className="bg-gray-900 text-green-400 p-4 rounded-xl h-48 overflow-y-auto text-xs font-mono shadow-inner mb-4">{notifyLogs.map((log, i) => (<div key={i} className="mb-1 border-b border-gray-800 pb-1 last:border-0">{log}</div>))}</div>
            <div className="flex justify-end gap-2">{notifyIsRunning ? (<button onClick={() => setNotifyIsRunning(false)} className="flex-1 px-4 py-2 bg-red-100 text-red-700 rounded-xl text-sm font-bold hover:bg-red-200 transition-colors"><Pause className="w-4 h-4 inline mr-1" /> PAUSAR</button>) : (<button onClick={() => setNotifyIsRunning(true)} className="flex-1 px-4 py-2 bg-green-100 text-green-700 rounded-xl text-sm font-bold hover:bg-green-200 transition-colors" disabled={notifyCurrentIndex >= notifyQueue.length}><Play className="w-4 h-4 inline mr-1" /> CONTINUAR</button>)}<button onClick={() => setNotifyModalOpen(false)} className="flex-1 px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-200 transition-colors">FECHAR</button></div>
          </div>
        </div>
      )}
    </div>
  );
};
