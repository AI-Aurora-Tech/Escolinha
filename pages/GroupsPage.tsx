
import React, { useState } from 'react';
import { Group, Student } from '../types';
import { Plus, Edit, Trash2, Shield, X, Search, CheckSquare, Square, Users, Download } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface GroupsPageProps {
  groups: Group[];
  students: Student[];
  onAddGroup: (group: Group) => void;
  onUpdateGroup: (group: Group) => void;
  onDeleteGroup: (id: string) => void;
  onBatchAssignStudents: (studentIds: string[], groupId: string) => void;
}

export const GroupsPage: React.FC<GroupsPageProps> = ({ groups, students, onAddGroup, onUpdateGroup, onDeleteGroup, onBatchAssignStudents }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  
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
    setIsModalOpen(true);
  };

  const handleOpenEdit = (group: Group) => {
    setEditingId(group.id);
    setForm({
        name: group.name
    });
    
    // Check if group.id exists in student's groupIds array
    const currentStudents = students.filter(s => s.groupIds && s.groupIds.includes(group.id)).map(s => s.id);
    setSelectedStudentIds(new Set(currentStudents));
    setSearchTerm('');
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let groupId = editingId;
    if (editingId) {
        onUpdateGroup({ ...form, id: editingId });
    } else {
        groupId = Math.random().toString(36).substr(2, 9);
        onAddGroup({ ...form, id: groupId });
    }
    if (groupId) {
        onBatchAssignStudents(Array.from(selectedStudentIds), groupId);
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
      const age = calculateAge(s.birthDate).toString();
      const searchLower = searchTerm.toLowerCase();
      const matchesName = s.name.toLowerCase().includes(searchLower);
      const matchesAge = age === searchLower;
      return matchesName || matchesAge;
  }).sort((a, b) => {
      const aSelected = selectedStudentIds.has(a.id);
      const bSelected = selectedStudentIds.has(b.id);
      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;
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

                    <div className="flex flex-col h-[400px]">
                        <h4 className="font-semibold text-gray-700 flex items-center gap-2 mb-3">
                            <Users className="w-4 h-4" /> Incluir Atletas
                        </h4>
                        
                        <div className="relative mb-3">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input 
                                type="text" 
                                placeholder="Buscar por nome ou idade (ex: 10)..." 
                                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg bg-gray-50">
                            {filteredStudents.length > 0 ? (
                                <div className="divide-y divide-gray-200">
                                    {filteredStudents.map(student => {
                                        const isSelected = selectedStudentIds.has(student.id);
                                        const age = calculateAge(student.birthDate);
                                        const studentGroups = student.groupIds ? student.groupIds.map(gid => groups.find(g => g.id === gid)?.name).filter(Boolean).join(', ') : '';

                                        return (
                                            <div 
                                                key={student.id} 
                                                className={`p-3 flex items-center gap-3 cursor-pointer hover:bg-white transition-colors ${isSelected ? 'bg-primary-50' : ''}`}
                                                onClick={() => toggleStudent(student.id)}
                                            >
                                                <div className={`text-primary-600`}>
                                                    {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-gray-300" />}
                                                </div>
                                                <img src={student.photoUrl} alt="" className="w-8 h-8 rounded-full bg-gray-200 object-cover" />
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary-900' : 'text-gray-700'}`}>
                                                        {student.name}
                                                    </p>
                                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                                        <span>{age} anos</span>
                                                        {studentGroups && (
                                                            <span className="px-1.5 py-0.5 rounded bg-gray-200 truncate max-w-[150px]">
                                                                {studentGroups}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="h-full flex items-center justify-center text-gray-400 text-sm p-4 text-center">
                                    Nenhum aluno encontrado para "{searchTerm}"
                                </div>
                            )}
                        </div>
                        <div className="mt-2 text-right text-xs text-gray-500">
                            {selectedStudentIds.size} alunos selecionados
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
