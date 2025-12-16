
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
import { supabase } from './lib/supabaseClient';
import { createMPPreference } from './services/mercadoPago';
import { 
  User, Student, Plan, Group, Activity, Transaction, 
  UserRole, TransactionType, PaymentStatus, PaymentMethod 
} from './types';
import { Loader2 } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [loading, setLoading] = useState(true);

  // Data States
  const [students, setStudents] = useState<Student[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Derived state for AI Coach
  const income = transactions.filter(t => t.type === TransactionType.INCOME && t.status === PaymentStatus.PAID).reduce((acc, curr) => acc + curr.amount, 0);
  const expense = transactions.filter(t => t.type === TransactionType.EXPENSE).reduce((acc, curr) => acc + curr.amount, 0);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    // Fetch all data in parallel
    const [
      { data: studentsData },
      { data: plansData },
      { data: groupsData },
      { data: activitiesData },
      { data: transactionsData },
      { data: usersData }
    ] = await Promise.all([
      supabase.from('students').select('*'),
      supabase.from('plans').select('*'),
      supabase.from('groups').select('*'),
      supabase.from('activities').select('*'),
      supabase.from('transactions').select('*'),
      supabase.from('users').select('*')
    ]);

    if (studentsData) setStudents(studentsData);
    if (plansData) setPlans(plansData);
    if (groupsData) setGroups(groupsData);
    if (activitiesData) setActivities(activitiesData);
    if (transactionsData) setTransactions(transactionsData);
    if (usersData) {
        setUsers(usersData);
        // Mock Login: Pick the first admin or create one if empty
        if (!currentUser && usersData.length > 0) {
            setCurrentUser(usersData[0]);
        } else if (usersData.length === 0) {
             // If no users, create a default admin in state only for bootstrapping
             setCurrentUser({
                 id: 'admin', name: 'Admin', email: 'admin@system.com', role: UserRole.ADMIN, avatar: 'https://ui-avatars.com/api/?name=Admin'
             });
        }
    }
    setLoading(false);
  };

  const generateAnnualTuition = async (student: Student, plan: Plan) => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const newTransactionsPayload = [];
    
    for (let month = currentMonth; month <= 11; month++) {
        let dueYear = currentYear;
        const targetDate = new Date(dueYear, month, plan.dueDay);
        if (targetDate.getMonth() !== month) targetDate.setDate(0);

        const monthName = targetDate.toLocaleString('pt-BR', { month: 'long' });
        const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
        const description = `${student.name} - Mensalidade ${capitalizedMonth}`;
        
        const externalReference = crypto.randomUUID();
        let paymentLink = '';
        try {
            const mpResult = await createMPPreference({
                title: description,
                price: plan.price,
                externalReference: externalReference,
                payer: {
                    name: student.guardian.name,
                    email: student.guardian.email,
                    phone: student.guardian.phone,
                    identification: { type: 'CPF', number: student.guardian.cpf }
                }
            });
            if (mpResult) {
                paymentLink = mpResult.init_point;
            }
        } catch (e) { console.warn("Could not generate MP Link"); }

        newTransactionsPayload.push({
            description: description,
            amount: plan.price,
            type: TransactionType.INCOME,
            date: targetDate.toISOString().split('T')[0],
            status: PaymentStatus.PENDING,
            student_id: student.id,
            plan_id: plan.id,
            payment_link: paymentLink,
            payment_method: PaymentMethod.PIX_MERCADO_PAGO,
            external_reference: externalReference 
        });
    }

    if (newTransactionsPayload.length > 0) {
        const { data, error } = await supabase.from('transactions').insert(newTransactionsPayload).select();
        if (data && !error) {
             const mappedTxs = data.map((t: any) => ({
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
             }));
             setTransactions(prev => [...prev, ...mappedTxs]);
        } else {
            console.error("Erro ao gerar mensalidades:", error);
        }
    }
  };

  // --- Handlers ---
  const onAddStudent = async (student: Partial<Student>) => {
    const { data, error } = await supabase.from('students').insert([student]).select();
    if (data && !error) {
        const newStudent = data[0];
        setStudents(prev => [...prev, newStudent]);
        // Auto-generate tuition if plan selected
        if (newStudent.planId) {
            const plan = plans.find(p => p.id === newStudent.planId);
            if (plan) {
                await generateAnnualTuition(newStudent, plan);
            }
        }
    }
  };

  const onUpdateStudent = async (student: Student) => {
    const { error } = await supabase.from('students').update(student).eq('id', student.id);
    if (!error) {
        setStudents(prev => prev.map(s => s.id === student.id ? student : s));
    }
  };

  const onDeleteStudent = async (id: string) => {
      const { error } = await supabase.from('students').delete().eq('id', id);
      if (!error) setStudents(prev => prev.filter(s => s.id !== id));
  };

  const onAddTransaction = async (t: Omit<Transaction, 'id'>) => {
      // Map frontend camelCase to DB snake_case for insertion
      const payload = {
          description: t.description,
          amount: t.amount,
          type: t.type,
          date: t.date,
          status: t.status,
          payment_method: t.paymentMethod,
          payment_link: t.paymentLink,
          external_reference: t.externalReference,
          student_id: t.studentId,
          plan_id: t.planId
      };
      const { data, error } = await supabase.from('transactions').insert([payload]).select();
      if(data && !error) {
           // Map back
           const newTx: Transaction = { ...t, id: data[0].id };
           setTransactions(prev => [newTx, ...prev]);
      }
  };

  if (loading) {
      return <div className="h-screen w-full flex items-center justify-center bg-gray-50"><Loader2 className="w-10 h-10 animate-spin text-primary-600" /></div>;
  }

  if (!currentUser) return <div className="p-10 text-center">Carregando usuário...</div>;

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      <Sidebar 
          currentUser={currentUser} 
          currentPage={currentPage} 
          onNavigate={setCurrentPage} 
          onLogout={() => window.location.reload()} 
          isOpen={false} // Mobile toggle logic omitted for brevity
          onClose={() => {}} 
      />
      
      <main className="flex-1 overflow-y-auto p-4 md:p-8 ml-0 md:ml-64">
        {currentPage === 'dashboard' && <DashboardPage students={students} transactions={transactions} activities={activities} role={currentUser.role} onNavigate={(page) => setCurrentPage(page)} />}
        {currentPage === 'students' && <StudentsPage students={students} plans={plans} groups={groups} onAddStudent={onAddStudent} onUpdateStudent={onUpdateStudent} onDeleteStudent={onDeleteStudent} onAddTransaction={onAddTransaction} />}
        {currentPage === 'groups' && <GroupsPage groups={groups} students={students} onAddGroup={async (g) => { 
            const { data } = await supabase.from('groups').insert([g]).select(); 
            if(data) { setGroups(p => [...p, data[0]]); return data[0].id; } return null;
        }} onUpdateGroup={async (g) => {
            await supabase.from('groups').update(g).eq('id', g.id);
            setGroups(p => p.map(x => x.id === g.id ? g : x));
        }} onDeleteGroup={async (id) => {
            await supabase.from('groups').delete().eq('id', id);
            setGroups(p => p.filter(x => x.id !== id));
        }} onBatchAssignStudents={async (ids, groupId) => {
            // Logic to update students groupIds array
            const studentsToUpdate = students.filter(s => ids.includes(s.id));
            for(const s of studentsToUpdate) {
                const newGroups = s.groupIds ? [...new Set([...s.groupIds, groupId])] : [groupId];
                await onUpdateStudent({...s, groupIds: newGroups});
            }
        }} />}
        {currentPage === 'plans' && <PlansPage plans={plans} onAddPlan={async (p) => {
             const { data } = await supabase.from('plans').insert([p]).select();
             if(data) setPlans(prev => [...prev, data[0]]);
        }} onUpdatePlan={async (p) => {
             await supabase.from('plans').update(p).eq('id', p.id);
             setPlans(prev => prev.map(x => x.id === p.id ? p : x));
        }} onDeletePlan={async (id) => {
             await supabase.from('plans').delete().eq('id', id);
             setPlans(prev => prev.filter(x => x.id !== id));
        }} />}
        {currentPage === 'schedule' && <SchedulePage activities={activities} students={students} groups={groups} currentUser={currentUser} 
            onAddActivity={async (a) => {
                const { data } = await supabase.from('activities').insert([a]).select();
                if(data) setActivities(prev => [...prev, data[0]]);
            }} 
            onUpdateActivity={async (a) => {
                await supabase.from('activities').update(a).eq('id', a.id);
                setActivities(prev => prev.map(x => x.id === a.id ? a : x));
            }}
            onUpdateAttendance={async (actId, studId) => {
                const act = activities.find(a => a.id === actId);
                if(act) {
                    const newAtt = act.attendance.includes(studId) ? act.attendance.filter(id => id !== studId) : [...act.attendance, studId];
                    await supabase.from('activities').update({ attendance: newAtt }).eq('id', actId);
                    setActivities(prev => prev.map(a => a.id === actId ? {...a, attendance: newAtt} : a));
                }
            }}
            onDeleteActivity={async (id) => {
                await supabase.from('activities').delete().eq('id', id);
                setActivities(prev => prev.filter(x => x.id !== id));
            }}
        />}
        {currentPage === 'finance' && <FinancePage transactions={transactions} plans={plans} onAddTransaction={onAddTransaction} onUpdateTransaction={async (t) => {
             // Basic update
             await supabase.from('transactions').update({status: t.status, payment_method: t.paymentMethod, date: t.date}).eq('id', t.id);
             setTransactions(prev => prev.map(x => x.id === t.id ? t : x));
        }} />}
        {currentPage === 'users' && <UsersPage users={users} onAddUser={async (u) => {
             const { data } = await supabase.from('users').insert([u]).select();
             if(data) setUsers(prev => [...prev, data[0]]);
        }} onUpdateUser={async (u) => {
             await supabase.from('users').update(u).eq('id', u.id);
             setUsers(prev => prev.map(x => x.id === u.id ? u : x));
        }} onDeleteUser={async (id) => {
             await supabase.from('users').delete().eq('id', id);
             setUsers(prev => prev.filter(x => x.id !== id));
        }} />}
        {currentPage === 'ai-coach' && <AICoachPage income={income} expense={expense} />}
      </main>
    </div>
  );
}
