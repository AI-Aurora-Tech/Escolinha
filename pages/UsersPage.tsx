import React, { useState, useMemo } from 'react';
import { User, UserRole } from '../types';
import { Plus, Edit, Trash2, Shield, X, User as UserIcon, Mail, Key, Search, GraduationCap, Users as UsersIcon } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

interface UsersPageProps {
  users: User[];
  onAddUser: (user: Omit<User, 'id'>) => Promise<void>;
  onUpdateUser: (user: User) => Promise<void>;
  onDeleteUser: (id: string) => Promise<void>;
}

// Rótulo e cor por perfil. Importante: RESPONSAVEL tem tratamento próprio — antes
// qualquer perfil diferente de ADMIN era exibido como "Professor".
const ROLE_META: Record<string, { label: string; badge: string }> = {
  [UserRole.ADMIN]: { label: 'Administrador', badge: 'bg-purple-100 text-purple-700' },
  [UserRole.PROFESSOR]: { label: 'Professor', badge: 'bg-blue-100 text-blue-700' },
  [UserRole.RESPONSAVEL]: { label: 'Responsável', badge: 'bg-green-100 text-green-700' },
};
const roleMeta = (role: UserRole) => ROLE_META[role] || { label: String(role || '—'), badge: 'bg-gray-100 text-gray-700' };

export const UsersPage: React.FC<UsersPageProps> = ({ users, onAddUser, onUpdateUser, onDeleteUser }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const initialFormState = {
    name: '',
    email: '',
    password: '',
    role: UserRole.PROFESSOR
  };

  const [form, setForm] = useState(initialFormState);
  const [search, setSearch] = useState('');

  // Filtra por nome, email ou perfil (Responsável / Professor / Administrador).
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      (u.name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      roleMeta(u.role).label.toLowerCase().includes(q)
    );
  }, [users, search]);

  const handleOpenNew = () => {
    setEditingId(null);
    setForm(initialFormState);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: User) => {
    setEditingId(user.id);
    setForm({
        name: user.name,
        email: user.email,
        password: '', // Don't show existing password
        role: user.role
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Avatar generation based on name
    const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(form.name)}&background=random`;
    
    try {
        if (editingId) {
            const updatePayload: any = {
                name: form.name,
                email: form.email,
                role: form.role,
                avatar: avatar
            };
            if (form.password) {
                updatePayload.password = form.password;
            }
            await onUpdateUser({ ...updatePayload, id: editingId });
        } else {
            await onAddUser({
                name: form.name,
                email: form.email,
                password: form.password,
                role: form.role,
                avatar: avatar
            });
        }
        setIsModalOpen(false);
    } catch (error) {
        console.error("Error saving user", error);
        alert("Erro ao salvar usuário.");
    } finally {
        setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este usuário? O acesso dele será revogado imediatamente.')) {
        await onDeleteUser(id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <h2 className="text-2xl font-bold text-gray-800">Usuários do Sistema</h2>
        <button
          onClick={handleOpenNew}
          className="flex items-center justify-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors shadow-sm shrink-0"
        >
          <Plus className="w-4 h-4" />
          Novo Usuário
        </button>
      </div>

      {/* Busca por responsável, professor ou administrador */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome, email ou perfil (responsável, professor, administrador)"
          className="w-full border border-gray-200 rounded-lg p-2.5 pl-9 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-100 overflow-hidden">
        {filteredUsers.map(user => {
            const meta = roleMeta(user.role);
            return (
              <div key={user.id} className="flex items-center justify-between gap-3 p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                      <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full border border-gray-200 shrink-0" />
                      <div className="min-w-0">
                          <h3 className="font-bold text-gray-900 leading-tight truncate">{user.name}</h3>
                          <p className="text-sm text-gray-500 truncate">{user.email}</p>
                      </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                      <span className={`px-2 py-1 rounded-full text-[10px] sm:text-xs font-bold uppercase flex items-center gap-1 ${meta.badge}`}>
                          <Shield className="w-3 h-3" />
                          <span>{meta.label}</span>
                      </span>
                      <button onClick={() => handleOpenEdit(user)} className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-gray-100 rounded-lg transition-colors">
                          <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(user.id)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-gray-100 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                      </button>
                  </div>
              </div>
            );
        })}
        {filteredUsers.length === 0 && (
          <div className="p-10 text-center text-gray-400 text-sm">Nenhum usuário encontrado.</div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-gray-900">{editingId ? 'Editar Usuário' : 'Novo Usuário'}</h3>
                    <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                </div>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                        <div className="relative">
                            <UserIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input required type="text" className="w-full border rounded-lg p-2.5 pl-9 focus:ring-2 focus:ring-primary-500 outline-none" 
                                placeholder="Ex: João da Silva"
                                value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email (Login)</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input required type="email" className="w-full border rounded-lg p-2.5 pl-9 focus:ring-2 focus:ring-primary-500 outline-none" 
                                placeholder="email@exemplo.com"
                                value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            {editingId ? 'Nova Senha (deixe em branco para manter)' : 'Senha'}
                        </label>
                        <div className="relative">
                            <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input 
                                type="password" 
                                className="w-full border rounded-lg p-2.5 pl-9 focus:ring-2 focus:ring-primary-500 outline-none" 
                                placeholder="******"
                                required={!editingId}
                                value={form.password} onChange={e => setForm({...form, password: e.target.value})} 
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Perfil de Acesso</label>
                        <div className="grid grid-cols-3 gap-2">
                            <button
                                type="button"
                                onClick={() => setForm({...form, role: UserRole.ADMIN})}
                                className={`p-3 rounded-lg border text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                                    form.role === UserRole.ADMIN
                                    ? 'bg-purple-50 border-purple-200 text-purple-700 ring-1 ring-purple-500'
                                    : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                                }`}
                            >
                                <Shield className="w-5 h-5" />
                                Administrador
                            </button>
                            <button
                                type="button"
                                onClick={() => setForm({...form, role: UserRole.PROFESSOR})}
                                className={`p-3 rounded-lg border text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                                    form.role === UserRole.PROFESSOR
                                    ? 'bg-blue-50 border-blue-200 text-blue-700 ring-1 ring-blue-500'
                                    : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                                }`}
                            >
                                <GraduationCap className="w-5 h-5" />
                                Professor
                            </button>
                            <button
                                type="button"
                                onClick={() => setForm({...form, role: UserRole.RESPONSAVEL})}
                                className={`p-3 rounded-lg border text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                                    form.role === UserRole.RESPONSAVEL
                                    ? 'bg-green-50 border-green-200 text-green-700 ring-1 ring-green-500'
                                    : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                                }`}
                            >
                                <UsersIcon className="w-5 h-5" />
                                Responsável
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                            {form.role === UserRole.ADMIN
                                ? 'Acesso total ao sistema, incluindo Financeiro e Gestão de Usuários.'
                                : form.role === UserRole.RESPONSAVEL
                                ? 'Acesso apenas aos próprios filhos (dados e financeiro). Responsáveis normalmente se cadastram pelo login via CPF.'
                                : 'Acesso restrito a Alunos, Grupos e Agenda. Não acessa Financeiro.'}
                        </p>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors">
                            Cancelar
                        </button>
                        <button 
                            type="submit" 
                            disabled={loading}
                            className="px-5 py-2.5 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors shadow-lg shadow-primary-500/30 flex items-center gap-2"
                        >
                            {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                            Salvar Usuário
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};