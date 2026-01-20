
import React, { useState } from 'react';
import { Group, Student } from '../types';
import { Plus, Edit, Trash2, Shield, X, Search, CheckSquare, Square, Users, Download, ChevronRight, Filter } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface GroupsPageProps {
  groups: Group[];
  students: Student[];
  onAddGroup: (group: Group) => Promise<string | null>;
  onUpdateGroup: (group: Group) => void;
  onDeleteGroup: (id: string) => void;
  onBatchAssignStudents: (studentIds: string[], groupId: string) => void;
}

export const GroupsPage: React.FC<GroupsPageProps> = ({ groups, students, onAddGroup, onUpdateGroup, onDeleteGroup, onBatchAssignStudents }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [memberFilter, setMemberFilter] = useState<'ALL' | 'MEMBERS' | 'NON_MEMBERS'>('ALL');
  
  const initialFormState = {
    name: ''
  };

  const [form, setForm] = useState(initialFormState);

  const calculateAge = (birthDateString: string) => {
    if (!birthDateString) return 0;
    const today = new Date();
    const birthDate = new Date(birthDateString);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
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
        name: group.name
    });
    
    // Check if student has this group in their groupIds array
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
        onUpdateGroup({ ...form, id: editingId });
    } else {
        // Wait for ID from Supabase
        const newId = await onAddGroup({ ...form, id: '' }); // ID is ignored in insert usually
        targetGroupId = newId;
    }
    
    // Assign/Sync students
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

  const handleExportGroupPDF = (group: Group) => {
    const groupStudents = students.filter(s => s.groupIds && s.groupIds.includes(group.id));

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
        s.birthDate ? new Date(s.birthDate).toLocaleDateString('pt-BR') : '-'
    ]);

    autoTable(doc, {
        startY: 35,
        head: [['Nome', 'RG', 'CPF', 'Data Nascimento']],
        body: tableData,
        headStyles: { fillColor: [249, 115, 22] }, // Orange-500
    });

    doc.save(`Grupo_${group.name.replace(/\s+/g, '_')}.pdf`);
  };

  const toggleStudent = (studentId: string) => {
      const newSet = new Set(selectedStudentIds);
      if (newSet.has(studentId)) {
          newSet.delete(studentId);
      } else {
          newSet.add(studentId);
      }
      setSelectedStudentIds(newSet);
  };

  const filteredStudents = students.filter(s => {
      // CRITICAL: Apenas alunos ativos aparecem para serem inclusos nos grupos
      if (!s.active) return false;

      // Filtro de Membros
      const isSelected = selectedStudentIds.has(s.id);
      if (memberFilter === 'MEMBERS' && !isSelected) return false;
      if (memberFilter === 'NON_MEMBERS' && isSelected) return false;

      const age = calculateAge(s.birthDate).toString();
      const searchLower = searchTerm.toLowerCase();
      const matchesName = s.name.toLowerCase().includes(searchLower);
      const matchesAge = age === searchLower;
      return matchesName || matchesAge;
  }).sort((a, b) => {
      return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Grupos e Categorias</h2>
        <button 
          onClick={handleOpenNew}
          className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Novo Grupo
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {groups.map(group => {
            const studentCount = students.filter(s => s.groupIds && s.groupIds.includes(group.id)).length;

            return (
                <div key={group.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:border-primary-200 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                        <div className="bg-primary-50 p-3 rounded-lg">
                            <Shield className="w-6 h-6 text-primary-600" />
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => handleExportGroupPDF(group)} 
                                className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-gray-50 rounded-lg transition-colors"
                                title="Exportar Lista de Alunos"
                            >
                                <Download className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleOpenEdit(group)} className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-gray-50 rounded-lg transition-colors">
                                <Edit className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDelete(group.id)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-gray-50 rounded-lg transition-colors">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-1">{group.name}</h3>
                    
                    <div className="flex items-center gap-3 pt-4 border-t border-gray-50 mt-4">
                        <div className="flex items-center gap-1 text-sm text-gray-500 bg-gray-50 px-2 py-1 rounded-full">
                            <Users className="w-4 h-4" /> {studentCount} Atletas
                        </div>
                    </div>
                </div>
            );
        })}
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
                            <Shield className="w-4 h-4" /> Dados do Grupo
                        </h4>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Grupo</label>
                            <input required type="text" className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" 
                                placeholder="Ex: Fraldinha A"
                                value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
                        </div>
                    </div>

                    <div className="flex flex-col h-[450px]">
                        <h4 className="font-semibold text-gray-700 flex items-center gap-2 mb-3">
                            <Users className="w-4 h-4" /> Incluir Atletas
                        </h4>
                        
                        <div className="relative mb-3">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input 
                                type="text" 
                                placeholder="Buscar por nome ou idade..." 
                                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm shadow-sm"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        {/* Filtro de Membros estilo Tabs/Pills */}
                        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg mb-3">
                            <button 
                                type="button"
                                onClick={() => setMemberFilter('ALL')}
                                className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all ${memberFilter === 'ALL' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Todos
                            </button>
                            <button 
                                type="button"
                                onClick={() => setMemberFilter('MEMBERS')}
                                className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all ${memberFilter === 'MEMBERS' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                No Grupo
                            </button>
                            <button 
                                type="button"
                                onClick={() => setMemberFilter('NON_MEMBERS')}
                                className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all ${memberFilter === 'NON_MEMBERS' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Disponíveis
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg bg-gray-50 shadow-inner">
                            {filteredStudents.length > 0 ? (
                                <div className="divide-y divide-gray-200">
                                    {filteredStudents.map(student => {
                                        const isSelected = selectedStudentIds.has(student.id);
                                        const isMemberOfCurrentGroup = editingId && student.groupIds?.includes(editingId);
                                        const age = calculateAge(student.birthDate);
                                        
                                        // Mapeia nomes dos grupos destacando o atual
                                        const groupNames = (student.groupIds || []).map(gid => {
                                            const gName = groups.find(g => g.id === gid)?.name;
                                            if (editingId && gid === editingId) return { name: gName, active: true };
                                            return { name: gName, active: false };
                                        }).filter(g => g.name);

                                        return (
                                            <div 
                                                key={student.id} 
                                                className={`p-3 flex items-center gap-3 cursor-pointer hover:bg-white transition-colors border-l-4 ${
                                                    isSelected ? 'bg-primary-50' : ''
                                                } ${
                                                    isMemberOfCurrentGroup ? 'border-green-500 bg-green-50/30' : 'border-transparent'
                                                }`}
                                                onClick={() => toggleStudent(student.id)}
                                            >
                                                <div className={`text-primary-600`}>
                                                    {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-gray-300" />}
                                                </div>
                                                <img src={student.photoUrl} alt="" className="w-8 h-8 rounded-full bg-gray-200 object-cover shadow-sm" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className={`text-sm font-bold truncate ${isSelected ? 'text-primary-900' : 'text-gray-700'}`}>
                                                            {student.name}
                                                        </p>
                                                        {isMemberOfCurrentGroup && (
                                                            <span className="bg-green-100 text-green-700 text-[10px] px-1.5 py-0.5 rounded font-black uppercase tracking-tighter">Membro</span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                                        <span>{age} anos</span>
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
                                    <p>Nenhum aluno encontrado para os critérios selecionados.</p>
                                </div>
                            )}
                        </div>
                        <div className="mt-2 text-right text-xs text-gray-500 flex justify-between items-center px-1">
                            <span className="bg-gray-100 px-2 py-0.5 rounded-full font-medium">Exibindo {filteredStudents.length} atletas</span>
                            <span className="font-bold text-primary-600">{selectedStudentIds.size} selecionados</span>
                        </div>
                    </div>

                    <div className="lg:col-span-2 flex justify-end gap-3 pt-4 border-t border-gray-100">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors">
                            Cancelar
                        </button>
                        <button type="submit" className="px-5 py-2.5 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors shadow-lg shadow-primary-500/30">
                            Salvar Grupo
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};
