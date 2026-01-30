
import React, { useMemo, useState } from 'react';
import { Users, CalendarCheck, AlertCircle, Download, Cake, FileWarning, Trophy, Goal, ChevronRight } from 'lucide-react';
import { Student, Transaction, Activity, UserRole, TransactionType, PaymentStatus } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
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

  const pendingPayments = useMemo(() => {
    return transactions
      .filter(t => t.type === TransactionType.INCOME && t.status !== PaymentStatus.PAID)
      .length;
  }, [transactions]);

  // Calculate distinct active students who are defaulting (scoped by props)
  const defaultingStudentsCount = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const activeStudentIds = new Set(students.filter(s => s.active).map(s => s.id));
    
    const defaulterIds = new Set(
        transactions
            .filter(t => 
                t.type === TransactionType.INCOME && 
                t.status !== PaymentStatus.PAID && 
                t.status !== PaymentStatus.CANCELLED && 
                t.studentId &&
                activeStudentIds.has(t.studentId) && 
                t.date < todayStr
            )
            .map(t => t.studentId)
    );
    return defaulterIds.size;
  }, [transactions, students]);

  const missingDocsCount = useMemo(() => {
      return students.filter(s => {
          if (!s.active || !s.documents) return false;
          const check = (doc: any) => {
              if (typeof doc === 'boolean') return doc;
              return doc?.delivered;
          };
          return !check(s.documents.rg) || !check(s.documents.cpf) || !check(s.documents.medical) || !check(s.documents.address) || !check(s.documents.school);
      }).length;
  }, [students]);

  const nextActivity = useMemo(() => {
    const now = new Date();
    
    // Para responsáveis, precisamos filtrar apenas o que o filho dele está convocado
    const studentIds = students.map(s => s.id);
    const studentGroupIds = students.flatMap(s => s.groupIds || []);

    return activities
        .filter(a => {
            const isFuture = new Date(a.date + 'T' + a.startTime) > now;
            if (!isFuture) return false;

            // Se for responsável, filtra pela convocação do aluno
            if (role === UserRole.RESPONSAVEL) {
                const isInGroup = a.groupId && studentGroupIds.includes(a.groupId);
                const isIndividualParticipant = a.participants && a.participants.some(pId => studentIds.includes(pId));
                return isInGroup || isIndividualParticipant;
            }

            return true;
        })
        .sort((a, b) => new Date(a.date + 'T' + a.startTime).getTime() - new Date(b.date + 'T' + b.startTime).getTime())[0];
  }, [activities, students, role]);

  const formatDate = (dateString: string) => {
      if (!dateString) return '';
      const parts = dateString.split('-');
      if (parts.length === 3) {
          return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return dateString;
  };

  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const birthdayStudents = useMemo(() => {
    return students.filter(s => {
        if (!s.birthDate || !s.active) return false; // Apenas alunos ativos na lista de aniversariantes
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
        headStyles: { fillColor: [249, 115, 22] },
    });

    doc.save(`Aniversariantes_${months[birthdayMonth]}.pdf`);
  };

  const finishedGames = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    return activities
      .filter(a => {
        // Um jogo é considerado "finalizado" para a dashboard se:
        // 1. For do tipo GAME
        // 2. Pertencer ao ano corrente
        // 3. A data/hora de início já passou (flag temporal de finalização)
        // 4. Possuir valores numéricos para os placares
        const gameStart = new Date(`${a.date}T${a.startTime}`);
        return (
          a.type === 'GAME' && 
          a.date.startsWith(String(currentYear)) &&
          gameStart < now &&
          typeof a.homeScore === 'number' && 
          typeof a.awayScore === 'number'
        );
      })
      .sort((a, b) => new Date(b.date + 'T' + b.startTime).getTime() - new Date(a.date + 'T' + a.startTime).getTime());
  }, [activities]);

  const gameStats = useMemo(() => {
    let wins = 0;
    let draws = 0;
    let losses = 0;

    finishedGames.forEach(a => {
        const home = a.homeScore || 0;
        const away = a.awayScore || 0;

        if (home > away) wins++;
        else if (home < away) losses++;
        else draws++;
    });

    return [
        { name: 'Vitórias', value: wins, color: '#22c55e' }, 
        { name: 'Empates', value: draws, color: '#eab308' }, 
        { name: 'Derrotas', value: losses, color: '#ef4444' } 
    ];
  }, [finishedGames]);

  return (
    <div className="space-y-6">
      <h2 className="text-xl md:text-2xl font-bold text-gray-800">Visão Geral</h2>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 font-medium">{role === UserRole.RESPONSAVEL ? 'Seus Filhos' : 'Alunos Ativos'}</p>
            <h3 className="text-2xl font-bold text-gray-900 mt-1">{activeStudents}</h3>
          </div>
          <div className="bg-blue-50 p-3 rounded-lg">
            <Users className="w-6 h-6 text-blue-600" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-500 font-medium">Próxima Atividade</p>
            <h3 className="text-lg font-bold text-gray-900 mt-1 truncate">
              {nextActivity ? (
                <span className="flex items-center gap-1">
                  {nextActivity.type === 'GAME' ? 'Jogo: ' : 'Treino: '}
                  {nextActivity.title}
                </span>
              ) : 'Sem atividades'}
            </h3>
            {nextActivity && <p className="text-xs text-gray-400">{formatDate(nextActivity.date)} às {nextActivity.startTime}</p>}
          </div>
          <div className="bg-indigo-50 p-3 rounded-lg flex-shrink-0">
            <CalendarCheck className="w-6 h-6 text-indigo-600" />
          </div>
        </div>

        {(role === UserRole.ADMIN || role === UserRole.RESPONSAVEL) && (
            <div 
                className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between cursor-pointer hover:border-red-300 transition-colors group"
                onClick={() => onNavigate && onNavigate(role === UserRole.RESPONSAVEL ? 'students' : 'students', { filter: 'DEFAULTING' })}
            >
                <div>
                <p className="text-sm text-gray-500 font-medium group-hover:text-red-600 transition-colors">
                  {role === UserRole.RESPONSAVEL ? 'Mensalidade Pendente' : 'Alunos Inadimplentes'}
                </p>
                <h3 className="text-2xl font-bold text-red-600 mt-1 flex items-center gap-2">
                    {defaultingStudentsCount}
                    <span className="text-xs font-normal text-red-400 bg-red-50 px-2 py-0.5 rounded-full">Ver</span>
                </h3>
                </div>
                <div className="bg-red-50 p-3 rounded-lg group-hover:bg-red-100 transition-colors">
                    <AlertCircle className="w-6 h-6 text-red-600" />
                </div>
            </div>
        )}

        {(role === UserRole.ADMIN || role === UserRole.RESPONSAVEL) && missingDocsCount > 0 && (
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
         <div className="lg:col-span-2 bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-yellow-500" /> Resultados nos Jogos ({new Date().getFullYear()})
                </h3>
            </div>
            <div className="h-64 w-full">
                {gameStats.some(s => s.value > 0) ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={gameStats} layout="horizontal">
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#4b5563', fontSize: 14, fontWeight: 500}} />
                            <YAxis axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} allowDecimals={false} />
                            <Tooltip 
                                cursor={{fill: '#f9fafb'}} 
                                contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} 
                            />
                            <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={60}>
                                {gameStats.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400">
                        <Trophy className="w-12 h-12 mb-2 opacity-20" />
                        <p>Nenhum jogo finalizado neste ano ainda.</p>
                    </div>
                )}
            </div>

            {/* LISTAGEM DE RESULTADOS RECENTES */}
            {finishedGames.length > 0 && (
              <div className="mt-8 pt-6 border-t border-gray-100">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Goal className="w-4 h-4" /> Últimos Resultados ({new Date().getFullYear()})
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {finishedGames.slice(0, 4).map(game => {
                    const result = game.homeScore! > game.awayScore! ? 'W' : game.homeScore! < game.awayScore! ? 'L' : 'D';
                    const color = result === 'W' ? 'bg-green-100 text-green-700 border-green-200' : result === 'L' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-yellow-100 text-yellow-700 border-yellow-200';
                    const label = result === 'W' ? 'Vitória' : result === 'L' ? 'Derrota' : 'Empate';

                    return (
                      <div key={game.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-50 bg-gray-50/30 hover:bg-white hover:shadow-sm transition-all group">
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] text-gray-400 font-bold uppercase">{formatDate(game.date)} • {game.title}</p>
                          <h5 className="text-sm font-bold text-gray-700 truncate group-hover:text-primary-600 transition-colors">vs {game.opponent || 'Indefinido'}</h5>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-lg border border-gray-100 shadow-sm">
                            <span className="text-lg font-black text-primary-600">{game.homeScore}</span>
                            <span className="text-gray-300 font-light">x</span>
                            <span className="text-lg font-black text-gray-700">{game.awayScore}</span>
                          </div>
                          <span className={`w-2 h-8 rounded-full ${result === 'W' ? 'bg-green-500' : result === 'L' ? 'bg-red-500' : 'bg-yellow-500'}`} title={label} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {finishedGames.length > 4 && (
                  <button 
                    onClick={() => onNavigate?.('schedule')}
                    className="mt-4 w-full py-2 text-xs font-bold text-gray-400 hover:text-primary-600 transition-colors flex items-center justify-center gap-1 uppercase"
                  >
                    Ver Histórico Completo <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
        </div>

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
                        <p className="text-sm">Nenhum aniversariante ativo em {months[Number(birthdayMonth)]}.</p>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};
