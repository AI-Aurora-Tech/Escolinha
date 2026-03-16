import React from 'react';
import { LayoutDashboard, Users, Calendar, Wallet, Menu } from 'lucide-react';
import { User, UserRole } from '../types';

interface BottomNavProps {
  currentUser: User;
  currentPage: string;
  onNavigate: (page: string) => void;
  onOpenMenu: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentUser, currentPage, onNavigate, onOpenMenu }) => {
  const navItems = [
    { id: 'dashboard', label: 'Início', icon: LayoutDashboard, roles: [UserRole.ADMIN, UserRole.PROFESSOR, UserRole.RESPONSAVEL] },
    { id: 'schedule', label: 'Agenda', icon: Calendar, roles: [UserRole.ADMIN, UserRole.PROFESSOR, UserRole.RESPONSAVEL] },
    { id: 'students', label: currentUser.role === UserRole.RESPONSAVEL ? 'Filhos' : 'Alunos', icon: Users, roles: [UserRole.ADMIN, UserRole.PROFESSOR, UserRole.RESPONSAVEL] },
    { id: 'finance', label: 'Caixa', icon: Wallet, roles: [UserRole.ADMIN] },
  ];

  const visibleItems = navItems.filter(item => item.roles.includes(currentUser.role));

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around items-center pb-[env(safe-area-inset-bottom)] z-40 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
      {visibleItems.map(item => {
        const Icon = item.icon;
        const isActive = currentPage === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`flex flex-col items-center justify-center w-full py-3 ${isActive ? 'text-primary-600' : 'text-gray-500 hover:text-gray-900'}`}
          >
            <Icon className={`w-6 h-6 mb-1 ${isActive ? 'fill-primary-50' : ''}`} />
            <span className="text-[10px] font-bold">{item.label}</span>
          </button>
        );
      })}
      <button
        onClick={onOpenMenu}
        className="flex flex-col items-center justify-center w-full py-3 text-gray-500 hover:text-gray-900"
      >
        <Menu className="w-6 h-6 mb-1" />
        <span className="text-[10px] font-bold">Menu</span>
      </button>
    </div>
  );
};
