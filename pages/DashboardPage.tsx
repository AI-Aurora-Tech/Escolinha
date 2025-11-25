
import React, { useMemo, useState } from 'react';
import { Users, DollarSign, CalendarCheck, AlertCircle, Download, Cake, ChevronRight, FileWarning } from 'lucide-react';
import { Student, Transaction, Activity, UserRole, TransactionType, PaymentStatus } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface DashboardProps {
  students: Student[];
  transactions: Transaction[];
  activities: Activity[];
  role: UserRole;
  onNavigate?: (page: string, data?: any) => void;
}

export const DashboardPage: React.FC<DashboardProps> = ({ students, transactions, activities, role, onNavigate }) => {
  const [birthdayMonth, setBirthdayMonth] = useState(new Date().getMonth());
  
  const activeStudents = students.filter(s => s.active).length;
  
  const monthlyRevenue = useMemo(() => {
    return transactions
      .filter(t => t.type === TransactionType.INCOME && t.status === PaymentStatus.PAID)
      .reduce((acc, curr) => acc + curr.amount, 0);
  }, [transactions]);

  const pendingPayments = useMemo(() => {
    return transactions
      .filter(t => t.type === TransactionType.INCOME && t.status !== PaymentStatus.PAID)
      .length;
  }, [transactions]);

  // Calculate distinct students who are defaulting
  const defaultingStudentsCount = useMemo(() => {
    const today = new Date();
    const defaulterIds = new Set(
        transactions
            .filter(t => 
                t.type === TransactionType.INCOME && 
                t.status !== PaymentStatus.PAID && 
                t.studentId &&
                new Date(t.date) < today
            )
            .map(t => t.studentId)
    );
    return defaulterIds.size;
  }, [transactions]);

  const missingDocsCount = useMemo(() => {
      return students.filter(s => {
          if (!s.active || !s.documents) return false;
          // Retorna verdadeiro se algum documento estiver false (faltando)
          return !s.documents.rg || !s.documents.cpf || !s.documents.medical || !s.documents.address || !s.documents.school;
      }).length;
  }, [students]);

  const nextActivity = useMemo(() => {
    const now = new Date();
    return activities
        .filter(a => new Date(a.date + 'T' + a.startTime) > now)
        .sort((a, b) => new Date(a.date + 'T' + a.startTime).getTime() - new Date(b.date + 'T' + b.startTime).getTime())[0];
  }, [activities]);

  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const birthdayStudents = useMemo(() => {
    return students.filter(s => {
        if (!s.birthDate) return false;
        const parts = s.birthDate.split('-');
        const month = parseInt(parts[1]) - 1; 
        return month === Number(birthdayMonth);
    }).sort((a, b) => {
        const dayA = parseInt(a.birthDate.split('-')[2]);
        const dayB = parseInt(b.birthDate.split('-')[2]);
        return dayA - dayB;
    });
  }, [students, birthdayMonth]);

  const handleExportBirthdays = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Aniversariantes de ${months[birthdayMonth]}`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 28);

    const tableData = birthdayStudents.map(s => {
        const parts = s.birthDate.split('-');
        const day = parts[2];
        const month = parts[1];
        const year = parts[0];
        const birthDateObj = new Date(parseInt(year), parseInt(month)-1, parseInt(day));
        const today = new Date();
        let age = today.getFullYear() - birthDateObj.getFullYear();
        const m = today.getMonth() - birthDateObj.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDateObj.getDate())) {
            age--;
        }

        return [
            `${day}/${month}`,
            s.name,
            `${age} anos`,
            s.phone || '-',
            s.guardian.name
        ];
    });

    autoTable(doc, {
        startY: 35,
        head: [['Dia', 'Nome do Aluno', 'Idade Atual', 'Telefone', 'Responsável']],
        body: tableData,
        headStyles: { fillColor: [249, 115, 22] }, // Orange-500
    });

    doc.save(`Aniversariantes_${months[birthdayMonth]}.pdf`);
  };

  const chartData = [
    { name: 'Jan', receita: 4000, despesa: 2400 },
    { name: 'Fev', receita: 3000, despesa: 1398 },
    { name: 'Mar', receita: 2000, despesa: 9800 },
    { name: 'Abr', receita: 2780, despesa: 3908 },
    { name: 'Mai', receita: 1890, despesa: 4800 },
    { name: 'Jun', receita: 2390, despesa: 3800 },
    { name: 'Jul', receita: 3490, despesa: 4300 },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-xl md:text-2xl font-bold text-gray-800">Visão Geral</h2>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 font-medium">Alunos Ativos</p>
            <h3 className="text-2xl font-bold text-gray-900 mt-1">{activeStudents}</h3>
          </div>
          <div className="bg-blue-50 p-3 rounded-lg">
            <Users className="w-6 h-6 text-blue-600" />
          </div>
        </div>

        {role === UserRole.ADMIN && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 font-medium">Receita Mensal</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">R$ {monthlyRevenue.toLocaleString('pt-BR')}</h3>
            </div>
            <div className="bg-green-50 p-3 rounded-lg">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
          </div>
        )}

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 font-medium">Próximo Treino</p>
            <h3 className="text-lg font-bold text-gray-900 mt-1 truncate max-w-[120px] sm:max-w-[150px]">
              {nextActivity ? nextActivity.title : 'Sem treinos'}
            </h3>
            {nextActivity && <p className="text-xs text-gray-400">{new Date(nextActivity.date).toLocaleDateString('pt-BR')} às {nextActivity.startTime}</p>}
          </div>
          <div className="bg-indigo-50 p-3 rounded-lg">
            <CalendarCheck className="w-6 h-6 text-indigo-600" />
          </div>
        </div>

        {role === UserRole.ADMIN && (
            <div 
                className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between cursor-pointer hover:border-red-300 transition-colors group"
                onClick={() => onNavigate && onNavigate('students', { filter: 'DEFAULTING' })}
            >
                <div>
                <p className="text-sm text-gray-500 font-medium group-hover:text-red-600 transition-colors">Alunos Inadimplentes</p>
                <h3 className="text-2xl font-bold text-red-600 mt-1 flex items-center gap-2">
                    {defaultingStudentsCount}
                    <span className="text-xs font-normal text-red-400 bg-red-50 px-2 py-0.5 rounded-full">Ver todos</span>
                </h3>
                </div>
                <div className="bg-red-50 p-3 rounded-lg group-hover:bg-red-100 transition-colors">
                    <AlertCircle className="w-6 h-6 text-red-600" />
                </div>
            </div>
        )}

        {role === UserRole.ADMIN && missingDocsCount > 0 && (
            <div 
                className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between cursor-pointer hover:border-orange-300 transition-colors group"
                onClick={() => onNavigate && onNavigate('students', { filter: 'MISSING_DOCS' })}
            >
                <div>
                <p className="text-sm text-gray-500 font-medium group-hover:text-orange-600 transition-colors">Doc. Pendente</p>
                <h3 className="text-2xl font-bold text-orange-600 mt-1 flex items-center gap-2">
                    {missingDocsCount}
                    <span className="text-xs font-normal text-orange-400 bg-orange-50 px-2 py-0.5 rounded-full">Ver</span>
                </h3>
                </div>
                <div className="bg-orange-50 p-3 rounded-lg group-hover:bg-orange-100 transition-colors">
                    <FileWarning className="w-6 h-6 text-orange-600" />
                </div>
            </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Financial Chart (Admin Only) or Placeholder */}
        {role === UserRole.ADMIN ? (
             <div className="lg:col-span-2 bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <h3 className="text-lg font-semibold text-gray-800 mb-6">Desempenho Financeiro (Semestral)</h3>
                <div className="h-64 md:h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} />
                            <YAxis axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} />
                            <Tooltip cursor={{fill: '#f9fafb'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                            <Bar dataKey="receita" name="Receitas" fill="#f97316" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="despesa" name="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        ) : (
            <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-center text-gray-400 min-h-[300px]">
                <p>Área reservada para gráficos administrativos.</p>
            </div>
        )}

        {/* Birthdays Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col h-full lg:min-h-[400px]">
            <div className="p-4 border-b border-gray-100 bg-orange-50 rounded-t-xl flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <Cake className="w-5 h-5 text-orange-600" />
                    <h3 className="font-bold text-gray-800">Aniversariantes</h3>
                </div>
                <button 
                    onClick={handleExportBirthdays}
                    className="p-1.5 bg-white text-orange-600 rounded-lg hover:bg-orange-100 transition-colors shadow-sm"
                    title="Exportar Lista"
                    disabled={birthdayStudents.length === 0}
                >
                    <Download className="w-4 h-4" />
                </button>
            </div>
            
            <div className="p-4 border-b border-gray-100">
                <select 
                    value={birthdayMonth} 
                    onChange={(e) => setBirthdayMonth(Number(e.target.value))}
                    className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                >
                    {months.map((m, index) => (
                        <option key={index} value={index}>{m}</option>
                    ))}
                </select>
            </div>

            <div className="flex-1 overflow-y-auto p-2 max-h-[350px]">
                {birthdayStudents.length > 0 ? (
                    <div className="space-y-2">
                        {birthdayStudents.map(student => {
                            const day = student.birthDate.split('-')[2];
                            return (
                                <div key={student.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors border border-gray-50 hover:border-gray-100">
                                    <div className="flex-shrink-0 w-10 h-10 bg-orange-100 text-orange-700 rounded-lg flex flex-col items-center justify-center">
                                        <span className="text-xs font-bold uppercase">{months[Number(birthdayMonth)].substring(0,3)}</span>
                                        <span className="text-sm font-bold leading-none">{day}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 truncate">{student.name}</p>
                                        <p className="text-xs text-gray-500 truncate">{student.active ? 'Ativo' : 'Inativo'} • {student.guardian.name}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8 text-center">
                        <Cake className="w-10 h-10 mb-2 opacity-20" />
                        <p className="text-sm">Nenhum aniversariante em {months[Number(birthdayMonth)]}.</p>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};
