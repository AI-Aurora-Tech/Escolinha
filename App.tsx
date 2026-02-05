
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { DashboardPage } from './pages/DashboardPage';
import { StudentsPage } from './pages/StudentsPage';
import { GroupsPage } from './pages/GroupsPage';
import { PlansPage } from './pages/PlansPage';
import { SchedulePage } from './pages/SchedulePage';
import { FinancePage } from './pages/FinancePage';
import { UsersPage } from './pages/UsersPage';
import { AICoachPage } from './pages/AICoachPage';
import { Student, Group, Plan, Transaction, Activity, User, UserRole, PaymentStatus, TransactionType, PaymentMethod, Occurrence } from './types';
import { supabase } from './lib/supabaseClient';
import { Menu, Loader2, User as UserIcon, Lock, Users as UsersIcon } from 'lucide-react';
import { checkMPPaymentStatus } from './services/mercadoPago';
import { sendZApiMessage, sendZApiDocument } from './services/zapiService';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Colunas seguras para transações
const TX_SELECT_FIELDS = 'id, description, amount, type, date, status, student_id, plan_id, payment_method, payment_link, external_reference, preference_id';

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
  
  // App State
  const [students, setStudents] = useState<Student[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [systemUsers, setSystemUsers] = useState<User[]>([]);
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);

  const checkingRefs = useRef<Set<string>>(new Set());

  const formatFriendlyDate = (dateString: string) => {
    if (!dateString) return '';
    const parts = dateString.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateString;
  };

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
        const { data: groupsData } = await supabase.from('groups').select('*');
        const { data: plansData } = await supabase.from('plans').select('*');
        const { data: activitiesData } = await supabase.from('activities').select('*');
        const { data: occurrencesData } = await supabase.from('student_occurrences').select('*');
        
        let studentsData;
        let transactionsData;

        if (currentUser?.role === UserRole.RESPONSAVEL && currentUser.cpf) {
             const { data: allStudents } = await supabase.from('students').select('*');
             const cleanUserCpf = currentUser.cpf.replace(/\D/g, '');
             studentsData = allStudents?.filter((s: any) => {
                 const gCpf = s.guardian?.cpf?.replace(/\D/g, '') || '';
                 return gCpf === cleanUserCpf;
             });

             if (studentsData && studentsData.length > 0) {
                 const studentIds = studentsData.map((s: any) => s.id);
                 const { data: myTxs } = await supabase
                    .from('transactions')
                    .select(TX_SELECT_FIELDS)
                    .in('student_id', studentIds);
                 transactionsData = myTxs;
             } else {
                 transactionsData = [];
             }
        } else {
             const { data: allStudents } = await supabase.from('students').select('*');
             const { data: allTxs } = await supabase.from('transactions').select(TX_SELECT_FIELDS);
             transactionsData = allTxs;
             studentsData = allStudents;
        }

        if (currentUser?.role === UserRole.ADMIN) {
            const { data: usersData } = await supabase.from('app_users').select('*');
            if (usersData) {
                setSystemUsers(usersData.map((u: any) => ({
                    id: u.id,
                    name: u.name,
                    email: u.email,
                    role: u.role,
                    avatar: u.avatar,
                    cpf: u.cpf
                })));
            }
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
                 planId: s.plan_id || '',
                 groupIds: s.group_ids || [],
                 active: s.active,
                 documents: s.documents 
             } as Student)));
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

        if (occurrencesData) {
            setOccurrences(occurrencesData.map((o: any) => ({
                id: o.id,
                studentId: o.student_id,
                description: o.description,
                date: o.date,
                createdAt: o.created_at
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
                 externalReference: t.external_reference, 
                 preferenceId: t.preference_id
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
                 date: a.date,
                 startTime: a.start_time,
                 endTime: a.end_time,
                 recurrence: a.recurrence,
                 attendance: a.attendance || [],
                 feePayments: a.fee_payments || [] 
             })));
        }
    } catch (error) {
        console.error("Error fetching data:", error);
    } finally {
        if (!silent) setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const handleChanges = () => fetchData(true);
    const channel = supabase.channel('realtime-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, handleChanges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, handleChanges)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isAuthenticated, fetchData]);

  useEffect(() => { if (isAuthenticated) fetchData(); }, [isAuthenticated, fetchData]);

  const handleEmailLogin = async (e: React.FormEvent) => {
      e.preventDefault(); setIsLoggingIn(true); setLoginError('');
      try {
          const { data, error } = await supabase.from('app_users').select('*').eq('email', loginEmail).eq('password', loginPassword).single();
          if (error || !data) { setLoginError('Email ou senha inválidos.'); setIsLoggingIn(false); return; }
          setCurrentUser({ id: data.id, name: data.name, email: data.email, role: data.role as UserRole, avatar: data.avatar || `https://ui-avatars.com/api/?name=${data.name}`, cpf: data.cpf });
          setIsAuthenticated(true);
      } catch (err) { setLoginError('Erro ao conectar ao servidor.'); } finally { setIsLoggingIn(false); }
  };

  const handleCpfCheck = async (e: React.FormEvent) => {
      e.preventDefault(); setIsLoggingIn(true); setLoginError('');
      const cleanCpf = loginCpf.replace(/\D/g, ''); 
      try {
          const { data: existingUser } = await supabase.from('app_users').select('*').eq('cpf', loginCpf).maybeSingle();
          if (existingUser) {
               if (loginPassword && existingUser.password === loginPassword) {
                    setCurrentUser({ id: existingUser.id, name: existingUser.name, email: existingUser.email, role: existingUser.role as UserRole, avatar: existingUser.avatar || `https://ui-avatars.com/api/?name=${existingUser.name}`, cpf: existingUser.cpf });
                    setIsAuthenticated(true); setIsLoggingIn(false); return;
               } else { setLoginError('Senha incorreta ou não informada.'); setIsLoggingIn(false); return; }
          }
          const { data: matched } = await supabase.from('students').select('guardian').limit(100);
          const found = matched?.find((s: any) => s.guardian?.cpf?.replace(/\D/g, '') === cleanCpf);
          if (found) { setIsFirstAccess(true); setTempGuardianName(found.guardian.name); setTempGuardianEmail(found.guardian.email); setIsLoggingIn(false); return; }
          setLoginError('CPF não encontrado.');
      } catch (err) { setLoginError('Erro ao validar CPF.'); } finally { setIsLoggingIn(false); }
  };

  const handleCreatePassword = async (e: React.FormEvent) => {
      e.preventDefault(); if (newPassword !== confirmNewPassword) { setLoginError('As senhas não coincidem.'); return; }
      setIsLoggingIn(true);
      try {
          const { data, error } = await supabase.from('app_users').insert([{ name: tempGuardianName, email: tempGuardianEmail || `${loginCpf}@martinica.com`, password: newPassword, role: UserRole.RESPONSAVEL, cpf: loginCpf, avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(tempGuardianName)}` }]).select().single();
          if (data && !error) { setCurrentUser({ id: data.id, name: data.name, email: data.email, role: data.role as UserRole, avatar: data.avatar, cpf: data.cpf }); setIsAuthenticated(true); }
      } catch (err) { setLoginError('Erro ao registrar.'); } finally { setIsLoggingIn(false); }
  };

  const handleAddStudent = async (studentData: Omit<Student, 'id'>) => {
    setIsLoading(true);
    const payload = { 
        name: studentData.name,
        birth_date: studentData.birthDate,
        rg: studentData.rg,
        cpf: studentData.cpf,
        phone: studentData.phone,
        medical_expiry: studentData.medicalCertificateExpiry,
        photo_url: studentData.photoUrl,
        address: studentData.address,
        guardian: studentData.guardian,
        plan_id: studentData.planId === '' ? null : studentData.planId,
        group_ids: studentData.groupIds || [],
        active: studentData.active,
        documents: studentData.documents
    };
    const { error } = await supabase.from('students').insert([payload]);
    if (!error) await fetchData(true);
    else console.error(error);
    setIsLoading(false);
  };

  const handleUpdateStudent = async (student: Student) => {
    setIsLoading(true);
    const payload = { 
      name: student.name, birth_date: student.birthDate, rg: student.rg, cpf: student.cpf, phone: student.phone,
      medical_expiry: student.medicalCertificateExpiry, photo_url: student.photoUrl, address: student.address,
      guardian: student.guardian, plan_id: student.planId === '' ? null : student.planId,
      group_ids: student.groupIds, active: student.active, documents: student.documents
    };
    const { error } = await supabase.from('students').update(payload).eq('id', student.id);
    if (!error) await fetchData(true);
    setIsLoading(false);
  };

  const handleUpdateTransaction = async (t: Partial<Transaction>) => { 
      if (!t.id) return;
      const payload: any = { status: t.status, payment_method: t.paymentMethod, amount: t.amount, description: t.description, date: t.date };
      if (t.externalReference !== undefined) payload.external_reference = t.externalReference;
      const { error } = await supabase.from('transactions').update(payload).eq('id', t.id);
      if (!error) await fetchData(true);
  };

  const handleAddTransaction = async (t: Omit<Transaction, 'id'>) => {
      const payload = { description: t.description, amount: t.amount, type: t.type, date: t.date, status: t.status, student_id: t.studentId, payment_method: t.paymentMethod };
      await supabase.from('transactions').insert([payload]);
      await fetchData(true);
  };

  const handleNavigate = (page: string, data?: any) => { setCurrentPage(page); setPageData(data || null); };

  if (!isAuthenticated) {
      return (
          <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-md overflow-hidden animate-in fade-in zoom-in duration-300">
                  <div className="bg-primary-600 p-8 text-center">
                      <h1 className="text-2xl font-bold text-white mb-1">Garotos do Martinica</h1>
                      <p className="text-primary-100">Sistema de Gestão Esportiva</p>
                  </div>
                  <div className="flex border-b">
                      <button className={`flex-1 py-4 text-sm font-bold ${activeLoginTab === 'EMAIL' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-400'}`} onClick={() => setActiveLoginTab('EMAIL')}>Admin / Professor</button>
                      <button className={`flex-1 py-4 text-sm font-bold ${activeLoginTab === 'CPF' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-400'}`} onClick={() => setActiveLoginTab('CPF')}>Sou Responsável</button>
                  </div>
                  <div className="p-8">
                      {isFirstAccess ? (
                           <form onSubmit={handleCreatePassword} className="space-y-4">
                               <div className="text-center mb-4"><h3 className="font-bold">Olá, {tempGuardianName}!</h3><p className="text-sm text-gray-500">Crie sua senha de acesso.</p></div>
                               <div><label className="block text-sm font-medium mb-1">Nova Senha</label><input type="password" required className="w-full border rounded-lg p-3 outline-none focus:ring-2 focus:ring-primary-500" value={newPassword} onChange={e => setNewPassword(e.target.value)} /></div>
                               <div><label className="block text-sm font-medium mb-1">Confirmar Senha</label><input type="password" required className="w-full border rounded-lg p-3 outline-none focus:ring-2 focus:ring-primary-500" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} /></div>
                               <button type="submit" disabled={isLoggingIn} className="w-full bg-primary-600 text-white font-bold py-3 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50">Definir Senha e Entrar</button>
                           </form>
                      ) : activeLoginTab === 'EMAIL' ? (
                        <form onSubmit={handleEmailLogin} className="space-y-4">
                            <div><label className="block text-sm font-medium mb-1">Email</label><input type="email" required className="w-full border rounded-lg p-3 outline-none focus:ring-2 focus:ring-primary-500" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} /></div>
                            <div><label className="block text-sm font-medium mb-1">Senha</label><input type="password" required className="w-full border rounded-lg p-3 outline-none focus:ring-2 focus:ring-primary-500" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} /></div>
                            {loginError && <p className="text-red-500 text-sm text-center">{loginError}</p>}
                            <button type="submit" disabled={isLoggingIn} className="w-full bg-primary-600 text-white font-bold py-3 rounded-lg hover:bg-primary-700 transition-colors">Entrar no Sistema</button>
                        </form>
                      ) : (
                        <form onSubmit={handleCpfCheck} className="space-y-4">
                            <div><label className="block text-sm font-medium mb-1">CPF do Responsável</label><input type="text" placeholder="000.000.000-00" required className="w-full border rounded-lg p-3 outline-none focus:ring-2 focus:ring-primary-500" value={loginCpf} onChange={(e) => setLoginCpf(e.target.value)} /></div>
                            <div><label className="block text-sm font-medium mb-1">Senha</label><input type="password" placeholder="Em branco no 1º acesso" className="w-full border rounded-lg p-3 outline-none focus:ring-2 focus:ring-primary-500" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} /></div>
                            {loginError && <p className="text-red-500 text-sm text-center">{loginError}</p>}
                            <button type="submit" disabled={isLoggingIn} className="w-full bg-primary-600 text-white font-bold py-3 rounded-lg hover:bg-primary-700 transition-colors">Acessar Portal</button>
                        </form>
                      )}
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="flex bg-gray-50 min-h-screen">
      {isLoading && <div className="fixed inset-0 z-[100] bg-black/20 backdrop-blur-sm flex items-center justify-center"><Loader2 className="animate-spin text-primary-600 w-12 h-12" /></div>}
      <Sidebar currentUser={currentUser!} currentPage={currentPage} onNavigate={handleNavigate} onLogout={() => setIsAuthenticated(false)} isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
      <main className="flex-1 md:ml-64 p-4 md:p-8">
        <header className="mb-8 flex items-center gap-4">
            <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden p-2 bg-white border rounded-lg"><Menu /></button>
            <h1 className="text-2xl font-bold text-gray-900 uppercase">{currentPage}</h1>
        </header>
        {currentPage === 'dashboard' && <DashboardPage students={students} transactions={transactions} activities={activities} role={currentUser!.role} onNavigate={handleNavigate} />}
        {currentPage === 'students' && <StudentsPage students={students} groups={groups} plans={plans} transactions={transactions} activities={activities} occurrences={occurrences} onAddStudent={handleAddStudent} onUpdateStudent={handleUpdateStudent} onUpdateTransaction={handleUpdateTransaction} onAddTransaction={handleAddTransaction} onAddOccurrence={async (sid, desc, d) => { const { error } = await supabase.from('student_occurrences').insert([{ student_id: sid, description: desc, date: d }]); return !error; }} onGenerateTuitions={async () => {}} initialFilter={pageData?.filter} currentUser={currentUser} onBatchAddStudents={() => {}} />}
        {currentPage === 'plans' && <PlansPage plans={plans} onAddPlan={async (p) => { await supabase.from('plans').insert([{ name: p.name, price: p.price, due_day: p.dueDay, description: p.description }]); fetchData(true); }} onUpdatePlan={async (p) => { await supabase.from('plans').update({ name: p.name, price: p.price, due_day: p.dueDay, description: p.description }).eq('id', p.id); fetchData(true); }} onDeletePlan={async (id) => { await supabase.from('plans').delete().eq('id', id); fetchData(true); }} />}
        {currentPage === 'finance' && <FinancePage students={students} transactions={transactions} plans={plans} onAddTransaction={handleAddTransaction} onUpdateTransaction={handleUpdateTransaction} />}
      </main>
    </div>
  );
}

export default App;
