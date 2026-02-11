
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
import { Menu, Loader2 } from 'lucide-react';
import { sendZApiMessage } from './services/zapiService';

const TX_SELECT_FIELDS = 'id, description, category, amount, type, date, payment_date, status, student_id, plan_id, payment_method, payment_link, external_reference, preference_id, recurrence';

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeLoginTab, setActiveLoginTab] = useState<'EMAIL' | 'CPF'>('EMAIL');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginCpf, setLoginCpf] = useState('');
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

  const safeDate = (d?: string) => (d === '' || !d) ? null : d;
  const safeId = (id?: string) => (id === '' || !id) ? null : id;

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
        const [{ data: groupsData }, { data: plansData }, { data: occurrencesData }] = await Promise.all([
          supabase.from('groups').select('*'),
          supabase.from('plans').select('*'),
          supabase.from('student_occurrences').select('*')
        ]);
        
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

        const { data: usersData } = await supabase.from('app_users').select('*');
        if (usersData) setSystemUsers(usersData as User[]);

        if (studentsData) {
             setStudents(studentsData.map((s: any) => ({
                 id: s.id, name: s.name, birthDate: s.birth_date, rg: s.rg, cpf: s.cpf, phone: s.phone,
                 medicalCertificateExpiry: s.medical_expiry, photo_url: s.photo_url, address: s.address || {}, 
                 guardian: s.guardian || {}, planId: s.plan_id || '', groupIds: s.group_ids || [], 
                 positions: s.positions || [], active: s.active, documents: s.documents || {}
             } as Student)));
        }

        if (groupsData) setGroups(groupsData);
        if (plansData) setPlans(plansData.map((p: any) => ({ id: p.id, name: p.name, price: Number(p.price), dueDay: p.due_day, description: p.description })));
        if (occurrencesData) setOccurrences(occurrencesData.map((o: any) => ({ id: o.id, studentId: o.student_id, description: o.description, date: o.date, createdAt: o.created_at })));
        
        if (transactionsData) {
            setTransactions(transactionsData.map((t: any) => ({ 
                id: t.id, 
                description: t.description, 
                category: t.category,
                amount: Number(t.amount), 
                type: t.type, 
                date: t.date, 
                paymentDate: t.payment_date,
                status: t.status, 
                studentId: t.student_id, 
                planId: t.plan_id, 
                paymentMethod: t.payment_method, 
                payment_link: t.payment_link, 
                externalReference: t.external_reference, 
                preferenceId: t.preference_id,
                recurrence: t.recurrence || 'NONE'
            } as Transaction)));
        }

        const { data: activitiesData } = await supabase.from('activities').select('*');
        if (activitiesData) {
            setActivities(activitiesData.map((a: any) => ({
                id: a.id,
                title: a.title,
                type: a.activity_type || 'TRAINING',
                fee: a.fee || 0,
                location: a.location || '',
                presentationTime: a.presentation_time,
                opponent: a.opponent,
                homeScore: a.home_score,
                awayScore: a.away_score,
                scorers: a.scorers || [],
                groupId: a.group_id,
                participants: a.participants || [],
                date: a.date,
                startTime: a.start_time,
                endTime: a.end_time,
                recurrence: a.recurrence || 'none',
                attendance: a.attendance || [],
                feePayments: a.fee_payments || []
            } as Activity)));
        }
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
      e.preventDefault(); 
      setIsLoggingIn(true); 
      setLoginError('');
      
      const cleanInputCpf = loginCpf.replace(/\D/g, ''); 
      if (!cleanInputCpf) {
          setLoginError('Informe o CPF.');
          setIsLoggingIn(false);
          return;
      }

      try {
          // 1. Verificar se usuário já existe em app_users
          const { data: existingUser } = await supabase
              .from('app_users')
              .select('*')
              .eq('cpf', cleanInputCpf)
              .maybeSingle();

          if (existingUser) {
               if (loginPassword) {
                   if (existingUser.password === loginPassword) { 
                       setCurrentUser(existingUser as User); 
                       setIsAuthenticated(true); 
                       setIsLoggingIn(false); 
                       return; 
                   } else { 
                       setLoginError('Senha incorreta.'); 
                       setIsLoggingIn(false); 
                       return; 
                   }
               } else { 
                   setLoginError('Usuário já cadastrado. Por favor, digite sua senha.'); 
                   setIsLoggingIn(false); 
                   return; 
               }
          }

          // 2. Se não existe, verificar se o CPF está vinculado a algum aluno
          const { data: studentsData } = await supabase.from('students').select('guardian');
          const matchedStudent = studentsData?.find((s: any) => 
              s.guardian?.cpf?.replace(/\D/g, '') === cleanInputCpf
          );

          if (matchedStudent) {
              if (!loginPassword) {
                  setLoginError('CPF validado! Por favor, digite uma senha para criar seu primeiro acesso.');
                  setIsLoggingIn(false);
                  return;
              }

              // 3. Primeiro acesso: Criar o usuário automaticamente
              const newUserPayload = {
                  name: matchedStudent.guardian.name,
                  email: matchedStudent.guardian.email || `${cleanInputCpf}@martinica.com`,
                  password: loginPassword,
                  role: UserRole.RESPONSAVEL,
                  cpf: cleanInputCpf,
                  avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(matchedStudent.guardian.name)}&background=random`
              };

              const { data: createdUser, error: createError } = await supabase
                  .from('app_users')
                  .insert([newUserPayload])
                  .select()
                  .single();

              if (createError) {
                  setLoginError('Erro ao criar seu acesso. Tente novamente.');
              } else {
                  setCurrentUser(createdUser as User);
                  setIsAuthenticated(true);
                  alert('Acesso criado com sucesso! Bem-vindo(a) ao Portal do Responsável.');
              }
          } else {
              setLoginError('CPF não encontrado em nossa base de atletas.');
          }
      } catch (err) { 
          setLoginError('Erro ao validar CPF.'); 
      } finally { 
          setIsLoggingIn(false); 
      }
  };

  const handleLogout = () => { setCurrentUser(null); setIsAuthenticated(false); setCurrentPage('dashboard'); };

  const handleAddStudent = async (studentData: Omit<Student, 'id'>) => {
    setIsLoading(true);
    try {
        const payload = {
          name: studentData.name,
          birth_date: safeDate(studentData.birthDate),
          rg: studentData.rg || null,
          cpf: studentData.cpf || null,
          phone: studentData.phone || null,
          medical_expiry: safeDate(studentData.medicalCertificateExpiry),
          photo_url: studentData.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(studentData.name)}&background=random`,
          address: studentData.address || {},
          guardian: studentData.guardian || {},
          plan_id: safeId(studentData.planId),
          group_ids: studentData.groupIds || [],
          positions: studentData.positions || [],
          active: studentData.active ?? true,
          documents: studentData.documents || {}
        };
        const { error } = await supabase.from('students').insert([payload]);
        if (error) throw error;
        await fetchData(true);
        alert("Atleta cadastrado!");
    } catch (err: any) { alert(`Erro: ${err.message}`); } finally { setIsLoading(false); }
  };

  const handleUpdateStudent = async (student: Student) => {
    setIsLoading(true);
    try {
        const payload = {
          name: student.name,
          birth_date: safeDate(student.birthDate),
          rg: student.rg || null,
          cpf: student.cpf || null,
          phone: student.phone || null,
          medical_expiry: safeDate(student.medicalCertificateExpiry),
          photo_url: student.photoUrl,
          address: student.address,
          guardian: student.guardian,
          plan_id: safeId(student.planId),
          group_ids: student.groupIds || [],
          positions: student.positions || [],
          active: student.active,
          documents: student.documents
        };
        const { error } = await supabase.from('students').update(payload).eq('id', student.id);
        if (error) throw error;
        await fetchData(true);
        alert("Atleta atualizado!");
    } catch (err: any) { alert(`Erro: ${err.message}`); } finally { setIsLoading(false); }
  };

  const handleAddPlan = async (p: Omit<Plan, 'id'>) => {
      await supabase.from('plans').insert([{ name: p.name, price: p.price, due_day: p.dueDay, description: p.description }]);
      await fetchData(true);
  };
  const handleUpdatePlan = async (p: Plan) => {
      await supabase.from('plans').update({ name: p.name, price: p.price, due_day: p.dueDay, description: p.description }).eq('id', p.id);
      await fetchData(true);
  };
  const handleDeletePlan = async (id: string) => {
      await supabase.from('plans').delete().eq('id', id);
      await fetchData(true);
  };

  const handleAddGroup = async (g: Group) => {
      const { data, error } = await supabase.from('groups').insert([{ name: g.name }]).select();
      await fetchData(true);
      return data?.[0]?.id || null;
  };
  const handleUpdateGroup = async (g: Group) => {
      await supabase.from('groups').update({ name: g.name }).eq('id', g.id);
      await fetchData(true);
  };
  const handleDeleteGroup = async (id: string) => {
      await supabase.from('groups').delete().eq('id', id);
      await fetchData(true);
  };

  const handleBatchAssignStudents = async (studentIds: string[], groupId: string) => {
      for (const sId of studentIds) {
          const student = students.find(s => s.id === sId);
          if (!student) continue;
          const nextGroups = (student.groupIds || []).includes(groupId) ? student.groupIds : [...(student.groupIds || []), groupId];
          await supabase.from('students').update({ group_ids: nextGroups }).eq('id', sId);
      }
      const others = students.filter(s => !studentIds.includes(s.id) && (s.groupIds || []).includes(groupId));
      for (const s of others) {
          const nextGroups = (s.groupIds || []).filter(id => id !== groupId);
          await supabase.from('students').update({ group_ids: nextGroups }).eq('id', s.id);
      }
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

  const handleUpdateTransaction = async (t: Partial<Transaction>) => { 
      if (!t.id) return;
      const payload: any = {};
      if (t.description !== undefined) payload.description = t.description;
      if (t.category !== undefined) payload.category = t.category;
      if (t.amount !== undefined) payload.amount = t.amount;
      if (t.type !== undefined) payload.type = t.type;
      if (t.date !== undefined) payload.date = t.date;
      if (t.paymentDate !== undefined) payload.payment_date = t.paymentDate;
      if (t.status !== undefined) payload.status = t.status;
      if (t.studentId !== undefined) payload.student_id = safeId(t.studentId);
      if (t.planId !== undefined) payload.plan_id = safeId(t.planId);
      if (t.paymentMethod !== undefined) payload.payment_method = t.paymentMethod;
      if (t.paymentLink !== undefined) payload.payment_link = t.paymentLink;
      if (t.externalReference !== undefined) payload.external_reference = t.externalReference;
      if (t.preferenceId !== undefined) payload.preference_id = t.preferenceId;
      if (t.recurrence !== undefined) payload.recurrence = t.recurrence;

      const { error } = await supabase.from('transactions').update(payload).eq('id', t.id);
      if(!error) {
        if (t.status === PaymentStatus.PAID) {
            const student = students.find(s => s.id === (transactions.find(tx => tx.id === t.id)?.studentId));
            if (student && student.guardian.phone) {
                const msg = `✅ *PAGAMENTO RECEBIDO* ⚽\nOlá *${student.guardian.name}*! Confirmamos o pagamento do atleta *${student.name}*.\nObrigado! Garotos do Martinica.`;
                sendZApiMessage(student.guardian.phone, msg);
            }
        }
        await fetchData(true);
      }
  };

  const handleAddTransaction = async (t: Omit<Transaction, 'id'>) => {
    const payload = { description: t.description, category: t.category || 'Outros', amount: t.amount, type: t.type, date: t.date, payment_date: t.paymentDate, status: t.status, student_id: safeId(t.studentId), plan_id: safeId(t.planId), payment_method: t.paymentMethod, recurrence: t.recurrence || 'NONE' };
    await supabase.from('transactions').insert([payload]);
    await fetchData(true);
  };

  const handleGenerateGlobalTuitions = async () => {
    setIsLoading(true);
    try {
      const activeStudents = students.filter(s => s.active);
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      const monthStr = currentMonth.toString().padStart(2, '0');
      const yearStr = currentYear.toString();
      
      for (const student of activeStudents) {
        if (!student.planId) continue;
        const plan = plans.find(p => p.id === student.planId);
        if (!plan) continue;

        const existing = transactions.find(t => 
          t.studentId === student.id && 
          t.category === 'Mensalidade' &&
          t.date.startsWith(`${yearStr}-${monthStr}`)
        );

        if (!existing) {
          const dueDay = plan.dueDay || 10;
          const dueDate = `${yearStr}-${monthStr}-${dueDay.toString().padStart(2, '0')}`;
          
          const payload = { 
            description: `Mensalidade ${monthStr}/${yearStr}`, 
            category: 'Mensalidade', 
            amount: plan.price, 
            type: TransactionType.INCOME, 
            date: dueDate, 
            status: PaymentStatus.PENDING, 
            student_id: safeId(student.id), 
            plan_id: safeId(student.planId), 
            payment_method: PaymentMethod.CASH, 
            recurrence: 'NONE' 
          };
          await supabase.from('transactions').insert([payload]);
        }
      }
      await fetchData(true);
    } catch (err) {
      console.error("Error generating tuitions", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddActivity = async (a: Omit<Activity, 'id'>) => {
      const payload = { title: a.title, activity_type: a.type, fee: a.fee || 0, location: a.location || '', presentation_time: a.presentationTime, opponent: a.opponent, home_score: a.homeScore, away_score: a.awayScore, scorers: a.scorers || [], group_id: safeId(a.groupId), participants: a.participants || [], date: a.date, start_time: a.startTime, end_time: a.endTime, recurrence: a.recurrence || 'none', attendance: a.attendance || [], fee_payments: a.feePayments || [] };
      await supabase.from('activities').insert([payload]);
      await fetchData(true);
  };

  const handleUpdateActivity = async (a: Activity) => {
      const payload = { title: a.title, activity_type: a.type, fee: a.fee, location: a.location, presentation_time: a.presentationTime, opponent: a.opponent, home_score: a.homeScore, away_score: a.awayScore, scorers: a.scorers, group_id: safeId(a.groupId), participants: a.participants, date: a.date, start_time: a.startTime, end_time: a.endTime, recurrence: a.recurrence, attendance: a.attendance, fee_payments: a.feePayments };
      await supabase.from('activities').update(payload).eq('id', a.id);
      await fetchData(true);
  };

  const handleDeleteActivity = async (id: string) => {
      await supabase.from('activities').delete().eq('id', id);
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
    const student = students.find(s => s.id === studentId);
    if (!activity || !student) return;
    
    const extRef = `fee_${activityId}_${studentId}`;
    const feePayments = activity.feePayments || [];
    const isCurrentlyPaid = feePayments.includes(studentId);
    const becomingPaid = !isCurrentlyPaid;

    const nextFeePayments = becomingPaid 
        ? [...feePayments, studentId] 
        : feePayments.filter(id => id !== studentId);
    
    const { error: actError } = await supabase.from('activities').update({ fee_payments: nextFeePayments }).eq('id', activityId);
    if (actError) return;

    if (becomingPaid) {
        const txPayload = {
            description: `Taxa: ${activity.title} - ${student.name}`,
            category: 'Taxa de Atividade',
            amount: Number(activity.fee) || 0,
            type: TransactionType.INCOME,
            date: activity.date,
            payment_date: new Date().toISOString().split('T')[0],
            status: PaymentStatus.PAID,
            student_id: studentId,
            payment_method: PaymentMethod.CASH,
            external_reference: extRef
        };
        await supabase.from('transactions').upsert(txPayload, { onConflict: 'external_reference' });

        if (student.guardian.phone) {
            const msg = `✅ *PAGAMENTO DE TAXA RECEBIDO* ⚽\n\nOlá *${student.guardian.name}*!\n\nConfirmamos o recebimento da taxa de *R$ ${Number(activity.fee).toFixed(2)}* referente à atividade: *${activity.title}* do atleta *${student.name}*.\n\nObrigado! Garotos do Martinica.`;
            sendZApiMessage(student.guardian.phone, msg);
        }
    } else {
        await supabase.from('transactions').delete().eq('external_reference', extRef);
    }

    await fetchData(true);
  };

  const handleAddOccurrence = async (studentId: string, description: string, date: string) => {
      const { error } = await supabase.from('student_occurrences').insert([{ student_id: studentId, description, date }]);
      if (error) return false;
      const student = students.find(s => s.id === studentId);
      if (student?.guardian.phone) {
          const msg = `⚽ *COMUNICADO DE OCORRÊNCIA* ⚽\n\nOlá *${student.guardian.name}*!\n\nRegistramos a seguinte ocorrência para o atleta *${student.name}* em ${date.split('-').reverse().join('/')}:\n\n"${description}"\n\nQualquer dúvida, procure a coordenação. Garotos do Martinica.`;
          sendZApiMessage(student.guardian.phone, msg);
      }
      await fetchData(true);
      return true;
  };

  const handleNavigate = (page: string, data?: any) => { setCurrentPage(page); setPageData(data || null); };

  if (!isAuthenticated) {
    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-md overflow-hidden">
                <div className="bg-primary-600 p-8 text-center">
                    <h1 className="text-2xl font-bold text-white mb-1">Garotos do Martinica</h1>
                    <p className="text-primary-100">Gestão de Escolinha</p>
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
                            <input type="password" placeholder="Senha (ou escolha uma no 1º acesso)" className="w-full border rounded-lg p-3 outline-none" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
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
        {currentPage === 'schedule' && <SchedulePage activities={activities} students={students} groups={groups} onAddActivity={handleAddActivity} onUpdateActivity={handleUpdateActivity} onUpdateAttendance={handleUpdateAttendance} onUpdateFeePayment={handleUpdateFeePayment} onDeleteActivity={handleDeleteActivity} currentUser={currentUser} onAddTransaction={handleAddTransaction} onUpdateTransaction={handleUpdateTransaction} transactions={transactions} />}
        {currentPage === 'groups' && <GroupsPage groups={groups} students={students} transactions={transactions} onAddGroup={handleAddGroup} onUpdateGroup={handleUpdateGroup} onDeleteGroup={handleDeleteGroup} onBatchAssignStudents={handleBatchAssignStudents} />}
        {currentPage === 'plans' && <PlansPage plans={plans} onAddPlan={handleAddPlan} onUpdatePlan={handleUpdatePlan} onDeletePlan={handleDeletePlan} />}
        {currentPage === 'users' && <UsersPage users={systemUsers} onAddUser={handleAddUser} onUpdateUser={handleUpdateUser} onDeleteUser={handleDeleteUser} />}
        {currentPage === 'aicoach' && <AICoachPage income={transactions.filter(t => t.type === TransactionType.INCOME && t.status === PaymentStatus.PAID).reduce((acc, curr) => acc + curr.amount, 0)} expense={transactions.filter(t => t.type === TransactionType.EXPENSE && t.status === PaymentStatus.PAID).reduce((acc, curr) => acc + curr.amount, 0)} />}
      </main>
    </div>
  );
}

export default App;
