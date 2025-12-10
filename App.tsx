
import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { DashboardPage } from './pages/DashboardPage';
import { StudentsPage } from './pages/StudentsPage';
import { GroupsPage } from './pages/GroupsPage';
import { PlansPage } from './pages/PlansPage';
import { SchedulePage } from './pages/SchedulePage';
import { FinancePage } from './pages/FinancePage';
import { UsersPage } from './pages/UsersPage';
import { InventoryPage } from './pages/InventoryPage'; // Importar nova página
import { Student, UserRole, User, Plan, Group, Activity, Transaction, TransactionType, PaymentStatus, PaymentMethod, InventoryItem } from './types';
import { Menu, Loader2, User as UserIcon, Lock, Users as UsersIcon, Key, X, Check } from 'lucide-react';
import { supabase } from './lib/supabaseClient';
import { createMPPreference } from './services/mercadoPago';

// Helper for safe local date string YYYY-MM-DD without UTC conversion shifts
const getLocalDateStr = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // Login State
  const [activeLoginTab, setActiveLoginTab] = useState<'EMAIL' | 'CPF'>('EMAIL');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  // Login State - Responsável
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

  // Change Password State
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [changePasswordData, setChangePasswordData] = useState({ new: '', confirm: '' });
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  
  // App State
  const [students, setStudents] = useState<Student[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [systemUsers, setSystemUsers] = useState<User[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]); // Novo Estado

  // --- TUITION GENERATION JOB (10 Days Before Rule) ---
  const runTuitionJob = async (currentStudents: Student[], currentPlans: Plan[], currentTransactions: Transaction[]) => {
      // Só roda se for Admin ou Professor
      if (currentUser?.role === UserRole.RESPONSAVEL) return;

      const today = new Date();
      today.setHours(0,0,0,0); // Normalize today to start of day

      const newTransactionsPayload: any[] = [];
      
      // Datas para verificar: Mês Atual e Próximo Mês (Relative to today)
      const monthsToCheck = [0, 1]; 

      for (const student of currentStudents) {
          if (!student.active || !student.planId) continue;
          
          const plan = currentPlans.find(p => p.id === student.planId);
          if (!plan) continue;

          for (const offset of monthsToCheck) {
              // 1. Construct the target Due Date safely in local time
              const checkDate = new Date(today.getFullYear(), today.getMonth() + offset, 1);
              const processingYear = checkDate.getFullYear();
              const processingMonth = checkDate.getMonth();
              
              let dueDay = plan.dueDay;
              const maxDaysInMonth = new Date(processingYear, processingMonth + 1, 0).getDate();
              if (dueDay > maxDaysInMonth) dueDay = maxDaysInMonth;

              const targetDueDate = new Date(processingYear, processingMonth, dueDay);
              targetDueDate.setHours(0,0,0,0);
              
              const targetDueDateStr = getLocalDateStr(targetDueDate);
              const targetMonthPrefix = targetDueDateStr.substring(0, 7); // "YYYY-MM"

              // 2. Calculate Trigger Date (10 days before)
              const triggerDate = new Date(targetDueDate);
              triggerDate.setDate(targetDueDate.getDate() - 10);
              triggerDate.setHours(0,0,0,0);

              // Regra: Se Hoje >= (Vencimento - 10 dias)
              // This covers cases where we passed the trigger date but haven't generated yet
              if (today.getTime() >= triggerDate.getTime()) {
                  
                  // 3. Verify existence (Check if ANY income transaction exists for this student in this Month)
                  // This prevents duplicates if dueDay changed, but ensures monthly billing
                  const alreadyExists = currentTransactions.some(t => 
                      t.studentId === student.id && 
                      t.type === TransactionType.INCOME &&
                      t.date.startsWith(targetMonthPrefix)
                  );

                  const inQueue = newTransactionsPayload.some(t => 
                      t.student_id === student.id && 
                      t.date.startsWith(targetMonthPrefix)
                  );

                  if (!alreadyExists && !inQueue) {
                      // 4. Generate
                      const monthName = targetDueDate.toLocaleString('pt-BR', { month: 'long' });
                      const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
                      // Descrição com Nome do Aluno e Mês
                      const description = `${student.name} - Mensalidade ${capitalizedMonth}/${processingYear}`;
                      
                      const externalReference = crypto.randomUUID();
                      let paymentLink = '';

                      // Try generate link MP
                      try {
                          if (student.guardian.cpf) {
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
                          }
                      } catch (e) { console.warn("Erro silencioso MP Job", e); }

                      newTransactionsPayload.push({
                          description: description,
                          amount: plan.price,
                          type: TransactionType.INCOME,
                          date: targetDueDateStr,
                          status: targetDueDate < today ? PaymentStatus.LATE : PaymentStatus.PENDING,
                          student_id: student.id,
                          plan_id: plan.id,
                          payment_method: PaymentMethod.PIX_MERCADO_PAGO,
                          payment_link: paymentLink,
                          external_reference: externalReference
                      });
                  }
              }
          }
      }

      // Batch Insert
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
                  externalReference: t.external_reference,
                  preferenceId: t.preference_id
              }));
              setTransactions(prev => [...prev, ...mappedTxs]);
              console.log(`Job: Geradas ${mappedTxs.length} novas mensalidades.`);
          } else {
              console.error("Erro no Job de Mensalidades:", error);
          }
      } else {
          console.log("Job: Nenhuma nova mensalidade necessária.");
      }
  };

  const handleManualTuitionJob = async () => {
    setIsLoading(true);
    await runTuitionJob(students, plans, transactions);
    setIsLoading(false);
    alert("Verificação de mensalidades concluída.");
  };

  // --- DATA FETCHING ---
  const fetchData = async () => {
    setIsLoading(true);
    try {
        // Fetch base tables
        const { data: groupsData } = await supabase.from('groups').select('*');
        const { data: plansData } = await supabase.from('plans').select('*');
        const { data: activitiesData } = await supabase.from('activities').select('*');
        const { data: inventoryData } = await supabase.from('inventory').select('*'); // Fetch Inventory
        
        // --- ROLE BASED FETCHING ---
        let studentsData;
        let transactionsData;

        if (currentUser?.role === UserRole.RESPONSAVEL && currentUser.cpf) {
             // 1. Fetch only MY students (children)
             const { data: allStudents } = await supabase.from('students').select('*');
             
             const cleanUserCpf = currentUser.cpf.replace(/\D/g, '');
             studentsData = allStudents?.filter((s: any) => {
                 const gCpf = s.guardian?.cpf?.replace(/\D/g, '') || '';
                 return gCpf === cleanUserCpf;
             });

             // 2. Fetch Transactions only for my students
             if (studentsData && studentsData.length > 0) {
                 const studentIds = studentsData.map((s: any) => s.id);
                 const { data: myTxs } = await supabase
                    .from('transactions')
                    .select('*')
                    .in('student_id', studentIds);
                 transactionsData = myTxs;
             } else {
                 transactionsData = [];
             }

        } else {
             // Admin/Professor - Fetch All
             const { data: allStudents } = await supabase.from('students').select('*');
             const { data: allTxs } = await supabase.from('transactions').select('*');
             studentsData = allStudents;
             transactionsData = allTxs;
        }

        // Only fetch users if admin
        if (currentUser?.role === UserRole.ADMIN) {
            const { data: usersData } = await supabase.from('app_users').select('*');
            if (usersData) {
                setSystemUsers(usersData.map((u: any) => ({
                    id: u.id,
                    name: u.name,
                    email: u.email,
                    role: u.role,
                    avatar: u.avatar,
                    cpf: u.cpf
                })));
            }
        }

        // Mappers to match Typescript Interfaces
        let mappedStudents: Student[] = [];
        let mappedPlans: Plan[] = [];
        let mappedTransactions: Transaction[] = [];

        if (studentsData) {
             mappedStudents = studentsData.map((s: any) => ({
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
            mappedPlans = plansData.map((p: any) => ({
                id: p.id,
                name: p.name,
                price: p.price,
                dueDay: p.due_day,
                description: p.description
            }));
            setPlans(mappedPlans);
        }
        
        if (inventoryData) {
            setInventoryItems(inventoryData.map((i: any) => ({
                id: i.id,
                name: i.name,
                category: i.category,
                size: i.size,
                quantity: i.quantity,
                minQuantity: i.min_quantity,
                salePrice: i.price, // Map existing 'price' to salePrice, assuming standard schema
                costPrice: i.cost_price, // Assuming new column
                supplier: i.supplier // Assuming new column
            })));
        }

        if (transactionsData) {
             mappedTransactions = transactionsData.map((t: any) => ({
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
                 externalReference: t.external_reference, 
                 preferenceId: t.preference_id
             }));
             setTransactions(mappedTransactions);
        }

        if (activitiesData) {
             // Filter activities for parents (only relevant ones)
             let relevantActivities = activitiesData;
             if (currentUser?.role === UserRole.RESPONSAVEL && students) {
                 const studentIds = students.map(s => s.id);
                 const studentGroupIds = students.map(s => s.groupId);
                 relevantActivities = activitiesData.filter((a: any) => 
                    (a.group_id && studentGroupIds.includes(a.group_id)) || 
                    (a.participants && a.participants.some((p: string) => studentIds.includes(p)))
                 );
             }

             setActivities(relevantActivities.map((a: any) => {
                 // UNPACK METADATA FROM DESCRIPTION (JSON fallback)
                 let meta: any = {};
                 try {
                     if (a.description && (a.description.startsWith('{') || a.description.startsWith('['))) {
                         meta = JSON.parse(a.description);
                     }
                 } catch (e) { /* ignore */ }

                 return {
                     id: a.id,
                     title: a.title,
                     // Prioritize metadata (JSON) then column if exists, default to training
                     type: meta.type || a.activity_type || 'TRAINING',
                     opponent: meta.opponent || '', // Extract opponent
                     teamA: meta.teamA || '', // Extract teamA
                     teamB: meta.teamB || '', // Extract teamB
                     fee: meta.fee !== undefined ? meta.fee : (a.fee || 0),
                     location: meta.location || a.location || '',
                     score: meta.score || a.score || '', 
                     goals: meta.goals || a.goals || [], 
                     feePayments: meta.feePayments || a.fee_payments || [], // Unpack feePayments

                     groupId: a.group_id,
                     participants: a.participants || [],
                     date: a.date,
                     startTime: a.start_time,
                     endTime: a.end_time,
                     recurrence: a.recurrence,
                     attendance: a.attendance || [],
                     description: a.description // Keep original
                 };
             }));
        }

        // --- EXECUTE AUTOMATED JOBS ---
        // Run tuition check only if data loaded and user is Staff
        if (currentUser?.role !== UserRole.RESPONSAVEL && mappedStudents.length > 0 && mappedPlans.length > 0) {
            runTuitionJob(mappedStudents, mappedPlans, mappedTransactions);
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
        // Set default page for parents
        if (currentUser?.role === UserRole.RESPONSAVEL) {
            setCurrentPage('students');
        }
    }
  }, [isAuthenticated]);

  // --- LOGIN LOGIC ---
  
  const handleEmailLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoggingIn(true);
      setLoginError('');

      try {
          const { data, error } = await supabase
            .from('app_users')
            .select('*')
            .eq('email', loginEmail)
            .eq('password', loginPassword)
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
              avatar: data.avatar || `https://ui-avatars.com/api/?name=${data.name}`,
              cpf: data.cpf
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

  const handleCpfCheck = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoggingIn(true);
      setLoginError('');
      
      const cleanCpf = loginCpf.replace(/\D/g, ''); 
      
      try {
          const { data: existingUser } = await supabase
            .from('app_users')
            .select('*')
            .eq('cpf', loginCpf) 
            .maybeSingle();
            
          if (existingUser) {
               if (loginPassword) {
                   if (existingUser.password === loginPassword) {
                        const user: User = {
                            id: existingUser.id,
                            name: existingUser.name,
                            email: existingUser.email,
                            role: existingUser.role as UserRole,
                            avatar: existingUser.avatar || `https://ui-avatars.com/api/?name=${existingUser.name}`,
                            cpf: existingUser.cpf
                        };
                        setCurrentUser(user);
                        setIsAuthenticated(true);
                        setIsLoggingIn(false);
                        return;
                   } else {
                       setLoginError('Senha incorreta.');
                       setIsLoggingIn(false);
                       return;
                   }
               } else {
                   setLoginError('Por favor, digite sua senha.');
                   setIsLoggingIn(false);
                   return;
               }
          }

          const { data: studentsData } = await supabase.from('students').select('guardian');
          
          if (studentsData) {
              const matchedStudent = studentsData.find((s: any) => {
                  const gCpf = s.guardian?.cpf?.replace(/\D/g, '');
                  return gCpf === cleanCpf;
              });

              if (matchedStudent) {
                  setIsFirstAccess(true);
                  setTempGuardianName(matchedStudent.guardian.name);
                  setTempGuardianEmail(matchedStudent.guardian.email || `${cleanCpf}@temp.com`);
                  setLoginError('');
                  setIsLoggingIn(false);
                  return;
              }
          }

          setLoginError('CPF não encontrado como responsável cadastrado. Entre em contato com a secretaria.');

      } catch (err) {
          console.error(err);
          setLoginError('Erro ao validar CPF.');
      } finally {
          setIsLoggingIn(false);
      }
  };

  const handleCreatePassword = async (e: React.FormEvent) => {
      e.preventDefault();
      if (newPassword !== confirmNewPassword) {
          setLoginError('As senhas não coincidem.');
          return;
      }
      if (newPassword.length < 6) {
          setLoginError('A senha deve ter pelo menos 6 caracteres.');
          return;
      }

      setIsLoggingIn(true);
      try {
          const newUserPayload = {
              name: tempGuardianName,
              email: tempGuardianEmail,
              password: newPassword,
              role: UserRole.RESPONSAVEL,
              cpf: loginCpf, 
              avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(tempGuardianName)}&background=random`
          };

          const { data, error } = await supabase.from('app_users').insert([newUserPayload]).select().single();

          if (data && !error) {
               const user: User = {
                    id: data.id,
                    name: data.name,
                    email: data.email,
                    role: data.role as UserRole,
                    avatar: data.avatar,
                    cpf: data.cpf
                };
                setCurrentUser(user);
                setIsAuthenticated(true);
          } else {
              setLoginError('Erro ao criar usuário.');
          }

      } catch (err) {
          console.error(err);
          setLoginError('Erro ao registrar senha.');
      } finally {
          setIsLoggingIn(false);
      }
  };
  
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (changePasswordData.new !== changePasswordData.confirm) {
        alert("As senhas não coincidem.");
        return;
    }
    if (changePasswordData.new.length < 6) {
        alert("A senha deve ter pelo menos 6 caracteres.");
        return;
    }

    setIsChangingPassword(true);
    try {
        const { error } = await supabase
            .from('app_users')
            .update({ password: changePasswordData.new })
            .eq('id', currentUser?.id);

        if (error) {
            throw error;
        }

        alert("Senha alterada com sucesso!");
        setIsChangePasswordModalOpen(false);
        setChangePasswordData({ new: '', confirm: '' });
    } catch (err) {
        console.error("Error changing password:", err);
        alert("Erro ao alterar senha. Tente novamente.");
    } finally {
        setIsChangingPassword(false);
    }
  };

  const handleLogout = () => {
      setCurrentUser(null);
      setIsAuthenticated(false);
      setLoginEmail('');
      setLoginPassword('');
      setLoginCpf('');
      setIsFirstAccess(false);
      setNewPassword('');
      setConfirmNewPassword('');
      setCurrentPage('dashboard');
  };

  const uploadPhoto = async (photoDataUrl: string, studentName: string): Promise<string | undefined> => {
      if (!photoDataUrl || !photoDataUrl.startsWith('data:')) return photoDataUrl;
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

  // --- CRUD HANDLERS ---
  
  const handleAddStudent = async (studentData: Omit<Student, 'id'>) => {
    setIsLoading(true);
    let finalPhotoUrl = studentData.photoUrl;
    if (studentData.photoUrl && studentData.photoUrl.startsWith('data:')) {
        finalPhotoUrl = await uploadPhoto(studentData.photoUrl, studentData.name);
    }
    const payload = {
        name: studentData.name,
        birth_date: studentData.birthDate,
        rg: studentData.rg,
        cpf: studentData.cpf,
        phone: studentData.phone,
        medical_expiry: studentData.medicalCertificateExpiry ? studentData.medicalCertificateExpiry : null, 
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
        
        // Em vez de gerar o ano todo, rodamos o job para gerar apenas a próxima se estiver em dia
        if (newStudent.active && newStudent.planId) {
             runTuitionJob([newStudent], plans, transactions);
        }
    } else { alert("Erro ao salvar aluno."); }
    setIsLoading(false);
  };

  const handleBatchAddStudents = async (studentsData: any[]) => { 
      setIsLoading(true);
      const payload = studentsData.map(s => ({
        name: s.name,
        birth_date: s.birthDate,
        rg: s.rg,
        cpf: s.cpf,
        phone: s.phone,
        medical_expiry: s.medicalCertificateExpiry ? s.medicalCertificateExpiry : null,
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
          
          // Trigger automated check
          runTuitionJob(newStudents, plans, transactions);
          
          alert(`${newStudents.length} alunos importados com sucesso!`);
      } else {
          alert("Erro na importação em massa.");
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
          medical_expiry: updatedStudent.medicalCertificateExpiry ? updatedStudent.medicalCertificateExpiry : null,
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
      }
      setIsLoading(false);
  };
  
  const handleBatchAssignStudents = async (ids: string[], gid: string) => { 
      setIsLoading(true);
      const { error } = await supabase.from('students').update({ group_id: gid }).in('id', ids);
      if (!error) {
           setStudents(students.map(s => ids.includes(s.id) ? { ...s, groupId: gid } : s));
      }
      setIsLoading(false);
  };
  
  const handleAddActivity = async (a: any) => { 
      setIsLoading(true);
      const payloadList = [];

      // Robust Sanitization
      const feeValue = (typeof a.fee === 'number' && !isNaN(a.fee)) ? a.fee : 0;
      const locationValue = a.location || '';
      
      // PACK EXTRA FIELDS INTO DESCRIPTION
      const metadata = {
          type: a.type,
          opponent: a.opponent || '', // Pack opponent
          teamA: a.teamA || '', // Pack teamA
          teamB: a.teamB || '', // Pack teamB
          fee: feeValue,
          location: locationValue,
          score: a.score || '',
          goals: a.goals || [],
          feePayments: []
      };

      const basePayload = {
          title: a.title,
          description: JSON.stringify(metadata), 
          group_id: a.groupId || null,
          participants: a.participants || [],
          start_time: a.startTime,
          end_time: a.endTime,
          recurrence: a.recurrence,
          attendance: [],
          fee_payments: [] 
      };

      const startDate = new Date(a.date + 'T00:00:00'); // Use local time to prevent day shift
      const startYear = startDate.getFullYear();

      // Se for recorrente, gerar para o resto do ano
      if (a.recurrence === 'weekly') {
          const current = new Date(startDate);
          while (current.getFullYear() === startYear) {
               const dateStr = getLocalDateStr(current);
               payloadList.push({
                   ...basePayload,
                   date: dateStr
               });
               // Adicionar 7 dias
               current.setDate(current.getDate() + 7);
          }
      } else {
          // Atividade pontual
          payloadList.push({
              ...basePayload,
              date: a.date
          });
      }
      
      const { data, error } = await supabase.from('activities').insert(payloadList).select();
      
      if(data && !error) {
           const newActivities = data.map((newItem: any) => ({
               ...a,
               id: newItem.id,
               date: newItem.date,
               // CRITICAL: Initialize arrays to prevent white screen crash on render
               attendance: [],
               feePayments: [],
               participants: a.participants || [],
               score: newItem.score || '',
               goals: newItem.goals || []
           }));
           setActivities(prev => [...prev, ...newActivities]);
      } else {
          console.error("Supabase Error:", error);
          alert(`Erro ao agendar atividades: ${error?.message || 'Erro desconhecido'}`);
      }
      setIsLoading(false);
  };
  
  const handleUpdateActivity = async (a: any) => { 
      // 1. Encontrar a atividade existente para preservar arrays que não vêm no form de edição
      const existingActivity = activities.find(act => act.id === a.id);
      if (!existingActivity) return;

      // 2. Mesclar arrays existentes se 'a' não os tiver
      const finalParticipants = a.participants || existingActivity.participants || [];
      const finalAttendance = a.attendance || existingActivity.attendance || [];
      const finalFeePayments = a.feePayments || existingActivity.feePayments || [];
      const finalScore = a.score !== undefined ? a.score : (existingActivity.score || '');
      const finalGoals = a.goals !== undefined ? a.goals : (existingActivity.goals || []);

      // Robust Sanitization
      const feeValue = (typeof a.fee === 'number' && !isNaN(a.fee)) ? a.fee : 0;
      const locationValue = a.location || '';
      
      // Pack into description
      const metadata = {
          type: a.type,
          opponent: a.opponent || '', 
          teamA: a.teamA || '', 
          teamB: a.teamB || '', 
          fee: feeValue,
          location: locationValue,
          score: finalScore,
          goals: finalGoals,
          feePayments: finalFeePayments
      };

      const payload = {
          title: a.title,
          description: JSON.stringify(metadata),
          group_id: a.groupId || null,
          participants: finalParticipants,
          date: a.date,
          start_time: a.startTime,
          end_time: a.endTime,
          recurrence: a.recurrence,
          attendance: finalAttendance,
      };
      
      const { error } = await supabase.from('activities').update(payload).eq('id', a.id);
      
      if(!error) {
          // Update local state by merging
          setActivities(prev => prev.map(act => act.id === a.id ? { 
              ...act, 
              ...a,
              participants: finalParticipants,
              attendance: finalAttendance,
              feePayments: finalFeePayments,
              score: finalScore,
              goals: finalGoals
          } : act));
      } else {
          console.error("Supabase Update Error:", error);
          alert(`Erro ao atualizar atividade: ${error?.message || 'Erro desconhecido'}`);
      }
  };

  const handleDeleteActivity = async (id: string) => {
      setIsLoading(true);
      const { error } = await supabase.from('activities').delete().eq('id', id);
      if (!error) {
          setActivities(prev => prev.filter(a => a.id !== id));
      } else {
          alert("Erro ao excluir atividade.");
      }
      setIsLoading(false);
  };
  
  const handleUpdateAttendance = async (aid: string, sid: string) => { 
      const activity = activities.find(a => a.id === aid);
      if(!activity) return;
      
      // Safety check
      const currentAttendance = activity.attendance || [];

      const newAttendance = currentAttendance.includes(sid) 
        ? currentAttendance.filter(id => id !== sid)
        : [...currentAttendance, sid];
      
      const { error } = await supabase.from('activities').update({ attendance: newAttendance }).eq('id', aid);
      if(!error) {
          setActivities(prev => prev.map(a => a.id === aid ? { ...a, attendance: newAttendance } : a));
      }
  };

  const handleUpdateFeePayment = async (aid: string, sid: string) => {
      const activity = activities.find(a => a.id === aid);
      if(!activity) return;

      // Inicializa feePayments se não existir
      const currentFeePayments = activity.feePayments || [];
      
      const newFeePayments = currentFeePayments.includes(sid)
        ? currentFeePayments.filter(id => id !== sid)
        : [...currentFeePayments, sid];
        
      // Pack into metadata because column might not exist
      const metadata = {
          type: activity.type,
          opponent: activity.opponent,
          teamA: activity.teamA,
          teamB: activity.teamB,
          fee: activity.fee,
          location: activity.location,
          score: activity.score,
          goals: activity.goals,
          feePayments: newFeePayments
      };

      const { error } = await supabase.from('activities').update({ description: JSON.stringify(metadata) }).eq('id', aid);
      if(!error) {
          setActivities(prev => prev.map(a => a.id === aid ? { ...a, feePayments: newFeePayments } : a));
      }
  };

  const handleAddTransaction = async (t: any) => { 
      const payload = {
          description: t.description,
          amount: t.amount,
          type: t.type,
          date: t.date,
          status: t.status,
          student_id: t.studentId || null,
          plan_id: t.plan_id || null,
          payment_method: t.paymentMethod,
          payment_link: t.payment_link,
          // Mapeamento correto: App (camelCase) -> Banco (snake_case)
          external_reference: t.externalReference
      };
      const { data, error } = await supabase.from('transactions').insert([payload]).select().single();
      if(data && !error) {
          setTransactions(prev => [...prev, { ...t, id: data.id }]);
      } else {
          console.error("Erro ao adicionar transação:", error);
      }
  };
  
  const handleUpdateTransaction = async (t: any) => { 
      const payload = {
          description: t.description,
          amount: t.amount,
          type: t.type,
          date: t.date,
          status: t.status,
          student_id: t.studentId || null,
          plan_id: t.plan_id || null,
          payment_method: t.paymentMethod,
          payment_link: t.payment_link
      };
      const { error } = await supabase.from('transactions').update(payload).eq('id', t.id);
      if(!error) {
          setTransactions(prev => prev.map(tx => tx.id === t.id ? t : tx));
      }
  };

  const handleAddGroup = async (g: any) => { 
      const { data, error } = await supabase.from('groups').insert([{ name: g.name }]).select().single();
      if(data && !error) setGroups(prev => [...prev, { ...g, id: data.id }]);
  };
  
  const handleUpdateGroup = async (g: any) => { 
      const { error } = await supabase.from('groups').update({ name: g.name }).eq('id', g.id);
      if(!error) setGroups(prev => prev.map(gr => gr.id === g.id ? g : gr));
  };
  
  const handleDeleteGroup = async (id: string) => { 
      const { error } = await supabase.from('groups').delete().eq('id', id);
      if(!error) setGroups(prev => prev.filter(g => g.id !== id));
  };
  
  const handleAddPlan = async (p: any) => { 
      const payload = { name: p.name, price: p.price, due_day: p.dueDay, description: p.description };
      const { data, error } = await supabase.from('plans').insert([payload]).select().single();
      if(data && !error) setPlans(prev => [...prev, { ...p, id: data.id }]);
  };
  
  const handleUpdatePlan = async (p: any) => { 
      const payload = { name: p.name, price: p.price, due_day: p.dueDay, description: p.description };
      const { error } = await supabase.from('plans').update(payload).eq('id', p.id);
      if(!error) setPlans(prev => prev.map(pl => pl.id === p.id ? p : pl));
  };
  
  const handleDeletePlan = async (id: string) => { 
      const { error } = await supabase.from('plans').delete().eq('id', id);
      if(!error) setPlans(prev => prev.filter(p => p.id !== id));
  };
  
  const handleAddUser = async (u: any) => { 
      const { data, error } = await supabase.from('app_users').insert([u]).select().single();
      if(data && !error) {
          setSystemUsers(prev => [...prev, { ...u, id: data.id, cpf: u.cpf }]);
      }
  };
  
  const handleUpdateUser = async (u: any) => { 
      // Remove password if empty to not overwrite
      const payload: any = { name: u.name, email: u.email, role: u.role, avatar: u.avatar };
      if(u.password) payload.password = u.password;
      
      const { error } = await supabase.from('app_users').update(payload).eq('id', u.id);
      if(!error) {
          setSystemUsers(prev => prev.map(us => us.id === u.id ? u : us));
      }
  };
  
  const handleDeleteUser = async (id: string) => { 
      const { error } = await supabase.from('app_users').delete().eq('id', id);
      if(!error) setSystemUsers(prev => prev.filter(u => u.id !== id));
  };

  // --- INVENTORY HANDLERS ---
  const handleAddInventoryItem = async (item: Omit<InventoryItem, 'id'>) => {
      const payload = {
          name: item.name,
          category: item.category,
          size: item.size,
          quantity: item.quantity,
          min_quantity: item.minQuantity,
          price: item.salePrice, // Mapping salePrice to DB 'price' column for compatibility
          cost_price: item.costPrice, // Using cost_price column
          supplier: item.supplier // Using supplier column
      };
      
      // Note: If columns don't exist in DB, Supabase might ignore them or error. 
      // This implementation assumes the schema update was applied.
      const { data, error } = await supabase.from('inventory').insert([payload]).select().single();
      if(data && !error) {
          setInventoryItems(prev => [...prev, { 
              ...item, 
              id: data.id,
              salePrice: item.salePrice, 
              costPrice: item.costPrice,
              supplier: item.supplier
          }]);
      } else {
          console.error("Erro ao adicionar item:", error);
      }
  };

  const handleUpdateInventoryItem = async (item: InventoryItem) => {
      const payload = {
          name: item.name,
          category: item.category,
          size: item.size,
          quantity: item.quantity,
          min_quantity: item.minQuantity,
          price: item.salePrice,
          cost_price: item.costPrice,
          supplier: item.supplier
      };
      const { error } = await supabase.from('inventory').update(payload).eq('id', item.id);
      if(!error) {
          setInventoryItems(prev => prev.map(i => i.id === item.id ? item : i));
      } else {
          console.error("Erro ao atualizar item:", error);
      }
  };

  const handleDeleteInventoryItem = async (id: string) => {
      const { error } = await supabase.from('inventory').delete().eq('id', id);
      if(!error) {
          setInventoryItems(prev => prev.filter(i => i.id !== id));
      }
  };
  
  const handleNavigate = (page: string, data?: any) => { setCurrentPage(page); setPageData(data || null); };

  // --- LOGIN SCREEN RENDER ---
  if (!isAuthenticated) {
      return (
          <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                  <div className="bg-primary-600 p-8 text-center relative">
                      <div className="inline-flex bg-white/20 p-4 rounded-full mb-4 backdrop-blur-sm">
                          <img src="/logo.svg" alt="Logo" className="w-16 h-16" />
                      </div>
                      <h1 className="text-2xl font-bold text-white mb-1">Garotos do Martinica</h1>
                      <p className="text-primary-100">Portal do Aluno e Gestão</p>
                  </div>
                  
                  {/* TABS */}
                  <div className="flex border-b border-gray-100">
                      <button 
                        className={`flex-1 py-4 text-sm font-semibold transition-colors ${activeLoginTab === 'EMAIL' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
                        onClick={() => { setActiveLoginTab('EMAIL'); setLoginError(''); setIsFirstAccess(false); }}
                      >
                          Admin / Professor
                      </button>
                      <button 
                        className={`flex-1 py-4 text-sm font-semibold transition-colors ${activeLoginTab === 'CPF' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
                        onClick={() => { setActiveLoginTab('CPF'); setLoginError(''); setIsFirstAccess(false); }}
                      >
                          Sou Responsável
                      </button>
                  </div>

                  <div className="p-8">
                      {isFirstAccess ? (
                           <form onSubmit={handleCreatePassword} className="space-y-4">
                               <div className="text-center mb-4">
                                   <h3 className="font-bold text-gray-800">Primeiro Acesso</h3>
                                   <p className="text-sm text-gray-500">Olá, <strong>{tempGuardianName}</strong>. Crie uma senha para acessar o portal.</p>
                               </div>
                               <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Nova Senha</label>
                                  <input type="password" required className="w-full border rounded-lg p-3" placeholder="******" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                                </div>
                               <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar Senha</label>
                                  <input type="password" required className="w-full border rounded-lg p-3" placeholder="******" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} />
                               </div>
                               {loginError && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg text-center">{loginError}</div>}
                               <button type="submit" disabled={isLoggingIn} className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2">
                                  {isLoggingIn ? <Loader2 className="animate-spin" /> : 'Criar Senha e Entrar'}
                               </button>
                           </form>
                      ) : activeLoginTab === 'EMAIL' ? (
                        <form onSubmit={handleEmailLogin} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                <div className="relative">
                                    <UserIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                    <input type="email" required className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500" placeholder="seu@email.com" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                    <input type="password" required className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500" placeholder="••••••" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
                                </div>
                            </div>
                            {loginError && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg text-center">{loginError}</div>}
                            <button type="submit" disabled={isLoggingIn} className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2">
                                {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Entrar no Sistema'}
                            </button>
                        </form>
                      ) : (
                        <form onSubmit={handleCpfCheck} className="space-y-4">
                             <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">CPF do Responsável</label>
                                <div className="relative">
                                    <UsersIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                    <input 
                                        type="text" 
                                        required 
                                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500" 
                                        placeholder="000.000.000-00" 
                                        value={loginCpf} 
                                        onChange={(e) => setLoginCpf(e.target.value)} 
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Senha <span className="text-gray-400 font-normal text-xs">(Deixe em branco no 1º acesso)</span></label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                    <input 
                                        type="password" 
                                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500" 
                                        placeholder="••••••" 
                                        value={loginPassword} 
                                        onChange={(e) => setLoginPassword(e.target.value)} 
                                    />
                                </div>
                            </div>
                            {loginError && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg text-center">{loginError}</div>}
                            <button type="submit" disabled={isLoggingIn} className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2">
                                {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Acessar / Primeiro Acesso'}
                            </button>
                        </form>
                      )}
                      
                      <div className="mt-6 text-center text-xs text-gray-400">
                          © 2024 Garotos do Martinica.
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
                  onAddTransaction={handleAddTransaction}
                  initialFilter={pageData?.filter}
                  currentUser={currentUser}
               />;
      case 'groups':
        // Responsável can't edit groups
        if (currentUser!.role === UserRole.RESPONSAVEL) return <div className="p-10 text-center text-gray-500">Acesso Restrito</div>;
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
                  onUpdateFeePayment={handleUpdateFeePayment}
                  onDeleteActivity={handleDeleteActivity}
                  currentUser={currentUser}
               />;
      case 'inventory':
         if (currentUser!.role === UserRole.RESPONSAVEL) return <div className="p-10 text-center text-gray-500">Acesso Restrito</div>;
         return <InventoryPage
                  items={inventoryItems}
                  onAddItem={handleAddInventoryItem}
                  onUpdateItem={handleUpdateInventoryItem}
                  onDeleteItem={handleDeleteInventoryItem}
              />;
      case 'finance':
        return (currentUser!.role === UserRole.ADMIN) ? 
            <FinancePage 
                transactions={transactions} 
                plans={plans} 
                students={students}
                onAddTransaction={handleAddTransaction} 
                onUpdateTransaction={handleUpdateTransaction}
                onRunTuitionJob={handleManualTuitionJob}
            /> : 
            <div className="p-10 text-center text-gray-500">Acesso Restrito</div>;
      case 'users':
        return currentUser!.role === UserRole.ADMIN ? 
            <UsersPage 
                users={systemUsers} 
                onAddUser={handleAddUser}
                onUpdateUser={handleUpdateUser}
                onDeleteUser={handleDeleteUser}
            /> : 
            <div className="p-10 text-center text-gray-500">Acesso Restrito ao Administrador</div>;
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
        onChangePassword={() => setIsChangePasswordModalOpen(true)}
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
                        {currentPage === 'dashboard' && 'Visão Geral'}
                        {currentPage === 'students' && (currentUser?.role === UserRole.RESPONSAVEL ? 'Meus Filhos' : 'Gestão de Alunos')}
                        {currentPage === 'groups' && 'Gestão de Grupos'}
                        {currentPage === 'plans' && 'Planos e Mensalidades'}
                        {currentPage === 'schedule' && 'Agenda'}
                        {currentPage === 'inventory' && 'Controle de Estoque'}
                        {currentPage === 'finance' && 'Fluxo de Caixa'}
                        {currentPage === 'users' && 'Gestão de Usuários'}
                    </h1>
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

      {/* Change Password Modal */}
      {isChangePasswordModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                          <Key className="w-5 h-5 text-primary-600" /> Alterar Senha
                      </h3>
                      <button onClick={() => setIsChangePasswordModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                          <X className="w-5 h-5" />
                      </button>
                  </div>
                  
                  <form onSubmit={handleChangePassword} className="space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Nova Senha</label>
                          <input 
                              type="password" 
                              required
                              className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary-500"
                              placeholder="Mínimo 6 caracteres"
                              value={changePasswordData.new}
                              onChange={(e) => setChangePasswordData({...changePasswordData, new: e.target.value})}
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar Nova Senha</label>
                          <input 
                              type="password" 
                              required
                              className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary-500"
                              placeholder="Repita a senha"
                              value={changePasswordData.confirm}
                              onChange={(e) => setChangePasswordData({...changePasswordData, confirm: e.target.value})}
                          />
                      </div>
                      
                      <div className="pt-2">
                          <button 
                              type="submit" 
                              disabled={isChangingPassword}
                              className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                              {isChangingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                              Atualizar Senha
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
}

export default App;
