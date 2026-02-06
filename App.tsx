
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

const TX_SELECT_FIELDS = 'id, description, amount, type, date, status, student_id, plan_id, payment_method, payment_link, external_reference, preference_id';

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
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);

  const checkingRefs = useRef<Set<string>>(new Set());

  // Helpers de tratamento de dados para o Postgres
  const safeDate = (d?: string) => (d === '' || !d) ? null : d;
  const safeId = (id?: string) => (id === '' || !id) ? null : id;

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
             studentsData = allStudents?.filter((s: any) => (s.guardian?.cpf?.replace(/\D/g, '') || '') === cleanUserCpf);

             if (studentsData && studentsData.length > 0) {
                 const studentIds = studentsData.map((s: any) => s.id);
                 const { data: myTxs } = await supabase.from('transactions').select(TX_SELECT_FIELDS).in('student_id', studentIds);
                 transactionsData = myTxs;
             } else transactionsData = [];
        } else {
             const { data: allStudents } = await supabase.from('students').select('*');
             const { data: allTxs } = await supabase.from('transactions').select(TX_SELECT_FIELDS);
             studentsData = allStudents;
             transactionsData = allTxs;
        }

        if (currentUser?.role === UserRole.ADMIN) {
            const { data: usersData } = await supabase.from('app_users').select('*');
            if (usersData) setSystemUsers(usersData as User[]);
        }

        if (studentsData) {
             setStudents(studentsData.map((s: any) => ({
                 id: s.id, name: s.name, birthDate: s.birth_date, rg: s.rg, cpf: s.cpf, phone: s.phone,
                 medicalCertificateExpiry: s.medical_expiry, photoUrl: s.photo_url, address: s.address || {}, 
                 guardian: s.guardian || {}, planId: s.plan_id || '', groupIds: s.group_ids || [], 
                 active: s.active, documents: s.documents || {}
             } as Student)));
        }

        if (groupsData) setGroups(groupsData);
        if (plansData) setPlans(plansData.map((p: any) => ({ id: p.id, name: p.name, price: p.price, dueDay: p.due_day, description: p.description })));
        if (occurrencesData) setOccurrences(occurrencesData.map((o: any) => ({ id: o.id, studentId: o.student_id, description: o.description, date: o.date, createdAt: o.created_at })));
        if (transactionsData) setTransactions(transactionsData.map((t: any) => ({ id: t.id, description: t.description, amount: t.amount, type: t.type, date: t.date, status: t.status, studentId: t.student_id, planId: t.plan_id, paymentMethod: t.payment_method, paymentLink: t.payment_link, externalReference: t.external_reference, preferenceId: t.preference_id })));
        if (activitiesData) setActivities(activitiesData.map((a: any) => ({ id: a.id, title: a.title, type: a.activity_type || 'TRAINING', fee: a.fee || 0, location: a.location || '', presentationTime: a.presentation_time, opponent: a.opponent, homeScore: a.home_score, awayScore: a.away_score, scorers: a.scorers || [], groupId: a.group_id, participants: a.participants || [], date: a.date, startTime: a.start_time, endTime: a.end_time, recurrence: a.recurrence, attendance: a.attendance || [], feePayments: a.fee_payments || [] })));
    } catch (error) {
        console.error("Error fetching data:", error);
    } finally {
        if (!silent) setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const channel = supabase.channel('app-db-changes').on('postgres_changes', { event: '*', schema: 'public' }, () => fetchData(true)).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isAuthenticated, fetchData]);

  useEffect(() => { if (isAuthenticated) fetchData(); }, [isAuthenticated, fetchData]);

  const handleEmailLogin = async (e: React.FormEvent) => {
      e.preventDefault(); setIsLoggingIn(true); setLoginError('');
      try {
          const { data, error } = await supabase.from('app_users').select('*').eq('email', loginEmail).eq('password', loginPassword).single();
          if (error || !data) { setLoginError('Email ou senha inválidos.'); setIsLoggingIn(false); return; }
          setCurrentUser(data as User); setIsAuthenticated(true);
      } catch (err) { setLoginError('Erro ao conectar ao servidor.'); } finally { setIsLoggingIn(false); }
  };

  const handleCpfCheck = async (e: React.FormEvent) => {
      e.preventDefault(); setIsLoggingIn(true); setLoginError('');
      const cleanCpf = loginCpf.replace(/\D/g, ''); 
      try {
          const { data: existingUser } = await supabase.from('app_users').select('*').eq('cpf', loginCpf).maybeSingle();
          if (existingUser) {
               if (loginPassword) {
                   if (existingUser.password === loginPassword) { setCurrentUser(existingUser as User); setIsAuthenticated(true); setIsLoggingIn(false); return; }
                   else { setLoginError('Senha incorreta.'); setIsLoggingIn(false); return; }
               } else { setLoginError('Por favor, digite sua senha.'); setIsLoggingIn(false); return; }
          }
          const { data: studentsData } = await supabase.from('students').select('guardian');
          if (studentsData) {
              const matchedStudent = studentsData.find((s: any) => (s.guardian?.cpf?.replace(/\D/g, '') === cleanCpf));
              if (matchedStudent) { setIsFirstAccess(true); setTempGuardianName(matchedStudent.guardian.name); setTempGuardianEmail(matchedStudent.guardian.email || `${cleanCpf}@temp.com`); setLoginError(''); setIsLoggingIn(false); return; }
          }
          setLoginError('CPF não encontrado.');
      } catch (err) { setLoginError('Erro ao validar CPF.'); } finally { setIsLoggingIn(false); }
  };

  const handleCreatePassword = async (e: React.FormEvent) => {
      e.preventDefault(); if (newPassword !== confirmNewPassword) { setLoginError('As senhas não coincidem.'); return; }
      if (newPassword.length < 6) { setLoginError('A senha deve ter pelo menos 6 caracteres.'); return; }
      setIsLoggingIn(true);
      try {
          const newUserPayload = { name: tempGuardianName, email: tempGuardianEmail, password: newPassword, role: UserRole.RESPONSAVEL, cpf: loginCpf, avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(tempGuardianName)}&background=random` };
          const { data, error } = await supabase.from('app_users').insert([newUserPayload]).select().single();
          if (data && !error) { setCurrentUser(data as User); setIsAuthenticated(true); }
          else setLoginError('Erro ao criar usuário.');
      } catch (err) { setLoginError('Erro ao registrar senha.'); } finally { setIsLoggingIn(false); }
  };

  const handleLogout = () => { setCurrentUser(null); setIsAuthenticated(false); setCurrentPage('dashboard'); };

  const handleGenerateGlobalTuitions = async () => {
    // Lógica para gerar mensalidades em massa...
    await fetchData(true);
  };

  const uploadPhoto = async (base64: string, name: string) => {
    try {
      const fileName = `${Date.now()}_${name.replace(/\s+/g, '_')}.jpg`;
      const base64Data = base64.split(',')[1];
      const binaryData = atob(base64Data);
      const uint8Array = new Uint8Array(binaryData.length);
      for (let i = 0; i < binaryData.length; i++) uint8Array[i] = binaryData.charCodeAt(i);
      const { error } = await supabase.storage.from('student-photos').upload(fileName, uint8Array, { contentType: 'image/jpeg' });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('student-photos').getPublicUrl(fileName);
      return urlData.publicUrl;
    } catch (err) { return base64; }
  };

  const handleAddStudent = async (studentData: Omit<Student, 'id'>) => {
    setIsLoading(true);
    try {
        let finalPhotoUrl = studentData.photoUrl;
        if (studentData.photoUrl && studentData.photoUrl.startsWith('data:')) {
          finalPhotoUrl = await uploadPhoto(studentData.photoUrl, studentData.name);
        }

        const payload = {
          name: studentData.name,
          birth_date: safeDate(studentData.birthDate),
          rg: studentData.rg || null,
          cpf: studentData.cpf || null,
          phone: studentData.phone || null,
          medical_expiry: safeDate(studentData.medicalCertificateExpiry),
          photo_url: finalPhotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(studentData.name)}&background=random`,
          address: studentData.address || {},
          guardian: studentData.guardian || {},
          plan_id: safeId(studentData.planId),
          group_ids: studentData.groupIds || [],
          active: studentData.active ?? true,
          documents: studentData.documents || {}
        };

        const { error } = await supabase.from('students').insert([payload]);
        if (error) throw error;

        await fetchData(true);
        if (studentData.guardian.phone) sendZApiMessage(studentData.guardian.phone, `Bem-vindo(a) à Garotos do Martinica! ⚽`);
        await handleGenerateGlobalTuitions();
        alert("Atleta cadastrado com sucesso!");
    } catch (err: any) {
        console.error("Erro ao salvar atleta:", err);
        alert(`Erro ao salvar: ${err.message}`);
    } finally {
        setIsLoading(false);
    }
  };

  const handleUpdateStudent = async (student: Student) => {
    setIsLoading(true);
    try {
        let finalPhotoUrl = student.photoUrl;
        if (student.photoUrl && student.photoUrl.startsWith('data:')) {
          finalPhotoUrl = await uploadPhoto(student.photoUrl, student.name);
        }

        const payload = {
          name: student.name,
          birth_date: safeDate(student.birthDate),
          rg: student.rg || null,
          cpf: student.cpf || null,
          phone: student.phone || null,
          medical_expiry: safeDate(student.medicalCertificateExpiry),
          photo_url: finalPhotoUrl,
          address: student.address,
          guardian: student.guardian,
          plan_id: safeId(student.planId),
          group_ids: student.groupIds,
          active: student.active,
          documents: student.documents
        };

        const { error } = await supabase.from('students').update(payload).eq('id', student.id);
        if (error) throw error;
        await fetchData(true);
        alert("Dados atualizados!");
    } catch (err: any) {
        alert(`Erro ao atualizar: ${err.message}`);
    } finally {
        setIsLoading(false);
    }
  };

  const handleUpdateTransaction = async (t: Partial<Transaction>) => { 
      if (!t.id) return;
      const { error } = await supabase.from('transactions').update(t).eq('id', t.id);
      if(!error) await fetchData(true);
  };

  const handleAddTransaction = async (t: Omit<Transaction, 'id'>) => {
    await supabase.from('transactions').insert([t]);
    await fetchData(true);
  };

  const handleAddOccurrence = async (studentId: string, description: string, date: string): Promise<boolean> => {
      const { error } = await supabase.from('student_occurrences').insert([{ student_id: studentId, description, date }]);
      if (!error) { await fetchData(true); return true; }
      return false;
  };

  const handleAddActivity = async (a: Omit<Activity, 'id'>) => {
      await supabase.from('activities').insert([a]);
      await fetchData(true);
  };

  const handleUpdateActivity = async (a: Activity) => {
      await supabase.from('activities').update(a).eq('id', a.id);
      await fetchData(true);
  };

  const handleUpdateAttendance = async (activityId: string, studentId: string) => {
    const activity = activities.find(a => a.id === activityId);
    if (!activity) return;
    const nextAttendance = activity.attendance.includes(studentId) ? activity.attendance.filter(id => id !== studentId) : [...activity.attendance, studentId];
    await supabase.from('activities').update({ attendance: nextAttendance }).eq('id', activityId);
    await fetchData(true);
  };

  const handleUpdateFeePayment = async (activityId: string, studentId: string) => {
    const activity = activities.find(a => a.id === activityId);
    if (!activity) return;
    const nextFeePayments = (activity.feePayments || []).includes(studentId) ? (activity.feePayments || []).filter(id => id !== studentId) : [...(activity.feePayments || []), studentId];
    await supabase.from('activities').update({ fee_payments: nextFeePayments }).eq('id', activityId);
    await fetchData(true);
  };

  const handleDeleteActivity = async (id: string) => {
    await supabase.from('activities').delete().eq('id', id);
    await fetchData(true);
  };

  const handleAddGroup = async (g: Omit<Group, 'id'>): Promise<string | null> => {
      const { data } = await supabase.from('groups').insert([g]).select().single();
      await fetchData(true);
      return data?.id || null;
  };

  const handleUpdateGroup = async (g: Group) => {
      await supabase.from('groups').update(g).eq('id', g.id);
      await fetchData(true);
  };

  const handleDeleteGroup = async (id: string) => {
      await supabase.from('groups').delete().eq('id', id);
      await fetchData(true);
  };

  const handleBatchAssignStudents = async (studentIds: string[], groupId: string) => {
      // Lógica de atribuição em lote...
      await fetchData(true);
  };

  const handleAddPlan = async (p: Omit<Plan, 'id'>) => {
      await supabase.from('plans').insert([p]);
      await fetchData(true);
  };

  const handleUpdatePlan = async (p: Plan) => {
      await supabase.from('plans').update(p).eq('id', p.id);
      await fetchData(true);
  };

  const handleDeletePlan = async (id: string) => {
      await supabase.from('plans').delete().eq('id', id);
      await fetchData(true);
  };

  const handleAddUser = async (u: Omit<User, 'id'>) => {
      await supabase.from('app_users').insert([u]);
      await fetchData(true);
  };

  const handleUpdateUser = async (u: User) => {
      await supabase.from('app_users').update(u).eq('id', u.id);
      await fetchData(true);
  };

  const handleDeleteUser = async (id: string) => {
      await supabase.from('app_users').delete().eq('id', id);
      await fetchData(true);
  };

  const handleNavigate = (page: string, data?: any) => { setCurrentPage(page); setPageData(data || null); };

  if (!isAuthenticated) {
    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-md overflow-hidden">
                <div className="bg-primary-600 p-8 text-center">
                    <h1 className="text-2xl font-bold text-white mb-1">Garotos do Martinica</h1>
                    <p className="text-primary-100">Portal do Aluno e Gestão</p>
                </div>
                <div className="flex border-b">
                    <button className={`flex-1 py-4 text-sm font-semibold ${activeLoginTab === 'EMAIL' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500'}`} onClick={() => setActiveLoginTab('EMAIL')}>Gestão</button>
                    <button className={`flex-1 py-4 text-sm font-semibold ${activeLoginTab === 'CPF' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500'}`} onClick={() => setActiveLoginTab('CPF')}>Responsável</button>
                </div>
                <div className="p-8">
                    {activeLoginTab === 'EMAIL' ? (
                        <form onSubmit={handleEmailLogin} className="space-y-4">
                            <input type="email" placeholder="Email" className="w-full border rounded-lg p-3 outline-none" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} />
                            <input type="password" placeholder="Senha" className="w-full border rounded-lg p-3 outline-none" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
                            <button className="w-full bg-primary-600 text-white py-3 rounded-lg font-bold">Entrar</button>
                        </form>
                    ) : (
                        <form onSubmit={handleCpfCheck} className="space-y-4">
                            <input type="text" placeholder="CPF do Responsável" className="w-full border rounded-lg p-3 outline-none" value={loginCpf} onChange={e => setLoginCpf(e.target.value)} />
                            <input type="password" placeholder="Senha (ou em branco no 1º acesso)" className="w-full border rounded-lg p-3 outline-none" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
                            <button className="w-full bg-primary-600 text-white py-3 rounded-lg font-bold">Acessar</button>
                        </form>
                    )}
                    {loginError && <p className="text-red-500 text-sm mt-4 text-center">{loginError}</p>}
                </div>
            </div>
        </div>
    );
  }

  return (
    <div className="flex bg-gray-50 min-h-screen">
      {isLoading && <div className="fixed inset-0 z-[100] bg-black/20 flex items-center justify-center"><Loader2 className="animate-spin text-primary-600 w-12 h-12" /></div>}
      <Sidebar currentUser={currentUser!} currentPage={currentPage} onNavigate={handleNavigate} onLogout={handleLogout} isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
      <main className="flex-1 md:ml-64 p-4 md:p-8">
        <header className="mb-8 flex items-center gap-4">
            <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden p-2 bg-white border rounded-lg"><Menu /></button>
            <h1 className="text-2xl font-bold text-gray-900 uppercase">{currentPage}</h1>
        </header>
        {currentPage === 'dashboard' && <DashboardPage students={students} transactions={transactions} activities={activities} role={currentUser!.role} onNavigate={handleNavigate} />}
        {currentPage === 'students' && <StudentsPage students={students} groups={groups} plans={plans} transactions={transactions} activities={activities} occurrences={occurrences} onAddStudent={handleAddStudent} onUpdateStudent={handleUpdateStudent} onUpdateTransaction={handleUpdateTransaction} onAddTransaction={handleAddTransaction} onAddOccurrence={handleAddOccurrence} onGenerateTuitions={handleGenerateGlobalTuitions} initialFilter={pageData?.filter} currentUser={currentUser} onBatchAddStudents={() => {}} />}
        {currentPage === 'finance' && <FinancePage students={students} transactions={transactions} plans={plans} onAddTransaction={handleAddTransaction} onUpdateTransaction={handleUpdateTransaction} />}
        {currentPage === 'plans' && <PlansPage plans={plans} onAddPlan={handleAddPlan} onUpdatePlan={handleUpdatePlan} onDeletePlan={handleDeletePlan} />}
        {currentPage === 'groups' && <GroupsPage groups={groups} students={students} onAddGroup={handleAddGroup} onUpdateGroup={handleUpdateGroup} onDeleteGroup={handleDeleteGroup} onBatchAssignStudents={handleBatchAssignStudents} />}
        {currentPage === 'schedule' && <SchedulePage activities={activities} students={students} groups={groups} onAddActivity={handleAddActivity} onUpdateActivity={handleUpdateActivity} onUpdateAttendance={handleUpdateAttendance} onUpdateFeePayment={handleUpdateFeePayment} onDeleteActivity={handleDeleteActivity} currentUser={currentUser} onAddTransaction={handleAddTransaction} onUpdateTransaction={handleUpdateTransaction} transactions={transactions} />}
        {currentPage === 'users' && <UsersPage users={systemUsers} onAddUser={handleAddUser} onUpdateUser={handleUpdateUser} onDeleteUser={handleDeleteUser} />}
      </main>
    </div>
  );
}

export default App;
