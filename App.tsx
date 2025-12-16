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
import { Student, Group, Plan, Transaction, Activity, User, UserRole, PaymentStatus, TransactionType } from './types';
import { supabase } from './lib/supabaseClient';
import { Menu, Loader2, AlertCircle } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [pageData, setPageData] = useState<any>(null);

  // Data States
  const [students, setStudents] = useState<Student[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Login State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Fetch Data
  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    
    // Attempt to fetch data. Error handling omitted for brevity but should be robust in prod.
    const [
      { data: studentsData },
      { data: groupsData },
      { data: plansData },
      { data: transactionsData },
      { data: activitiesData },
      { data: usersData }
    ] = await Promise.all([
      supabase.from('students').select('*'),
      supabase.from('groups').select('*'),
      supabase.from('plans').select('*'),
      supabase.from('transactions').select('*'),
      supabase.from('activities').select('*'),
      supabase.from('users').select('*')
    ]);

    if (studentsData) setStudents(studentsData);
    if (groupsData) setGroups(groupsData);
    if (plansData) setPlans(plansData);
    if (transactionsData) setTransactions(transactionsData);
    if (activitiesData) setActivities(activitiesData);
    if (usersData) setUsers(usersData);

    // Check session
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.email) {
       const user = usersData?.find(u => u.email === session.user.email);
       if (user) setCurrentUser(user);
    }
    
    setLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    
    // Supabase Auth Login
    const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword
    });

    if (error) {
        // Fallback: Check 'users' table directly (Legacy/Demo mode)
        const user = users.find(u => u.email === loginEmail && u.password === loginPassword);
        if (user) {
            setCurrentUser(user);
            return;
        }
        setLoginError('Credenciais inválidas');
    } else if (data.session?.user?.email) {
         const user = users.find(u => u.email === data.session!.user.email);
         if (user) setCurrentUser(user);
         else setLoginError('Usuário não encontrado no sistema.');
    }
  };

  const handleLogout = async () => {
      await supabase.auth.signOut();
      setCurrentUser(null);
  };

  // --- HANDLERS ---
  
  // GROUPS
  const handleAddGroup = async (g: Group): Promise<string | null> => {
      const { data, error } = await supabase.from('groups').insert([{ name: g.name }]).select().single();
      if(data && !error) {
          setGroups(prev => [...prev, { ...g, id: data.id }]);
          return data.id;
      }
      return null;
  };

  const handleUpdateGroup = async (g: Group) => {
      const { error } = await supabase.from('groups').update({ name: g.name }).eq('id', g.id);
      if(!error) {
          setGroups(prev => prev.map(item => item.id === g.id ? g : item));
      }
  };

  const handleDeleteGroup = async (id: string) => {
      const { error } = await supabase.from('groups').delete().eq('id', id);
      if(!error) {
          setGroups(prev => prev.filter(item => item.id !== id));
      }
  };
  
  const handleBatchAssignStudents = async (studentIds: string[], groupId: string) => {
       const updates = students
           .filter(s => studentIds.includes(s.id))
           .map(s => {
               const newGroups = s.groupIds.includes(groupId) ? s.groupIds : [...s.groupIds, groupId];
               return { ...s, groupIds: newGroups };
           });
       
       for (const s of updates) {
           await supabase.from('students').update({ groupIds: s.groupIds }).eq('id', s.id);
       }
       
       setStudents(prev => prev.map(s => {
           const updated = updates.find(u => u.id === s.id);
           return updated || s;
       }));
  };

  // STUDENTS
  const handleAddStudent = async (s: Omit<Student, 'id'>) => {
      const { data, error } = await supabase.from('students').insert([s]).select().single();
      if (data && !error) setStudents(prev => [...prev, data]);
  };

  const handleBatchAddStudents = async (studentsList: Omit<Student, 'id'>[]) => {
      const { data, error } = await supabase.from('students').insert(studentsList).select();
      if (data && !error) setStudents(prev => [...prev, ...data]);
  };

  const handleUpdateStudent = async (s: Student) => {
      const { error } = await supabase.from('students').update(s).eq('id', s.id);
      if (!error) setStudents(prev => prev.map(item => item.id === s.id ? s : item));
  };

  // PLANS
  const handleAddPlan = async (p: Omit<Plan, 'id'>) => {
      const { data, error } = await supabase.from('plans').insert([p]).select().single();
      if (data && !error) setPlans(prev => [...prev, data]);
  };

  const handleUpdatePlan = async (p: Plan) => {
      const { error } = await supabase.from('plans').update(p).eq('id', p.id);
      if (!error) setPlans(prev => prev.map(item => item.id === p.id ? p : item));
  };

  const handleDeletePlan = async (id: string) => {
      const { error } = await supabase.from('plans').delete().eq('id', id);
      if (!error) setPlans(prev => prev.filter(item => item.id !== id));
  };

  // TRANSACTIONS
  const handleAddTransaction = async (t: Omit<Transaction, 'id'>) => {
      const { data, error } = await supabase.from('transactions').insert([t]).select().single();
      if (data && !error) setTransactions(prev => [...prev, data]);
  };

  const handleUpdateTransaction = async (t: Transaction) => {
      const { error } = await supabase.from('transactions').update(t).eq('id', t.id);
      if (!error) setTransactions(prev => prev.map(item => item.id === t.id ? t : item));
  };

  // ACTIVITIES
  const handleAddActivity = async (a: Omit<Activity, 'id'>) => {
      const { data, error } = await supabase.from('activities').insert([a]).select().single();
      if (data && !error) setActivities(prev => [...prev, data]);
  };

  const handleUpdateActivity = async (a: Activity) => {
      const { error } = await supabase.from('activities').update(a).eq('id', a.id);
      if (!error) setActivities(prev => prev.map(item => item.id === a.id ? a : item));
  };

  const handleDeleteActivity = async (id: string) => {
      const { error } = await supabase.from('activities').delete().eq('id', id);
      if (!error) setActivities(prev => prev.filter(item => item.id !== id));
  };

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

  const handleUpdateFeePayment = async (activityId: string, studentId: string) => {
      const activity = activities.find(a => a.id === activityId);
      if (!activity) return;

      const currentPayments = activity.feePayments || [];
      const newPayments = currentPayments.includes(studentId)
          ? currentPayments.filter(id => id !== studentId)
          : [...currentPayments, studentId];
      
      const { error } = await supabase.from('activities').update({ feePayments: newPayments }).eq('id', activityId);
      if (!error) {
          setActivities(prev => prev.map(a => a.id === activityId ? { ...a, feePayments: newPayments } : a));
      }
  };

  // USERS
  const handleAddUser = async (u: Omit<User, 'id'>) => {
      const { data: authData, error: authError } = await supabase.auth.signUp({
          email: u.email,
          password: u.password || '123456',
      });
      
      if (authError) {
          console.error("Auth Signup Error", authError);
      }
      
      const { data, error } = await supabase.from('users').insert([{...u, id: authData.user?.id || crypto.randomUUID() }]).select().single();
      if (data && !error) setUsers(prev => [...prev, data]);
  };

  const handleUpdateUser = async (u: User) => {
       const { error } = await supabase.from('users').update(u).eq('id', u.id);
       if (!error) setUsers(prev => prev.map(item => item.id === u.id ? u : item));
  };

  const handleDeleteUser = async (id: string) => {
       const { error } = await supabase.from('users').delete().eq('id', id);
       if (!error) setUsers(prev => prev.filter(item => item.id !== id));
  };

  // Navigation Handler
  const handleNavigate = (page: string, data?: any) => {
      setCurrentPage(page);
      if (data) setPageData(data);
  };

  // --- RENDER ---

  if (loading) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-gray-100">
              <Loader2 className="w-10 h-10 text-primary-600 animate-spin" />
          </div>
      );
  }

  if (!currentUser) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 p-4">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
                <div className="flex flex-col items-center mb-6">
                    <div className="bg-primary-100 p-3 rounded-full mb-3">
                         <img src="/logo.svg" alt="Logo" className="w-10 h-10" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-800">Garotos do Martinica</h2>
                    <p className="text-gray-500">Gestão de Escolinha de Futebol</p>
                </div>
                
                <form onSubmit={handleLogin} className="space-y-4">
                    {loginError && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" /> {loginError}
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input 
                            type="email" 
                            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-primary-500 outline-none"
                            placeholder="seu@email.com"
                            value={loginEmail}
                            onChange={(e) => setLoginEmail(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                        <input 
                            type="password" 
                            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-primary-500 outline-none"
                            placeholder="******"
                            value={loginPassword}
                            onChange={(e) => setLoginPassword(e.target.value)}
                        />
                    </div>
                    <button type="submit" className="w-full bg-primary-600 text-white py-3 rounded-lg font-bold hover:bg-primary-700 transition-colors shadow-lg shadow-primary-500/30">
                        Entrar
                    </button>
                </form>
            </div>
        </div>
      );
  }

  const renderPage = () => {
      switch(currentPage) {
          case 'dashboard':
              return <DashboardPage 
                        students={students} 
                        transactions={transactions} 
                        activities={activities} 
                        role={currentUser.role}
                        onNavigate={handleNavigate}
                     />;
          case 'students':
              return <StudentsPage 
                        students={students} 
                        groups={groups} 
                        plans={plans} 
                        transactions={transactions}
                        activities={activities}
                        onAddStudent={handleAddStudent}
                        onBatchAddStudents={handleBatchAddStudents}
                        onUpdateStudent={handleUpdateStudent}
                        onUpdateTransaction={handleUpdateTransaction}
                        onAddTransaction={handleAddTransaction}
                        initialFilter={pageData?.filter}
                        currentUser={currentUser}
                     />;
          case 'groups':
              return <GroupsPage 
                        groups={groups} 
                        students={students} 
                        onAddGroup={handleAddGroup} 
                        onUpdateGroup={handleUpdateGroup} 
                        onDeleteGroup={handleDeleteGroup}
                        onBatchAssignStudents={handleBatchAssignStudents}
                     />;
          case 'plans':
              return <PlansPage 
                        plans={plans} 
                        onAddPlan={handleAddPlan} 
                        onUpdatePlan={handleUpdatePlan} 
                        onDeletePlan={handleDeletePlan} 
                     />;
          case 'schedule':
              return <SchedulePage 
                        activities={activities} 
                        students={students} 
                        groups={groups} 
                        onAddActivity={handleAddActivity} 
                        onUpdateActivity={handleUpdateActivity} 
                        onUpdateAttendance={handleUpdateAttendance}
                        onUpdateFeePayment={handleUpdateFeePayment}
                        onDeleteActivity={handleDeleteActivity}
                        currentUser={currentUser}
                     />;
          case 'finance':
              return <FinancePage 
                        transactions={transactions} 
                        plans={plans} 
                        onAddTransaction={handleAddTransaction} 
                        onUpdateTransaction={handleUpdateTransaction} 
                     />;
          case 'users':
              return <UsersPage 
                        users={users} 
                        onAddUser={handleAddUser} 
                        onUpdateUser={handleUpdateUser} 
                        onDeleteUser={handleDeleteUser} 
                     />;
          case 'ai-coach':
              return <AICoachPage 
                  income={transactions.filter(t => t.type === TransactionType.INCOME && t.status === PaymentStatus.PAID).reduce((acc, curr) => acc + curr.amount, 0)}
                  expense={transactions.filter(t => t.type === TransactionType.EXPENSE).reduce((acc, curr) => acc + curr.amount, 0)}
              />;
          default:
              return <DashboardPage students={students} transactions={transactions} activities={activities} role={currentUser.role} />;
      }
  };

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-900">
      <Sidebar 
        currentUser={currentUser}
        currentPage={currentPage}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col md:ml-64 transition-all duration-300">
        <header className="bg-white border-b border-gray-100 p-4 flex items-center justify-between md:hidden sticky top-0 z-30">
             <div className="flex items-center gap-2">
                 <img src="/logo.svg" alt="Logo" className="w-8 h-8" />
                 <span className="font-bold text-gray-800">Garotos do Martinica</span>
             </div>
             <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg">
                 <Menu className="w-6 h-6" />
             </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
            <div className="max-w-7xl mx-auto">
                {renderPage()}
            </div>
        </main>
      </div>
    </div>
  );
}
