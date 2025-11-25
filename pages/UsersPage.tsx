import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { Plus, Edit, Trash2, Shield, X, User as UserIcon, Mail, Key } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

interface UsersPageProps {
  users: User[];
  onAddUser: (user: Omit<User, 'id'>) => Promise<void>;
  onUpdateUser: (user: User) => Promise<void>;
  onDeleteUser: (id: string) => Promise<void>;
}

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
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Usuários do Sistema</h2>
        <button 
          onClick={handleOpenNew}
          className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Novo Usuário
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {users.map(user => (
            <div key={user.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:border-primary-200 transition-colors">
                <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                        <img src={user.avatar} alt={user.name} className="w-12 h-12 rounded-full border border-gray-200" />
                        <div>
                             <h3 className="text-lg font-bold text-gray-900 leading-tight">{user.name}</h3>
                             <p className="text-sm text-gray-500">{user.email}</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => handleOpenEdit(user)} className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-gray-50 rounded-lg transition-colors">
                            <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(user.id)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-gray-50 rounded-lg transition-colors">
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>
                
                <div className="flex items-center gap-3 pt-4 border-t border-gray-50 mt-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase flex items-center gap-1 ${
                        user.role === UserRole.ADMIN ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                        <Shield className="w-3 h-3" />
                        {user.role === UserRole.ADMIN ? 'Administrador' : 'Professor'}
                    </span>
                </div>
            </div>
        ))}
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
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setForm({...form, role: UserRole.ADMIN})}
                                className={`p-3 rounded-lg border text-sm font-medium flex flex-col items-center gap-1 transition-all ${
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
                                className={`p-3 rounded-lg border text-sm font-medium flex flex-col items-center gap-1 transition-all ${
                                    form.role === UserRole.PROFESSOR 
                                    ? 'bg-blue-50 border-blue-200 text-blue-700 ring-1 ring-blue-500' 
                                    : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                                }`}
                            >
                                <UserIcon className="w-5 h-5" />
                                Professor
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                            {form.role === UserRole.ADMIN 
                                ? 'Acesso total ao sistema, incluindo Financeiro e Gestão de Usuários.' 
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