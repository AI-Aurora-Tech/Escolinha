
import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { DashboardPage } from './pages/DashboardPage';
import { StudentsPage } from './pages/StudentsPage';
import { GroupsPage } from './pages/GroupsPage';
import { PlansPage } from './pages/PlansPage';
import { SchedulePage } from './pages/SchedulePage';
import { FinancePage } from './pages/FinancePage';
import { AICoachPage } from './pages/AICoachPage';
import { UsersPage } from './pages/UsersPage';
import { Student, Group, Plan, Transaction, Activity, User, UserRole, PaymentStatus, TransactionType, PaymentMethod } from './types';
import { supabase } from './lib/supabaseClient';
import { Menu, Loader2, User as UserIcon, Lock, Users as UsersIcon } from 'lucide-react';
import { createMPPreference, getMPAccessToken } from './services/mercadoPago';

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
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
             studentsData = allStudents?.filter((s: any) => s.guardian?.cpf?.replace(/\D/g, '') === cleanUserCpf);

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
            if (usersData) setSystemUsers(usersData);
        }

        if (studentsData) {
             setStudents(studentsData.map((s: any) => ({
                 id: s.id,
                 name: s.name,
                 birthDate: s.birth_date,
                 rg: s.rg,
                 cpf: s.cpf,
                 phone: s.phone,
                 medicalCertificateExpiry: s.medical_expiry,
                 photoUrl: s.photo_url,
                 address: s.address,
                 guardian: s.guardian,
                 planId: s.plan_id,
                 groupIds: s.group_ids || (s.group_id ? [s.group_id] : []),
                 active: s.active,
                 documents: s.documents
             })));
        }

        if (groupsData) setGroups(groupsData);
        if (plansData) {
            setPlans(plansData.map((p: any) => ({
                id: p.id,
                name: p.name,
                price: p.price,
                dueDay: p.due_day,
                description: p.description
            })));
        }

        if (transactionsData) {
             setTransactions(transactionsData.map((t: any) => ({
                 id: t.id,
                 description: t.description,
                 amount: t.amount,
                 type: t.type,
                 date: t.date,
                 status: t.status,
                 studentId: t.student_id,
                 planId: t.plan_id,
                 paymentMethod: t.payment_method,
                 paymentLink: t.payment_link,
                 externalReference: t.external_reference
             })));
        }

        if (activitiesData) {
             setActivities(activitiesData.map((a: any) => ({
                 id: a.id,
                 title: a.title,
                 type: a.activity_type || 'TRAINING',
                 fee: a.fee || 0,
                 location: a.location || '',
                 presentationTime: a.presentation_time || '',
                 opponent: a.opponent || '',
                 homeScore: a.home_score,
                 awayScore: a.away_score,
                 scorers: a.scorers || [],
                 groupId: a.group_id,
                 participants: a.participants || [],
                 date: a.date ? a.date.split('T')[0] : '', 
                 startTime: a.start_time,
                 endTime: a.end_time,
                 recurrence: a.recurrence,
                 attendance: a.attendance || [],
                 feePayments: a.fee_payments || []
             })).sort((a, b) => a.startTime.localeCompare(b.startTime)));
        }
    } catch (error) {
        console.error("Data fetch error:", error);
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && currentUser) fetchData();
  }, [isAuthenticated, currentUser?.id]);

  const handleEmailLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoggingIn(true);
      const { data, error } = await supabase.from('app_users').select('*').eq('email', loginEmail).eq('password', loginPassword).maybeSingle();
      if (!error && data) {
          setCurrentUser(data);
          setIsAuthenticated(true);
      } else {
          setLoginError('Email ou senha inválidos.');
      }
      setIsLoggingIn(false);
  };

  const handleCpfCheck = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoggingIn(true);
      const cleanCpf = loginCpf.replace(/\D/g, '');
      const { data: existingUser } = await supabase.from('app_users').select('*').eq('cpf', loginCpf).maybeSingle();
      if (existingUser) {
           if (loginPassword && existingUser.password === loginPassword) {
                setCurrentUser(existingUser);
                setIsAuthenticated(true);
                setIsLoggingIn(false);
                return;
           } else if (!loginPassword) {
               setLoginError('Digite sua senha.');
           } else {
               setLoginError('Senha incorreta.');
           }
      } else {
          const { data: studs } = await supabase.from('students').select('guardian');
          const matched = studs?.find((s: any) => s.guardian?.cpf?.replace(/\D/g, '') === cleanCpf);
          if (matched) {
              setIsFirstAccess(true);
              setTempGuardianName(matched.guardian.name);
              setTempGuardianEmail(matched.guardian.email || `${cleanCpf}@martinica.com`);
          } else {
              setLoginError('CPF não encontrado.');
          }
      }
      setIsLoggingIn(false);
  };

  const handleCreatePassword = async (e: React.FormEvent) => {
      e.preventDefault();
      if (newPassword !== confirmNewPassword) { setLoginError('Senhas não coincidem.'); return; }
      setIsLoggingIn(true);
      const newUser = { name: tempGuardianName, email: tempGuardianEmail, password: newPassword, role: UserRole.RESPONSAVEL, cpf: loginCpf, avatar: `https://ui-avatars.com/api/?name=${tempGuardianName}` };
      const { data, error } = await supabase.from('app_users').insert([newUser]).select().single();
      if (!error && data) { setCurrentUser(data); setIsAuthenticated(true); }
      setIsLoggingIn(false);
  };

  const handleLogout = () => { setIsAuthenticated(false); setCurrentUser(null); };

  const generateAnnualTuition = async (student: Student, plan: Plan) => {
    const mpToken = await getMPAccessToken();
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const txs = [];
    
    for (let m = currentMonth; m <= 11; m++) {
        const dueDate = new Date(currentYear, m, plan.dueDay);
        if (dueDate.getMonth() !== m) dueDate.setDate(0);
        const monthName = dueDate.toLocaleString('pt-BR', { month: 'long' });
        const desc = `Mensalidade ${student.name.split(' ')[0]} - ${monthName.charAt(0).toUpperCase() + monthName.slice(1)}`;
        const extRef = crypto.randomUUID();
        let link = '';

        if (mpToken && student.guardian.cpf) {
            const res = await createMPPreference({
                title: desc, price: plan.price, externalReference: extRef,
                payer: { name: student.guardian.name, email: student.guardian.email, phone: student.guardian.phone, identification: { type: 'CPF', number: student.guardian.cpf } }
            });
            if (res) link = res.init_point;
        }

        txs.push({
            description: desc, amount: plan.price, type: TransactionType.INCOME, date: dueDate.toISOString().split('T')[0],
            status: PaymentStatus.PENDING, student_id: student.id, plan_id: plan.id, payment_link: link, external_reference: extRef, payment_method: PaymentMethod.PIX_MERCADO_PAGO
        });
    }

    if (txs.length > 0) {
        const { data } = await supabase.from('transactions').insert(txs).select();
        if (data) setTransactions(prev => [...prev, ...data.map((t: any) => ({
            id: t.id, description: t.description, amount: t.amount, type: t.type, date: t.date, status: t.status, studentId: t.student_id, paymentLink: t.payment_link, externalReference: t.external_reference
        }))]);
    }
  };

  const handleAddStudent = async (s: Omit<Student, 'id'>) => {
    setIsLoading(true);
    // Fix: Using planId instead of non-existent plan_id on Omit<Student, 'id'> (Error in App.tsx on line 254)
    const payload = {
        name: s.name, birth_date: s.birthDate, rg: s.rg, cpf: s.cpf, phone: s.phone, medical_expiry: s.medicalCertificateExpiry,
        photo_url: s.photoUrl, address: s.address, guardian: s.guardian, plan_id: s.planId, group_ids: s.groupIds, active: s.active, documents: s.documents
    };
    const { data, error } = await supabase.from('students').insert([payload]).select().single();
    if (!error && data) {
        const student = { ...s, id: data.id };
        setStudents(prev => [...prev, student]);
        if (student.active && student.planId) {
            const plan = plans.find(p => p.id === student.planId);
            if (plan) await generateAnnualTuition(student, plan);
        }
    } else {
        alert("Erro ao salvar aluno. Verifique se o Token do Mercado Pago está configurado.");
    }
    setIsLoggingIn(false);
  };

  const handleUpdateStudent = async (s: Student) => {
      const payload = {
          name: s.name, birth_date: s.birthDate, rg: s.rg, cpf: s.cpf, phone: s.phone, medical_expiry: s.medicalCertificateExpiry,
          photo_url: s.photoUrl, address: s.address, guardian: s.guardian, plan_id: s.planId, group_ids: s.groupIds, active: s.active, documents: s.documents
      };
      const { error } = await supabase.from('students').update(payload).eq('id', s.id);
      if (!error) setStudents(prev => prev.map(item => item.id === s.id ? s : item));
  };

  const handleAddTransaction = async (t: any) => { 
      const { data } = await supabase.from('transactions').insert([{ description: t.description, amount: t.amount, type: t.type, date: t.date, status: t.status, student_id: t.studentId, payment_method: t.paymentMethod }]).select().single();
      if (data) setTransactions(prev => [...prev, { ...t, id: data.id }]);
  };
  const handleUpdateTransaction = async (t: any) => { 
      await supabase.from('transactions').update({ status: t.status, date: t.date, payment_method: t.paymentMethod }).eq('id', t.id);
      setTransactions(prev => prev.map(tx => tx.id === t.id ? t : tx));
  };
  const handleAddGroup = async (g: any) => { 
      const { data } = await supabase.from('groups').insert([{ name: g.name }]).select().single();
      if (data) { setGroups(prev => [...prev, data]); return data.id; }
  };
  const handleUpdateGroup = async (g: any) => { await supabase.from('groups').update({ name: g.name }).eq('id', g.id); fetchData(); };
  const handleDeleteGroup = async (id: string) => { await supabase.from('groups').delete().eq('id', id); fetchData(); };
  const handleBatchAssignStudents = async (ids: string[], gid: string) => { fetchData(); };
  const handleAddPlan = async (p: any) => { await supabase.from('plans').insert([{ name: p.name, price: p.price, due_day: p.dueDay, description: p.description }]); fetchData(); };
  const handleUpdatePlan = async (p: any) => { await supabase.from('plans').update({ name: p.name, price: p.price, due_day: p.dueDay, description: p.description }).eq('id', p.id); fetchData(); };
  const handleDeletePlan = async (id: string) => { await supabase.from('plans').delete().eq('id', id); fetchData(); };
  const handleAddActivity = async (a: any) => { await supabase.from('activities').insert([a]); fetchData(); };
  const handleUpdateActivity = async (a: any) => { await supabase.from('activities').update(a).eq('id', a.id); fetchData(); };
  const handleUpdateAttendance = async (aid: string, sid: string) => { fetchData(); };
  const handleUpdateFeePayment = async (aid: string, sid: string) => { fetchData(); };
  const handleDeleteActivity = async (id: string) => { await supabase.from('activities').delete().eq('id', id); fetchData(); };
  const handleAddUser = async (u: any) => { await supabase.from('app_users').insert([u]); fetchData(); };
  const handleUpdateUser = async (u: any) => { await supabase.from('app_users').update(u).eq('id', u.id); fetchData(); };
  const handleDeleteUser = async (id: string) => { await supabase.from('app_users').delete().eq('id', id); fetchData(); };
  const handleNavigate = (p: string, d?: any) => { setCurrentPage(p); setPageData(d); };

  const renderContent = () => {
    if (!currentUser) return <div className="flex justify-center mt-20"><Loader2 className="animate-spin text-primary-600 w-10 h-10" /></div>;
    
    switch (currentPage) {
      case 'dashboard': return <DashboardPage students={students} transactions={transactions} activities={activities} role={currentUser.role} onNavigate={handleNavigate} />;
      case 'students': return <StudentsPage students={students} groups={groups} plans={plans} transactions={transactions} activities={activities} onAddStudent={handleAddStudent} onBatchAddStudents={() => {}} onUpdateStudent={handleUpdateStudent} onUpdateTransaction={handleUpdateTransaction} onAddTransaction={handleAddTransaction} initialFilter={pageData?.filter} currentUser={currentUser} />;
      case 'groups': return <GroupsPage groups={groups} students={students} onAddGroup={handleAddGroup} onUpdateGroup={handleUpdateGroup} onDeleteGroup={handleDeleteGroup} onBatchAssignStudents={handleBatchAssignStudents} />;
      case 'plans': return <PlansPage plans={plans} onAddPlan={handleAddPlan} onUpdatePlan={handleUpdatePlan} onDeletePlan={handleDeletePlan} />;
      case 'schedule': return <SchedulePage activities={activities} students={students} groups={groups} onAddActivity={handleAddActivity} onUpdateActivity={handleUpdateActivity} onUpdateAttendance={handleUpdateAttendance} onUpdateFeePayment={handleUpdateFeePayment} onDeleteActivity={handleDeleteActivity} currentUser={currentUser} />;
      case 'finance': return <FinancePage transactions={transactions} plans={plans} onAddTransaction={handleAddTransaction} onUpdateTransaction={handleUpdateTransaction} />;
      case 'users': return <UsersPage users={systemUsers} onAddUser={handleAddUser} onUpdateUser={handleUpdateUser} onDeleteUser={handleDeleteUser} />;
      default: return null;
    }
  };

  if (!isAuthenticated || !currentUser) {
      return (
          <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                  <div className="bg-primary-600 p-8 text-center relative">
                      <div className="inline-flex bg-white/20 p-4 rounded-full mb-4 backdrop-blur-sm">
                          <img src="/logo.svg" alt="Logo" className="w-16 h-16" />
                      </div>
                      <h1 className="text-2xl font-bold text-white mb-1">Garotos do Martinica</h1>
                      <p className="text-primary-100">Portal do Aluno e Gestão</p>
                  </div>
                  <div className="flex border-b border-gray-100">
                      <button className={`flex-1 py-4 text-sm font-semibold transition-colors ${activeLoginTab === 'EMAIL' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}`} onClick={() => { setActiveLoginTab('EMAIL'); setLoginError(''); setIsFirstAccess(false); }}>Admin / Professor</button>
                      <button className={`flex-1 py-4 text-sm font-semibold transition-colors ${activeLoginTab === 'CPF' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}`} onClick={() => { setActiveLoginTab('CPF'); setLoginError(''); setIsFirstAccess(false); }}>Sou Responsável</button>
                  </div>
                  <div className="p-8">
                      {isFirstAccess ? (
                           <form onSubmit={handleCreatePassword} className="space-y-4">
                               <div className="text-center mb-4">
                                   <h3 className="font-bold text-gray-800">Primeiro Acesso</h3>
                                   <p className="text-sm text-gray-500">Olá, <strong>{tempGuardianName}</strong>. Crie uma senha para acessar o portal.</p>
                               </div>
                               <div><label className="block text-sm font-medium text-gray-700 mb-1">Nova Senha</label><input type="password" required className="w-full border rounded-lg p-3" placeholder="******" value={newPassword} onChange={e => setNewPassword(e.target.value)} /></div>
                               <div><label className="block text-sm font-medium text-gray-700 mb-1">Confirmar Senha</label><input type="password" required className="w-full border rounded-lg p-3" placeholder="******" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} /></div>
                               {loginError && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg text-center">{loginError}</div>}
                               <button type="submit" disabled={isLoggingIn} className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2">{isLoggingIn ? <Loader2 className="animate-spin" /> : 'Criar Senha e Entrar'}</button>
                           </form>
                      ) : activeLoginTab === 'EMAIL' ? (
                        <form onSubmit={handleEmailLogin} className="space-y-4">
                            <div><label className="block text-sm font-medium text-gray-700 mb-1">Email</label><div className="relative"><UserIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" /><input type="email" required className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500" placeholder="seu@email.com" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} /></div></div>
                            <div><label className="block text-sm font-medium text-gray-700 mb-1">Senha</label><div className="relative"><Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" /><input type="password" required className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500" placeholder="••••••" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} /></div></div>
                            {loginError && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg text-center">{loginError}</div>}
                            <button type="submit" disabled={isLoggingIn} className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2">{isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Entrar no Sistema'}</button>
                        </form>
                      ) : (
                        <form onSubmit={handleCpfCheck} className="space-y-4">
                             <div><label className="block text-sm font-medium text-gray-700 mb-1">CPF do Responsável</label><div className="relative"><UsersIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" /><input type="text" required className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500" placeholder="000.000.000-00" value={loginCpf} onChange={(e) => setLoginCpf(e.target.value)} /></div></div>
                            <div><label className="block text-sm font-medium text-gray-700 mb-1">Senha <span className="text-gray-400 font-normal text-xs">(Deixe em branco no 1º acesso)</span></label><div className="relative"><Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" /><input type="password" title="Deixe em branco no 1º acesso" className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500" placeholder="••••••" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} /></div></div>
                            {loginError && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg text-center">{loginError}</div>}
                            <button type="submit" disabled={isLoggingIn} className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2">{isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Acessar / Primeiro Acesso'}</button>
                        </form>
                      )}
                      <div className="mt-6 text-center text-xs text-gray-400">© 2024 Garotos do Martinica.</div>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="flex bg-gray-50 min-h-screen">
      <Sidebar currentUser={currentUser} currentPage={currentPage} onNavigate={handleNavigate} onLogout={handleLogout} isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
      <main className="flex-1 md:ml-64 p-4 md:p-8 w-full">
        {isLoading && students.length === 0 ? <div className="flex justify-center mt-20"><Loader2 className="animate-spin text-primary-600 w-10 h-10" /></div> : renderContent()}
      </main>
    </div>
  );
}

export default App;
