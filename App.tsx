
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { DashboardPage } from './pages/DashboardPage';
import { StudentsPage } from './pages/StudentsPage';
import { GroupsPage } from './pages/GroupsPage';
import { PlansPage } from './pages/PlansPage';
import { SchedulePage } from './pages/SchedulePage';
import { FinancePage } from './pages/FinancePage';
import { AICoachPage } from './pages/AICoachPage';
import { Student, Group, Plan, Transaction, Activity, User, UserRole, PaymentStatus, TransactionType, PaymentMethod, Occurrence } from './types';
import { supabase } from './lib/supabaseClient';
import { Menu, Loader2 } from 'lucide-react';

const TX_SELECT_FIELDS = 'id, description, amount, type, date, status, student_id, plan_id, payment_method, payment_link, external_reference, preference_id';

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeLoginTab, setActiveLoginTab] = useState<'EMAIL' | 'CPF'>('EMAIL');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginCpf, setLoginCpf] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // FIX: Added missing state variables for current page and page data
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [pageData, setPageData] = useState<any>(null);

  const [students, setStudents] = useState<Student[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);

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
             studentsData = allStudents?.filter((s: any) => s.guardian?.cpf?.replace(/\D/g, '') === cleanUserCpf);

             if (studentsData && studentsData.length > 0) {
                 const studentIds = studentsData.map((s: any) => s.id);
                 const { data: myTxs } = await supabase.from('transactions').select(TX_SELECT_FIELDS).in('student_id', studentIds);
                 transactionsData = myTxs;
             }
        } else {
             const { data: allStudents } = await supabase.from('students').select('*');
             const { data: allTxs } = await supabase.from('transactions').select(TX_SELECT_FIELDS);
             studentsData = allStudents;
             transactionsData = allTxs;
        }

        if (studentsData) {
             setStudents(studentsData.map((s: any) => ({
                 id: s.id, name: s.name, birthDate: s.birth_date, rg: s.rg, cpf: s.cpf, phone: s.phone,
                 medicalCertificateExpiry: s.medical_expiry, photoUrl: s.photo_url, address: s.address, 
                 guardian: s.guardian, planId: s.plan_id || '', groupIds: s.group_ids || [], active: s.active, documents: s.documents 
             } as Student)));
        }

        if (groupsData) setGroups(groupsData);
        if (plansData) setPlans(plansData.map((p: any) => ({ id: p.id, name: p.name, price: p.price, dueDay: p.due_day, description: p.description })));
        if (occurrencesData) setOccurrences(occurrencesData.map((o: any) => ({ id: o.id, studentId: o.student_id, description: o.description, date: o.date, createdAt: o.created_at })));
        if (transactionsData) setTransactions(transactionsData.map((t: any) => ({ id: t.id, description: t.description, amount: t.amount, type: t.type, date: t.date, status: t.status, studentId: t.student_id, planId: t.plan_id, payment_method: t.payment_method, payment_link: t.payment_link, external_reference: t.external_reference, preference_id: t.preference_id })));
        if (activitiesData) setActivities(activitiesData.map((a: any) => ({ id: a.id, title: a.title, type: a.activity_type || 'TRAINING', fee: a.fee || 0, location: a.location || '', presentation_time: a.presentation_time || '', opponent: a.opponent || '', home_score: a.home_score, away_score: a.away_score, scorers: a.scorers || [], groupId: a.group_id, participants: a.participants || [], date: a.date, start_time: a.start_time, end_time: a.end_time, recurrence: a.recurrence, attendance: a.attendance || [], fee_payments: a.fee_payments || [] })));
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

  const handleAddStudent = async (studentData: Omit<Student, 'id'>) => {
    setIsLoading(true);
    const payload = { 
        name: studentData.name, 
        birth_date: safeDate(studentData.birthDate), 
        rg: studentData.rg, 
        cpf: studentData.cpf, 
        phone: studentData.phone, 
        medical_expiry: safeDate(studentData.medicalCertificateExpiry), 
        photo_url: studentData.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(studentData.name)}&background=random`,
        address: studentData.address, 
        guardian: studentData.guardian, 
        plan_id: safeId(studentData.planId),
        group_ids: studentData.groupIds || [], 
        active: studentData.active, 
        documents: studentData.documents
    };

    const { error } = await supabase.from('students').insert([payload]);
    
    if (error) {
        console.error("Erro Supabase Insert:", error);
        alert(`Erro ao salvar atleta: ${error.message}`);
    } else {
        await fetchData(true);
        alert("Atleta cadastrado com sucesso!");
    }
    setIsLoading(false);
  };

  const handleUpdateStudent = async (student: Student) => {
    setIsLoading(true);
    const payload = { 
      name: student.name, 
      birth_date: safeDate(student.birthDate), 
      rg: student.rg, 
      cpf: student.cpf, 
      phone: student.phone,
      medical_expiry: safeDate(student.medicalCertificateExpiry), 
      photo_url: student.photoUrl, 
      address: student.address,
      guardian: student.guardian, 
      plan_id: safeId(student.planId),
      group_ids: student.groupIds, 
      active: student.active, 
      documents: student.documents
    };

    const { error } = await supabase.from('students').update(payload).eq('id', student.id);
    
    if (error) {
        console.error("Erro Supabase Update:", error);
        alert(`Erro ao atualizar: ${error.message}`);
    } else {
        await fetchData(true);
        alert("Dados atualizados!");
    }
    setIsLoading(false);
  };

  const handleUpdateTransaction = async (t: Partial<Transaction>) => { 
      if (!t.id) return;
      const payload: any = {};
      if (t.status !== undefined) payload.status = t.status;
      if (t.amount !== undefined) payload.amount = t.amount;
      if (t.description !== undefined) payload.description = t.description;
      if (t.paymentMethod !== undefined) payload.payment_method = t.paymentMethod;
      if (t.externalReference !== undefined) payload.external_reference = t.externalReference;
      const { error } = await supabase.from('transactions').update(payload).eq('id', t.id);
      if (!error) await fetchData(true);
  };

  const handleAddTransaction = async (t: Omit<Transaction, 'id'>) => {
      const payload = { description: t.description, amount: t.amount, type: t.type, date: t.date, status: t.status, student_id: t.studentId, payment_method: t.paymentMethod, external_reference: t.externalReference };
      await supabase.from('transactions').insert([payload]);
      await fetchData(true);
  };

  const handleUpdateActivity = async (a: Activity) => {
    setIsLoading(true);
    const payload = { title: a.title, activity_type: a.type, fee: a.fee, location: a.location, presentation_time: a.presentationTime, opponent: a.opponent, home_score: a.homeScore, away_score: a.away_score, scorers: a.scorers, group_id: a.groupId, participants: a.participants, date: a.date, start_time: a.startTime, end_time: a.endTime, recurrence: a.recurrence, attendance: a.attendance, fee_payments: a.feePayments };
    const { error } = await supabase.from('activities').update(payload).eq('id', a.id);
    if (!error) await fetchData(true);
    setIsLoading(false);
  };

  const handleAddPlan = async (plan: Omit<Plan, 'id'>) => {
    setIsLoading(true);
    const { error } = await supabase.from('plans').insert([{
      name: plan.name,
      price: plan.price,
      due_day: plan.dueDay,
      description: plan.description
    }]);
    if (error) alert(`Erro ao salvar plano: ${error.message}`);
    else await fetchData(true);
    setIsLoading(false);
  };

  const handleUpdatePlan = async (plan: Plan) => {
    setIsLoading(true);
    const { error } = await supabase.from('plans').update({
      name: plan.name,
      price: plan.price,
      due_day: plan.dueDay,
      description: plan.description
    }).eq('id', plan.id);
    if (error) alert(`Erro ao atualizar plano: ${error.message}`);
    else await fetchData(true);
    setIsLoading(false);
  };

  const handleBatchAssignStudents = async (studentIds: string[], groupId: string) => {
    setIsLoading(true);
    const { data: allStudents } = await supabase.from('students').select('id, group_ids');
    if (!allStudents) { setIsLoading(false); return; }
    const promises = [];
    for (const student of allStudents) {
      const gIds = student.group_ids || [];
      const isTarget = studentIds.includes(student.id);
      const hasGroup = gIds.includes(groupId);
      if (isTarget && !hasGroup) {
        promises.push(supabase.from('students').update({ group_ids: [...gIds, groupId] }).eq('id', student.id));
      } else if (!isTarget && hasGroup) {
        promises.push(supabase.from('students').update({ group_ids: gIds.filter((id: string) => id !== groupId) }).eq('id', student.id));
      }
    }
    await Promise.all(promises);
    await fetchData(true);
    setIsLoading(false);
  };

  const handleAddActivity = async (a: Omit<Activity, 'id'>) => {
    setIsLoading(true);
    // FIX: Corrected typo 'fee_payments' to 'feePayments' from the parameter 'a'
    const payload = {
      title: a.title, activity_type: a.type, fee: a.fee, location: a.location, presentation_time: a.presentationTime, opponent: a.opponent, home_score: a.homeScore, away_score: a.awayScore, scorers: a.scorers, group_id: a.groupId, participants: a.participants, date: a.date, start_time: a.startTime, end_time: a.endTime, recurrence: a.recurrence, attendance: a.attendance || [], fee_payments: a.feePayments || []
    };
    const { error } = await supabase.from('activities').insert([payload]);
    if (error) alert(`Erro ao agendar: ${error.message}`); else await fetchData(true);
    setIsLoading(false);
  };

  const handleUpdateAttendance = async (activityId: string, studentId: string) => {
    const activity = activities.find(a => a.id === activityId);
    if (!activity) return;
    let newAttendance = [...(activity.attendance || [])];
    if (newAttendance.includes(studentId)) { newAttendance = newAttendance.filter(id => id !== studentId); } 
    else { newAttendance.push(studentId); }
    const { error } = await supabase.from('activities').update({ attendance: newAttendance }).eq('id', activityId);
    if (!error) await fetchData(true);
  };

  const handleUpdateFeePayment = async (activityId: string, studentId: string) => {
    const activity = activities.find(a => a.id === activityId);
    if (!activity) return;
    let newFeePayments = [...(activity.feePayments || [])];
    if (newFeePayments.includes(studentId)) { newFeePayments = newFeePayments.filter(id => id !== studentId); } 
    else { newFeePayments.push(studentId); }
    const { error } = await supabase.from('activities').update({ fee_payments: newFeePayments }).eq('id', activityId);
    if (!error) await fetchData(true);
  };

  const handleDeleteActivity = async (id: string) => {
    const { error } = await supabase.from('activities').delete().eq('id', id);
    if (error) alert(`Erro ao excluir: ${error.message}`); else await fetchData(true);
  };

  const handleAddOccurrence = async (studentId: string, description: string, date: string): Promise<boolean> => {
    setIsLoading(true);
    const { error } = await supabase.from('student_occurrences').insert([{ student_id: studentId, description, date }]);
    if (error) {
      alert(`Erro ao adicionar ocorrência: ${error.message}`);
      setIsLoading(false);
      return false;
    }
    await fetchData(true);
    setIsLoading(false);
    return true;
  };

  const handleNavigate = (page: string, data?: any) => { setCurrentPage(page); setPageData(data || null); };

  if (!isAuthenticated) {
    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-300">
                <div className="bg-primary-600 p-8 text-center">
                    <h1 className="text-2xl font-bold text-white mb-1">Garotos do Martinica</h1>
                    <p className="text-primary-100">Sistema de Gestão</p>
                </div>
                <div className="flex border-b">
                    <button className={`flex-1 py-4 text-sm font-bold ${activeLoginTab === 'EMAIL' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-400'}`} onClick={() => setActiveLoginTab('EMAIL')}>Gestão</button>
                    <button className={`flex-1 py-4 text-sm font-bold ${activeLoginTab === 'CPF' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-400'}`} onClick={() => setActiveLoginTab('CPF')}>Responsável</button>
                </div>
                <div className="p-8">
                    {activeLoginTab === 'EMAIL' ? (
                        <form onSubmit={(e) => { e.preventDefault(); setIsAuthenticated(true); setCurrentUser({id:'1', name:'Admin', email:'admin@martinica.com', role: UserRole.ADMIN, avatar:''}); }} className="space-y-4">
                            <p className="text-xs text-gray-500 text-center">Digite qualquer dado para entrar (Modo Demo)</p>
                            <input type="email" placeholder="E-mail" className="w-full border rounded-lg p-3 outline-none focus:ring-2 focus:ring-primary-500" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} />
                            <input type="password" placeholder="Senha" className="w-full border rounded-lg p-3 outline-none focus:ring-2 focus:ring-primary-500" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
                            <button className="w-full bg-primary-600 text-white font-bold py-3 rounded-lg hover:bg-primary-700 transition-colors">Entrar</button>
                        </form>
                    ) : (
                        <form onSubmit={(e) => { e.preventDefault(); setIsAuthenticated(true); setCurrentUser({id:'2', name:'Responsável', email:'', role: UserRole.RESPONSAVEL, avatar:'', cpf: loginCpf}); }} className="space-y-4">
                            <input type="text" placeholder="CPF do Responsável" className="w-full border rounded-lg p-3 outline-none focus:ring-2 focus:ring-primary-500" value={loginCpf} onChange={e => setLoginCpf(e.target.value)} />
                            <button className="w-full bg-primary-600 text-white font-bold py-3 rounded-lg hover:bg-primary-700 transition-colors">Acessar Portal</button>
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
        {currentPage === 'students' && <StudentsPage students={students} groups={groups} plans={plans} transactions={transactions} activities={activities} occurrences={occurrences} onAddStudent={handleAddStudent} onUpdateStudent={handleUpdateStudent} onUpdateTransaction={handleUpdateTransaction} onAddTransaction={handleAddTransaction} onAddOccurrence={handleAddOccurrence} onGenerateTuitions={async () => {}} initialFilter={pageData?.filter} currentUser={currentUser} onBatchAddStudents={() => {}} />}
        {currentPage === 'finance' && <FinancePage students={students} transactions={transactions} plans={plans} onAddTransaction={handleAddTransaction} onUpdateTransaction={handleUpdateTransaction} />}
        {currentPage === 'plans' && <PlansPage plans={plans} onAddPlan={handleAddPlan} onUpdatePlan={handleUpdatePlan} onDeletePlan={async (id) => { await supabase.from('plans').delete().eq('id', id); fetchData(true); }} />}
        {currentPage === 'groups' && <GroupsPage groups={groups} students={students} onAddGroup={async (g) => { const { data } = await supabase.from('groups').insert([{name: g.name}]).select().single(); return data?.id; }} onUpdateGroup={async (g) => { await supabase.from('groups').update({name: g.name}).eq('id', g.id); fetchData(true); }} onDeleteGroup={async (id) => { await supabase.from('groups').delete().eq('id', id); fetchData(true); }} onBatchAssignStudents={handleBatchAssignStudents} />}
        {currentPage === 'schedule' && <SchedulePage activities={activities} students={students} groups={groups} onAddActivity={handleAddActivity} onUpdateActivity={handleUpdateActivity} onUpdateAttendance={handleUpdateAttendance} onUpdateFeePayment={handleUpdateFeePayment} onDeleteActivity={handleDeleteActivity} currentUser={currentUser} onAddTransaction={handleAddTransaction} onUpdateTransaction={handleUpdateTransaction} transactions={transactions} />}
      </main>
    </div>
  );
}

export default App;
