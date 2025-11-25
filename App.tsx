
import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { DashboardPage } from './pages/DashboardPage';
import { StudentsPage } from './pages/StudentsPage';
import { GroupsPage } from './pages/GroupsPage';
import { PlansPage } from './pages/PlansPage';
import { SchedulePage } from './pages/SchedulePage';
import { FinancePage } from './pages/FinancePage';
import { AICoachPage } from './pages/AICoachPage';
import { Student, UserRole, User, Plan, Group, Activity, Transaction, TransactionType, PaymentStatus, PaymentMethod } from './types';
import { Menu, Loader2 } from 'lucide-react';
import { supabase } from './lib/supabaseClient';

// Mock User (Auth not fully implemented yet, keeping mock user for logic)
const MOCK_USER_ADMIN: User = { id: 'u1', name: 'Carlos Silva', role: UserRole.ADMIN, avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026024d' };
const MOCK_USER_PROFESSOR: User = { id: 'u2', name: 'Renato Gaúcho', role: UserRole.PROFESSOR, avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026704d' };

function App() {
  const [currentUser, setCurrentUser] = useState<User>(MOCK_USER_ADMIN);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [pageData, setPageData] = useState<any>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // App State
  const [students, setStudents] = useState<Student[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);

  // --- DATA FETCHING ---
  const fetchData = async () => {
    setIsLoading(true);
    try {
        const { data: studentsData } = await supabase.from('students').select('*');
        const { data: groupsData } = await supabase.from('groups').select('*');
        const { data: plansData } = await supabase.from('plans').select('*');
        const { data: transactionsData } = await supabase.from('transactions').select('*');
        const { data: activitiesData } = await supabase.from('activities').select('*');

        // Mappers to match Typescript Interfaces (Supabase returns snake_case, Types are camelCase or match)
        if (studentsData) {
             const mappedStudents: Student[] = studentsData.map((s: any) => ({
                 id: s.id,
                 name: s.name,
                 birthDate: s.birth_date,
                 rg: s.rg,
                 cpf: s.cpf,
                 phone: s.phone,
                 medicalCertificateExpiry: s.medical_expiry,
                 photoUrl: s.photo_url,
                 address: s.address, // JSONB
                 guardian: s.guardian, // JSONB
                 planId: s.plan_id,
                 groupId: s.group_id,
                 active: s.active,
                 documents: s.documents // JSONB
             }));
             setStudents(mappedStudents);
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
                 paymentLink: t.payment_link
             })));
        }

        if (activitiesData) {
             setActivities(activitiesData.map((a: any) => ({
                 id: a.id,
                 title: a.title,
                 groupId: a.group_id,
                 participants: a.participants || [],
                 date: a.date,
                 startTime: a.start_time,
                 endTime: a.end_time,
                 recurrence: a.recurrence,
                 attendance: a.attendance || []
             })));
        }

    } catch (error) {
        console.error("Error fetching data from Supabase:", error);
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- ACTIONS WITH SUPABASE ---

  const generateAnnualTuition = async (student: Student, plan: Plan) => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const newTransactionsPayload = [];

    for (let month = currentMonth; month <= 11; month++) {
        let dueYear = currentYear;
        const targetDate = new Date(dueYear, month, plan.dueDay);
        if (targetDate.getMonth() !== month) {
            targetDate.setDate(0);
        }

        const monthName = targetDate.toLocaleString('pt-BR', { month: 'long' });
        const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
        const description = `Mensalidade ${student.name.split(' ')[0]} - ${capitalizedMonth}`;
        // Generate a simpler ID for Payment Link reference if needed, but DB handles real ID
        const tempRef = Math.random().toString(36).substr(2, 9); 
        const paymentLink = `https://www.mercadopago.com.br/checkout/pay?pref_id=${tempRef}&amount=${plan.price}`;

        newTransactionsPayload.push({
            description: description,
            amount: plan.price,
            type: TransactionType.INCOME,
            date: targetDate.toISOString().split('T')[0],
            status: PaymentStatus.PENDING,
            student_id: student.id,
            plan_id: plan.id,
            payment_link: paymentLink
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
                 paymentLink: t.payment_link
             }));
             setTransactions(prev => [...prev, ...mappedTxs]);
        }
    }
  };

  const uploadPhoto = async (photoDataUrl: string, studentName: string): Promise<string | undefined> => {
      if (!photoDataUrl || !photoDataUrl.startsWith('data:')) return photoDataUrl; // Already a URL or empty

      try {
          const res = await fetch(photoDataUrl);
          const blob = await res.blob();
          const fileName = `${studentName.replace(/\s+/g, '_')}_${Date.now()}.jpg`;
          
          const { data, error } = await supabase.storage.from('photos').upload(fileName, blob);
          if (error) throw error;
          
          const { data: publicUrlData } = supabase.storage.from('photos').getPublicUrl(fileName);
          return publicUrlData.publicUrl;
      } catch (err) {
          console.error("Error uploading photo:", err);
          return undefined;
      }
  };

  const handleAddStudent = async (studentData: Omit<Student, 'id'>) => {
    setIsLoading(true);
    let finalPhotoUrl = studentData.photoUrl;
    
    // Upload photo if it's base64
    if (studentData.photoUrl && studentData.photoUrl.startsWith('data:')) {
        finalPhotoUrl = await uploadPhoto(studentData.photoUrl, studentData.name);
    }

    const payload = {
        name: studentData.name,
        birth_date: studentData.birthDate,
        rg: studentData.rg,
        cpf: studentData.cpf,
        phone: studentData.phone,
        medical_expiry: studentData.medicalCertificateExpiry,
        photo_url: finalPhotoUrl,
        address: studentData.address,
        guardian: studentData.guardian,
        plan_id: studentData.planId,
        group_id: studentData.groupId,
        active: studentData.active,
        documents: studentData.documents
    };

    const { data, error } = await supabase.from('students').insert([payload]).select().single();

    if (data && !error) {
        const newStudent: Student = {
             id: data.id,
             name: data.name,
             birthDate: data.birth_date,
             rg: data.rg,
             cpf: data.cpf,
             phone: data.phone,
             medicalCertificateExpiry: data.medical_expiry,
             photoUrl: data.photo_url,
             address: data.address,
             guardian: data.guardian,
             planId: data.plan_id,
             groupId: data.group_id,
             active: data.active,
             documents: data.documents
        };
        setStudents(prev => [...prev, newStudent]);
        
        // Generate tuition if applicable
        if (newStudent.active && newStudent.planId) {
            const plan = plans.find(p => p.id === newStudent.planId);
            if (plan) {
                await generateAnnualTuition(newStudent, plan);
            }
        }
    } else {
        alert("Erro ao salvar aluno. Verifique o console.");
        console.error(error);
    }
    setIsLoading(false);
  };

  const handleUpdateStudent = async (updatedStudent: Student) => {
    setIsLoading(true);
    let finalPhotoUrl = updatedStudent.photoUrl;
    if (updatedStudent.photoUrl && updatedStudent.photoUrl.startsWith('data:')) {
        finalPhotoUrl = await uploadPhoto(updatedStudent.photoUrl, updatedStudent.name);
    }

    const payload = {
        name: updatedStudent.name,
        birth_date: updatedStudent.birthDate,
        rg: updatedStudent.rg,
        cpf: updatedStudent.cpf,
        phone: updatedStudent.phone,
        medical_expiry: updatedStudent.medicalCertificateExpiry,
        photo_url: finalPhotoUrl,
        address: updatedStudent.address,
        guardian: updatedStudent.guardian,
        plan_id: updatedStudent.planId,
        group_id: updatedStudent.groupId,
        active: updatedStudent.active,
        documents: updatedStudent.documents
    };

    const { error } = await supabase.from('students').update(payload).eq('id', updatedStudent.id);
    
    if (!error) {
        setStudents(students.map(s => s.id === updatedStudent.id ? { ...updatedStudent, photoUrl: finalPhotoUrl } : s));
    } else {
        alert("Erro ao atualizar.");
        console.error(error);
    }
    setIsLoading(false);
  };

  const handleBatchAssignStudents = async (studentIds: string[], groupId: string) => {
    const { error } = await supabase.from('students').update({ group_id: groupId }).in('id', studentIds);
    if (!error) {
        setStudents(prev => prev.map(s => {
            if (studentIds.includes(s.id)) return { ...s, groupId };
            if (s.groupId === groupId && !studentIds.includes(s.id)) return { ...s, groupId: '' };
            return s;
        }));
    }
  };
  
  const handleAddActivity = async (activityData: Omit<Activity, 'id'>) => {
      const payload = {
          title: activityData.title,
          group_id: activityData.groupId || null,
          participants: activityData.participants,
          date: activityData.date,
          start_time: activityData.startTime,
          end_time: activityData.endTime,
          recurrence: activityData.recurrence,
          attendance: []
      };
      
      const { data, error } = await supabase.from('activities').insert([payload]).select().single();
      if (data && !error) {
          setActivities(prev => [...prev, { ...activityData, id: data.id, attendance: [] }]);
      }
  };

  const handleUpdateActivity = async (updatedActivity: Activity) => {
      const payload = {
          title: updatedActivity.title,
          group_id: updatedActivity.groupId || null,
          participants: updatedActivity.participants,
          date: updatedActivity.date,
          start_time: updatedActivity.startTime,
          end_time: updatedActivity.endTime,
          recurrence: updatedActivity.recurrence,
          attendance: updatedActivity.attendance
      };
      const { error } = await supabase.from('activities').update(payload).eq('id', updatedActivity.id);
      if (!error) {
          setActivities(activities.map(a => a.id === updatedActivity.id ? updatedActivity : a));
      }
  };

  const handleUpdateAttendance = async (activityId: string, studentId: string) => {
      const activity = activities.find(a => a.id === activityId);
      if (!activity) return;

      const isPresent = activity.attendance.includes(studentId);
      const newAttendance = isPresent ? activity.attendance.filter(id => id !== studentId) : [...activity.attendance, studentId];

      const { error } = await supabase.from('activities').update({ attendance: newAttendance }).eq('id', activityId);
      
      if (!error) {
        setActivities(activities.map(a => a.id === activityId ? { ...a, attendance: newAttendance } : a));
      }
  };

  const handleAddTransaction = async (txData: Omit<Transaction, 'id'>) => {
      const payload = {
          description: txData.description,
          amount: txData.amount,
          type: txData.type,
          date: txData.date,
          status: txData.status,
          student_id: txData.studentId,
          plan_id: txData.planId,
          payment_method: txData.paymentMethod,
          payment_link: txData.paymentLink
      };
      const { data, error } = await supabase.from('transactions').insert([payload]).select().single();
      if (data && !error) {
          setTransactions(prev => [{ ...txData, id: data.id } as Transaction, ...prev]);
      }
  };

  const handleUpdateTransaction = async (updatedTx: Transaction) => {
      const payload = {
          description: updatedTx.description,
          amount: updatedTx.amount,
          type: updatedTx.type,
          date: updatedTx.date,
          status: updatedTx.status,
          payment_method: updatedTx.paymentMethod
      };
      const { error } = await supabase.from('transactions').update(payload).eq('id', updatedTx.id);
      if (!error) {
        setTransactions(transactions.map(t => t.id === updatedTx.id ? updatedTx : t));
      }
  };

  const handleAddGroup = async (group: Group) => {
      const { data, error } = await supabase.from('groups').insert([{ name: group.name }]).select().single();
      if (data && !error) {
          setGroups(prev => [...prev, { id: data.id, name: data.name }]);
      }
  };

  const handleUpdateGroup = async (updatedGroup: Group) => {
      const { error } = await supabase.from('groups').update({ name: updatedGroup.name }).eq('id', updatedGroup.id);
      if (!error) {
          setGroups(groups.map(g => g.id === updatedGroup.id ? updatedGroup : g));
      }
  };

  const handleDeleteGroup = async (id: string) => {
      // Note: This requires handling constraints in DB or UI. For now simple delete.
      const { error } = await supabase.from('groups').delete().eq('id', id);
      if (!error) {
          setGroups(groups.filter(g => g.id !== id));
          setStudents(students.map(s => s.groupId === id ? { ...s, groupId: '' } : s));
      }
  };

  const handleAddPlan = async (planData: Omit<Plan, 'id'>) => {
      const payload = {
          name: planData.name,
          price: planData.price,
          due_day: planData.dueDay,
          description: planData.description
      };
      const { data, error } = await supabase.from('plans').insert([payload]).select().single();
      if (data && !error) {
          setPlans(prev => [...prev, { ...planData, id: data.id } as Plan]);
      }
  };

  const handleUpdatePlan = async (updatedPlan: Plan) => {
      const payload = {
          name: updatedPlan.name,
          price: updatedPlan.price,
          due_day: updatedPlan.dueDay,
          description: updatedPlan.description
      };
      const { error } = await supabase.from('plans').update(payload).eq('id', updatedPlan.id);
      if (!error) {
          setPlans(plans.map(p => p.id === updatedPlan.id ? updatedPlan : p));
      }
  };

  const handleDeletePlan = async (id: string) => {
      const { error } = await supabase.from('plans').delete().eq('id', id);
      if (!error) {
          setPlans(plans.filter(p => p.id !== id));
      }
  };

  const toggleRole = () => {
      setCurrentUser(currentUser.role === UserRole.ADMIN ? MOCK_USER_PROFESSOR : MOCK_USER_ADMIN);
      setCurrentPage('dashboard');
  };

  const handleNavigate = (page: string, data?: any) => {
      setCurrentPage(page);
      if (data) setPageData(data);
      else setPageData(null);
  };

  // Render Loading State
  if (isLoading && students.length === 0 && plans.length === 0) {
      return (
          <div className="flex h-screen w-full items-center justify-center bg-gray-50 flex-col gap-4">
              <Loader2 className="w-12 h-12 text-primary-500 animate-spin" />
              <p className="text-gray-500 font-medium">Carregando sistema Garotos do Martinica...</p>
          </div>
      )
  }

  const renderContent = () => {
    switch (currentPage) {
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
                  onUpdateStudent={handleUpdateStudent}
                  onUpdateTransaction={handleUpdateTransaction}
                  initialFilter={pageData?.filter}
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
               />;
      case 'finance':
        return currentUser.role === UserRole.ADMIN ? 
            <FinancePage 
                transactions={transactions} 
                plans={plans} 
                onAddTransaction={handleAddTransaction} 
                onUpdateTransaction={handleUpdateTransaction}
            /> : 
            <div className="p-10 text-center">Acesso Negado</div>;
      case 'ai-coach':
         const totalIncome = transactions.filter(t => t.type === TransactionType.INCOME).reduce((acc, c) => acc + c.amount, 0);
         const totalExpense = transactions.filter(t => t.type === TransactionType.EXPENSE).reduce((acc, c) => acc + c.amount, 0);
         return <AICoachPage income={totalIncome} expense={totalExpense} />;
      default:
        return <DashboardPage students={students} transactions={transactions} activities={activities} role={currentUser.role} onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="flex bg-gray-50 min-h-screen font-sans">
      <Sidebar 
        currentUser={currentUser} 
        currentPage={currentPage} 
        onNavigate={handleNavigate} 
        onLogout={toggleRole} 
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />
      
      <main className="flex-1 md:ml-64 p-4 md:p-8 w-full">
        <header className="mb-8 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
            <div className="flex items-center gap-3">
                <button 
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="md:hidden p-2 bg-white rounded-lg shadow-sm border border-gray-200 text-gray-700 hover:bg-gray-50"
                >
                    <Menu className="w-6 h-6" />
                </button>
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900">
                        {currentPage === 'dashboard' && 'Painel de Controle'}
                        {currentPage === 'students' && 'Gestão de Alunos'}
                        {currentPage === 'groups' && 'Gestão de Grupos'}
                        {currentPage === 'plans' && 'Planos e Mensalidades'}
                        {currentPage === 'schedule' && 'Agenda'}
                        {currentPage === 'finance' && 'Departamento Financeiro'}
                        {currentPage === 'ai-coach' && 'Inteligência Artificial'}
                    </h1>
                    <p className="text-xs md:text-sm text-gray-500 mt-1">Bem-vindo ao sistema Garotos do Martinica.</p>
                </div>
            </div>
            
            <div className="bg-orange-100 text-orange-800 text-xs px-3 py-1 rounded-full border border-orange-200 w-fit self-start md:self-auto flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                Sistema Online (Supabase)
            </div>
        </header>
        
        {renderContent()}
      </main>
    </div>
  );
}

export default App;
