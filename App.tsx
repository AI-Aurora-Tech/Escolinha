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
import { User, Student, Group, Plan, Transaction, Activity, UserRole, TransactionType, PaymentStatus } from './types';
import { supabase } from './lib/supabaseClient';
import { Loader2, Lock, User as UserIcon } from 'lucide-react';

// Simple Login Component
const LoginScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex justify-center mb-6">
           <div className="bg-primary-600 p-3 rounded-full">
             <Lock className="w-8 h-8 text-white" />
           </div>
        </div>
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-2">Garotos do Martinica</h2>
        <p className="text-center text-gray-500 mb-8">Faça login para acessar o sistema</p>
        
        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4">{error}</div>}
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input 
                  type="email" 
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full pl-10 p-3 border rounded-lg outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="admin@exemplo.com"
                  required
                />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
            <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input 
                  type="password" 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-10 p-3 border rounded-lg outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="••••••••"
                  required
                />
            </div>
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-primary-600 text-white py-3 rounded-lg font-bold hover:bg-primary-700 transition-colors flex justify-center items-center gap-2"
          >
            {loading && <Loader2 className="w-5 h-5 animate-spin" />}
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}

function App() {
  const [session, setSession] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Data State
  const [students, setStudents] = useState<Student[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      fetchData();
    }
  }, [session]);

  const fetchData = async () => {
    setLoading(true);
    try {
        // 1. Fetch Current User Profile
        const { data: profile } = await supabase.from('users').select('*').eq('email', session.user.email).single();
        if (profile) {
            setCurrentUser(profile);
        } else {
            setCurrentUser({
                id: session.user.id,
                name: 'Usuário',
                email: session.user.email,
                role: UserRole.ADMIN,
                avatar: `https://ui-avatars.com/api/?name=User`
            });
        }

        // 2. Fetch Domain Data
        const [
            { data: studentsData },
            { data: groupsData },
            { data: plansData },
            { data: transactionsData },
            { data: activitiesData },
            { data: usersData }
        ] = await Promise.all([
            supabase.from('students').select(`*, guardian:guardians(*)`),
            supabase.from('groups').select('*'),
            supabase.from('plans').select('*'),
            supabase.from('transactions').select('*'),
            supabase.from('activities').select('*'),
            supabase.from('users').select('*')
        ]);

        if (groupsData) setGroups(groupsData);
        if (plansData) setPlans(plansData);
        if (transactionsData) setTransactions(transactionsData);
        if (activitiesData) setActivities(activitiesData);
        if (usersData) setUsers(usersData);

        // Mappers to match Typescript Interfaces
        if (studentsData) {
             const mappedStudents: Student[] = studentsData.map((s: any) => {
                 let finalGroupIds: string[] = [];
                 
                 // Priority 1: New Array Column
                 if (s.group_ids && Array.isArray(s.group_ids) && s.group_ids.length > 0) {
                     finalGroupIds = s.group_ids;
                 } 
                 // Priority 2: Metadata
                 else if (s.guardian?.system_metadata?.group_ids && Array.isArray(s.guardian.system_metadata.group_ids)) {
                     finalGroupIds = s.guardian.system_metadata.group_ids;
                 } 
                 
                 // Priority 3: Legacy Single Column
                 if (finalGroupIds.length === 0 && s.group_id) {
                     let val = s.group_id;
                     if (typeof val === 'object' && val !== null) {
                         val = (val as any).id || (val as any).group_id || Object.values(val)[0]; 
                     }
                     if (typeof val === 'string') {
                         val = val.replace(/['"]/g, '').trim();
                         if (val.length > 0 && val !== 'null' && val !== 'undefined') {
                             finalGroupIds = [val];
                         }
                     }
                 }

                 return {
                     id: s.id,
                     name: s.name,
                     birthDate: s.birth_date,
                     rg: s.rg || '',
                     cpf: s.cpf || '',
                     phone: s.phone || '',
                     medicalCertificateExpiry: s.medical_certificate_expiry,
                     photoUrl: s.photo_url,
                     address: s.address || { street: '', number: '', city: '', state: '', cep: '' },
                     guardian: {
                         name: s.guardian?.name || '',
                         phone: s.guardian?.phone || '',
                         email: s.guardian?.email || '',
                         cpf: s.guardian?.cpf || ''
                     },
                     planId: s.plan_id,
                     groupIds: finalGroupIds,
                     active: s.active,
                     documents: s.documents || { rg: false, cpf: false, medical: false, address: false, school: false }
                 };
             });
             setStudents(mappedStudents);
        }
    } catch (error) {
        console.error("Error fetching data:", error);
    } finally {
        setLoading(false);
    }
  };

  // --- CRUD Handlers ---
  const handleAddStudent = async (s: Omit<Student, 'id'>) => {
      // 1. Upsert Guardian
      const { data: guardianData, error: gError } = await supabase.from('guardians').upsert({
          name: s.guardian.name,
          phone: s.guardian.phone,
          cpf: s.guardian.cpf,
          email: s.guardian.email
      }).select().single();

      if (gError) { console.error(gError); alert("Erro ao salvar responsável"); return; }

      // 2. Insert Student
      const { error: sError } = await supabase.from('students').insert({
          name: s.name,
          birth_date: s.birthDate,
          rg: s.rg,
          cpf: s.cpf,
          phone: s.phone,
          medical_certificate_expiry: s.medicalCertificateExpiry,
          photo_url: s.photoUrl,
          active: s.active,
          address: s.address,
          plan_id: s.planId,
          group_ids: s.groupIds,
          documents: s.documents,
          guardian_id: guardianData.id
      });
      
      if (sError) { console.error(sError); alert("Erro ao salvar aluno"); return; }
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
          plan_id: s.planId,
          group_ids: s.groupIds,
          documents: s.documents
       }).eq('id', s.id);
       fetchData();
  };

  const handleBatchAddStudents = async (studentsList: Omit<Student, 'id'>[]) => {
      for (const s of studentsList) {
          await handleAddStudent(s);
      }
  };

  const handleAddTransaction = async (t: Omit<Transaction, 'id'>) => {
      const { error } = await supabase.from('transactions').insert({
          description: t.description,
          amount: t.amount,
          type: t.type,
          date: t.date,
          status: t.status,
          student_id: t.studentId,
          payment_method: t.paymentMethod,
          payment_link: t.paymentLink,
          external_reference: t.externalReference
      });
      if (!error) fetchData();
  };

  const handleUpdateTransaction = async (t: Transaction) => {
      await supabase.from('transactions').update({
          status: t.status,
          payment_method: t.paymentMethod,
          payment_link: t.paymentLink,
          external_reference: t.externalReference,
          date: t.date
      }).eq('id', t.id);
      fetchData();
  };

  const handleAddGroup = async (g: Group) => {
      const { data, error } = await supabase.from('groups').insert({ name: g.name }).select().single();
      if (!error) { fetchData(); return data.id; }
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
      const studentsToUpdate = students.filter(s => studentIds.includes(s.id));
      for (const s of studentsToUpdate) {
          const newGroups = s.groupIds.includes(groupId) ? s.groupIds : [...s.groupIds, groupId];
          await supabase.from('students').update({ group_ids: newGroups }).eq('id', s.id);
      }
      fetchData();
  };

  const handleAddPlan = async (p: Omit<Plan, 'id'>) => {
      await supabase.from('plans').insert({
          name: p.name,
          price: p.price,
          due_day: p.dueDay,
          description: p.description
      });
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

  const handleAddActivity = async (a: Omit<Activity, 'id'>) => {
      await supabase.from('activities').insert({
          title: a.title,
          type: a.type,
          date: a.date,
          start_time: a.startTime,
          end_time: a.endTime,
          group_id: a.groupId || null,
          participants: a.participants,
          fee: a.fee,
          location: a.location,
          recurrence: a.recurrence,
          home_score: a.homeScore,
          away_score: a.awayScore,
          opponent: a.opponent,
          presentation_time: a.presentationTime,
          scorers: a.scorers
      });
      fetchData();
  };

  const handleUpdateActivity = async (a: Activity) => {
       await supabase.from('activities').update({
          title: a.title,
          type: a.type,
          date: a.date,
          start_time: a.startTime,
          end_time: a.endTime,
          group_id: a.groupId || null,
          participants: a.participants,
          fee: a.fee,
          location: a.location,
          recurrence: a.recurrence,
          home_score: a.homeScore,
          away_score: a.awayScore,
          opponent: a.opponent,
          presentation_time: a.presentationTime,
          scorers: a.scorers
      }).eq('id', a.id);
      fetchData();
  };

  const handleUpdateAttendance = async (activityId: string, studentId: string) => {
      const activity = activities.find(a => a.id === activityId);
      if (!activity) return;
      
      const currentAttendance = activity.attendance || [];
      const newAttendance = currentAttendance.includes(studentId) 
        ? currentAttendance.filter(id => id !== studentId)
        : [...currentAttendance, studentId];

      await supabase.from('activities').update({ attendance: newAttendance }).eq('id', activityId);
      fetchData();
  };
  
  const handleUpdateFeePayment = async (activityId: string, studentId: string) => {
      const activity = activities.find(a => a.id === activityId);
      if (!activity) return;

      const currentPayments = activity.feePayments || [];
      const newPayments = currentPayments.includes(studentId)
        ? currentPayments.filter(id => id !== studentId)
        : [...currentPayments, studentId];
        
      await supabase.from('activities').update({ fee_payments: newPayments }).eq('id', activityId);
      fetchData();
  };

  const handleDeleteActivity = async (id: string) => {
      await supabase.from('activities').delete().eq('id', id);
      fetchData();
  };
  
  const handleAddUser = async (u: Omit<User, 'id'>) => {
      const { error } = await supabase.from('users').insert({
          name: u.name,
          email: u.email,
          role: u.role,
          avatar: u.avatar
      });
      if(!error) fetchData();
  };
  
  const handleUpdateUser = async (u: User) => {
      await supabase.from('users').update({
          name: u.name,
          role: u.role,
          avatar: u.avatar
      }).eq('id', u.id);
      fetchData();
  };
  
  const handleDeleteUser = async (id: string) => {
      await supabase.from('users').delete().eq('id', id);
      fetchData();
  };


  if (!session) {
    return <LoginScreen />;
  }

  if (loading || !currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <Loader2 className="w-10 h-10 text-primary-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex bg-gray-50 min-h-screen">
       <Sidebar 
         currentUser={currentUser} 
         currentPage={currentPage} 
         onNavigate={setCurrentPage} 
         onLogout={() => supabase.auth.signOut()} 
         isOpen={isSidebarOpen}
         onClose={() => setIsSidebarOpen(false)}
       />
       
       <div className="flex-1 md:ml-64 p-4 md:p-8 transition-all duration-300">
          <div className="md:hidden flex justify-between items-center mb-6">
             <button onClick={() => setIsSidebarOpen(true)} className="p-2 bg-white rounded shadow text-gray-700">
                 Menu
             </button>
             <h1 className="font-bold text-lg">Garotos do Martinica</h1>
          </div>

          {currentPage === 'dashboard' && (
             <DashboardPage 
                students={students} 
                transactions={transactions} 
                activities={activities} 
                role={currentUser.role}
                onNavigate={(page, data) => {
                    setCurrentPage(page);
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
                onAddTransaction={handleAddTransaction}
                onUpdateTransaction={handleUpdateTransaction}
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
                onDeleteActivity={handleDeleteActivity}
                onUpdateAttendance={handleUpdateAttendance}
                onUpdateFeePayment={handleUpdateFeePayment}
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
          {currentPage === 'ai-coach' && (
             <AICoachPage 
                income={transactions.filter(t => t.type === TransactionType.INCOME && t.status === PaymentStatus.PAID).reduce((a, b) => a + b.amount, 0)}
                expense={transactions.filter(t => t.type === TransactionType.EXPENSE).reduce((a, b) => a + b.amount, 0)}
             />
          )}
       </div>
    </div>
  );
}

export default App;