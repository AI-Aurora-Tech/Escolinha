
import React, { useState } from 'react';
import { Activity, Student, Group, User, UserRole } from '../types';
import { Calendar as CalendarIcon, Clock, CheckCircle, Users, Repeat, CheckSquare, Square, Search, User as UserIcon, FileText, XCircle, Edit, Trophy, Coins } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface SchedulePageProps {
  activities: Activity[];
  students: Student[];
  groups: Group[];
  onAddActivity: (activity: Omit<Activity, 'id'>) => void;
  onUpdateActivity: (activity: Activity) => void;
  onUpdateAttendance: (activityId: string, studentId: string) => void;
  currentUser?: User | null;
}

export const SchedulePage: React.FC<SchedulePageProps> = ({ activities, students, groups, onAddActivity, onUpdateActivity, onUpdateAttendance, currentUser }) => {
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [targetType, setTargetType] = useState<'GROUP' | 'INDIVIDUAL'>('GROUP');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [studentSearch, setStudentSearch] = useState('');
  const [hasFee, setHasFee] = useState(false);

  const [newActivity, setNewActivity] = useState<Partial<Activity>>({
      title: '',
      type: 'TRAINING',
      fee: 0,
      date: new Date().toISOString().split('T')[0],
      startTime: '14:00',
      endTime: '15:30',
      groupId: '',
      participants: [],
      recurrence: 'none',
      attendance: []
  });

  const isGuardian = currentUser?.role === UserRole.RESPONSAVEL;

  const selectedActivity = selectedActivityId ? activities.find(a => a.id === selectedActivityId) || null : null;

  const sortedActivities = [...activities].sort((a, b) => {
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
          date: new Date().toISOString().split('T')[0],
          startTime: '14:00',
          endTime: '15:30',
          groupId: '',
          participants: [],
          recurrence: 'none',
          attendance: []
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
          date: activity.date,
          startTime: activity.startTime,
          endTime: activity.endTime,
          groupId: activity.groupId || '',
          participants: activity.participants || [],
          recurrence: activity.recurrence || 'none',
          attendance: activity.attendance
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

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      
      const activityData = {
          ...newActivity,
          fee: hasFee ? newActivity.fee : 0,
          groupId: targetType === 'GROUP' ? newActivity.groupId : undefined,
          participants: targetType === 'INDIVIDUAL' ? Array.from(selectedStudentIds) : [],
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

  const handleExportAttendanceReport = () => {
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text('Relatório Geral de Frequência', 14, 20);
      doc.setFontSize(10);
      doc.text(`Gerado em: ${new Date().toLocaleDateString()}`, 14, 28);

      const reportRows: any[] = [];
      const activitiesToExport = sortedActivities;

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Agenda de Atividades</h2>
        {!isGuardian && (
            <div className="flex gap-2 w-full md:w-auto">
                <button 
                    onClick={handleExportAttendanceReport}
                    className="flex-1 md:flex-none justify-center flex items-center gap-2 bg-white text-gray-700 border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 shadow-sm transition-colors"
                >
                    <FileText className="w-4 h-4" />
                    Exportar Relatório
                </button>
                <button 
                    onClick={handleOpenAdd}
                    className="flex-1 md:flex-none justify-center flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 shadow-sm transition-colors"
                >
                    <CalendarIcon className="w-4 h-4" />
                    Agendar
                </button>
            </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity List */}
        <div className="lg:col-span-2 space-y-4">
            {sortedActivities.map(activity => {
                const group = groups.find(g => g.id === activity.groupId);
                const isPast = new Date(activity.date + 'T' + activity.endTime) < new Date();
                const participantCount = activity.groupId 
                    ? students.filter(s => s.groupId === activity.groupId).length 
                    : (activity.participants?.length || 0);
                const isGame = activity.type === 'GAME';
                
                return (
                    <div 
                        key={activity.id} 
                        className={`bg-white p-5 rounded-xl border transition-all cursor-pointer hover:shadow-md relative group ${
                            selectedActivityId === activity.id ? 'border-primary-500 ring-1 ring-primary-500' : 'border-gray-100'
                        }`}
                        onClick={() => setSelectedActivityId(activity.id)}
                    >
                        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                            <div>
                                <h4 className="font-bold text-gray-900 flex items-center gap-2 flex-wrap">
                                    {isGame ? <Trophy className="w-4 h-4 text-yellow-500" /> : <CalendarIcon className="w-4 h-4 text-primary-500" />}
                                    {activity.title}
                                    {activity.recurrence === 'weekly' && (
                                        <span title="Recorrente (Semanal)" className="bg-blue-100 text-blue-700 p-1 rounded-full">
                                            <Repeat className="w-3 h-3" />
                                        </span>
                                    )}
                                    {isGame && activity.fee && activity.fee > 0 && (
                                        <span title={`Taxa: R$ ${activity.fee}`} className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs flex items-center gap-1">
                                            <Coins className="w-3 h-3" /> R$ {activity.fee}
                                        </span>
                                    )}
                                </h4>
                                <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-500">
                                    <span className="flex items-center gap-1">
                                        <CalendarIcon className="w-4 h-4" />
                                        {formatDate(activity.date)}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Clock className="w-4 h-4" />
                                        {activity.startTime} - {activity.endTime}
                                    </span>
                                    <span className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded-md text-gray-700">
                                        {group ? (
                                            <>
                                                <Users className="w-3 h-3" />
                                                {group.name}
                                            </>
                                        ) : (
                                            <>
                                                <UserIcon className="w-3 h-3" />
                                                {participantCount} Alunos
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
                                    <button 
                                        onClick={(e) => handleOpenEdit(e, activity)}
                                        className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-gray-50 rounded-lg transition-colors"
                                        title="Editar Atividade"
                                    >
                                        <Edit className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="mt-4 flex items-center gap-2">
                             <div className="flex -space-x-2 overflow-hidden">
                                {activity.attendance.slice(0, 5).map(studentId => {
                                    const st = students.find(s => s.id === studentId);
                                    if(!st) return null;
                                    return <img key={st.id} className="inline-block h-6 w-6 rounded-full ring-2 ring-white" src={st.photoUrl} alt={st.name} title={st.name} />
                                })}
                                {activity.attendance.length > 5 && (
                                    <div className="h-6 w-6 rounded-full bg-gray-100 ring-2 ring-white flex items-center justify-center text-[10px] font-medium text-gray-600">
                                        +{activity.attendance.length - 5}
                                    </div>
                                )}
                             </div>
                             <span className="text-xs text-gray-500">
                                {activity.attendance.length > 0 ? `${activity.attendance.length} presentes` : 'Nenhuma presença confirmada'}
                             </span>
                        </div>
                    </div>
                );
            })}
        </div>

        {/* Attendance Panel */}
        <div className="lg:col-span-1">
            {selectedActivity ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 sticky top-4 max-h-[calc(100vh-2rem)] flex flex-col">
                    <div className="p-5 border-b border-gray-100 bg-gray-50 rounded-t-xl">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="font-bold text-gray-900">Lista de Presença</h3>
                                <p className="text-sm text-gray-500">{selectedActivity.title}</p>
                            </div>
                            {selectedActivity.type === 'GAME' && selectedActivity.fee && (
                                <div className="bg-green-100 text-green-800 text-xs font-bold px-2 py-1 rounded-md">
                                    Taxa: R$ {selectedActivity.fee}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2">
                        {getAttendeesList(selectedActivity).length > 0 ? (
                            getAttendeesList(selectedActivity).map(student => {
                                const isPresent = selectedActivity.attendance.includes(student.id);
                                return (
                                    <div key={student.id} 
                                        onClick={() => !isGuardian && onUpdateAttendance(selectedActivity.id, student.id)}
                                        className={`flex items-center justify-between p-3 mb-1 rounded-lg transition-colors ${!isGuardian ? 'cursor-pointer' : ''} ${
                                            isPresent ? 'bg-green-50 border border-green-100' : 'bg-red-50 hover:bg-red-100 border border-red-100'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <img src={student.photoUrl} className="w-8 h-8 rounded-full object-cover" alt="" />
                                            <span className={`text-sm font-medium ${isPresent ? 'text-green-900' : 'text-red-900'}`}>
                                                {student.name}
                                            </span>
                                        </div>
                                        {isPresent ? (
                                            <div className="flex items-center gap-1 text-green-700 text-xs font-bold uppercase">
                                                Presente <CheckCircle className="w-5 h-5 fill-current" />
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1 text-red-500 text-xs font-bold uppercase">
                                                Ausente <XCircle className="w-5 h-5" />
                                            </div>
                                        )}
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
                        <input className="w-full border rounded-lg p-2" type="text" placeholder="Ex: Treino Tático ou Jogo vs Time X" 
                            required value={newActivity.title} onChange={e => setNewActivity({...newActivity, title: e.target.value})} />
                    </div>

                    {newActivity.type === 'GAME' && (
                        <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100">
                             <div className="flex items-center gap-2 mb-2">
                                 <input 
                                    type="checkbox" 
                                    id="hasFee"
                                    className="rounded text-primary-600 focus:ring-primary-500"
                                    checked={hasFee}
                                    onChange={(e) => setHasFee(e.target.checked)}
                                 />
                                 <label htmlFor="hasFee" className="text-sm font-medium text-gray-800">Cobrar Taxa do Jogo?</label>
                             </div>
                             {hasFee && (
                                 <div>
                                     <label className="block text-xs font-medium text-gray-600 mb-1">Valor da Taxa (R$)</label>
                                     <input 
                                        type="number" 
                                        min="0" 
                                        step="0.01"
                                        className="w-full border rounded-lg p-2 bg-white"
                                        placeholder="0,00"
                                        value={newActivity.fee}
                                        onChange={(e) => setNewActivity({...newActivity, fee: parseFloat(e.target.value)})}
                                     />
                                 </div>
                             )}
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                             <label className="block text-sm font-medium mb-1">Repetição</label>
                             <select className="w-full border rounded-lg p-2 bg-white" 
                                value={newActivity.recurrence} 
                                onChange={e => setNewActivity({...newActivity, recurrence: e.target.value as 'weekly' | 'none'})}>
                                 <option value="none">Pontual</option>
                                 <option value="weekly">Recorrente (Semanal)</option>
                             </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Público Alvo</label>
                            <div className="flex border rounded-lg overflow-hidden">
                                <button type="button" 
                                    onClick={() => setTargetType('GROUP')}
                                    className={`flex-1 py-2 text-sm font-medium ${targetType === 'GROUP' ? 'bg-gray-100 text-gray-900' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                >
                                    Grupo
                                </button>
                                <div className="w-px bg-gray-200"></div>
                                <button type="button" 
                                    onClick={() => setTargetType('INDIVIDUAL')}
                                    className={`flex-1 py-2 text-sm font-medium ${targetType === 'INDIVIDUAL' ? 'bg-gray-100 text-gray-900' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
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
                                <span className="self-center">-</span>
                                <input className="w-full border rounded-lg p-2 text-sm" type="time" required
                                    value={newActivity.endTime} onChange={e => setNewActivity({...newActivity, endTime: e.target.value})} />
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                        <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                            {editingId ? 'Salvar Alterações' : 'Agendar'}
                        </button>
                    </div>
                </form>
             </div>
        </div>
      )}
    </div>
  );
};