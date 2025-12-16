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
import { Student, Group, Plan, Transaction, Activity, User, UserRole, TransactionType, PaymentStatus, PaymentMethod } from './types';
import { Loader2, LogIn } from 'lucide-react';

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Data State
  const [students, setStudents] = useState<Student[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Login State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Fetch Data
  const fetchData = async () => {
      setLoading(true);
      try {
          // Fetch Students
          const { data: studentsData } = await supabase.from('students').select('*');
          if (studentsData) {
              setStudents(studentsData.map((s: any) => ({
                  id: s.id,
                  name: s.name,
                  birthDate: s.birth_date,
                  rg: s.rg,
                  cpf: s.cpf,
                  phone: s.phone,
                  medicalCertificateExpiry: s.medical_certificate_expiry,
                  photoUrl: s.photo_url,
                  address: s.address || {},
                  guardian: s.guardian || { name: '', phone: '', email: '', cpf: '' },
                  planId: s.plan_id,
                  groupIds: s.group_ids || (s.group_id ? [s.group_id] : []),
                  active: s.active,
                  documents: s.documents || {}
              })));
          }

          // Fetch Groups
          const { data: groupsData } = await supabase.from('groups').select('*');
          if (groupsData) setGroups(groupsData);

          // Fetch Plans
          const { data: plansData } = await supabase.from('plans').select('*');
          if (plansData) {
              setPlans(plansData.map((p: any) => ({
                  id: p.id,
                  name: p.name,
                  price: p.price,
                  dueDay: p.due_day,
                  description: p.description
              })));
          }

          // Fetch Transactions
          const { data: txData } = await supabase.from('transactions').select('*');
          if (txData) {
              setTransactions(txData.map((t: any) => ({
                  id: t.id,
                  description: t.description,
                  amount: t.amount,
                  type: t.type as TransactionType,
                  date: t.date,
                  status: t.status as PaymentStatus,
                  studentId: t.student_id,
                  paymentMethod: t.payment_method as PaymentMethod,
                  planId: t.plan_id,
                  paymentLink: t.payment_link,
                  externalReference: t.external_reference,
                  preferenceId: t.preference_id
              })));
          }

          // Fetch Activities
          const { data: actData } = await supabase.from('activities').select('*');
          if (actData) {
              setActivities(actData.map((a: any) => ({
                  id: a.id,
                  title: a.title,
                  type: a.type,
                  fee: a.fee,
                  location: a.location,
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
                  description: a.description,
                  recurrence: a.recurrence,
                  attendance: a.attendance || [],
                  feePayments: a.fee_payments || []
              })));
          }

           // Fetch Users
           const { data: usersData } = await supabase.from('users').select('*');
           if (usersData) {
               setUsers(usersData.map((u: any) => ({
                   id: u.id,
                   name: u.name,
                   email: u.email,
                   role: u.role as UserRole,
                   avatar: u.avatar,
                   cpf: u.cpf
               })));
           }

      } catch (error) {
          console.error("Error fetching data:", error);
      } finally {
          setLoading(false);
      }
  };

  useEffect(() => {
    // Check local storage for session or just check user state
    // For simplicity, if we have a user, fetch data
    if (currentUser) {
        fetchData();
    }
  }, [currentUser]);


  const handleLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoginError('');
      
      try {
        // Authenticate with Supabase Auth or custom table
        // Assuming custom table for now based on UsersPage
        const { data: userData, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (error || !userData) {
            setLoginError('Usuário não encontrado.');
            return;
        }

        // Simple password check (In production use proper auth/hashing)
        // For this demo app, we assume direct check if password column exists.
        if (userData.password && userData.password !== password) {
             setLoginError('Senha incorreta.');
             return;
        }

        const user: User = {
            id: userData.id,
            name: userData.name,
            email: userData.email,
            role: userData.role as UserRole,
            avatar: userData.avatar,
            cpf: userData.cpf
        };

        setCurrentUser(user);

      } catch (err) {
          console.error(err);
          setLoginError('Erro ao fazer login.');
      }
  };

  const handleLogout = () => {
      setCurrentUser(null);
      setCurrentPage('dashboard');
  };

  // --- HANDLERS ---
  const handleAddStudent = async (s: Omit<Student, 'id'>) => {
      await supabase.from('students').insert([{
          name: s.name,
          birth_date: s.birthDate,
          rg: s.rg,
          cpf: s.cpf,
          phone: s.phone,
          medical_certificate_expiry: s.medicalCertificateExpiry,
          photo_url: s.photoUrl,
          active: s.active,
          address: s.address,
          guardian: s.guardian,
          plan_id: s.planId,
          group_ids: s.groupIds || [],
          documents: s.documents
      }]);
      fetchData();
  };

  const handleUpdateStudent = async (s: Student) => {
       await supabase.from('students').update({
          name: s.name,
          birth_date: s.birthDate,
          rg: s.rg,
          cpf: s.cpf,
          phone: s.phone,
          medical_certificate_expiry: s.medicalCertificateExpiry,
          photo_url: s.photoUrl,
          active: s.active,
          address: s.address,
          guardian: s.guardian,
          plan_id: s.planId,
          group_ids: s.groupIds || [],
          group_id: (s.groupIds && s.groupIds.length > 0) ? s.groupIds[0] : null,
          documents: s.documents
       }).eq('id', s.id);
       fetchData();
  };

  const handleBatchAddStudents = async (studentsList: Omit<Student, 'id'>[]) => {
      const dbData = studentsList.map(s => ({
          name: s.name,
          birth_date: s.birthDate,
          rg: s.rg,
          cpf: s.cpf,
          phone: s.phone,
          medical_certificate_expiry: s.medicalCertificateExpiry,
          photo_url: s.photoUrl,
          active: s.active,
          address: s.address,
          guardian: s.guardian,
          plan_id: s.planId,
          group_ids: s.groupIds || [],
          documents: s.documents
      }));
      await supabase.from('students').insert(dbData);
      fetchData();
  };

  const handleAddGroup = async (g: Omit<Group, 'id'>): Promise<string | null> => {
      const { data, error } = await supabase.from('groups').insert([{ name: g.name }]).select().single();
      if (!error && data) {
          fetchData();
          return data.id;
      }
      return null;
  };

  const handleUpdateGroup = async (g: Group) => {
      await supabase.from('groups').update({ name: g.name }).eq('id', g.id);
      fetchData();
  };

  const handleDeleteGroup = async (id: string) => {
      await supabase.from('groups').delete().eq('id', id);
      fetchData();
  };

  const handleBatchAssignStudents = async (studentIds: string[], groupId: string) => {
      // Fetch current students to update their groupIds
      const currentStudents = students.filter(s => studentIds.includes(s.id));
      
      for (const s of currentStudents) {
          const newGroupIds = s.groupIds && !s.groupIds.includes(groupId) 
            ? [...s.groupIds, groupId] 
            : (s.groupIds || [groupId]);
            
          await supabase.from('students').update({ group_ids: newGroupIds }).eq('id', s.id);
      }
      fetchData();
  };

  const handleAddPlan = async (p: Omit<Plan, 'id'>) => {
      await supabase.from('plans').insert([{
          name: p.name,
          price: p.price,
          due_day: p.dueDay,
          description: p.description
      }]);
      fetchData();
  };

  const handleUpdatePlan = async (p: Plan) => {
      await supabase.from('plans').update({
          name: p.name,
          price: p.price,
          due_day: p.dueDay,
          description: p.description
      }).eq('id', p.id);
      fetchData();
  };

  const handleDeletePlan = async (id: string) => {
      await supabase.from('plans').delete().eq('id', id);
      fetchData();
  };

  const handleAddTransaction = async (t: Omit<Transaction, 'id'>) => {
      await supabase.from('transactions').insert([{
          description: t.description,
          amount: t.amount,
          type: t.type,
          date: t.date,
          status: t.status,
          student_id: t.studentId,
          payment_method: t.paymentMethod,
          plan_id: t.planId,
          payment_link: t.paymentLink,
          external_reference: t.externalReference,
          preference_id: t.preferenceId
      }]);
      fetchData();
  };

  const handleUpdateTransaction = async (t: Transaction) => {
      await supabase.from('transactions').update({
          description: t.description,
          amount: t.amount,
          type: t.type,
          date: t.date,
          status: t.status,
          payment_method: t.paymentMethod,
          payment_link: t.paymentLink,
          external_reference: t.externalReference
      }).eq('id', t.id);
      fetchData();
  };

  const handleAddActivity = async (a: Omit<Activity, 'id'>) => {
      await supabase.from('activities').insert([{
          title: a.title,
          type: a.type,
          fee: a.fee,
          location: a.location,
          presentation_time: a.presentationTime,
          opponent: a.opponent,
          home_score: a.homeScore,
          away_score: a.awayScore,
          scorers: a.scorers,
          group_id: a.groupId,
          participants: a.participants,
          date: a.date,
          start_time: a.startTime,
          end_time: a.endTime,
          recurrence: a.recurrence,
          attendance: a.attendance,
          fee_payments: a.feePayments
      }]);
      fetchData();
  };

  const handleUpdateActivity = async (a: Activity) => {
      await supabase.from('activities').update({
          title: a.title,
          type: a.type,
          fee: a.fee,
          location: a.location,
          presentation_time: a.presentationTime,
          opponent: a.opponent,
          home_score: a.homeScore,
          away_score: a.awayScore,
          scorers: a.scorers,
          group_id: a.groupId,
          participants: a.participants,
          date: a.date,
          start_time: a.startTime,
          end_time: a.endTime,
          recurrence: a.recurrence,
          attendance: a.attendance,
          fee_payments: a.feePayments
      }).eq('id', a.id);
      fetchData();
  };

  const handleDeleteActivity = async (id: string) => {
      await supabase.from('activities').delete().eq('id', id);
      fetchData();
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

      await supabase.from('activities').update({ attendance: newAttendance }).eq('id', activityId);
      fetchData();
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

      await supabase.from('activities').update({ fee_payments: newFeePayments }).eq('id', activityId);
      fetchData();
  };

  const handleAddUser = async (u: Omit<User, 'id'>) => {
      await supabase.from('users').insert([{
          name: u.name,
          email: u.email,
          password: u.password,
          role: u.role,
          avatar: u.avatar
      }]);
      fetchData();
  };

  const handleUpdateUser = async (u: User) => {
      const updateData: any = {
          name: u.name,
          email: u.email,
          role: u.role,
          avatar: u.avatar
      };
      if (u.password) updateData.password = u.password;

      await supabase.from('users').update(updateData).eq('id', u.id);
      fetchData();
  };

  const handleDeleteUser = async (id: string) => {
      await supabase.from('users').delete().eq('id', id);
      fetchData();
  };

  // --- RENDER ---
  if (!currentUser) {
      return (
          <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
              <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
                  <div className="flex flex-col items-center mb-6">
                      <div className="bg-primary-50 p-3 rounded-full mb-3">
                          <LogIn className="w-8 h-8 text-primary-600" />
                      </div>
                      <h1 className="text-2xl font-bold text-gray-800">Garotos do Martinica</h1>
                      <p className="text-gray-500">Sistema de Gestão Esportiva</p>
                  </div>
                  
                  {loginError && (
                      <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm text-center">
                          {loginError}
                      </div>
                  )}

                  <form onSubmit={handleLogin} className="space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                          <input 
                              type="email" 
                              required 
                              className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary-500"
                              value={email}
                              onChange={e => setEmail(e.target.value)}
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                          <input 
                              type="password" 
                              required 
                              className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary-500"
                              value={password}
                              onChange={e => setPassword(e.target.value)}
                          />
                      </div>
                      <button 
                          type="submit" 
                          className="w-full bg-primary-600 text-white py-2.5 rounded-lg hover:bg-primary-700 transition-colors font-medium shadow-lg shadow-primary-500/30"
                      >
                          Entrar
                      </button>
                  </form>
                  <div className="mt-6 text-center">
                      <p className="text-xs text-gray-400">© 2024 Garotos do Martinica. Todos os direitos reservados.</p>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar 
          currentUser={currentUser}
          currentPage={currentPage} 
          onNavigate={setCurrentPage} 
          onLogout={handleLogout}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
      />
      
      <div className="flex-1 md:ml-64 transition-all duration-300">
          {/* Mobile Header for Sidebar Toggle */}
          <div className="md:hidden bg-white p-4 shadow-sm flex items-center justify-between sticky top-0 z-30">
              <div className="flex items-center gap-2">
                  <img src="/logo.svg" alt="Logo" className="w-8 h-8" />
                  <span className="font-bold text-gray-800">Garotos do Martinica</span>
              </div>
              <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-gray-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
          </div>

          <main className="p-4 md:p-8 max-w-7xl mx-auto">
              {loading && (
                  <div className="fixed top-4 right-4 bg-white p-2 rounded-lg shadow-lg z-50 flex items-center gap-2 text-sm text-primary-600">
                      <Loader2 className="w-4 h-4 animate-spin" /> Atualizando...
                  </div>
              )}

              {currentPage === 'dashboard' && (
                  <DashboardPage 
                      students={students} 
                      transactions={transactions} 
                      activities={activities}
                      role={currentUser.role}
                      onNavigate={(page, data) => {
                          setCurrentPage(page);
                          // Handle data passing if needed via context or state, 
                          // here simplistic navigation
                      }}
                  />
              )}
              {currentPage === 'students' && (
                  <StudentsPage 
                      students={students}
                      groups={groups}
                      plans={plans}
                      transactions={transactions}
                      activities={activities}
                      currentUser={currentUser}
                      onAddStudent={handleAddStudent}
                      onUpdateStudent={handleUpdateStudent}
                      onBatchAddStudents={handleBatchAddStudents}
                      onUpdateTransaction={handleUpdateTransaction}
                      onAddTransaction={handleAddTransaction}
                      // If passing filters via onNavigate in Dashboard
                      // initialFilter={...} 
                  />
              )}
              {currentPage === 'groups' && (
                  <GroupsPage 
                      groups={groups}
                      students={students}
                      onAddGroup={handleAddGroup}
                      onUpdateGroup={handleUpdateGroup}
                      onDeleteGroup={handleDeleteGroup}
                      onBatchAssignStudents={handleBatchAssignStudents}
                  />
              )}
              {currentPage === 'plans' && (
                  <PlansPage 
                      plans={plans}
                      onAddPlan={handleAddPlan}
                      onUpdatePlan={handleUpdatePlan}
                      onDeletePlan={handleDeletePlan}
                  />
              )}
              {currentPage === 'schedule' && (
                  <SchedulePage 
                      activities={activities}
                      students={students}
                      groups={groups}
                      currentUser={currentUser}
                      onAddActivity={handleAddActivity}
                      onUpdateActivity={handleUpdateActivity}
                      onUpdateAttendance={handleUpdateAttendance}
                      onUpdateFeePayment={handleUpdateFeePayment}
                      onDeleteActivity={handleDeleteActivity}
                  />
              )}
              {currentPage === 'finance' && (
                  <FinancePage 
                      transactions={transactions}
                      plans={plans}
                      onAddTransaction={handleAddTransaction}
                      onUpdateTransaction={handleUpdateTransaction}
                  />
              )}
              {currentPage === 'users' && (
                  <UsersPage 
                      users={users}
                      onAddUser={handleAddUser}
                      onUpdateUser={handleUpdateUser}
                      onDeleteUser={handleDeleteUser}
                  />
              )}
              {/* If there was an AI Coach page link in Sidebar, it would be here. 
                  Assuming it might be accessed via dashboard or sidebar if added. 
                  Let's assume it's not in the main sidebar list yet or hidden. 
                  But let's add support if `currentPage` becomes 'aicoach'. */}
              {currentPage === 'aicoach' && (
                  <AICoachPage 
                      income={transactions.filter(t => t.type === TransactionType.INCOME && t.status === PaymentStatus.PAID).reduce((sum, t) => sum + t.amount, 0)}
                      expense={transactions.filter(t => t.type === TransactionType.EXPENSE).reduce((sum, t) => sum + t.amount, 0)}
                  />
              )}
          </main>
      </div>
    </div>
  );
}

export default App;