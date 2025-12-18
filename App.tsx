
// @google/genai guidelines followed in geminiService.ts

import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { DashboardPage } from './pages/DashboardPage';
import { StudentsPage } from './pages/StudentsPage';
import { GroupsPage } from './pages/GroupsPage';
import { PlansPage } from './pages/PlansPage';
import { SchedulePage } from './pages/SchedulePage';
import { FinancePage } from './pages/FinancePage';
import { UsersPage } from './pages/UsersPage';
import { AICoachPage } from './pages/AICoachPage';
import { Student, Group, Plan, Transaction, Activity, User, UserRole, PaymentStatus, TransactionType, PaymentMethod } from './types';
import { supabase } from './lib/supabaseClient';
import { Menu, Loader2, User as UserIcon, Lock, Users as UsersIcon, Smartphone, Mail, ChevronRight, Bot } from 'lucide-react';
import { createMPPreference } from './services/mercadoPago';

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // Login State
  const [activeLoginTab, setActiveLoginTab] = useState<'EMAIL' | 'CPF'>('EMAIL');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginCpf, setLoginCpf] = useState('');
  
  const [isFirstAccess, setIsFirstAccess] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [tempGuardianName, setTempGuardianName] = useState('');
  const [tempGuardianEmail, setTempGuardianEmail] = useState('');

  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [currentPage, setCurrentPage] = useState('dashboard');
  const [pageData, setPageData] = useState<any>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const [students, setStudents] = useState<Student[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [systemUsers, setSystemUsers] = useState<User[]>([]);

  // Fetch all initial data from Supabase
  const fetchData = async () => {
    if (!currentUser) return;
    setIsLoading(true);
    try {
        const { data: groupsData } = await supabase.from('groups').select('*');
        const { data: plansData } = await supabase.from('plans').select('*');
        const { data: activitiesData } = await supabase.from('activities').select('*');
        
        let studentsData;
        let transactionsData;

        if (currentUser.role === UserRole.RESPONSAVEL && currentUser.cpf) {
             const { data: allStudents } = await supabase.from('students').select('*');
             const cleanUserCpf = currentUser.cpf.replace(/\D/g, '');
             studentsData = allStudents?.filter((s: any) => {
                 const gCpf = s.guardian?.cpf?.replace(/\D/g, '') || '';
                 return gCpf === cleanUserCpf;
             });

             if (studentsData && studentsData.length > 0) {
                 const studentIds = studentsData.map((s: any) => s.id);
                 const { data: myTxs } = await supabase.from('transactions').select('*').in('student_id', studentIds);
                 transactionsData = myTxs;
             } else {
                 transactionsData = [];
             }
        } else {
             const { data: allStudents } = await supabase.from('students').select('*');
             const { data: allTxs } = await supabase.from('transactions').select('*');
             studentsData = allStudents;
             transactionsData = allTxs;
        }

        if (currentUser.role === UserRole.ADMIN) {
            const { data: usersData } = await supabase.from('app_users').select('*');
            if (usersData) {
                setSystemUsers(usersData.map((u: any) => ({ id: u.id, name: u.name, email: u.email, role: u.role, avatar: u.avatar, cpf: u.cpf })));
            }
        }

        if (studentsData) {
             setStudents(studentsData.map((s: any) => ({
                 id: s.id, name: s.name, birthDate: s.birth_date, rg: s.rg, cpf: s.cpf, phone: s.phone,
                 medicalCertificateExpiry: s.medical_expiry, photoUrl: s.photo_url, address: s.address, 
                 guardian: s.guardian, planId: s.plan_id, groupIds: s.group_ids || [], active: s.active, documents: s.documents
             })));
        }

        if (groupsData) setGroups(groupsData);
        if (plansData) setPlans(plansData.map((p: any) => ({ id: p.id, name: p.name, price: p.price, due_day: p.due_day, description: p.description })));
        if (transactionsData) {
             setTransactions(transactionsData.map((t: any) => ({
                 id: t.id, description: t.description, amount: t.amount, type: t.type, date: t.date, status: t.status,
                 studentId: t.student_id, planId: t.plan_id, paymentMethod: t.payment_method, paymentLink: t.payment_link,
                 externalReference: t.external_reference, preferenceId: t.preference_id
             })));
        }

        if (activitiesData) {
             setActivities(activitiesData.map((a: any) => ({
                 id: a.id, title: a.title, type: a.activity_type || 'TRAINING', fee: a.fee || 0,
                 location: a.location || '', presentationTime: a.presentation_time || '',
                 opponent: a.opponent || '', homeScore: a.home_score || 0, awayScore: a.away_score || 0, scorers: a.scorers || [],
                 groupId: a.group_id, participants: a.participants || [], date: a.date,
                 startTime: a.start_time, endTime: a.end_time, recurrence: a.recurrence,
                 attendance: a.attendance || [], feePayments: a.fee_payments || [] 
             })));
        }
    } catch (error) { console.error("Error fetching data:", error); } 
    finally { setIsLoading(false); }
  };

  useEffect(() => {
    if (isAuthenticated) fetchData();
  }, [isAuthenticated]);

  const handleEmailLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoggingIn(true);
      setLoginError('');
      try {
          const { data, error } = await supabase.from('app_users').select('*').eq('email', loginEmail).eq('password', loginPassword).single();
          if (error || !data) { setLoginError('Email ou senha inválidos.'); setIsLoggingIn(false); return; }
          setCurrentUser({ id: data.id, name: data.name, email: data.email, role: data.role as UserRole, avatar: data.avatar || `https://ui-avatars.com/api/?name=${data.name}`, cpf: data.cpf });
          setIsAuthenticated(true);
      } catch (err) { setLoginError('Erro ao conectar ao servidor.'); } finally { setIsLoggingIn(false); }
  };

  const handleCpfCheck = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoggingIn(true);
      setLoginError('');
      const cleanCpf = loginCpf.replace(/\D/g, ''); 
      try {
          const { data: existingUser } = await supabase.from('app_users').select('*').eq('cpf', loginCpf).maybeSingle();
          if (existingUser) {
               if (loginPassword && existingUser.password === loginPassword) {
                    setCurrentUser({ id: existingUser.id, name: existingUser.name, email: existingUser.email, role: existingUser.role as UserRole, avatar: existingUser.avatar || `https://ui-avatars.com/api/?name=${existingUser.name}`, cpf: existingUser.cpf });
                    setIsAuthenticated(true);
                    return;
               } else { setLoginError(loginPassword ? 'Senha incorreta.' : 'Digite sua senha para o CPF informado.'); setIsLoggingIn(false); return; }
          }
          const { data: studentsData } = await supabase.from('students').select('guardian');
          const matched = studentsData?.find((s: any) => s.guardian?.cpf?.replace(/\D/g, '') === cleanCpf);
          if (matched) {
              setIsFirstAccess(true);
              setTempGuardianName(matched.guardian.name);
              setTempGuardianEmail(matched.guardian.email || `${cleanCpf}@martinica.com.br`);
          } else {
              setLoginError('CPF não encontrado na base de alunos.');
          }
      } catch (err) { setLoginError('Erro ao validar CPF.'); } finally { setIsLoggingIn(false); }
  };

  const handleCreatePassword = async (e: React.FormEvent) => {
      e.preventDefault();
      if (newPassword !== confirmNewPassword) { setLoginError('As senhas não coincidem.'); return; }
      setIsLoggingIn(true);
      try {
          const newUser = { name: tempGuardianName, email: tempGuardianEmail, password: newPassword, role: UserRole.RESPONSAVEL, cpf: loginCpf, avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(tempGuardianName)}` };
          const { data, error } = await supabase.from('app_users').insert([newUser]).select().single();
          if (data) { setCurrentUser(data); setIsAuthenticated(true); }
      } catch (err) { setLoginError('Erro ao criar senha.'); } finally { setIsLoggingIn(false); }
  };

  const handleNavigate = (p: string, d?: any) => { setCurrentPage(p); setPageData(d || null); setIsMobileMenuOpen(false); };
  const handleLogout = () => { setCurrentUser(null); setIsAuthenticated(false); setCurrentPage('dashboard'); };

  const handleUpdateAttendance = async (activityId: string, studentId: string) => {
    const activity = activities.find(a => a.id === activityId);
    if (!activity) return;
    
    const newAttendance = activity.attendance.includes(studentId)
        ? activity.attendance.filter(id => id !== studentId)
        : [...activity.attendance, studentId];
    
    const { error } = await supabase.from('activities').update({ attendance: newAttendance }).eq('id', activityId);
    if (!error) {
        setActivities(prev => prev.map(a => a.id === activityId ? { ...a, attendance: newAttendance } : a));
    }
  };

  // Student handlers to fix missing reference
  const handleAddStudent = async (s: Omit<Student, 'id'>) => {
    const payload = {
        name: s.name,
        birth_date: s.birthDate,
        rg: s.rg,
        cpf: s.cpf,
        phone: s.phone,
        medical_expiry: s.medicalCertificateExpiry,
        // Fix: Use photoUrl from Student interface
        photo_url: s.photoUrl,
        address: s.address,
        guardian: s.guardian,
        plan_id: s.planId,
        group_ids: s.groupIds,
        active: s.active,
        documents: s.documents
    };
    const { error } = await supabase.from('students').insert([payload]);
    if (!error) fetchData();
  };

  const handleUpdateStudent = async (s: Student) => {
    const payload = {
        name: s.name,
        birth_date: s.birthDate,
        rg: s.rg,
        cpf: s.cpf,
        phone: s.phone,
        medical_expiry: s.medicalCertificateExpiry,
        // Fix: Ensure we use photoUrl from Student interface to avoid snake_case errors
        photo_url: s.photoUrl,
        address: s.address,
        guardian: s.guardian,
        plan_id: s.planId,
        group_ids: s.groupIds,
        active: s.active,
        documents: s.documents
    };
    const { error } = await supabase.from('students').update(payload).eq('id', s.id);
    if (!error) fetchData();
  };

  // Transaction handlers
  const handleAddTransaction = async (t: Omit<Transaction, 'id'>) => {
    const payload = {
        description: t.description,
        amount: t.amount,
        type: t.type,
        date: t.date,
        status: t.status,
        student_id: t.studentId,
        plan_id: t.planId,
        payment_method: t.paymentMethod,
        // Fix: Use camelCase properties paymentLink, externalReference, and preferenceId from Transaction interface
        payment_link: t.paymentLink,
        external_reference: t.externalReference,
        preference_id: t.preferenceId
    };
    const { error } = await supabase.from('transactions').insert([payload]);
    if (!error) fetchData();
  };

  const handleUpdateTransaction = async (t: Transaction) => {
    const payload = {
        description: t.description,
        amount: t.amount,
        type: t.type,
        date: t.date,
        status: t.status,
        // Fix: Use correct camelCase property names when accessing Transaction object properties
        student_id: t.studentId,
        plan_id: t.planId,
        payment_method: t.paymentMethod,
        payment_link: t.paymentLink,
        external_reference: t.externalReference,
        preference_id: t.preferenceId
    };
    const { error } = await supabase.from('transactions').update(payload).eq('id', t.id);
    if (!error) fetchData();
  };

  // Activity handlers
  const handleUpdateActivity = async (a: Activity) => {
    const payload = {
        title: a.title,
        activity_type: a.type,
        date: a.date,
        start_time: a.startTime,
        end_time: a.endTime,
        group_id: a.groupId,
        location: a.location,
        opponent: a.opponent,
        home_score: a.homeScore,
        away_score: a.awayScore,
        fee: a.fee,
        presentation_time: a.presentationTime,
        participants: a.participants,
        scorers: a.scorers
    };
    const { error } = await supabase.from('activities').update(payload).eq('id', a.id);
    if (!error) fetchData();
  };

  const handleAddActivity = async (a: Omit<Activity, 'id'>) => {
    const payload = {
        title: a.title,
        activity_type: a.type,
        date: a.date,
        start_time: a.startTime,
        end_time: a.endTime,
        group_id: a.groupId,
        location: a.location,
        opponent: a.opponent,
        home_score: a.homeScore,
        away_score: a.awayScore,
        fee: a.fee,
        presentation_time: a.presentationTime,
        participants: a.participants,
        scorers: a.scorers || []
    };
    const { error } = await supabase.from('activities').insert([payload]);
    if (!error) fetchData();
  };

  // Plan handlers
  const handleAddPlan = async (p: Omit<Plan, 'id'>) => {
    const payload = {
        name: p.name,
        price: p.price,
        due_day: p.dueDay,
        description: p.description
    };
    const { error } = await supabase.from('plans').insert([payload]);
    if (!error) fetchData();
  };

  const handleUpdatePlan = async (p: Plan) => {
    const payload = {
        name: p.name,
        price: p.price,
        due_day: p.dueDay,
        description: p.description
    };
    const { error } = await supabase.from('plans').update(payload).eq('id', p.id);
    if (!error) fetchData();
  };

  // Group handlers
  const handleAddGroup = async (g: Group): Promise<string | null> => {
    const { data, error } = await supabase.from('groups').insert({ name: g.name }).select().single();
    if (error || !data) return null;
    fetchData();
    return data.id;
  };

  const handleUpdateGroup = async (g: Group) => {
    const { error } = await supabase.from('groups').update({ name: g.name }).eq('id', g.id);
    if (!error) fetchData();
  };

  const handleBatchAssignStudents = async (studentIds: string[], groupId: string) => {
    // For simplicity, update each student's groupIds array
    for (const id of studentIds) {
        const s = students.find(x => x.id === id);
        if (s) {
            const newGroups = s.groupIds.includes(groupId) ? s.groupIds : [...s.groupIds, groupId];
            await supabase.from('students').update({ group_ids: newGroups }).eq('id', id);
        }
    }
    fetchData();
  };

  const renderContent = () => {
    switch (currentPage) {
      case 'dashboard': return <DashboardPage students={students} transactions={transactions} activities={activities} role={currentUser!.role} onNavigate={handleNavigate} />;
      case 'students': return <StudentsPage students={students} groups={groups} plans={plans} transactions={transactions} activities={activities} onAddStudent={handleAddStudent} onBatchAddStudents={()=>{}} onUpdateStudent={handleUpdateStudent} onUpdateTransaction={handleUpdateTransaction} onAddTransaction={handleAddTransaction} initialFilter={pageData?.filter} currentUser={currentUser} />;
      case 'schedule': return <SchedulePage activities={activities} students={students} groups={groups} onAddActivity={handleAddActivity} onUpdateActivity={handleUpdateActivity} onUpdateAttendance={handleUpdateAttendance} onDeleteActivity={id => supabase.from('activities').delete().eq('id', id).then(fetchData)} currentUser={currentUser} />;
      case 'finance': return <FinancePage transactions={transactions} plans={plans} onAddTransaction={handleAddTransaction} onUpdateTransaction={handleUpdateTransaction} />;
      case 'groups': return <GroupsPage groups={groups} students={students} onAddGroup={handleAddGroup} onUpdateGroup={handleUpdateGroup} onDeleteGroup={id=>supabase.from('groups').delete().eq('id', id).then(fetchData)} onBatchAssignStudents={handleBatchAssignStudents} />;
      case 'plans': return <PlansPage plans={plans} onAddPlan={handleAddPlan} onUpdatePlan={handleUpdatePlan} onDeletePlan={id=>supabase.from('plans').delete().eq('id', id).then(fetchData)} />;
      case 'users': return <UsersPage users={systemUsers} onAddUser={async u=> {await supabase.from('app_users').insert(u); fetchData();}} onUpdateUser={async u=> {await supabase.from('app_users').update(u).eq('id', u.id); fetchData();}} onDeleteUser={async id=> {await supabase.from('app_users').delete().eq('id', id); fetchData();}} />;
      case 'aicoach': return <AICoachPage income={transactions.filter(t => t.type === TransactionType.INCOME && t.status === PaymentStatus.PAID).reduce((acc, curr) => acc + curr.amount, 0)} expense={transactions.filter(t => t.type === TransactionType.EXPENSE).reduce((acc, curr) => acc + curr.amount, 0)} />;
      default: return <DashboardPage students={students} transactions={transactions} activities={activities} role={currentUser!.role} onNavigate={handleNavigate} />;
    }
  };

  if (!isAuthenticated) {
      return (
          <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4 sm:p-6">
              <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
                  <div className="bg-primary-500 p-8 text-center">
                      <div className="bg-white w-20 h-20 rounded-2xl mx-auto flex items-center justify-center shadow-lg mb-4">
                          <img src="/logo.svg" className="w-12 h-12" alt="Martinica" />
                      </div>
                      <h1 className="text-white text-2xl font-black uppercase tracking-tighter">Garotos do Martinica</h1>
                      <p className="text-primary-100 text-xs font-bold mt-1 uppercase opacity-80">Gestão de Escolinha</p>
                  </div>

                  <div className="p-8">
                      {!isFirstAccess ? (
                          <>
                            <div className="flex bg-gray-100 p-1 rounded-xl mb-8">
                                <button onClick={() => setActiveLoginTab('EMAIL')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-black uppercase transition-all ${activeLoginTab === 'EMAIL' ? 'bg-white shadow-sm text-primary-600' : 'text-gray-400'}`}><Mail className="w-4 h-4" /> Colaborador</button>
                                <button onClick={() => setActiveLoginTab('CPF')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-black uppercase transition-all ${activeLoginTab === 'CPF' ? 'bg-white shadow-sm text-primary-600' : 'text-gray-400'}`}><Smartphone className="w-4 h-4" /> Responsável</button>
                            </div>

                            <form onSubmit={activeLoginTab === 'EMAIL' ? handleEmailLogin : handleCpfCheck} className="space-y-4">
                                {activeLoginTab === 'EMAIL' ? (
                                    <>
                                        <div className="relative"><Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 w-5 h-5" /><input required type="email" placeholder="Email de acesso" className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:border-primary-500 outline-none font-bold text-sm" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} /></div>
                                        <div className="relative"><Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 w-5 h-5" /><input required type="password" placeholder="Sua senha" className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:border-primary-500 outline-none font-bold text-sm" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} /></div>
                                    </>
                                ) : (
                                    <>
                                        <div className="relative"><UsersIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 w-5 h-5" /><input required type="text" placeholder="CPF do Responsável" className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:border-primary-500 outline-none font-bold text-sm" value={loginCpf} onChange={e => setLoginCpf(e.target.value)} /></div>
                                        <div className="relative"><Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 w-5 h-5" /><input type="password" placeholder="Sua senha (se já tiver)" className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:border-primary-500 outline-none font-bold text-sm" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} /></div>
                                    </>
                                )}
                                {loginError && <p className="text-red-500 text-xs font-bold text-center px-2">{loginError}</p>}
                                <button disabled={isLoggingIn} type="submit" className="w-full bg-primary-600 hover:bg-primary-700 text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-primary-500/30 transition-all flex items-center justify-center gap-2">
                                    {isLoggingIn ? <Loader2 className="animate-spin" /> : <>Entrar no Sistema <ChevronRight className="w-5 h-5" /></>}
                                </button>
                            </form>
                          </>
                      ) : (
                          <form onSubmit={handleCreatePassword} className="space-y-4">
                              <div className="text-center mb-6"><h2 className="text-xl font-black text-gray-800">Primeiro Acesso</h2><p className="text-gray-400 text-xs font-bold mt-1">Crie uma senha para o CPF informado</p></div>
                              <div className="relative"><Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 w-5 h-5" /><input required type="password" placeholder="Nova Senha" className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:border-primary-500 outline-none font-bold text-sm" value={newPassword} onChange={e => setNewPassword(e.target.value)} /></div>
                              <div className="relative"><Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 w-5 h-5" /><input required type="password" placeholder="Confirmar Senha" className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:border-primary-500 outline-none font-bold text-sm" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} /></div>
                              {loginError && <p className="text-red-500 text-xs font-bold text-center">{loginError}</p>}
                              <button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white py-4 rounded-2xl font-black uppercase tracking-widest transition-all">Ativar Acesso</button>
                          </form>
                      )}
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="flex bg-gray-50 min-h-screen font-sans overflow-x-hidden">
      <Sidebar currentUser={currentUser} currentPage={currentPage} onNavigate={handleNavigate} onLogout={handleLogout} isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
      
      <main className="flex-1 md:ml-64 p-4 md:p-8 w-full max-w-full overflow-x-hidden">
        <header className="mb-6 flex justify-between items-center">
            <div className="flex items-center gap-3">
                <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden p-2 bg-white rounded-xl shadow-sm border border-gray-100 text-gray-700"><Menu /></button>
                <h1 className="text-xl md:text-2xl font-black text-gray-900 capitalize">{currentPage === 'students' ? (currentUser.role === UserRole.RESPONSAVEL ? 'Meus Filhos' : 'Alunos') : (currentPage === 'aicoach' ? 'Assistente IA' : currentPage)}</h1>
            </div>
            <div className="hidden sm:flex items-center gap-2 bg-orange-100 text-orange-800 text-[10px] font-black px-3 py-1.5 rounded-full border border-orange-200 uppercase tracking-tighter">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div> Sistema Ativo
            </div>
        </header>

        {isLoading ? (
             <div className="flex h-64 w-full items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-primary-500" /></div>
        ) : renderContent()}
      </main>
    </div>
  );
}

export default App;
