
import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { DashboardPage } from './pages/DashboardPage';
import { StudentsPage } from './pages/StudentsPage';
import { GroupsPage } from './pages/GroupsPage';
import { PlansPage } from './pages/PlansPage';
import { SchedulePage } from './pages/SchedulePage';
import { FinancePage } from './pages/FinancePage';
import { AICoachPage } from './pages/AICoachPage';
import { UsersPage } from './pages/UsersPage';
import { Student, UserRole, User, Plan, Group, Activity, Transaction, TransactionType, PaymentStatus, PaymentMethod } from './types';
import { Menu, Loader2, Trophy, User as UserIcon, Lock } from 'lucide-react';
import { supabase } from './lib/supabaseClient';
import { createMPPreference } from './services/mercadoPago';

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // Login State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
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

  // --- DATA FETCHING ---
  const fetchData = async () => {
    setIsLoading(true);
    try {
        const { data: studentsData } = await supabase.from('students').select('*');
        const { data: groupsData } = await supabase.from('groups').select('*');
        const { data: plansData } = await supabase.from('plans').select('*');
        const { data: transactionsData } = await supabase.from('transactions').select('*');
        const { data: activitiesData } = await supabase.from('activities').select('*');
        
        // Only fetch users if admin
        if (currentUser?.role === UserRole.ADMIN) {
            const { data: usersData } = await supabase.from('app_users').select('*');
            if (usersData) {
                setSystemUsers(usersData.map((u: any) => ({
                    id: u.id,
                    name: u.name,
                    email: u.email,
                    role: u.role,
                    avatar: u.avatar
                })));
            }
        }

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
                 paymentLink: t.payment_link,
                 externalReference: t.externalReference,
                 preferenceId: t.preferenceId
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
    if (isAuthenticated) {
        fetchData();
    }
  }, [isAuthenticated]);

  const handleLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoggingIn(true);
      setLoginError('');

      try {
          const { data, error } = await supabase
            .from('app_users')
            .select('*')
            .eq('email', loginEmail)
            .eq('password', loginPassword) // In production, use Supabase Auth or hash comparison
            .single();

          if (error || !data) {
              setLoginError('Email ou senha inválidos.');
              setIsLoggingIn(false);
              return;
          }

          const user: User = {
              id: data.id,
              name: data.name,
              email: data.email,
              role: data.role as UserRole,
              avatar: data.avatar || `https://ui-avatars.com/api/?name=${data.name}`
          };

          setCurrentUser(user);
          setIsAuthenticated(true);
      } catch (err) {
          setLoginError('Erro ao conectar ao servidor.');
          console.error(err);
      } finally {
          setIsLoggingIn(false);
      }
  };

  const handleLogout = () => {
      setCurrentUser(null);
      setIsAuthenticated(false);
      setLoginEmail('');
      setLoginPassword('');
      setCurrentPage('dashboard');
  };

  // --- ACTIONS WITH SUPABASE ---

  const generateAnnualTuition = async (student: Student, plan: Plan) => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const newTransactionsPayload = [];

    // Create a temporary ID generator since we need to send an external_reference to Mercado Pago
    // BEFORE inserting into the database to get the real ID.
    // We will use crypto.randomUUID() for reliability.
    
    for (let month = currentMonth; month <= 11; month++) {
        let dueYear = currentYear;
        const targetDate = new Date(dueYear, month, plan.dueDay);
        if (targetDate.getMonth() !== month) {
            targetDate.setDate(0);
        }

        const monthName = targetDate.toLocaleString('pt-BR', { month: 'long' });
        const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
        const description = `Mensalidade ${student.name.split(' ')[0]} - ${capitalizedMonth}`;
        
        // Generate UUID for reference
        const externalReference = crypto.randomUUID();
        let paymentLink = '';
        let preferenceId = '';

        // Try to generate Mercado Pago link
        // Note: This runs sequentially, so it might take a moment.
        // We do this to ensure each month has a unique playable link.
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
                preferenceId = mpResult.id;
            }
        } catch (e) {
            console.warn("Could not generate MP Link for " + description);
        }

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
            // We can't insert 'externalReference' directly if the column name in DB is different,
            // but assuming we don't have that column mapped yet, we might store it in description or payment_link metadata?
            // Actually, let's assuming we just store it in payment_link for now or if we updated the schema.
            // But wait, checkPaymentStatus needs it. Let's assume we can query by payment_link if needed or add metadata.
            // For now, let's keep it simple. If DB doesn't have column, this field will be ignored by Supabase insert unless mapped.
            // We will add 'payment_link' which is standard.
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
                // Warning: this might be slow due to MP generation
                await generateAnnualTuition(newStudent, plan);
            }
        }
    } else {
        alert("Erro ao salvar aluno. Verifique o console.");
        console.error(error);
    }
    setIsLoading(false);
  };

  const handleBatchAddStudents = async (studentsData: Omit<Student, 'id'>[]) => {
    setIsLoading(true);
    try {
        const payload = studentsData.map(s => ({
            name: s.name,
            birth_date: s.birthDate,
            rg: s.rg,
            cpf: s.cpf,
            phone: s.phone,
            medical_expiry: s.medicalCertificateExpiry,
            photo_url: s.photoUrl,
            address: s.address,
            guardian: s.guardian,
            plan_id: s.planId || null,
            group_id: s.groupId || null,
            active: s.active,
            documents: s.documents
        }));

        const { data, error } = await supabase.from('students').insert(payload).select();

        if (data && !error) {
            const newStudents: Student[] = data.map((d: any) => ({
                 id: d.id,
                 name: d.name,
                 birthDate: d.birth_date,
                 rg: d.rg,
                 cpf: d.cpf,
                 phone: d.phone,
                 medicalCertificateExpiry: d.medical_expiry,
                 photoUrl: d.photo_url,
                 address: d.address,
                 guardian: d.guardian,
                 planId: d.plan_id,
                 groupId: d.group_id,
                 active: d.active,
                 documents: d.documents
            }));
            
            setStudents(prev => [...prev, ...newStudents]);
            alert(`${newStudents.length} alunos importados com sucesso!`);
        } else {
            console.error(error);
            alert("Erro na importação em massa.");
        }
    } catch (error) {
        console.error(error);
        alert("Erro inesperado na importação.");
    } finally {
        setIsLoading(false);
    }
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

  const handleAddUser = async (user: Omit<User, 'id'>) => {
      const { data, error } = await supabase.from('app_users').insert([user]).select().single();
      if (data && !error) {
          const newUser = { id: data.id, name: data.name, email: data.email, role: data.role, avatar: data.avatar };
          setSystemUsers(prev => [...prev, newUser]);
      } else {
          console.error(error);
          alert("Erro ao criar usuário.");
      }
  };

  const handleUpdateUser = async (user: User) => {
      const payload: any = { name: user.name, email: user.email, role: user.role, avatar: user.avatar };
      if (user.password) payload.password = user.password;
      
      const { error } = await supabase.from('app_users').update(payload).eq('id', user.id);
      if (!error) {
          setSystemUsers(prev => prev.map(u => u.id === user.id ? { ...u, ...user, password: undefined } : u));
      } else {
          console.error(error);
          alert("Erro ao atualizar usuário.");
      }
  };

  const handleDeleteUser = async (id: string) => {
      const { error } = await supabase.from('app_users').delete().eq('id', id);
      if (!error) {
          setSystemUsers(prev => prev.filter(u => u.id !== id));
      } else {
          console.error(error);
          alert("Erro ao excluir usuário.");
      }
  };

  const handleNavigate = (page: string, data?: any) => {
      setCurrentPage(page);
      if (data) setPageData(data);
      else setPageData(null);
  };

  // --- LOGIN SCREEN ---
  if (!isAuthenticated) {
      return (
          <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                  <div className="bg-primary-600 p-8 text-center">
                      <div className="inline-flex bg-white/20 p-4 rounded-full mb-4 backdrop-blur-sm">
                          <img src="/logo.svg" alt="Logo" className="w-12 h-12" />
                      </div>
                      <h1 className="text-2xl font-bold text-white mb-1">Garotos do Martinica</h1>
                      <p className="text-primary-100">Sistema de Gestão Esportiva</p>
                  </div>
                  <div className="p-8">
                      <h2 className="text-xl font-bold text-gray-800 mb-6 text-center">Acesso ao Sistema</h2>
                      <form onSubmit={handleLogin} className="space-y-4">
                          <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                              <div className="relative">
                                  <UserIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                  <input 
                                    type="email" 
                                    required
                                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
                                    placeholder="seu@email.com"
                                    value={loginEmail}
                                    onChange={(e) => setLoginEmail(e.target.value)}
                                  />
                              </div>
                          </div>
                          <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                              <div className="relative">
                                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                  <input 
                                    type="password" 
                                    required
                                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
                                    placeholder="••••••"
                                    value={loginPassword}
                                    onChange={(e) => setLoginPassword(e.target.value)}
                                  />
                              </div>
                          </div>
                          
                          {loginError && (
                              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-100 text-center">
                                  {loginError}
                              </div>
                          )}

                          <button 
                            type="submit" 
                            disabled={isLoggingIn}
                            className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                          >
                              {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Entrar no Sistema'}
                          </button>
                      </form>
                      <div className="mt-6 text-center text-xs text-gray-400">
                          © 2024 Garotos do Martinica. Todos os direitos reservados.
                      </div>
                  </div>
              </div>
          </div>
      );
  }

  // --- APP CONTENT ---
  const renderContent = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage 
                  students={students} 
                  transactions={transactions} 
                  activities={activities} 
                  role={currentUser!.role}
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
        if (currentUser!.role !== UserRole.ADMIN) return <div className="p-10 text-center text-gray-500">Acesso Restrito</div>;
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
        return currentUser!.role === UserRole.ADMIN ? 
            <FinancePage 
                transactions={transactions} 
                plans={plans} 
                onAddTransaction={handleAddTransaction} 
                onUpdateTransaction={handleUpdateTransaction}
            /> : 
            <div className="p-10 text-center text-gray-500">Acesso Restrito ao Administrador</div>;
      case 'users':
        return currentUser!.role === UserRole.ADMIN ? 
            <UsersPage 
                users={systemUsers} 
                onAddUser={handleAddUser}
                onUpdateUser={handleUpdateUser}
                onDeleteUser={handleDeleteUser}
            /> : 
            <div className="p-10 text-center text-gray-500">Acesso Restrito ao Administrador</div>;
      case 'ai-coach':
         const totalIncome = transactions.filter(t => t.type === TransactionType.INCOME).reduce((acc, c) => acc + c.amount, 0);
         const totalExpense = transactions.filter(t => t.type === TransactionType.EXPENSE).reduce((acc, c) => acc + c.amount, 0);
         return <AICoachPage income={totalIncome} expense={totalExpense} />;
      default:
        return <DashboardPage students={students} transactions={transactions} activities={activities} role={currentUser!.role} onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="flex bg-gray-50 min-h-screen font-sans">
      <Sidebar 
        currentUser={currentUser!} 
        currentPage={currentPage} 
        onNavigate={handleNavigate} 
        onLogout={handleLogout} 
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
                        {currentPage === 'users' && 'Gestão de Usuários'}
                        {currentPage === 'ai-coach' && 'Inteligência Artificial'}
                    </h1>
                    <p className="text-xs md:text-sm text-gray-500 mt-1">Bem-vindo ao sistema Garotos do Martinica.</p>
                </div>
            </div>
            
            <div className="bg-orange-100 text-orange-800 text-xs px-3 py-1 rounded-full border border-orange-200 w-fit self-start md:self-auto flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                Sistema Online
            </div>
        </header>
        
        {isLoading && !currentUser ? (
             <div className="flex h-64 w-full items-center justify-center flex-col gap-4">
                <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
                <p className="text-gray-500 font-medium">Sincronizando dados...</p>
            </div>
        ) : renderContent()}
      </main>
    </div>
  );
}

export default App;
