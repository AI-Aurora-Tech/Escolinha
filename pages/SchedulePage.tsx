




import React, { useState, useMemo } from 'react';
import { Activity, Group, Student, User, UserRole } from '../types';
import { Calendar as CalendarIcon, Clock, MapPin, Users, Plus, Edit, Trash2, CheckCircle, XCircle, DollarSign, Download, ChevronLeft, ChevronRight, Filter, FileText, X, Trophy, Minus, PlusCircle } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface SchedulePageProps {
  activities: Activity[];
  students: Student[];
  groups: Group[];
  onAddActivity: (activity: any) => void;
  onUpdateActivity: (activity: any) => void;
  onUpdateAttendance: (activityId: string, studentId: string) => void;
  onUpdateFeePayment: (activityId: string, studentId: string) => void;
  onDeleteActivity: (id: string) => void;
  currentUser: User | null;
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
  // Navigation State
  const [selectedDate, setSelectedDate] = useState(new Date());

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Report Modal State
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportStartDate, setReportStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [reportEndDate, setReportEndDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]);

  // Expanded Activity for Attendance (view details)
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);

  const isGuardian = currentUser?.role === UserRole.RESPONSAVEL;
  const canEdit = !isGuardian;

  // Modal Form State
  const initialForm: any = {
    title: '',
    type: 'TRAINING',
    groupId: '',
    date: new Date().toISOString().split('T')[0],
    startTime: '14:00',
    endTime: '15:30',
    location: '',
    fee: 0,
    recurrence: 'none',
    score: '',
    goals: []
  };
  const [form, setForm] = useState(initialForm);
  // Temporary state for adding a goal scorer in the modal
  const [selectedScorerId, setSelectedScorerId] = useState('');

  // Helper Date Functions
  const formatDate = (dateString: string) => {
      if (!dateString) return '';
      const parts = dateString.split('-');
      if (parts.length === 3) {
          return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return dateString;
  };

  const getDayLabel = (date: Date) => {
      return date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  // Filter activities by SELECTED DAY
  const filteredActivities = useMemo(() => {
    const targetDateStr = selectedDate.toISOString().split('T')[0];
    return activities.filter(a => a.date === targetDateStr)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [activities, selectedDate]);

  const changeDate = (days: number) => {
      const newDate = new Date(selectedDate);
      newDate.setDate(selectedDate.getDate() + days);
      setSelectedDate(newDate);
  };

  const handleOpenNew = () => {
      setEditingId(null);
      setForm({
          ...initialForm,
          date: selectedDate.toISOString().split('T')[0] // Default to currently selected date
      });
      setSelectedScorerId('');
      setIsModalOpen(true);
  };

  const handleOpenEdit = (activity: Activity) => {
      setEditingId(activity.id);
      setForm({
          title: activity.title,
          type: activity.type || 'TRAINING',
          groupId: activity.groupId || '',
          date: activity.date,
          startTime: activity.startTime,
          endTime: activity.endTime,
          location: activity.location || '',
          fee: activity.fee || 0,
          recurrence: activity.recurrence || 'none',
          score: activity.score || '',
          goals: activity.goals || []
      });
      setSelectedScorerId('');
      setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const activityData = { ...form };
      
      if (editingId) {
          onUpdateActivity({ ...activityData, id: editingId });
      } else {
          onAddActivity(activityData);
      }
      setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
      if (confirm('Tem certeza que deseja excluir esta atividade?')) {
          onDeleteActivity(id);
      }
  };

  // Goal Management Logic
  const handleAddGoal = () => {
      if (!selectedScorerId) return;
      
      const currentGoals = [...(form.goals || [])];
      const existingEntry = currentGoals.find((g: any) => g.studentId === selectedScorerId);

      if (existingEntry) {
          existingEntry.count += 1;
      } else {
          currentGoals.push({ studentId: selectedScorerId, count: 1 });
      }
      setForm({ ...form, goals: currentGoals });
      setSelectedScorerId('');
  };

  const handleRemoveGoal = (studentId: string) => {
      const currentGoals = [...(form.goals || [])];
      const existingEntry = currentGoals.find((g: any) => g.studentId === studentId);
      
      if (existingEntry) {
          if (existingEntry.count > 1) {
              existingEntry.count -= 1;
          } else {
              const index = currentGoals.indexOf(existingEntry);
              currentGoals.splice(index, 1);
          }
          setForm({ ...form, goals: currentGoals });
      }
  };


  // --- REPORT GENERATION ---

  const handleExportAttendanceReport = () => {
    const start = reportStartDate;
    const end = reportEndDate;

    const activitiesInRange = activities.filter(a => a.date >= start && a.date <= end)
        .sort((a, b) => new Date(a.date + 'T' + a.startTime).getTime() - new Date(b.date + 'T' + b.startTime).getTime());

    if (activitiesInRange.length === 0) {
        alert("Nenhuma atividade encontrada no período selecionado.");
        return;
    }

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Relatório de Atividades`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Período: ${formatDate(start)} a ${formatDate(end)}`, 14, 26);

    let currentY = 35;

    activitiesInRange.forEach((activity) => {
        const groupName = groups.find(g => g.id === activity.groupId)?.name || 'Misto/Individual';
        const scoreText = activity.score ? ` - Placar: ${activity.score}` : '';

        // Add Activity Header
        if (currentY > 250) { doc.addPage(); currentY = 20; }
        
        doc.setFillColor(240, 240, 240);
        doc.rect(14, currentY, 182, 8, 'F');
        doc.setFont("helvetica", "bold");
        doc.text(`${formatDate(activity.date)} - ${activity.title} (${groupName})${scoreText}`, 16, currentY + 5);
        doc.setFont("helvetica", "normal");
        
        currentY += 10;

        const activityStudents = getActivityStudents(activity);
        
        const rows = activityStudents.map(s => {
            const isPresent = activity.attendance?.includes(s.id);
            const hasPaid = activity.feePayments?.includes(s.id);
            const goals = activity.goals?.find(g => g.studentId === s.id)?.count || 0;
            
            let paymentStatus = '-';
            if (activity.type === 'GAME' && activity.fee && activity.fee > 0) {
                paymentStatus = hasPaid ? 'PAGO' : 'PENDENTE';
            }

            return [
                s.name,
                isPresent ? 'PRESENTE' : 'AUSENTE',
                paymentStatus,
                goals > 0 ? goals.toString() : '-'
            ];
        });

        autoTable(doc, {
            startY: currentY,
            head: [['Atleta', 'Presença', 'Taxa', 'Gols']],
            body: rows,
            theme: 'grid',
            headStyles: { fillColor: [100, 100, 100], fontSize: 8 },
            bodyStyles: { fontSize: 8 },
            columnStyles: { 
                0: { cellWidth: 90 },
                1: { cellWidth: 30 },
                2: { cellWidth: 30 },
                3: { cellWidth: 20 }
            },
            didParseCell: (data) => {
                 if (data.section === 'body') {
                     if (data.column.index === 1) {
                         data.cell.styles.textColor = data.cell.raw === 'PRESENTE' ? [0, 128, 0] : [200, 0, 0];
                     }
                     if (data.column.index === 2) {
                         if (data.cell.raw === 'PAGO') data.cell.styles.textColor = [0, 128, 0];
                         if (data.cell.raw === 'PENDENTE') data.cell.styles.textColor = [200, 0, 0];
                     }
                 }
            }
        });

        // @ts-ignore
        currentY = doc.lastAutoTable.finalY + 10;
    });

    doc.save(`Relatorio_Atividades_${start}_${end}.pdf`);
  };

  const handleExportGameStats = () => {
    const start = reportStartDate;
    const end = reportEndDate;

    // Filter only GAMES in range
    const gamesInRange = activities.filter(a => 
        a.type === 'GAME' && 
        a.date >= start && 
        a.date <= end
    );

    if (gamesInRange.length === 0) {
        alert("Nenhum JOGO encontrado no período selecionado.");
        return;
    }

    // Calculate stats per student
    const statsData = students.map(student => {
        let convocations = 0;
        let attended = 0;
        let totalGoals = 0;

        gamesInRange.forEach(game => {
             const isGroupMatch = game.groupId === student.groupId;
             const isParticipant = game.participants?.includes(student.id);
             
             if (isGroupMatch || isParticipant) {
                 convocations++;
                 if (game.attendance?.includes(student.id)) {
                     attended++;
                 }
                 const goalsInGame = game.goals?.find(g => g.studentId === student.id)?.count || 0;
                 totalGoals += goalsInGame;
             }
        });

        return {
            name: student.name,
            group: groups.find(g => g.id === student.groupId)?.name || 'Sem Grupo',
            convocations,
            attended,
            totalGoals
        };
    })
    .sort((a, b) => b.totalGoals - a.totalGoals || b.convocations - a.convocations); // Ordenar por gols, depois jogos

    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Estatísticas de Jogos e Artilharia`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Período: ${formatDate(start)} a ${formatDate(end)}`, 14, 26);
    doc.text(`Total de Jogos no Período: ${gamesInRange.length}`, 14, 32);

    const tableData = statsData.map(s => [
        s.name,
        s.group,
        s.convocations.toString(),
        s.attended.toString(),
        s.totalGoals.toString(),
        s.convocations > 0 ? `${Math.round((s.attended/s.convocations)*100)}%` : '0%'
    ]);

    autoTable(doc, {
        startY: 38,
        head: [['Atleta', 'Grupo', 'Jogos (Convocado)', 'Presenças', 'Gols', '% Freq.']],
        body: tableData,
        headStyles: { fillColor: [234, 88, 12] }, // Orange-600
        alternateRowStyles: { fillColor: [255, 247, 237] } // Orange-50
    });

    doc.save(`Estatisticas_Jogos_${start}_${end}.pdf`);
  };

  const handleExportSingleActivityPDF = (activity: Activity) => {
        const groupName = groups.find(g => g.id === activity.groupId)?.name || 'Misto/Individual';
        const doc = new jsPDF();
        
        doc.setFontSize(16);
        doc.text(activity.title, 14, 20);
        doc.setFontSize(10);
        doc.text(`Data: ${formatDate(activity.date)} - Horário: ${activity.startTime}`, 14, 28);
        doc.text(`Grupo: ${groupName} | Tipo: ${activity.type === 'GAME' ? 'JOGO' : 'TREINO'}`, 14, 34);
        if (activity.location) doc.text(`Local: ${activity.location}`, 14, 40);
        if (activity.score) doc.text(`Placar Final: ${activity.score}`, 14, 46);

        const activityStudents = getActivityStudents(activity);
        
        const rows = activityStudents.map(s => {
            const isPresent = activity.attendance?.includes(s.id);
            const hasPaid = activity.feePayments?.includes(s.id);
            const goals = activity.goals?.find(g => g.studentId === s.id)?.count || 0;
            
            let payment = '-';
            if (activity.type === 'GAME' && activity.fee && activity.fee > 0) payment = hasPaid ? 'PAGO' : 'PENDENTE';

            return [s.name, isPresent ? 'SIM' : 'NÃO', payment, goals > 0 ? goals.toString() : '-'];
        });

        autoTable(doc, {
            startY: 55,
            head: [['Atleta', 'Presença', 'Taxa', 'Gols']],
            body: rows,
            headStyles: { fillColor: [249, 115, 22] },
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index === 1) {
                    data.cell.styles.textColor = data.cell.raw === 'SIM' ? [0,128,0] : [200,0,0];
                }
            }
        });

        doc.save(`Relatorio_${activity.title.replace(/\s+/g, '_')}.pdf`);
  };

  // Helper to get students for an activity
  const getActivityStudents = (activity: Activity | any) => {
      // Logic duplicated for form preview where activity might be 'form' state which implies structure
      const targetGroupId = activity.groupId || activity.group_id; 
      const targetParticipants = activity.participants || [];

      if (targetGroupId) {
          return students.filter(s => s.groupId === targetGroupId && s.active);
      }
      if (targetParticipants && targetParticipants.length > 0) {
          return students.filter(s => targetParticipants.includes(s.id));
      }
      return students.filter(s => s.active); // Fallback: all active if no filter (rare)
  };

  // --- BULK WHATSAPP MESSAGE (CONVOCAÇÃO) ---
  // Simple "Click to Chat" implementation for now
  const handleBulkNotify = (activity: Activity) => {
      const activityStudents = getActivityStudents(activity);
      if (activityStudents.length === 0) {
          alert("Nenhum aluno nesta atividade.");
          return;
      }
      
      if (!confirm(`Deseja enviar convocação para ${activityStudents.length} atletas via WhatsApp? (Isso abrirá várias janelas)`)) return;

      const dateStr = formatDate(activity.date);
      let baseMessage = `⚽ *GAROTOS DO MARTINICA* ⚽\n\n`;
      
      if (activity.type === 'GAME') {
          baseMessage += `🗓 *CONVOCAÇÃO DE JOGO*\n`;
          baseMessage += `🆚 ${activity.title}\n`;
          baseMessage += `📅 Data: ${dateStr}\n`;
          baseMessage += `⏰ Horário: ${activity.startTime}\n`;
          baseMessage += `📍 Local: ${activity.location || 'A definir'}\n`;
          if (activity.fee && activity.fee > 0) baseMessage += `💰 Taxa: R$ ${activity.fee.toFixed(2)}\n`;
      } else {
          baseMessage += `💪 *LEMBRETE DE TREINO*\n`;
          baseMessage += `📅 Data: ${dateStr}\n`;
          baseMessage += `⏰ Horário: ${activity.startTime}\n`;
          baseMessage += `📝 Obs: ${activity.title}\n`;
      }
      
      baseMessage += `\nContamos com sua presença!`;

      // Simulação de fila simples
      activityStudents.forEach((s, index) => {
          if (!s.guardian.phone) return;
          const phone = s.guardian.phone.replace(/\D/g, '');
          const msg = `Olá ${s.name} / ${s.guardian.name},\n\n` + baseMessage;
          
          setTimeout(() => {
              window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`, '_blank');
          }, index * 8000); // 8 segundos entre cada aba
      });
  };


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
            <h2 className="text-2xl font-bold text-gray-800">Agenda</h2>
            <p className="text-gray-500 text-sm">Gerencie treinos, jogos e escalas.</p>
        </div>
        <div className="flex items-center gap-2">
            {!isGuardian && (
                <>
                <button 
                    onClick={() => setIsReportModalOpen(true)}
                    className="flex items-center gap-2 bg-white text-gray-700 border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors shadow-sm text-sm font-medium"
                >
                    <FileText className="w-4 h-4 text-orange-600" /> 
                    Relatórios
                </button>
                <button 
                    onClick={handleOpenNew}
                    className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors shadow-sm text-sm font-medium"
                >
                    <Plus className="w-4 h-4" /> Novo Evento
                </button>
                </>
            )}
        </div>
      </div>

      {/* Date Navigation */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
              <button onClick={() => changeDate(-1)} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
                  <ChevronLeft className="w-6 h-6" />
              </button>
              <div className="text-center">
                  <h3 className="text-lg font-bold text-gray-800 capitalize">{getDayLabel(selectedDate)}</h3>
                  <input 
                    type="date" 
                    className="text-xs text-gray-400 bg-transparent outline-none text-center cursor-pointer hover:text-primary-500"
                    value={selectedDate.toISOString().split('T')[0]}
                    onChange={(e) => setSelectedDate(new Date(e.target.value + 'T12:00:00'))}
                  />
              </div>
              <button onClick={() => changeDate(1)} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
                  <ChevronRight className="w-6 h-6" />
              </button>
          </div>
          
          <button onClick={() => setSelectedDate(new Date())} className="text-sm font-medium text-primary-600 hover:text-primary-700">
              Ir para Hoje
          </button>
      </div>

      {/* Activity List */}
      <div className="space-y-4">
          {filteredActivities.length > 0 ? (
              filteredActivities.map(activity => {
                  const activityStudents = getActivityStudents(activity);
                  const presentCount = activity.attendance ? activity.attendance.length : 0;
                  const totalCount = activityStudents.length;
                  const isExpanded = expandedActivityId === activity.id;
                  const groupName = groups.find(g => g.id === activity.groupId)?.name || 'Individual/Misto';
                  
                  // Calculate Fee stats
                  const paidCount = activity.feePayments?.length || 0;
                  const potentialFee = totalCount * (activity.fee || 0);
                  const collectedFee = paidCount * (activity.fee || 0);

                  return (
                      <div key={activity.id} className={`bg-white rounded-xl shadow-sm border transition-all ${isExpanded ? 'border-primary-200 ring-1 ring-primary-100' : 'border-gray-100'}`}>
                          {/* Activity Card Header */}
                          <div className="p-4 sm:p-5 flex flex-col md:flex-row gap-4 justify-between">
                              <div className="flex items-start gap-4">
                                  <div className={`flex flex-col items-center justify-center min-w-[60px] p-2 rounded-lg ${activity.type === 'GAME' ? 'bg-orange-100 text-orange-700' : 'bg-blue-50 text-blue-700'}`}>
                                      {activity.type === 'GAME' ? <Trophy className="w-6 h-6 mb-1" /> : <CalendarIcon className="w-6 h-6 mb-1" />}
                                      <span className="text-[10px] font-bold uppercase">{activity.type === 'GAME' ? 'JOGO' : 'TREINO'}</span>
                                  </div>
                                  <div>
                                      <h3 className="font-bold text-gray-900 text-lg leading-tight flex items-center gap-2">
                                        {activity.title}
                                        {activity.score && (
                                            <span className="bg-orange-100 text-orange-800 text-xs px-2 py-0.5 rounded border border-orange-200">
                                                {activity.score}
                                            </span>
                                        )}
                                      </h3>
                                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 mt-2">
                                          <div className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> {activity.startTime} - {activity.endTime}</div>
                                          <div className="flex items-center gap-1.5"><Users className="w-4 h-4" /> {groupName}</div>
                                          {activity.location && <div className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> {activity.location}</div>}
                                      </div>
                                      {activity.type === 'GAME' && activity.fee && activity.fee > 0 && (
                                          <div className="mt-2 inline-flex items-center gap-2 bg-green-50 text-green-700 px-2 py-1 rounded text-xs font-medium">
                                              <DollarSign className="w-3 h-3" />
                                              Arrecadado: R$ {collectedFee.toFixed(2)} / R$ {potentialFee.toFixed(2)}
                                          </div>
                                      )}
                                  </div>
                              </div>
                              
                              <div className="flex flex-col items-end gap-3 justify-center border-t md:border-0 border-gray-100 pt-4 md:pt-0">
                                  {!isGuardian && (
                                    <div className="text-right w-full md:w-auto">
                                        <div className="flex items-center justify-end gap-2 mb-1">
                                            <span className="text-xs text-gray-400">Presença: {presentCount}/{totalCount}</span>
                                        </div>
                                        <div className="w-full md:w-32 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-green-500 rounded-full transition-all duration-500" 
                                                style={{ width: `${totalCount > 0 ? (presentCount/totalCount)*100 : 0}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                  )}
                                  
                                  <div className="flex gap-2 w-full md:w-auto justify-end">
                                      {canEdit && (
                                        <button 
                                            onClick={() => handleBulkNotify(activity)}
                                            className="p-2 text-white bg-green-500 hover:bg-green-600 rounded-lg transition-colors shadow-sm"
                                            title="Enviar Convocação (WhatsApp)"
                                        >
                                            <Users className="w-4 h-4" />
                                        </button>
                                      )}
                                      <button 
                                          onClick={() => setExpandedActivityId(isExpanded ? null : activity.id)}
                                          className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors flex-1 md:flex-none ${isExpanded ? 'bg-primary-50 text-primary-700' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                                      >
                                          {isExpanded ? 'Ocultar' : 'Gerenciar'}
                                      </button>
                                      {canEdit && (
                                          <>
                                            <button onClick={() => handleOpenEdit(activity)} className="p-2 text-gray-400 hover:text-primary-600 hover:bg-gray-50 rounded-lg border border-gray-100">
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleDelete(activity.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-gray-50 rounded-lg border border-gray-100">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                          </>
                                      )}
                                  </div>
                              </div>
                          </div>

                          {/* Expanded Details Pane */}
                          {isExpanded && (
                              <div className="border-t border-gray-100 bg-gray-50 p-4 rounded-b-xl animate-in fade-in slide-in-from-top-2">
                                  {/* Artilharia Summary if GAME */}
                                  {activity.type === 'GAME' && activity.goals && activity.goals.length > 0 && (
                                      <div className="mb-4 bg-white p-3 rounded-lg border border-gray-200">
                                          <h5 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1"><Trophy className="w-3 h-3 text-orange-500" /> Gols da Partida</h5>
                                          <div className="flex flex-wrap gap-2">
                                              {activity.goals.map((g, idx) => {
                                                  const student = students.find(s => s.id === g.studentId);
                                                  if (!student) return null;
                                                  return (
                                                      <span key={idx} className="inline-flex items-center gap-1 bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded-full border border-gray-200">
                                                          ⚽ {student.name} ({g.count})
                                                      </span>
                                                  );
                                              })}
                                          </div>
                                      </div>
                                  )}

                                  <div className="flex justify-between items-center mb-4">
                                      <h4 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                          Lista de Atletas ({totalCount})
                                      </h4>
                                      <button 
                                        onClick={() => handleExportSingleActivityPDF(activity)}
                                        className="text-xs flex items-center gap-1 text-gray-500 hover:text-gray-800 bg-white border border-gray-200 px-2 py-1 rounded shadow-sm"
                                      >
                                          <Download className="w-3 h-3" /> PDF
                                      </button>
                                  </div>
                                  
                                  {activityStudents.length > 0 ? (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                          {activityStudents.map(student => {
                                              const isPresent = activity.attendance?.includes(student.id);
                                              const hasPaid = activity.feePayments?.includes(student.id);

                                              return (
                                                  <div key={student.id} className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-gray-200 shadow-sm">
                                                      <div className="flex items-center gap-2 overflow-hidden">
                                                          <img src={student.photoUrl} alt="" className="w-8 h-8 rounded-full bg-gray-200 border border-gray-100" />
                                                          <div className="overflow-hidden">
                                                            <p className="text-sm font-medium text-gray-700 truncate">{student.name}</p>
                                                            {activity.type === 'GAME' && activity.fee && activity.fee > 0 && (
                                                                <p className={`text-[10px] font-bold ${hasPaid ? 'text-green-600' : 'text-red-500'}`}>
                                                                    {hasPaid ? 'Taxa Paga' : 'Taxa Pendente'}
                                                                </p>
                                                            )}
                                                          </div>
                                                      </div>
                                                      <div className="flex items-center gap-1">
                                                          {/* Fee Toggle */}
                                                          {activity.type === 'GAME' && activity.fee && activity.fee > 0 && canEdit && (
                                                              <button 
                                                                onClick={() => onUpdateFeePayment(activity.id, student.id)}
                                                                title={hasPaid ? "Marcar como não pago" : "Marcar como pago"}
                                                                className={`p-1.5 rounded transition-colors ${hasPaid ? 'text-white bg-green-500 hover:bg-green-600' : 'text-gray-400 bg-gray-100 hover:bg-gray-200'}`}
                                                              >
                                                                  <DollarSign className="w-4 h-4" />
                                                              </button>
                                                          )}
                                                          
                                                          {/* Attendance Toggle */}
                                                          {canEdit ? (
                                                              <button 
                                                                onClick={() => onUpdateAttendance(activity.id, student.id)}
                                                                className={`p-1.5 rounded transition-colors ${isPresent ? 'text-white bg-blue-600 hover:bg-blue-700' : 'text-gray-400 bg-gray-100 hover:bg-gray-200'}`}
                                                                title={isPresent ? "Marcar falta" : "Marcar presença"}
                                                              >
                                                                  {isPresent ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                                                              </button>
                                                          ) : (
                                                              <div className={`p-1.5 rounded ${isPresent ? 'text-green-600 bg-green-50' : 'text-red-400 bg-red-50'}`}>
                                                                  {isPresent ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                                                              </div>
                                                          )}
                                                      </div>
                                                  </div>
                                              );
                                          })}
                                      </div>
                                  ) : (
                                      <p className="text-sm text-gray-500 italic text-center py-4">Nenhum aluno vinculado a este grupo/atividade.</p>
                                  )}
                              </div>
                          )}
                      </div>
                  );
              })
          ) : (
              <div className="bg-white p-12 rounded-xl border border-gray-100 text-center text-gray-400 flex flex-col items-center">
                  <CalendarIcon className="w-16 h-16 mb-4 text-gray-200" />
                  <p className="text-lg font-medium text-gray-600">Dia livre!</p>
                  <p className="text-sm">Nenhuma atividade agendada para {getDayLabel(selectedDate)}.</p>
                  {!isGuardian && (
                      <button onClick={handleOpenNew} className="mt-6 text-primary-600 hover:text-primary-700 font-bold text-sm bg-primary-50 px-4 py-2 rounded-lg">
                          + Adicionar Atividade Agora
                      </button>
                  )}
              </div>
          )}
      </div>

      {/* Reports Modal */}
      {isReportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                          <FileText className="w-5 h-5 text-orange-600" /> Central de Relatórios
                      </h3>
                      <button onClick={() => setIsReportModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                  </div>
                  
                  <div className="space-y-6">
                      <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Selecione o Período</label>
                          <div className="flex gap-2">
                              <div className="flex-1">
                                  <label className="block text-xs text-gray-400 mb-1">De</label>
                                  <input 
                                    type="date" 
                                    className="w-full border rounded p-2 text-sm"
                                    value={reportStartDate}
                                    onChange={(e) => setReportStartDate(e.target.value)}
                                  />
                              </div>
                              <div className="flex-1">
                                  <label className="block text-xs text-gray-400 mb-1">Até</label>
                                  <input 
                                    type="date" 
                                    className="w-full border rounded p-2 text-sm"
                                    value={reportEndDate}
                                    onChange={(e) => setReportEndDate(e.target.value)}
                                  />
                              </div>
                          </div>
                      </div>

                      <div className="space-y-3">
                          <button 
                            onClick={handleExportAttendanceReport}
                            className="w-full flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl hover:border-orange-300 hover:shadow-md transition-all group"
                          >
                              <div className="flex items-center gap-3">
                                  <div className="bg-blue-100 text-blue-600 p-2 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                      <Users className="w-5 h-5" />
                                  </div>
                                  <div className="text-left">
                                      <h4 className="font-bold text-gray-800 text-sm">Lista de Presença Geral</h4>
                                      <p className="text-xs text-gray-500">Resumo de presença de todas as atividades.</p>
                                  </div>
                              </div>
                              <Download className="w-4 h-4 text-gray-400" />
                          </button>

                          <button 
                            onClick={handleExportGameStats}
                            className="w-full flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl hover:border-orange-300 hover:shadow-md transition-all group"
                          >
                              <div className="flex items-center gap-3">
                                  <div className="bg-orange-100 text-orange-600 p-2 rounded-lg group-hover:bg-orange-600 group-hover:text-white transition-colors">
                                      <Trophy className="w-5 h-5" />
                                  </div>
                                  <div className="text-left">
                                      <h4 className="font-bold text-gray-800 text-sm">Estatísticas de Jogos</h4>
                                      <p className="text-xs text-gray-500">Ranking de convocações e artilharia.</p>
                                  </div>
                              </div>
                              <Download className="w-4 h-4 text-gray-400" />
                          </button>
                      </div>
                  </div>
                  
                  <div className="mt-6 pt-4 border-t border-gray-100 text-center">
                      <button onClick={() => setIsReportModalOpen(false)} className="text-sm text-gray-500 hover:text-gray-800 font-medium">Fechar</button>
                  </div>
              </div>
          </div>
      )}

      {/* Add/Edit Activity Modal */}
      {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 my-8 overflow-y-auto max-h-[90vh]">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold text-gray-900">{editingId ? 'Editar Evento' : 'Novo Evento'}</h3>
                      <button onClick={() => setIsModalOpen(false)}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
                  </div>
                  <form onSubmit={handleSubmit} className="space-y-5">
                      <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Título / Descrição</label>
                          <input required type="text" className="w-full border border-gray-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
                              placeholder="Ex: Treino Tático, Amistoso vs Time X" 
                              value={form.title} onChange={e => setForm({...form, title: e.target.value})} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tipo</label>
                              <select className="w-full border border-gray-300 rounded-lg p-3 bg-white outline-none focus:ring-2 focus:ring-primary-500"
                                  value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                                  <option value="TRAINING">Treino</option>
                                  <option value="GAME">Jogo / Amistoso</option>
                              </select>
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Grupo</label>
                              <select className="w-full border border-gray-300 rounded-lg p-3 bg-white outline-none focus:ring-2 focus:ring-primary-500"
                                  value={form.groupId} onChange={e => setForm({...form, groupId: e.target.value})}>
                                  <option value="">Todos / Individual</option>
                                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                              </select>
                          </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Data</label>
                              <input required type="date" className="w-full border border-gray-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-primary-500"
                                  value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Início</label>
                                <input required type="time" className="w-full border border-gray-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-primary-500"
                                    value={form.startTime} onChange={e => setForm({...form, startTime: e.target.value})} />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Fim</label>
                                <input required type="time" className="w-full border border-gray-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-primary-500"
                                    value={form.endTime} onChange={e => setForm({...form, endTime: e.target.value})} />
                              </div>
                          </div>
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Local / Endereço</label>
                          <input type="text" className="w-full border border-gray-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-primary-500"
                              placeholder="Ex: Arena Martinica, Campo B..."
                              value={form.location} onChange={e => setForm({...form, location: e.target.value})} />
                      </div>
                      
                      {/* Campos específicos para Jogo */}
                      {form.type === 'GAME' && (
                          <div className="space-y-4 border-t border-gray-100 pt-4">
                                <div className="bg-orange-50 p-4 rounded-lg border border-orange-100">
                                    <label className="block text-xs font-bold text-orange-800 uppercase mb-1 flex items-center gap-1">
                                        <DollarSign className="w-3 h-3" /> Taxa Extra (Opcional)
                                    </label>
                                    <input 
                                        type="number" 
                                        min="0" 
                                        step="0.50" 
                                        className="w-full border border-orange-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-orange-500"
                                        placeholder="0.00"
                                        value={isNaN(form.fee) ? '' : form.fee} 
                                        onChange={e => setForm({...form, fee: parseFloat(e.target.value) || 0})} 
                                    />
                                    <p className="text-[10px] text-orange-600 mt-1">Valor cobrado por atleta (ex: arbitragem, colete).</p>
                                </div>

                                <div className="space-y-3">
                                    <h4 className="text-sm font-bold text-gray-800">Resultado & Artilharia</h4>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Placar Final</label>
                                        <input 
                                            type="text" 
                                            className="w-full border border-gray-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-primary-500"
                                            placeholder="Ex: 3 x 2" 
                                            value={form.score} 
                                            onChange={e => setForm({...form, score: e.target.value})} 
                                        />
                                    </div>

                                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Adicionar Gol</label>
                                        <div className="flex gap-2 mb-3">
                                            <select 
                                                className="flex-1 border border-gray-300 rounded-lg p-2 text-sm"
                                                value={selectedScorerId}
                                                onChange={(e) => setSelectedScorerId(e.target.value)}
                                            >
                                                <option value="">Selecione o Atleta...</option>
                                                {getActivityStudents(form).map(s => (
                                                    <option key={s.id} value={s.id}>{s.name}</option>
                                                ))}
                                            </select>
                                            <button 
                                                type="button" 
                                                onClick={handleAddGoal}
                                                disabled={!selectedScorerId}
                                                className="bg-green-600 text-white p-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
                                            >
                                                <PlusCircle className="w-5 h-5" />
                                            </button>
                                        </div>

                                        {form.goals && form.goals.length > 0 && (
                                            <div className="space-y-2">
                                                {form.goals.map((goal: any) => {
                                                    const student = students.find(s => s.id === goal.studentId);
                                                    if (!student) return null;
                                                    return (
                                                        <div key={goal.studentId} className="flex justify-between items-center bg-white p-2 rounded border border-gray-200 text-sm">
                                                            <span className="font-medium flex items-center gap-1">⚽ {student.name}</span>
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold">x{goal.count}</span>
                                                                <button type="button" onClick={() => handleRemoveGoal(goal.studentId)} className="text-red-500 hover:text-red-700">
                                                                    <Minus className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                          </div>
                      )}
                      
                      {!editingId && (
                           <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Recorrência</label>
                                <select className="w-full border border-gray-300 rounded-lg p-3 bg-white outline-none focus:ring-2 focus:ring-primary-500"
                                    value={form.recurrence} onChange={e => setForm({...form, recurrence: e.target.value})}>
                                    <option value="none">Evento Único</option>
                                    <option value="weekly">Semanal (até o fim do ano)</option>
                                </select>
                                {form.recurrence === 'weekly' && <p className="text-xs text-orange-600 mt-1">⚠️ Atenção: Serão criados eventos repetidos até 31/Dez.</p>}
                           </div>
                      )}

                      <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                          <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-3 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors">
                              Cancelar
                          </button>
                          <button type="submit" className="px-5 py-3 bg-primary-600 text-white font-bold rounded-lg hover:bg-primary-700 transition-colors shadow-lg shadow-primary-500/20">
                              {editingId ? 'Salvar Alterações' : 'Criar Evento'}
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
};
