import React, { useState, useEffect, useRef } from 'react';
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
import { Menu, Loader2, User as UserIcon, Lock, Users as UsersIcon } from 'lucide-react';
import { checkMPPaymentStatus } from './services/mercadoPago';

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

  const checkingRefs = useRef<Set<string>>(new Set());

  const formatFriendlyDate = (dateString: string) => {
    if (!dateString) return '';
    const parts = dateString.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateString;
  };

  // Helper centralizado para verificar atraso de 1 dia útil após o vencimento real (respeitando FDS)
  const checkIsLate = (dateStr: string) => {
    if (!dateStr) return false;
    const due = new Date(dateStr + 'T12:00:00');
    let effectiveDue = new Date(due);

    // Vencimento original no fim de semana pula para segunda
    if (effectiveDue.getDay() === 6) effectiveDue.setDate(effectiveDue.getDate() + 2);
    else if (effectiveDue.getDay() === 0) effectiveDue.setDate(effectiveDue.getDate() + 1);

    // Regra: atraso só conta APÓS um dia útil extra do vencimento real
    let graceDate = new Date(effectiveDue);
    graceDate.setDate(graceDate.getDate() + 1);
    
    if (graceDate.getDay() === 6) graceDate.setDate(graceDate.getDate() + 2);
    else if (graceDate.getDay() === 0) graceDate.setDate(graceDate.getDate() + 1);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    graceDate.setHours(0, 0, 0, 0);

    return today > graceDate;
  };

  useEffect(() => {
    if (!isAuthenticated || transactions.length === 0) return;
    const reconcilePayments = async () => {
        const pendingWithRefs = transactions.filter(t => t.status === PaymentStatus.PENDING && t.externalReference && !checkingRefs.current.has(t.externalReference));
        if (pendingWithRefs.length === 0) return;
        for (const tx of pendingWithRefs) {
            const ref = tx.externalReference!;
            checkingRefs.current.add(ref);
            try {
                const status = await checkMPPaymentStatus(ref);
                if (status === 'approved') {
                    await handleUpdateTransaction({ id: tx.id, status: PaymentStatus.PAID, paymentMethod: PaymentMethod.PIX_MERCADO_PAGO, paymentDate: new Date().toISOString().split('T')[0] });
                }
            } catch (e) {} finally { setTimeout(() => checkingRefs.current.delete(ref), 10000); }
        }
    };
    const interval = setInterval(reconcilePayments, 30 * 60 * 1000); 
    return () => clearInterval(interval);
  }, [isAuthenticated, transactions]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
        const { data: groupsData } = await supabase.from('groups').select('*');
        const { data: plansData } = await supabase.from('plans').select('*');
        const { data: activitiesData } = await supabase.from('activities').select('*');
        let studentsData;
        let transactionsData;
        if (currentUser?.role === UserRole.RESPONSAVEL && currentUser.cpf) {
             const { data: allStudents } = await supabase.from('students').select('*');
             const cleanUserCpf = currentUser.cpf.replace(/\D/g, '');
             studentsData = allStudents?.filter((s: any) => s.guardian?.cpf?.replace(/\D/g, '') === cleanUserCpf);
             if (studentsData && studentsData.length > 0) {
                 const studentIds = studentsData.map((s: any) => s.id);
                 const { data: myTxs } = await supabase.from('transactions').select('*').in('student_id', studentIds);
                 transactionsData = myTxs;
             } else transactionsData = [];
        } else {
             const { data: allStudents } = await supabase.from('students').select('*');
             const { data: allTxs } = await supabase.from('transactions').select('*');
             studentsData = allStudents;
             transactionsData = allTxs;
        }
        if (currentUser?.role === UserRole.ADMIN) {
            const { data: usersData } = await supabase.from('app_users').select('*');
            if (usersData) setSystemUsers(usersData.map((u: any) => ({ id: u.id, name: u.name, email: u.email, role: u.role, avatar: u.avatar, cpf: u.cpf })));
        }
        if (studentsData) setStudents(studentsData.map((s: any) => ({ id: s.id, name: s.name, birthDate: s.birth_date, rg: s.rg, cpf: s.cpf, phone: s.phone, medical_expiry: s.medicalCertificateExpiry, photoUrl: s.photo_url, address: s.address, guardian: s.guardian, planId: s.plan_id || '', groupIds: Array.isArray(s.group_ids) ? s.group_ids : [], active: s.active, documents: s.documents })));
        if (groupsData) setGroups(groupsData);
        if (plansData) setPlans(plansData.map((p: any) => ({ id: p.id, name: p.name, price: p.price, dueDay: p.due_day, description: p.description })));
        if (transactionsData) setTransactions(transactionsData.map((t: any) => ({ id: t.id, description: t.description, category: 'Geral', amount: t.amount, type: t.type, date: t.date, paymentDate: t.payment_date || t.date, status: t.status, studentId: t.student_id, planId: t.plan_id, paymentMethod: t.payment_method, paymentLink: t.payment_link, externalReference: t.external_reference, preferenceId: t.preference_id })));
        if (activitiesData) setActivities(activitiesData.map((a: any) => ({ id: a.id, title: a.title, type: a.activity_type || 'TRAINING', fee: a.fee || 0, location: a.location || '', presentationTime: a.presentation_time || '', opponent: a.opponent || '', homeScore: a.home_score, awayScore: a.away_score, scorers: a.scorers || [], groupId: a.group_id, participants: a.participants || [], date: a.date, startTime: a.start_time, endTime: a.end_time, recurrence: a.recurrence, attendance: a.attendance || [], feePayments: a.fee_payments || [] })));
    } catch (error) {} finally { setIsLoading(false); }
  };

  useEffect(() => { if (isAuthenticated) fetchData(); }, [isAuthenticated]);

  const handleEmailLogin = async (e: React.FormEvent) => {
      e.preventDefault(); setIsLoggingIn(true); setLoginError('');
      try {
          const { data, error } = await supabase.from('app_users').select('*').eq('email', loginEmail).eq('password', loginPassword).single();
          if (error || !data) { setLoginError('Email ou senha inválidos.'); setIsLoggingIn(false); return; }
          setCurrentUser({ id: data.id, name: data.name, email: data.email, role: data.role as UserRole, avatar: data.avatar || `https://ui-avatars.com/api/?name=${data.name}`, cpf: data.cpf });
          setIsAuthenticated(true);
      } catch (err) { setLoginError('Erro de conexão.'); } finally { setIsLoggingIn(false); }
  };

  const handleCpfCheck = async (e: React.FormEvent) => {
      e.preventDefault(); setIsLoggingIn(true); setLoginError('');
      const cleanCpf = loginCpf.replace(/\D/g, ''); 
      try {
          const { data: existingUser } = await supabase.from('app_users').select('*').eq('cpf', loginCpf).maybeSingle();
          if (existingUser) {
               if (loginPassword && existingUser.password === loginPassword) { setCurrentUser({ id: existingUser.id, name: existingUser.name, email: existingUser.email, role: existingUser.role as UserRole, avatar: existingUser.avatar || `https://ui-avatars.com/api/?name=${existingUser.name}`, cpf: existingUser.cpf }); setIsAuthenticated(true); }
               else setLoginError('Senha incorreta.');
               setIsLoggingIn(false); return;
          }
          const { data: studentsData } = await supabase.from('students').select('guardian');
          if (studentsData) {
              const matched = studentsData.find((s: any) => s.guardian?.cpf?.replace(/\D/g, '') === cleanCpf);
              if (matched) { setIsFirstAccess(true); setTempGuardianName(matched.guardian.name); setTempGuardianEmail(matched.guardian.email || `${cleanCpf}@temp.com`); setLoginError(''); }
              else setLoginError('CPF não encontrado.');
          }
      } catch (err) {} finally { setIsLoggingIn(false); }
  };

  const handleCreatePassword = async (e: React.FormEvent) => {
      e.preventDefault();
      if (newPassword !== confirmNewPassword) { setLoginError('Senhas não coincidem.'); return; }
      setIsLoggingIn(true);
      try {
          const { data, error } = await supabase.from('app_users').insert([{ name: tempGuardianName, email: tempGuardianEmail, password: newPassword, role: UserRole.RESPONSAVEL, cpf: loginCpf, avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(tempGuardianName)}&background=random` }]).select().single();
          if (data && !error) { setCurrentUser({ id: data.id, name: data.name, email: data.email, role: data.role as UserRole, avatar: data.avatar, cpf: data.cpf }); setIsAuthenticated(true); }
      } catch (err) {} finally { setIsLoggingIn(false); }
  };

  const handleLogout = () => { setCurrentUser(null); setIsAuthenticated(false); setLoginEmail(''); setLoginPassword(''); setLoginCpf(''); setIsFirstAccess(false); setCurrentPage('dashboard'); };

  const handleGenerateGlobalTuitions = async () => {
      const activeStudents = students.filter(s => s.active && s.planId);
      const today = new Date();
      const currentMonth = today.getMonth();
      const monthPrefix = `${today.getFullYear()}-${(currentMonth + 1).toString().padStart(2, '0')}`;
      const newTxs = [];
      for (const student of activeStudents) {
          const plan = plans.find(p => p.id === student.planId);
          if (!plan) continue;
          if (!transactions.some(t => t.studentId === student.id && t.type === TransactionType.INCOME && t.date.startsWith(monthPrefix))) {
              newTxs.push({ description: `Mensalidade ${student.name.split(' ')[0]} - ${new Date(today.getFullYear(), currentMonth, 1).toLocaleString('pt-BR', { month: 'long' })}`, amount: plan.price, type: TransactionType.INCOME, date: `${today.getFullYear()}-${(currentMonth + 1).toString().padStart(2, '0')}-${plan.dueDay.toString().padStart(2, '0')}`, status: PaymentStatus.PENDING, student_id: student.id, plan_id: plan.id, payment_method: PaymentMethod.PIX_MERCADO_PAGO, external_reference: crypto.randomUUID() });
          }
      }
      if (newTxs.length > 0) {
          const { data, error } = await supabase.from('transactions').insert(newTxs).select();
          if (data && !error) fetchData();
      }
  };

  const handleAddStudent = async (studentData: Omit<Student, 'id'>) => {
    setIsLoading(true);
    let photoUrl = studentData.photoUrl;
    if (photoUrl && photoUrl.startsWith('data:')) {
        const fileName = `${studentData.name.replace(/\s+/g, '_')}_${Date.now()}.jpg`;
        const res = await fetch(photoUrl);
        const { error: upErr } = await supabase.storage.from('photos').upload(fileName, await res.blob());
        if (!upErr) photoUrl = supabase.storage.from('photos').getPublicUrl(fileName).data.publicUrl;
    }
    const payload = { name: studentData.name, birth_date: studentData.birthDate, rg: studentData.rg, cpf: studentData.cpf, phone: studentData.phone, medical_expiry: studentData.medicalCertificateExpiry, photo_url: photoUrl, address: studentData.address, guardian: studentData.guardian, plan_id: studentData.planId, group_ids: studentData.groupIds, active: studentData.active, documents: studentData.documents };
    const { data, error } = await supabase.from('students').insert([payload]).select().single();
    if (data && !error) { setStudents(prev => [...prev, { ...studentData, id: data.id, photoUrl }]); handleGenerateGlobalTuitions(); }
    setIsLoading(false);
  };

  const handleUpdateStudent = async (updated: Student) => {
      setIsLoading(true);
      const payload = { name: updated.name, birth_date: updated.birthDate, rg: updated.rg, cpf: updated.cpf, phone: updated.phone, medical_expiry: updated.medicalCertificateExpiry, photo_url: updated.photoUrl, address: updated.address, guardian: updated.guardian, plan_id: updated.planId, group_ids: updated.groupIds, active: updated.active, documents: updated.documents };
      const { error } = await supabase.from('students').update(payload).eq('id', updated.id);
      if (!error) setStudents(prev => prev.map(s => s.id === updated.id ? updated : s));
      setIsLoading(false);
  };

  const handleAddTransaction = async (t: any) => { 
    try {
      const txToAdd = [];
      const safeVal = (v: any) => (v === '' || v === undefined || v === 'null') ? null : v;
      const baseDesc = t.category && t.category !== 'Geral' ? `[${t.category}] ${t.description}` : t.description;

      if (t.type === TransactionType.EXPENSE && t.recurrence === 'MONTHLY') {
          const startDate = new Date(t.date + 'T00:00:00');
          for (let i = 0; i < (t.recurrenceMonths || 12); i++) {
              const d = new Date(startDate); d.setMonth(startDate.getMonth() + i);
              let finalDesc = `${baseDesc} (${i+1}/${t.recurrenceMonths})`;
              if (i === 0 && t.status === PaymentStatus.PAID && t.paymentDate) finalDesc += ` (Pago em ${formatFriendlyDate(t.paymentDate)})`;
              txToAdd.push({ description: finalDesc, amount: Number(t.amount), type: t.type, date: d.toISOString().split('T')[0], status: i === 0 ? t.status : PaymentStatus.PENDING, payment_method: i === 0 ? safeVal(t.paymentMethod) : null });
          }
      } else {
          let finalDesc = baseDesc;
          if (t.status === PaymentStatus.PAID && t.paymentDate) finalDesc += ` (Pago em ${formatFriendlyDate(t.paymentDate)})`;
          txToAdd.push({ description: finalDesc, amount: Number(t.amount), type: t.type, date: t.date, status: t.status, student_id: safeVal(t.studentId), plan_id: safeVal(t.planId), payment_method: safeVal(t.paymentMethod), payment_link: safeVal(t.paymentLink), external_reference: safeVal(t.externalReference), preference_id: safeVal(t.preferenceId) });
      }
      const { data, error } = await supabase.from('transactions').insert(txToAdd).select();
      if (error) alert(`Erro ao salvar: ${error.message}`); else fetchData();
    } catch (err) {}
  };
  
  const handleUpdateTransaction = async (t: Partial<Transaction>) => { 
      if (!t.id) return;
      const payload: any = {};
      const safeVal = (v: any) => (v === '' || v === undefined || v === 'null') ? null : v;
      if (t.status === PaymentStatus.PAID && t.paymentDate) {
          const original = transactions.find(x => x.id === t.id);
          if (original && !original.description.includes("(Pago em")) payload.description = `${original.description} (Pago em ${formatFriendlyDate(t.paymentDate)})`;
      } else if (t.description !== undefined) {
          // Mantém a categoria na descrição no update se ela foi alterada manualmente ou via prompt
          payload.description = t.category && t.category !== 'Geral' && !t.description.startsWith('[')
            ? `[${t.category}] ${t.description}`
            : t.description;
      }

      if (t.amount !== undefined) payload.amount = Number(t.amount);
      if (t.type !== undefined) payload.type = t.type;
      if (t.date !== undefined) payload.date = t.date;
      if (t.status !== undefined) payload.status = t.status;
      if (t.studentId !== undefined) payload.student_id = safeVal(t.studentId); 
      if (t.planId !== undefined) payload.plan_id = safeVal(t.planId);
      if (t.paymentMethod !== undefined) payload.payment_method = safeVal(t.paymentMethod);
      if (t.paymentLink !== undefined) payload.payment_link = safeVal(t.paymentLink);
      if (t.externalReference !== undefined) payload.external_reference = safeVal(t.externalReference);
      if (t.preferenceId !== undefined) payload.preference_id = safeVal(t.preferenceId);
      const { error } = await supabase.from('transactions').update(payload).eq('id', t.id);
      if (!error) fetchData();
  };

  const handleAddGroup = async (g: any): Promise<string | null> => { 
      const { data, error } = await supabase.from('groups').insert([{ name: g.name }]).select().single();
      if (data && !error) { fetchData(); return data.id; } return null;
  };
  const handleUpdateGroup = async (g: any) => { await supabase.from('groups').update({ name: g.name }).eq('id', g.id); fetchData(); };
  const handleDeleteGroup = async (id: string) => { await supabase.from('groups').delete().eq('id', id); fetchData(); };
  const handleAddPlan = async (p: any) => { await supabase.from('plans').insert([{ name: p.name, price: p.price, due_day: p.due_day, description: p.description }]); fetchData(); };
  const handleUpdatePlan = async (p: any) => { await supabase.from('plans').update({ name: p.name, price: p.price, due_day: p.due_day, description: p.description }).eq('id', p.id); fetchData(); };
  const handleDeletePlan = async (id: string) => { await supabase.from('plans').delete().eq('id', id); fetchData(); };
  const handleAddUser = async (u: any) => { await supabase.from('app_users').insert([u]); fetchData(); };
  const handleUpdateUser = async (u: any) => { const payload: any = { name: u.name, email: u.email, role: u.role, avatar: u.avatar }; if (u.password) payload.password = u.password; await supabase.from('app_users').update(payload).eq('id', u.id); fetchData(); };
  const handleDeleteUser = async (id: string) => { await supabase.from('app_users').delete().eq('id', id); fetchData(); };

  // Handlers for Activities
  const handleAddActivity = async (activityData: Omit<Activity, 'id'>) => {
    const payload = {
      title: activityData.title,
      activity_type: activityData.type,
      fee: activityData.fee,
      location: activityData.location,
      presentation_time: activityData.presentationTime,
      opponent: activityData.opponent,
      home_score: activityData.homeScore,
      away_score: activityData.awayScore,
      scorers: activityData.scorers,
      group_id: activityData.groupId,
      participants: activityData.participants,
      date: activityData.date,
      start_time: activityData.startTime,
      end_time: activityData.endTime,
      recurrence: activityData.recurrence,
      attendance: activityData.attendance,
      fee_payments: activityData.feePayments
    };
    const { error } = await supabase.from('activities').insert([payload]);
    if (!error) fetchData();
  };

  const handleUpdateActivity = async (updated: Activity) => {
    const payload = {
      title: updated.title,
      activity_type: updated.type,
      fee: updated.fee,
      location: updated.location,
      presentation_time: updated.presentationTime,
      opponent: updated.opponent,
      home_score: updated.homeScore,
      away_score: updated.awayScore,
      scorers: updated.scorers,
      group_id: updated.groupId,
      participants: updated.participants,
      date: updated.date,
      start_time: updated.startTime,
      end_time: updated.endTime,
      recurrence: updated.recurrence,
      attendance: updated.attendance,
      fee_payments: updated.feePayments
    };
    const { error } = await supabase.from('activities').update(payload).eq('id', updated.id);
    if (!error) fetchData();
  };

  const handleUpdateAttendance = async (activityId: string, studentId: string) => {
    const activity = activities.find(a => a.id === activityId);
    if (!activity) return;
    let newAttendance = [...activity.attendance];
    if (newAttendance.includes(studentId)) {
      newAttendance = newAttendance.filter(id => id !== studentId);
    } else {
      newAttendance.push(studentId);
    }
    const { error } = await supabase.from('activities').update({ attendance: newAttendance }).eq('id', activityId);
    if (!error) fetchData();
  };

  const handleUpdateFeePayment = async (activityId: string, studentId: string) => {
    const activity = activities.find(a => a.id === activityId);
    if (!activity) return;
    let newFeePayments = [...(activity.feePayments || [])];
    if (newFeePayments.includes(studentId)) {
      newFeePayments = newFeePayments.filter(id => id !== studentId);
    } else {
      newFeePayments.push(studentId);
    }
    const { error = null } = await supabase.from('activities').update({ fee_payments: newFeePayments }).eq('id', activityId);
    if (!error) fetchData();
  };

  const handleDeleteActivity = async (id: string) => {
    const { error } = await supabase.from('activities').delete().eq('id', id);
    if (!error) fetchData();
  };

  const handleNavigate = (page: string, data?: any) => { setCurrentPage(page); setPageData(data || null); };

  if (!isAuthenticated) {
      return (
          <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                  <div className="bg-primary-600 p-8 text-center relative">
                      <div className="inline-flex bg-white/20 p-4 rounded-full mb-4 backdrop-blur-sm"><img src="/logo.svg" alt="Logo" className="w-16 h-16" /></div>
                      <h1 className="text-2xl font-bold text-white mb-1">Garotos do Martinica</h1>
                      <p className="text-primary-100">Gestão de Escolinha</p>
                  </div>
                  <div className="flex border-b border-gray-100">
                      <button className={`flex-1 py-4 text-sm font-semibold ${activeLoginTab === 'EMAIL' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500'}`} onClick={() => setActiveLoginTab('EMAIL')}>Admin/Prof</button>
                      <button className={`flex-1 py-4 text-sm font-semibold ${activeLoginTab === 'CPF' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500'}`} onClick={() => setActiveLoginTab('CPF')}>Responsável</button>
                  </div>
                  <div className="p-8">
                      {isFirstAccess ? (
                           <form onSubmit={handleCreatePassword} className="space-y-4">
                               <p className="text-sm text-gray-500 text-center">Olá, <strong>{tempGuardianName}</strong>. Crie uma senha de acesso.</p>
                               <div><label className="block text-sm font-medium text-gray-700 mb-1">Senha</label><input type="password" required className="w-full border rounded-lg p-3" value={newPassword} onChange={e => setNewPassword(e.target.value)} /></div>
                               <div><label className="block text-sm font-medium text-gray-700 mb-1">Repetir Senha</label><input type="password" required className="w-full border rounded-lg p-3" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} /></div>
                               {loginError && <div className="text-red-600 text-xs bg-red-50 p-2 rounded text-center">{loginError}</div>}
                               <button type="submit" disabled={isLoggingIn} className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-lg">{isLoggingIn ? 'Processando...' : 'Ativar e Entrar'}</button>
                           </form>
                      ) : activeLoginTab === 'EMAIL' ? (
                        <form onSubmit={handleEmailLogin} className="space-y-4">
                            <div><label className="block text-sm font-medium text-gray-700 mb-1">Email</label><input type="email" required className="w-full p-3 border rounded-lg" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} /></div>
                            <div><label className="block text-sm font-medium text-gray-700 mb-1">Senha</label><input type="password" required className="w-full p-3 border rounded-lg" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} /></div>
                            {loginError && <div className="text-red-600 text-xs bg-red-50 p-2 rounded text-center">{loginError}</div>}
                            <button type="submit" disabled={isLoggingIn} className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-lg">Entrar</button>
                        </form>
                      ) : (
                        <form onSubmit={handleCpfCheck} className="space-y-4">
                            <div><label className="block text-sm font-medium text-gray-700 mb-1">CPF Responsável</label><input type="text" required className="w-full p-3 border rounded-lg" placeholder="000.000.000-00" value={loginCpf} onChange={(e) => setLoginCpf(e.target.value)} /></div>
                            <div><label className="block text-sm font-medium text-gray-700 mb-1">Senha (deixe vazio no 1º acesso)</label><input type="password" classname="w-full p-3 border rounded-lg" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} /></div>
                            {loginError && <div className="text-red-600 text-xs bg-red-50 p-2 rounded text-center">{loginError}</div>}
                            <button type="submit" disabled={isLoggingIn} className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-lg">Acessar</button>
                        </form>
                      )}
                  </div>
              </div>
          </div>
      );
  }

  const renderContent = () => {
    switch (currentPage) {
      case 'dashboard': return <DashboardPage students={students} transactions={transactions} activities={activities} role={currentUser!.role} onNavigate={handleNavigate} />;
      case 'students': return <StudentsPage students={students} groups={groups} plans={plans} transactions={transactions} activities={activities} onAddStudent={handleAddStudent} onBatchAddStudents={() => {}} onUpdateStudent={handleUpdateStudent} onUpdateTransaction={handleUpdateTransaction} onAddTransaction={handleAddTransaction} onGenerateTuitions={handleGenerateGlobalTuitions} initialFilter={pageData?.filter} currentUser={currentUser} />;
      case 'groups': return <GroupsPage groups={groups} students={students} onAddGroup={handleAddGroup} onUpdateGroup={handleUpdateGroup} onDeleteGroup={handleDeleteGroup} onBatchAssignStudents={async (ids, gid) => { for(const id of ids) await supabase.from('students').update({group_ids: [gid]}).eq('id', id); fetchData(); }} />;
      case 'plans': return <PlansPage plans={plans} onAddPlan={handleAddPlan} onUpdatePlan={handleUpdatePlan} onDeletePlan={handleDeletePlan} />;
      case 'schedule': return <SchedulePage activities={activities} students={students} groups={groups} onAddActivity={handleAddActivity} onUpdateActivity={handleUpdateActivity} onUpdateAttendance={handleUpdateAttendance} onUpdateFeePayment={handleUpdateFeePayment} onDeleteActivity={handleDeleteActivity} currentUser={currentUser} />;
      case 'finance': return <FinancePage students={students} transactions={transactions} plans={plans} onAddTransaction={handleAddTransaction} onUpdateTransaction={handleUpdateTransaction} />;
      case 'users': return <UsersPage users={systemUsers} onAddUser={handleAddUser} onUpdateUser={handleUpdateUser} onDeleteUser={handleDeleteUser} />;
      default: return <DashboardPage students={students} transactions={transactions} activities={activities} role={currentUser!.role} onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="flex bg-gray-50 min-h-screen font-sans overflow-x-hidden">
      <Sidebar currentUser={currentUser!} currentPage={currentPage} onNavigate={handleNavigate} onLogout={handleLogout} isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
      <main className="flex-1 md:ml-64 p-4 md:p-8 min-w-0 max-w-full overflow-x-hidden">
        <header className="mb-8 flex justify-between items-center"><div className="flex items-center gap-3 md:hidden"><button onClick={() => setIsMobileMenuOpen(true)} className="p-2 bg-white rounded-lg shadow-sm border text-gray-700"><Menu className="w-6 h-6" /></button></div><h1 className="text-xl md:text-2xl font-bold text-gray-900 hidden md:block">Garotos do Martinica</h1><div className="bg-orange-100 text-orange-800 text-xs px-3 py-1 rounded-full border flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>Sistema Online</div></header>
        {renderContent()}
      </main>
    </div>
  );
}

export default App;
