
import React, { useState, useMemo } from 'react';
import { Group, Student, Transaction, TransactionType, PaymentStatus } from '../types';
import { Plus, Edit, Trash2, Shield, X, Search, CheckSquare, Square, Users, Download, ChevronRight, Filter, FileSpreadsheet, AlertTriangle, Target, Trophy, MessageSquare } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface GroupsPageProps {
  groups: Group[];
  students: Student[];
  transactions: Transaction[];
  onAddGroup: (group: Group) => Promise<string | null>;
  onUpdateGroup: (group: Group) => Promise<void>;
  onDeleteGroup: (id: string) => void;
  onBatchAssignStudents: (studentIds: string[], groupId: string) => void;
}

export const GroupsPage: React.FC<GroupsPageProps> = ({ groups, students, transactions, onAddGroup, onUpdateGroup, onDeleteGroup, onBatchAssignStudents }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [memberFilter, setMemberFilter] = useState<'ALL' | 'MEMBERS' | 'NON_MEMBERS'>('ALL');
  const [sendingStatus, setSendingStatus] = useState<{
      active: boolean,
      total: number,
      current: number,
      name: string,
      status: 'starting' | 'progress' | 'completed' | 'error' | null,
  }>({ active: false, total: 0, current: 0, name: '', status: null });
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  
  const todayStr = useMemo(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }), []);

  const getStudentOverdueCount = (studentId: string) => {
    return transactions.filter(t => t.studentId === studentId && t.type === TransactionType.INCOME && t.status === PaymentStatus.PENDING && t.date < todayStr).length;
  };

  const initialFormState = {
    name: '',
    type: 'TRAINING' as 'TRAINING' | 'GAME'
  };

  const [form, setForm] = useState(initialFormState);

  // Helper para formatar data de forma segura (ignora fuso horário)
  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const parts = dateString.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateString;
  };

  // Cálculo de idade seguro contra fuso horário
  const calculateAge = (birthDateString: string) => {
    if (!birthDateString) return 0;
    const parts = birthDateString.split('-');
    if (parts.length !== 3) return 0;

    const birthYear = parseInt(parts[0]);
    const birthMonth = parseInt(parts[1]) - 1;
    const birthDay = parseInt(parts[2]);

    const today = new Date();
    let age = today.getFullYear() - birthYear;
    const m = today.getMonth() - birthMonth;
    if (m < 0 || (m === 0 && today.getDate() < birthDay)) {
        age--;
    }
    return age;
  };

  const handleOpenNew = () => {
    setEditingId(null);
    setForm(initialFormState);
    setSelectedStudentIds(new Set()); 
    setSearchTerm('');
    setMemberFilter('ALL');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (group: Group) => {
    setEditingId(group.id);
    setForm({
        name: group.name,
        type: group.type || 'TRAINING'
    });
    
    const currentStudents = students
        .filter(s => s.groupIds && s.groupIds.includes(group.id))
        .map(s => s.id);

    setSelectedStudentIds(new Set(currentStudents));
    setSearchTerm('');
    setMemberFilter('ALL');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let targetGroupId = editingId;
    
    if (editingId) {
        await onUpdateGroup({ ...form, id: editingId });
    } else {
        const newId = await onAddGroup({ ...form, id: '' });
        targetGroupId = newId;
    }
    
    if (targetGroupId) {
        onBatchAssignStudents(Array.from(selectedStudentIds), targetGroupId);
    }
    
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este grupo?')) {
        onDeleteGroup(id);
    }
  };

  const toggleGroupSelection = (id: string) => {
    const next = new Set(selectedGroupIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedGroupIds(next);
  };

  const handleExportGroupsExcel = (targetGroupIds?: string[]) => {
    const idsToExport = targetGroupIds || Array.from(selectedGroupIds);
    if (idsToExport.length === 0) {
      alert('Nenhum grupo selecionado para exportar.');
      return;
    }

    const exportData: any[] = [];
    const currentYear = new Date().getFullYear();

    idsToExport.forEach(gid => {
      const group = groups.find(g => g.id === gid);
      if (!group) return;

      const groupStudents = students
        .filter(s => s.groupIds && s.groupIds.includes(group.id))
        .sort((a, b) => a.name.localeCompare(b.name));
      
      if (groupStudents.length === 0) {
        exportData.push({
          'Grupo': group.name,
          'Tipo do Grupo': group.type === 'GAME' ? 'Jogo' : 'Treino',
          'Atleta': 'Nenhum atleta vinculado',
          'Idade': '-',
          'Categoria': '-',
          'Data de Nascimento': '-',
          'Responsável': '-',
          'WhatsApp': '-',
          'Status': '-'
        });
      } else {
        groupStudents.forEach(s => {
          const birthYear = s.birthDate ? parseInt(s.birthDate.split('-')[0]) : currentYear;
          exportData.push({
            'Grupo': group.name,
            'Tipo do Grupo': group.type === 'GAME' ? 'Jogo' : 'Treino',
            'Atleta': s.name,
            'Idade': calculateAge(s.birthDate),
            'Categoria': `Sub-${currentYear - birthYear}`,
            'Data de Nascimento': formatDate(s.birthDate),
            'Responsável': s.guardian.name,
            'WhatsApp': s.guardian.phone,
            'Status': s.active ? 'Ativo' : 'Inativo'
          });
        });
      }
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lista de Atletas");
    
    const fileName = idsToExport.length === 1 
      ? `Grupo_${groups.find(g => g.id === idsToExport[0])?.name.replace(/\s+/g, '_')}.xlsx`
      : `Exportacao_Grupos_Martinica_${new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })}.xlsx`;

    XLSX.writeFile(wb, fileName);
  };

  const handleExportGroupPDF = (group: Group) => {
    const groupStudents = students
      .filter(s => s.groupIds && s.groupIds.includes(group.id))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (groupStudents.length === 0) {
        alert('Este grupo não possui alunos para exportar.');
        return;
    }

    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Lista de Atletas - ${group.name}`, 14, 22);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 30);

    const tableData = groupStudents.map(s => [
        s.name,
        s.rg || '-',
        s.cpf || '-',
        s.birthDate ? formatDate(s.birthDate) : '-'
    ]);

    autoTable(doc, {
        startY: 35,
        head: [['Nome', 'RG', 'CPF', 'Data Nascimento']],
        body: tableData,
        headStyles: { fillColor: [249, 115, 22] },
    });

    doc.save(`Grupo_${group.name.replace(/\s+/g, '_')}.pdf`);
  };

  const toggleStudent = (studentId: string) => {
      const next = new Set(selectedStudentIds);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      setSelectedStudentIds(next);
  };

  const filteredStudents = students.filter(s => {
      if (!s.active) return false;
      const isSelected = selectedStudentIds.has(s.id);
      if (memberFilter === 'MEMBERS' && !isSelected) return false;
      if (memberFilter === 'NON_MEMBERS' && isSelected) return false;
      
      const age = calculateAge(s.birthDate).toString();
      const currentYear = new Date().getFullYear();
      const birthYear = s.birthDate ? parseInt(s.birthDate.split('-')[0]) : currentYear;
      const categoryStr1 = `sub-${currentYear - birthYear}`;
      const categoryStr2 = `sub ${currentYear - birthYear}`;
      
      const searchLower = searchTerm.toLowerCase();
      return s.name.toLowerCase().includes(searchLower) || 
             age === searchLower || 
             categoryStr1.includes(searchLower) || 
             categoryStr2.includes(searchLower);
  }).sort((a, b) => a.name.localeCompare(b.name));

  const handleSendMessage = async () => {
    if (!selectedGroupId || !message) return;
    
    setSendingStatus({ active: true, total: 0, current: 0, name: '', status: 'starting' });
    
    // Iniciar envio
    const res = await fetch('/api/start-group-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: selectedGroupId, message })
    });
    
    if (!res.ok) {
        let errorMsg = "Erro desconhecido";
        try {
            const data = await res.json();
            errorMsg = data.error || errorMsg;
        } catch (e) {
            errorMsg = await res.text() || errorMsg;
        }
        alert(`Erro ao iniciar envio: ${errorMsg}`);
        setSendingStatus({ active: false, total: 0, current: 0, name: '', status: 'error' });
        return;
    }

    const { jobId } = await res.json();
    
    // Polling
    const poll = async () => {
        const statusRes = await fetch(`/api/group-message-status/${jobId}`);
        if (!statusRes.ok) {
            setSendingStatus(prev => ({ ...prev, active: false, status: 'error' }));
            return;
        }
        
        const data = await statusRes.json();
        setSendingStatus({ 
            active: data.status !== 'completed' && data.status !== 'error', 
            total: data.total, 
            current: data.current, 
            name: data.name, 
            status: data.status as any
        });
        
        if (data.status === 'progress' || data.status === 'starting') {
            setTimeout(poll, 2000); // Poll every 2 seconds
        }
    };
    
    poll();
  };

  return (
    <div className="space-y-6">
      {/* ... Message Modal ... */}
      {isMessageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold">Enviar Mensagem</h3>
                    {!sendingStatus.active && <button onClick={() => { setIsMessageModalOpen(false); setSendingStatus({ active: false, total: 0, current: 0, name: '', status: null }); }} className="text-gray-400"><X className="w-5 h-5" /></button>}
                </div>
                
                {sendingStatus.active ? (
                    <div className="text-center py-8">
                        <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full mx-auto mb-4" />
                        <p className="font-bold">Enviando: {sendingStatus.current} / {sendingStatus.total}</p>
                        <p className="text-sm text-gray-500">Último: {sendingStatus.name}</p>
                        <p className="text-xs text-gray-400 mt-2">Aguarde 10 segundos entre envios...</p>
                    </div>
                ) : sendingStatus.status === 'completed' ? (
                    <div className="text-center py-8">
                        <div className="text-green-500 text-5xl mb-4">✓</div>
                        <p className="font-bold">Concluído!</p>
                        <button onClick={() => { setIsMessageModalOpen(false); setSendingStatus({ active: false, total: 0, current: 0, name: '', status: null }); setMessage(''); }} className="mt-4 bg-gray-200 px-4 py-2 rounded-lg">Fechar</button>
                    </div>
                ) : (
                    <>
                        <textarea 
                            className="w-full border rounded-lg p-2.5 mb-4"
                            rows={4}
                            placeholder="Digite sua mensagem..."
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                        />
                        <button 
                          onClick={handleSendMessage}
                          className="w-full bg-primary-600 text-white font-bold py-2.5 rounded-lg hover:bg-primary-700"
                        >
                            Enviar
                        </button>
                    </>
                )}
            </div>
        </div>
      )}
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Grupos e Categorias</h2>
        <div className="flex gap-2 w-full md:w-auto">
          {selectedGroupIds.size > 0 && (
            <button 
              onClick={() => handleExportGroupsExcel()}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors shadow-sm font-bold text-sm"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Exportar Selecionados ({selectedGroupIds.size})
            </button>
          )}
          <button 
            onClick={handleOpenNew}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors shadow-sm font-bold text-sm"
          >
            <Plus className="w-4 h-4" />
            Novo Grupo
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...groups].sort((a, b) => a.name.localeCompare(b.name)).map(group => {
            const studentCount = students.filter(s => s.groupIds && s.groupIds.includes(group.id)).length;
            const isSelected = selectedGroupIds.has(group.id);

            return (
                <div 
                  key={group.id} 
                  className={`relative bg-white p-6 rounded-xl shadow-sm border transition-all hover:shadow-md ${isSelected ? 'border-primary-500 ring-1 ring-primary-500 bg-primary-50/10' : 'border-gray-100 hover:border-primary-200'}`}
                >
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <button 
                            onClick={() => toggleGroupSelection(group.id)}
                            className={`p-1 rounded-md transition-colors ${isSelected ? 'text-primary-600' : 'text-gray-300 hover:text-primary-400'}`}
                          >
                            {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                          </button>
                          <div className={`p-3 rounded-lg ${isSelected ? 'bg-primary-100' : (group.type === 'GAME' ? 'bg-green-50' : 'bg-blue-50')}`}>
                              {group.type === 'GAME' ? (
                                  <Trophy className={`w-6 h-6 ${isSelected ? 'text-primary-700' : 'text-green-600'}`} />
                              ) : (
                                  <Target className={`w-6 h-6 ${isSelected ? 'text-primary-700' : 'text-blue-600'}`} />
                              )}
                          </div>
                        </div>
                        <div className="flex gap-1">
                            <button 
                                onClick={() => { setSelectedGroupId(group.id); setIsMessageModalOpen(true); }} 
                                className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                                title="Enviar mensagem para o grupo"
                            >
                                <MessageSquare className="w-4 h-4" />
                            </button>
                            <button 
                                onClick={() => handleExportGroupsExcel([group.id])} 
                                className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                title="Exportar para Excel"
                            >
                                <FileSpreadsheet className="w-4 h-4" />
                            </button>
                            <button 
                                onClick={() => handleExportGroupPDF(group)} 
                                className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                                title="Exportar para PDF"
                            >
                                <Download className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleOpenEdit(group)} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                                <Edit className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDelete(group.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-1">{group.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${group.type === 'GAME' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                            {group.type === 'GAME' ? 'Grupo de Jogo' : 'Grupo de Treino'}
                        </span>
                    </div>
                    
                    <div className="flex items-center gap-3 pt-4 border-t border-gray-50 mt-4">
                        <div className="flex items-center gap-1 text-sm text-gray-500 font-medium">
                            <Users className="w-4 h-4 text-gray-400" /> {studentCount} Atletas Vinculados
                        </div>
                    </div>
                </div>
            );
        })}
        {groups.length === 0 && (
          <div className="col-span-full py-20 text-center bg-white rounded-2xl border border-dashed border-gray-200">
            <Shield className="w-12 h-12 mx-auto text-gray-300 mb-2 opacity-50" />
            <p className="text-gray-400 font-medium">Nenhum grupo cadastrado.</p>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl p-6 my-8">
                <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                    <h3 className="text-lg font-bold text-gray-900">{editingId ? 'Editar Grupo e Atletas' : 'Novo Grupo e Atletas'}</h3>
                    <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                </div>
                
                <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-4">
                        <h4 className="font-semibold text-gray-700 flex items-center gap-2">
                            <Shield className="w-4 h-4 text-primary-600" /> Dados do Grupo
                        </h4>
                        <div>
                            <label className="block text-sm font-bold text-gray-600 mb-1 uppercase tracking-tight text-[10px]">Nome do Grupo</label>
                            <input required type="text" className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" 
                                placeholder="Ex: Sub-11 A"
                                value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-600 mb-1 uppercase tracking-tight text-[10px]">Tipo do Grupo</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setForm({ ...form, type: 'TRAINING' })}
                                    className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-sm font-medium transition-colors ${form.type === 'TRAINING' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                >
                                    <Target className="w-4 h-4" /> Treino
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setForm({ ...form, type: 'GAME' })}
                                    className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-sm font-medium transition-colors ${form.type === 'GAME' ? 'bg-green-50 border-green-500 text-green-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                >
                                    <Trophy className="w-4 h-4" /> Jogo
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col h-[450px]">
                        <h4 className="font-semibold text-gray-700 flex items-center gap-2 mb-3">
                            <Users className="w-4 h-4 text-primary-600" /> Gerenciar Membros
                        </h4>
                        
                        <div className="relative mb-3">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input 
                                type="text" 
                                placeholder="Buscar atleta ou categoria (ex: sub-11)..." 
                                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm shadow-sm"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg mb-3">
                            {['ALL', 'MEMBERS', 'NON_MEMBERS'].map((mode) => (
                                <button 
                                    key={mode}
                                    type="button"
                                    onClick={() => setMemberFilter(mode as any)}
                                    className={`flex-1 py-1.5 text-[10px] font-black uppercase rounded-md transition-all ${memberFilter === mode ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    {mode === 'ALL' ? 'Todos' : mode === 'MEMBERS' ? 'No Grupo' : 'Disponíveis'}
                                </button>
                            ))}
                        </div>

                        <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg bg-gray-50 shadow-inner">
                            {filteredStudents.length > 0 ? (
                                <div className="divide-y divide-gray-200">
                                    {filteredStudents.map(student => {
                                        const isSelected = selectedStudentIds.has(student.id);
                                        const isMemberOfCurrentGroup = editingId && student.groupIds?.includes(editingId);
                                        const age = calculateAge(student.birthDate);
                                        const overdueCount = getStudentOverdueCount(student.id);
                                        
                                        const overdueBgClass = overdueCount >= 3 
                                            ? 'bg-red-50 hover:bg-red-100' 
                                            : overdueCount === 2 
                                            ? 'bg-orange-50 hover:bg-orange-100' 
                                            : isSelected ? 'bg-primary-50/50' : 'hover:bg-white';
                                        
                                        const overdueBadgeClass = overdueCount >= 3
                                            ? 'bg-red-600 text-white'
                                            : overdueCount === 2
                                            ? 'bg-orange-500 text-white'
                                            : '';

                                        const groupNames = (student.groupIds || []).map(gid => {
                                            const gName = groups.find(g => g.id === gid)?.name;
                                            if (editingId && gid === editingId) return { name: gName, active: true };
                                            return { name: gName, active: false };
                                        }).filter(g => g.name);

                                        return (
                                            <div 
                                                key={student.id} 
                                                className={`p-3 flex items-center gap-3 cursor-pointer transition-colors border-l-4 ${overdueBgClass} ${isMemberOfCurrentGroup ? 'border-green-500' : 'border-transparent'}`}
                                                onClick={() => toggleStudent(student.id)}
                                            >
                                                <div className="text-primary-600">
                                                    {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-gray-300" />}
                                                </div>
                                                <img src={student.photoUrl} alt="" className="w-8 h-8 rounded-full bg-gray-200 object-cover shadow-sm" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className={`text-sm font-bold truncate ${isSelected ? 'text-primary-900' : 'text-gray-700'}`}>{student.name}</p>
                                                        {isMemberOfCurrentGroup && <span className="bg-green-100 text-green-700 text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-tighter">Membro</span>}
                                                        {overdueCount >= 2 && (
                                                            <span className={`${overdueBadgeClass} text-[9px] px-1.5 py-0.5 rounded font-black uppercase flex items-center gap-1 shadow-sm`}>
                                                                <AlertTriangle className="w-2.5 h-2.5" /> {overdueCount} Pend.
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[11px] text-gray-500 font-medium">
                                                        <span>{age} anos (Sub-{new Date().getFullYear() - (student.birthDate ? parseInt(student.birthDate.split('-')[0]) : new Date().getFullYear())})</span>
                                                        {groupNames.length > 0 && (
                                                            <span className="truncate max-w-[150px] text-gray-400">
                                                                • {groupNames.map((g, idx) => (
                                                                    <React.Fragment key={idx}>
                                                                        <span className={g.active ? 'text-green-600 font-bold' : ''}>{g.name}</span>
                                                                        {idx < groupNames.length - 1 ? ', ' : ''}
                                                                    </React.Fragment>
                                                                ))}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="h-full flex items-center justify-center text-gray-400 text-sm p-4 text-center flex-col gap-2">
                                    <Search className="w-8 h-8 opacity-20" />
                                    <p className="font-medium">Nenhum aluno encontrado.</p>
                                </div>
                            )}
                        </div>
                        <div className="mt-2 text-right text-[10px] text-gray-400 flex justify-between items-center px-1 font-bold uppercase tracking-wider">
                            <span>Exibindo {filteredStudents.length} atletas</span>
                            <span className="text-primary-600">{selectedStudentIds.size} selecionados</span>
                        </div>
                    </div>

                    <div className="lg:col-span-2 flex justify-end gap-3 pt-4 border-t border-gray-100">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 text-gray-500 font-bold hover:bg-gray-100 rounded-lg transition-colors">Cancelar</button>
                        <button type="submit" className="px-8 py-2.5 bg-primary-600 text-white font-black rounded-lg hover:bg-primary-700 transition-colors shadow-lg shadow-primary-500/20 uppercase tracking-tighter">Salvar Grupo</button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};
