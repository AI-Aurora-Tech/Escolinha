
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
import { Student, Group, Plan, Transaction, Activity, User, UserRole, PaymentStatus, TransactionType, PaymentMethod } from './types';
import { supabase } from './lib/supabaseClient';
import { Menu, Loader2, User as UserIcon, Lock, Users as UsersIcon } from 'lucide-react';
import { checkMPPaymentStatus } from './services/mercadoPago';
import { sendZApiMessage } from './services/zapiService';

// Lista de colunas seguras para evitar erro PGRST204
const TX_SELECT_FIELDS = 'id, description, amount, type, date, status, student_id, plan_id, payment_method, payment_link, external_reference, preference_id';

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
  
  // App State
  const [students, setStudents] = useState<Student[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [systemUsers, setSystemUsers] = useState<User[]>([]);

  // Ref para evitar múltiplas verificações simultâneas do mesmo pagamento
  const checkingRefs = useRef<Set<string>>(new Set());

  // Helper para formatar data DD/MM/AAAA
  const formatFriendlyDate = (dateString: string) => {
    if (!dateString) return '';
    const parts = dateString.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateString;
  };

  // --- DATA FETCHING (Encapsulado para Reuso) ---
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
        const { data: groupsData } = await supabase.from('groups').select('*');
        const { data: plansData } = await supabase.from('plans').select('*');
        const { data: activitiesData } = await supabase.from('activities').select('*');
        
        let studentsData;
        let transactionsData;

        if (currentUser?.role === UserRole.RESPONSAVEL && currentUser.cpf) {
             const { data: allStudents } = await supabase.from('students').select('*');
             const cleanUserCpf = currentUser.cpf.replace(/\D/g, '');
             studentsData = allStudents?.filter((s: any) => {
                 const gCpf = s.guardian?.cpf?.replace(/\D/g, '') || '';
                 return gCpf === cleanUserCpf;
             });

             if (studentsData && studentsData.length > 0) {
                 const studentIds = studentsData.map((s: any) => s.id);
                 const { data: myTxs } = await supabase
                    .from('transactions')
                    .select(TX_SELECT_FIELDS)
                    .in('student_id', studentIds);
                 transactionsData = myTxs;
             } else {
                 transactionsData = [];
             }
        } else {
             const { data: allStudents } = await supabase.from('students').select('*');
             const { data: allTxs } = await supabase.from('transactions').select(TX_SELECT_FIELDS);
             transactionsData = allTxs;
             studentsData = allStudents;
        }

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

        let mappedStudents: Student[] = [];
        if (studentsData) {
             mappedStudents = studentsData.map((s: any) => {
                 let finalGroupIds: string[] = [];
                 if (s.group_ids && Array.isArray(s.group_ids)) {
                     finalGroupIds = s.group_ids;
                 } else if (s.guardian?.system_metadata?.group_ids) {
                     finalGroupIds = s.guardian.system_metadata.group_ids;
                 } else if (s.group_id) {
                     finalGroupIds = [s.group_id];
                 }

                 return {
                     id: s.id,
                     name: s.name,
                     birthDate: s.birth_date,
                     rg: s.rg,
                     cpf: s.cpf,
                     phone: s.phone,
                     medicalCertificateExpiry: s.medical_expiry,
                     photoUrl: s.photo_url,
                     address: s.address, 
                     guardian: s.guardian, 
                     planId: s.plan_id || '',
                     groupIds: finalGroupIds,
                     active: s.active,
                     documents: s.documents 
                 } as Student;
             });
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
             setTransactions(transactionsData.map((t: any) => {
                 const desc = t.description || '';
                 const category = desc.startsWith('[') ? desc.split(']')[0].substring(1) : 'Geral';
                 const paymentDateMatch = desc.match(/\(Pago em (.*?)\)/);
                 const paymentDate = paymentDateMatch ? paymentDateMatch[1] : undefined;

                 return {
                     id: t.id,
                     description: t.description,
                     category: category,
                     amount: t.amount,
                     type: t.type,
                     date: t.date,
                     paymentDate: paymentDate,
                     status: t.status,
                     studentId: t.student_id,
                     planId: t.plan_id,
                     paymentMethod: t.payment_method,
                     paymentLink: t.payment_link,
                     externalReference: t.external_reference, 
                     preferenceId: t.preference_id
                 };
             }));
        }

        if (activitiesData) {
             setActivities(activitiesData.map((a: any) => ({
                 id: a.id,
                 title: a.title,
                 type: a.activity_type || 'TRAINING',
                 fee: a.fee || 0,
                 location: a.location || '',
                 presentationTime: a.presentation_time || '', 
                 opponent: a.opponent || '', 
                 homeScore: a.home_score, 
                 away_score: a.away_score, 
                 scorers: a.scorers || [], 
                 groupId: a.group_id,
                 participants: a.participants || [],
                 date: a.date,
                 startTime: a.start_time,
                 endTime: a.end_time,
                 recurrence: a.recurrence,
                 attendance: a.attendance || [],
                 feePayments: a.fee_payments || [] 
             })));
        }
    } catch (error) {
        console.error("Error fetching data:", error);
    } finally {
        if (!silent) setIsLoading(false);
    }
  }, [currentUser]);

  // --- REALTIME SUBSCRIPTION ---
  useEffect(() => {
    if (!isAuthenticated) return;

    console.log("[Realtime] Tentando conectar...");

    const handleChanges = (payload: any) => {
        console.log(`[Realtime] Mudança em ${payload.table}:`, payload.eventType);
        fetchData(true); 
    };

    // Canal dedicado para o esquema public
    const channel = supabase
      .channel('public-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, handleChanges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, handleChanges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, handleChanges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, handleChanges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plans' }, handleChanges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_users' }, handleChanges)
      .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
              console.log("[Realtime] Conectado e ouvindo mudanças!");
          }
          if (status === 'CHANNEL_ERROR') {
              console.error("[Realtime] Erro de conexão. Verifique o script SQL de publicação.", err);
          }
          if (status === 'TIMED_OUT') {
              console.warn("[Realtime] Conexão expirou. Tentando reconectar...");
          }
      });

    return () => {
      console.log("[Realtime] Removendo ouvintes...");
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, fetchData]);

  // --- BACKGROUND RECONCILIATION ---
  useEffect(() => {
    if (!isAuthenticated || transactions.length === 0) return;

    const reconcilePayments = async () => {
        const pendingWithRefs = transactions.filter(t => 
            t.status === PaymentStatus.PENDING && 
            t.externalReference && 
            !checkingRefs.current.has(t.externalReference)
        );

        if (pendingWithRefs.length === 0) return;

        for (const tx of pendingWithRefs) {
            const ref = tx.externalReference!;
            checkingRefs.current.add(ref);
            
            try {
                const status = await checkMPPaymentStatus(ref);
                if (status === 'approved') {
                    await handleUpdateTransaction({
                        id: tx.id,
                        status: PaymentStatus.PAID,
                        paymentMethod: PaymentMethod.PIX_MERCADO_PAGO,
                        paymentDate: new Date().toISOString().split('T')[0]
                    });
                }
            } catch (e) {
                console.error("Erro na reconciliação:", e);
            } finally {
                setTimeout(() => checkingRefs.current.delete(ref), 10000);
            }
        }
    };

    const interval = setInterval(reconcilePayments, 2 * 60 * 1000); 
    return () => clearInterval(interval);
  }, [isAuthenticated, transactions]);

  // --- INITIAL FETCH ---
  useEffect(() => {
    if (isAuthenticated) {
        fetchData();
    }
  }, [isAuthenticated, fetchData]);

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
                        const user: User = { id: existingUser.id, name: existingUser.name, email: existingUser.email, role: existingUser.role as UserRole, avatar: existingUser.avatar || `https://ui-avatars.com/api/?name=${existingUser.name}`, cpf: existingUser.cpf };
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
          setLoginError('Erro ao validar CPF.');
      } finally {
          setIsLoggingIn(false);
      }
  };

  const handleCreatePassword = async (e: React.FormEvent) => {
      e.preventDefault();
      if (newPassword !== confirmNewPassword) { setLoginError('As senhas não coincidem.'); return; }
      if (newPassword.length < 6) { setLoginError('A senha deve ter pelo menos 6 caracteres.'); return; }
      setIsLoggingIn(true);
      try {
          const newUserPayload = { name: tempGuardianName, email: tempGuardianEmail, password: newPassword, role: UserRole.RESPONSAVEL, cpf: loginCpf, avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(tempGuardianName)}&background=random` };
          const { data, error } = await supabase.from('app_users').insert([newUserPayload]).select().single();
          if (data && !error) {
               const user: User = { id: data.id, name: data.name, email: data.email, role: data.role as UserRole, avatar: data.avatar, cpf: data.cpf };
                setCurrentUser(user);
                setIsAuthenticated(true);
          } else { setLoginError('Erro ao criar usuário.'); }
      } catch (err) { setLoginError('Erro ao registrar senha.'); } finally { setIsLoggingIn(false); }
  };

  const handleLogout = () => {
      setCurrentUser(null); setIsAuthenticated(false); setLoginEmail(''); setLoginPassword(''); setLoginCpf(''); setIsFirstAccess(false); setNewPassword(''); setConfirmNewPassword(''); setCurrentPage('dashboard');
  };

  const handleGenerateGlobalTuitions = async () => {
      const activeStudents = students.filter(s => s.active && s.planId);
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth(); // 0-11
      const monthPrefix = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}`;
      const newTransactionsPayload = [];

      for (const student of activeStudents) {
          const plan = plans.find(p => p.id === student.planId);
          if (!plan) continue;

          const alreadyExists = transactions.some(t => 
              t.studentId === student.id && 
              t.type === TransactionType.INCOME && 
              t.date.startsWith(monthPrefix)
          );

          if (!alreadyExists) {
              const targetDay = plan.dueDay;
              const dateStr = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${targetDay.toString().padStart(2, '0')}`;
              
              const monthName = new Date(currentYear, currentMonth, 1).toLocaleString('pt-BR', { month: 'long' });
              const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
              const description = `[Mensalidade] ${student.name.split(' ')[0]} - ${capitalizedMonth} / ${currentYear}`;

              const externalReference = crypto.randomUUID();
              newTransactionsPayload.push({
                  description: description,
                  amount: plan.price,
                  type: TransactionType.INCOME,
                  date: dateStr,
                  status: PaymentStatus.PENDING,
                  student_id: student.id,
                  plan_id: plan.id,
                  payment_method: PaymentMethod.PIX_MERCADO_PAGO,
                  external_reference: externalReference
              });
          }
      }

      if (newTransactionsPayload.length > 0) {
          const { data, error } = await supabase.from('transactions').insert(newTransactionsPayload).select(TX_SELECT_FIELDS);
          if (data && !error) {
              const mapped = data.map((t: any) => ({
                  id: t.id, 
                  description: t.description, 
                  category: 'Mensalidade',
                  amount: t.amount, 
                  type: t.type, 
                  date: t.date, 
                  paymentDate: undefined,
                  status: t.status, 
                  studentId: t.student_id, 
                  planId: t.plan_id, 
                  paymentMethod: t.payment_method, 
                  externalReference: t.external_reference,
                  paymentLink: t.payment_link,
                  preferenceId: t.preference_id
              }));
              setTransactions(prev => [...prev, ...mapped]);
          }
      }
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
      } catch (err) { return undefined; }
  };

  const handleAddStudent = async (studentData: Omit<Student, 'id'>) => {
    setIsLoading(true);
    let finalPhotoUrl = studentData.photoUrl;
    if (studentData.photoUrl && studentData.photoUrl.startsWith('data:')) {
        finalPhotoUrl = await uploadPhoto(studentData.photoUrl, studentData.name);
    }
    const primaryGroupId = (studentData.groupIds && studentData.groupIds.length > 0) ? studentData.groupIds[0] : null;
    /* Correcting property name access from medical_expiry to medicalCertificateExpiry */
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
        group_ids: studentData.groupIds, 
        group_id: primaryGroupId, 
        active: studentData.active, 
        documents: studentData.documents 
    };
    const { data, error } = await supabase.from('students').insert([payload]).select().single();
    if (data && !error) {
        const studentFromDb = data as any;
        const newStudent: Student = { 
            id: studentFromDb.id, 
            name: studentFromDb.name, 
            birthDate: studentFromDb.birth_date, 
            rg: studentFromDb.rg, 
            cpf: studentFromDb.cpf, 
            phone: studentFromDb.phone, 
            medicalCertificateExpiry: studentFromDb.medical_expiry, 
            photoUrl: studentFromDb.photo_url, 
            address: studentFromDb.address, 
            guardian: studentFromDb.guardian, 
            planId: studentFromDb.plan_id || '', 
            groupIds: studentData.groupIds, 
            active: studentFromDb.active, 
            documents: studentFromDb.documents 
        };
        setStudents(prev => [...prev, newStudent]);
        
        if (studentData.guardian.phone) {
            const msg = `Seja bem-vindo(a) à Garotos do Martinica! ⚽\n\nOlá *${studentData.guardian.name}*, confirmamos a matrícula do(a) atleta *${studentData.name}*.\n\nFicamos felizes em tê-los conosco! Utilize o CPF do responsável para acessar o Portal do Aluno em nosso site.\n\nQualquer dúvida, estamos à disposição.`;
            const sent = await sendZApiMessage(studentData.guardian.phone, msg);
            if (sent) alert(`Mensagem de boas-vindas enviada para ${studentData.guardian.name}!`);
        }

        await handleGenerateGlobalTuitions();
    } else if (error) {
        alert(`Erro ao adicionar aluno: ${error.message || 'Erro desconhecido'}`);
    }
    setIsLoading(false);
  };

  const handleBatchAddStudents = async (studentsData: any[]) => { 
      setIsLoading(true);
      const payload = studentsData.map(s => {
        const primaryGroupId = (s.groupIds && s.groupIds.length > 0) ? s.groupIds[0] : null;
        /* Correcting property names to match Student interface for batch import */
        return { 
            name: s.name, 
            birth_date: s.birthDate || s.birth_date, 
            rg: s.rg, 
            cpf: s.cpf, 
            phone: s.phone, 
            medical_expiry: s.medicalCertificateExpiry || s.medical_expiry, 
            photo_url: s.photoUrl || s.photo_url, 
            address: s.address, 
            guardian: s.guardian, 
            plan_id: s.planId || null, 
            group_ids: s.groupIds || [], 
            group_id: primaryGroupId, 
            active: s.active, 
            documents: s.documents 
        };
      });
      const { data, error } = await supabase.from('students').insert(payload).select();
      if (data && !error) {
          const mapped: Student[] = data.map((d: any, idx: number) => ({ 
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
              planId: d.plan_id || '', 
              groupIds: studentsData[idx].groupIds || [], 
              active: d.active, 
              documents: d.documents 
          }));
          setStudents(prev => [...prev, ...mapped]);
          await handleGenerateGlobalTuitions();
      } else if (error) {
          alert(`Erro na importação em lote: ${error.message}`);
      }
      setIsLoading(false);
  };

  const handleUpdateStudent = async (updatedStudent: Student) => {
      setIsLoading(true);
      let finalPhotoUrl = updatedStudent.photoUrl;
      if (updatedStudent.photoUrl && updatedStudent.photoUrl.startsWith('data:')) {
          finalPhotoUrl = await uploadPhoto(updatedStudent.photoUrl, updatedStudent.name);
      }
      const primaryGroupId = (updatedStudent.groupIds && updatedStudent.groupIds.length > 0) ? updatedStudent.groupIds[0] : null;
      const payload = { name: updatedStudent.name, birth_date: updatedStudent.birthDate, rg: updatedStudent.rg, cpf: updatedStudent.cpf, phone: updatedStudent.phone, medical_expiry: updatedStudent.medicalCertificateExpiry, photo_url: finalPhotoUrl, address: updatedStudent.address, guardian: updatedStudent.guardian, plan_id: updatedStudent.plan_id, group_ids: updatedStudent.groupIds, group_id: primaryGroupId, active: updatedStudent.active, documents: updatedStudent.documents };
      const { error } = await supabase.from('students').update(payload).eq('id', updatedStudent.id);
      if (!error) { 
          setStudents(students.map(s => s.id === updatedStudent.id ? { ...updatedStudent, photoUrl: finalPhotoUrl } : s)); 
      } else {
          alert(`Erro ao atualizar aluno: ${error.message}`);
      }
      setIsLoading(false);
  };
  
  const handleBatchAssignStudents = async (selectedIds: string[], groupId: string) => { 
      setIsLoading(true);
      const selectedSet = new Set(selectedIds);
      const updates = students.map(student => {
          const currentGroups = new Set(student.groupIds || []);
          let changed = false;
          if (selectedSet.has(student.id)) { if (!currentGroups.has(groupId)) { currentGroups.add(groupId); changed = true; } } 
          else { if (currentGroups.has(groupId)) { currentGroups.delete(groupId); changed = true; } }
          if (changed) return { id: student.id, group_ids: Array.from(currentGroups), guardian: student.guardian };
          return null;
      }).filter(Boolean);
      for (const update of updates) {
          if (update) {
             const legacyGroupId = update.group_ids.length > 0 ? update.group_ids[0] : null;
             await supabase.from('students').update({ group_ids: update.group_ids, group_id: legacyGroupId }).eq('id', update.id);
          }
      }
      if (updates.length > 0) {
          const updatesMap = new Map(updates.map(u => [u!.id, u!.group_ids]));
          setStudents(prev => prev.map(s => { if (updatesMap.has(s.id)) { return { ...s, groupIds: updatesMap.get(s.id)! }; } return s; }));
      }
      setIsLoading(false);
  };
  
  const handleAddActivity = async (a: any) => { 
      setIsLoading(true);
      const payloadList = [];
      const basePayload = { title: a.title, activity_type: a.type, fee: a.fee || 0, location: a.location || '', group_id: a.groupId || null, participants: a.participants || [], start_time: a.startTime, end_time: a.endTime, recurrence: a.recurrence, attendance: a.attendance || [], fee_payments: a.fee_payments || [], presentation_time: a.presentationTime, opponent: a.opponent, home_score: a.homeScore ?? 0, away_score: a.awayScore ?? 0, scorers: a.scorers || [] };
      const startDate = new Date(a.date + 'T00:00:00'); 
      const startYear = startDate.getFullYear();
      if (a.recurrence === 'weekly') {
          const current = new Date(startDate);
          while (current.getFullYear() === startYear) {
               payloadList.push({ ...basePayload, date: current.toISOString().split('T')[0] });
               current.setDate(current.getDate() + 7);
          }
      } else { payloadList.push({ ...basePayload, date: a.date }); }
      
      const { data, error } = await supabase.from('activities').insert(payloadList).select();
      if(data && data.length > 0 && !error) {
           const mapped = data.map((newItem: any) => ({ 
               id: newItem.id, 
               title: newItem.title, 
               type: newItem.activity_type, 
               fee: newItem.fee, 
               location: newItem.location, 
               groupId: newItem.group_id, 
               participants: newItem.participants, 
               date: newItem.date, 
               startTime: newItem.start_time, 
               endTime: newItem.end_time, 
               attendance: newItem.attendance || [], 
               feePayments: newItem.fee_payments || [] 
           }));
           setActivities(prev => [...prev, ...mapped]);
           
           if (a.type === 'GAME' && a.fee > 0) {
               const txsPayload: any[] = [];
               const participantsList = a.groupId 
                   ? students.filter(s => s.groupIds?.includes(a.groupId))
                   : students.filter(s => a.participants?.includes(s.id));
               
               data.forEach((insertedAct: any) => {
                   const d = new Date(insertedAct.date + 'T12:00:00');
                   d.setDate(d.getDate() - 1);
                   const dueDate = d.toISOString().split('T')[0];
                   
                   participantsList.forEach(student => {
                       txsPayload.push({
                           description: `[Taxa de Jogo] ${insertedAct.title} - Atleta: ${student.name}`,
                           amount: a.fee,
                           type: TransactionType.INCOME,
                           date: dueDate,
                           status: PaymentStatus.PENDING,
                           student_id: student.id,
                           payment_method: PaymentMethod.PIX_MERCADO_PAGO,
                           external_reference: `game_fee_${insertedAct.id}_${student.id}`
                       });
                   });
               });

               if (txsPayload.length > 0) {
                   await supabase.from('transactions').insert(txsPayload);
               }
           }
      }
      setIsLoading(false);
  };
  
  const handleUpdateActivity = async (a: Activity) => { 
      const original = activities.find(act => act.id === a.id);
      const basePayload: any = { 
          title: a.title, 
          activity_type: a.type, 
          fee: a.fee || 0, 
          location: a.location || '', 
          group_id: a.groupId || null, 
          participants: a.participants || [], 
          date: a.date, 
          start_time: a.startTime, 
          end_time: a.endTime, 
          recurrence: a.recurrence, 
          attendance: a.attendance || [], 
          fee_payments: a.feePayments || [], 
          presentation_time: a.presentation_time, 
          opponent: a.opponent, 
          home_score: a.homeScore ?? 0, 
          away_score: a.awayScore ?? 0, 
          scorers: a.scorers || [] 
      };
      
      const { error } = await supabase.from('activities').update(basePayload).eq('id', a.id);
      if (error) return;

      if (original && original.recurrence === 'weekly') {
          let query = supabase.from('activities').select('*').eq('recurrence', 'weekly').eq('title', original.title).eq('start_time', (original as any).startTime || original.startTime).gt('date', original.date);
           if (original.groupId) query = query.eq('group_id', original.groupId); else query = query.is('group_id', null);
           const { data: futureEvents } = await query;
           
           if (futureEvents && futureEvents.length > 0) {
               const dayDiff = Math.round((new Date(a.date).getTime() - new Date(original.date).getTime()) / (1000 * 3600 * 24));
               const updates = futureEvents.map((evt: any) => {
                   let nextDateStr = evt.date;
                   if (dayDiff !== 0) { 
                       const evtD = new Date(evt.date); 
                       evtD.setDate(evtD.getDate() + dayDiff); 
                       nextDateStr = evtD.toISOString().split('T')[0]; 
                   }
                   return { 
                       id: evt.id, 
                       title: basePayload.title, 
                       activity_type: basePayload.activity_type, 
                       fee: basePayload.fee, 
                       location: basePayload.location, 
                       group_id: basePayload.group_id, 
                       participants: basePayload.participants, 
                       start_time: basePayload.start_time, 
                       end_time: basePayload.end_time, 
                       presentation_time: basePayload.presentation_time, 
                       opponent: basePayload.opponent, 
                       recurrence: basePayload.recurrence, 
                       date: nextDateStr, 
                       attendance: evt.attendance, 
                       fee_payments: evt.fee_payments, 
                       home_score: evt.home_score, 
                       away_score: evt.away_score, 
                       scorers: evt.scorers 
                   } as any;
               });
               
               await supabase.from('activities').upsert(updates);
               const updatesMap = new Map(updates.map((u: any) => [u.id, u]));
               
               setActivities(prev => prev.map(act => {
                   if (act.id === a.id) return a; 
                   if (updatesMap.has(act.id)) {
                       const up = updatesMap.get(act.id) as any;
                       return { 
                           ...act, 
                           title: up.title, 
                           type: up.activity_type, 
                           fee: up.fee, 
                           location: up.location, 
                           startTime: up.start_time, 
                           endTime: up.end_time, 
                           presentationTime: up.presentation_time, 
                           opponent: up.opponent, 
                           recurrence: up.recurrence, 
                           groupId: up.group_id, 
                           participants: up.participants, 
                           date: up.date, 
                           homeScore: up.home_score, 
                           awayScore: up.away_score, 
                           scorers: up.scorers,
                           attendance: up.attendance || [],
                           feePayments: up.fee_payments || []
                       } as Activity;
                   }
                   return act;
               }));
               return; 
           }
      }
      setActivities(prev => prev.map(act => act.id === a.id ? a : act));
  };

  const handleDeleteActivity = async (id: string) => {
      setIsLoading(true);
      const { error } = await supabase.from('activities').delete().eq('id', id);
      if (!error) setActivities(prev => prev.filter(a => a.id !== id));
      setIsLoading(false);
  };
  
  const handleUpdateAttendance = async (aid: string, sid: string) => { 
      const activity = activities.find(a => a.id === aid); if(!activity) return;
      const newAttendance = activity.attendance.includes(sid) ? activity.attendance.filter(id => id !== sid) : [...activity.attendance, sid];
      const { error } = await supabase.from('activities').update({ attendance: newAttendance }).eq('id', aid);
      if(!error) setActivities(prev => prev.map(a => a.id === aid ? { ...a, attendance: newAttendance } : a));
  };

  const handleUpdateFeePayment = async (aid: string, sid: string) => {
      const activity = activities.find(a => a.id === aid); if(!activity) return;
      const current = activity.feePayments || [];
      const isPaidNow = !current.includes(sid);
      const next = isPaidNow ? [...current, sid] : current.filter(id => id !== sid);
      
      const { error } = await supabase.from('activities').update({ fee_payments: next }).eq('id', aid);
      if(!error) {
          setActivities(prev => prev.map(a => a.id === aid ? { ...a, feePayments: next } : a));
          const targetRef = `game_fee_${aid}_${sid}`;
          const linkedTx = transactions.find(t => t.externalReference === targetRef);
          
          if (linkedTx) {
              await handleUpdateTransaction({
                  id: linkedTx.id,
                  status: isPaidNow ? PaymentStatus.PAID : PaymentStatus.PENDING,
                  paymentMethod: isPaidNow ? PaymentMethod.CASH : linkedTx.paymentMethod,
                  paymentDate: isPaidNow ? new Date().toISOString().split('T')[0] : undefined
              });
          }
      }
  };

  const handleAddTransaction = async (t: any) => { 
    try {
      const transactionsToAdd = [];
      const safeVal = (v: any) => (v === '' || v === undefined || v === 'null') ? null : v;
      
      const baseCategory = t.category || 'Geral';
      const baseDescription = baseCategory !== 'Outros' && baseCategory !== 'Geral' 
          ? `[${baseCategory}] ${t.description}` 
          : t.description;

      if (t.type === TransactionType.EXPENSE && t.recurrence === 'MONTHLY') {
          const startDate = new Date(t.date + 'T00:00:00');
          const monthsCount = t.recurrenceMonths || 12;
          for (let i = 0; i < monthsCount; i++) {
              const d = new Date(startDate);
              d.setMonth(startDate.getMonth() + i);
              const dueDateStr = d.toISOString().split('T')[0];
              
              let finalDesc = `${baseDescription} (${i+1}/${monthsCount})`;
              if (i === 0 && t.status === PaymentStatus.PAID && t.paymentDate) {
                  finalDesc += ` (Pago em ${formatFriendlyDate(t.paymentDate)})`;
              }

              transactionsToAdd.push({
                  description: finalDesc,
                  amount: Number(t.amount),
                  type: t.type,
                  date: dueDateStr,
                  status: i === 0 ? t.status : PaymentStatus.PENDING,
                  student_id: null,
                  plan_id: null,
                  payment_method: i === 0 ? safeVal(t.paymentMethod) : null,
                  payment_link: null,
                  external_reference: null,
                  preference_id: null
              });
          }
      } else {
          let finalDesc = baseDescription;
          if (t.status === PaymentStatus.PAID && t.paymentDate) {
              finalDesc += ` (Pago em ${formatFriendlyDate(t.paymentDate)})`;
          }

          transactionsToAdd.push({ 
              description: finalDesc, 
              amount: Number(t.amount), 
              type: t.type, 
              date: t.date, 
              status: t.status, 
              student_id: safeVal(t.studentId), 
              plan_id: safeVal(t.planId), 
              payment_method: safeVal(t.paymentMethod), 
              payment_link: safeVal(t.paymentLink), 
              external_reference: safeVal(t.externalReference),
              // Correcting preference_id to use preferenceId from input t
              preference_id: safeVal(t.preferenceId)
          });
      }

      const { data, error } = await supabase.from('transactions').insert(transactionsToAdd).select(TX_SELECT_FIELDS);
      
      if(error) {
          alert(`Erro ao salvar transação: ${error.message}`);
          return;
      }

      if(data) {
          const mapped = data.map((newTx: any) => ({
              id: newTx.id,
              description: newTx.description,
              category: newTx.description.startsWith('[') ? newTx.description.split(']')[0].substring(1) : 'Geral',
              amount: newTx.amount,
              type: newTx.type,
              date: newTx.date,
              paymentDate: (newTx.description.includes('(Pago em ') ? newTx.description.split('(Pago em ')[1].replace(')', '') : undefined),
              status: newTx.status,
              studentId: newTx.student_id,
              planId: newTx.plan_id,
              paymentMethod: newTx.payment_method,
              paymentLink: newTx.payment_link,
              externalReference: newTx.external_reference,
              preferenceId: newTx.preference_id
          }));
          setTransactions(prev => [...prev, ...mapped]);
      }
    } catch (err: any) {
        alert(`Erro inesperado ao registrar transação.`);
    }
  };
  
  const handleUpdateTransaction = async (t: Partial<Transaction>) => { 
      if (!t.id) return;
      const payload: any = {};
      const safeVal = (v: any) => (v === '' || v === undefined || v === 'null') ? null : v;
      const originalTx = transactions.find(x => x.id === t.id);
      
      if (t.status === PaymentStatus.PAID) {
          if (originalTx && !originalTx.description.includes("(Pago em")) {
              const pDate = t.paymentDate || new Date().toISOString().split('T')[0];
              payload.description = `${originalTx.description} (Pago em ${formatFriendlyDate(pDate)})`;
              
              if (originalTx.studentId) {
                  const student = students.find(s => s.id === originalTx.studentId);
                  if (student && student.guardian.phone) {
                      // Verifica se é taxa de jogo para ajustar o encerramento da mensagem
                      const isGameFee = originalTx.description.includes('[Taxa de Jogo]') || originalTx.externalReference?.startsWith('game_fee_');
                      const footerText = isGameFee ? 'Obrigado!' : 'Agradecemos a parceria! Sua mensalidade está em dia.';
                      
                      const msg = `Olá *${student.guardian.name}*! ⚽\n\nRecebemos o pagamento referente a:\n*${originalTx.description}*\nValor: *R$ ${originalTx.amount.toFixed(2)}*\nData: ${formatFriendlyDate(pDate)}\n\n${footerText}`;
                      sendZApiMessage(student.guardian.phone, msg);
                  }
              }

              const currentExtRef = t.externalReference || originalTx.externalReference;
              if (currentExtRef?.startsWith('game_fee_')) {
                  const parts = currentExtRef.split('_');
                  const activityId = parts[2];
                  const studentId = parts[3];
                  
                  if (activityId && studentId) {
                      const activity = activities.find(act => act.id === activityId);
                      if (activity) {
                          const currentFeePayments = activity.feePayments || [];
                          if (!currentFeePayments.includes(studentId)) {
                              const nextFeePayments = [...currentFeePayments, studentId];
                              await supabase.from('activities').update({ fee_payments: nextFeePayments }).eq('id', activityId);
                          }
                      }
                  }
              }
          }
      } else if (t.description !== undefined) {
          payload.description = t.description;
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
      // Correcting property access error where preference_id was used instead of preferenceId on a Partial<Transaction> type.
      if (t.preferenceId !== undefined) payload.preference_id = safeVal(t.preferenceId);

      const { error } = await supabase.from('transactions').update(payload).eq('id', t.id);
      
      if(error) {
          alert(`Erro ao atualizar transação: ${error.message}`);
      } else {
          setTransactions(prev => prev.map(tx => tx.id === t.id ? { ...tx, ...t, description: payload.description || tx.description } : tx));
      }
  };

  const handleAddGroup = async (g: any): Promise<string | null> => { 
      const { data, error } = await supabase.from('groups').insert([{ name: g.name }]).select().single();
      if(data && !error) { setGroups(prev => [...prev, { ...g, id: data.id }]); return data.id; }
      return null;
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
      const payload = { name: p.name, price: p.price, due_day: p.due_day, description: p.description };
      const { data, error } = await supabase.from('plans').insert([payload]).select().single();
      if(data && !error) setPlans(prev => [...prev, { ...p, id: data.id }]);
  };
  
  const handleUpdatePlan = async (p: any) => { 
      const payload = { name: p.name, price: p.price, due_day: p.due_day, description: p.description };
      const { error } = await supabase.from('plans').update(payload).eq('id', p.id);
      if(!error) setPlans(prev => prev.map(pl => pl.id === p.id ? p : pl));
  };
  
  const handleDeletePlan = async (id: string) => { 
      const { error } = await supabase.from('plans').delete().eq('id', id);
      if(!error) setPlans(prev => prev.filter(p => p.id !== id));
  };
  
  const handleAddUser = async (u: any) => { 
      const { data, error } = await supabase.from('app_users').insert([u]).select().single();
      if(data && !error) setSystemUsers(prev => [...prev, { ...u, id: data.id, cpf: u.cpf }]);
  };
  
  const handleUpdateUser = async (u: any) => { 
      const payload: any = { name: u.name, email: u.email, role: u.role, avatar: u.avatar };
      if(u.password) payload.password = u.password;
      const { error } = await supabase.from('app_users').update(payload).eq('id', u.id);
      if(!error) setSystemUsers(prev => prev.map(us => us.id === u.id ? u : us));
  };
  
  const handleDeleteUser = async (id: string) => { 
      const { error } = await supabase.from('app_users').delete().eq('id', id);
      if(!error) setSystemUsers(prev => prev.filter(u => u.id !== id));
  };
  
  const handleNavigate = (page: string, data?: any) => { setCurrentPage(page); setPageData(data || null); };

  if (!isAuthenticated) {
      return (
          <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-md overflow-hidden">
                  <div className="bg-primary-600 p-8 text-center relative">
                      <div className="inline-flex bg-white/20 p-4 rounded-full mb-4 backdrop-blur-sm">
                          <img src="/logo.svg" alt="Logo" className="w-16 h-16" />
                      </div>
                      <h1 className="text-2xl font-bold text-white mb-1">Garotos do Martinica</h1>
                      <p className="text-primary-100">Portal do Aluno e Gestão</p>
                  </div>
                  <div className="flex border-b border-gray-100">
                      <button className={`flex-1 py-4 text-sm font-semibold transition-colors ${activeLoginTab === 'EMAIL' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}`} onClick={() => { setActiveLoginTab('EMAIL'); setLoginError(''); setIsFirstAccess(false); }}>Admin / Professor</button>
                      <button className={`flex-1 py-4 text-sm font-semibold transition-colors ${activeLoginTab === 'CPF' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}`} onClick={() => { setActiveLoginTab('CPF'); setLoginError(''); setIsFirstAccess(false); }}>Sou Responsável</button>
                  </div>
                  <div className="p-8">
                      {isFirstAccess ? (
                           <form onSubmit={handleCreatePassword} className="space-y-4">
                               <div className="text-center mb-4"><h3 className="font-bold text-gray-800">Primeiro Acesso</h3><p className="text-sm text-gray-500">Olá, <strong>{tempGuardianName}</strong>. Crie uma senha para acessar o portal.</p></div>
                               <div><label className="block text-sm font-medium text-gray-700 mb-1">Nova Senha</label><input type="password" required className="w-full border rounded-lg p-3" placeholder="******" value={newPassword} onChange={e => setNewPassword(e.target.value)} /></div>
                               <div><label className="block text-sm font-medium text-gray-700 mb-1">Confirmar Senha</label><input type="password" required className="w-full border rounded-lg p-3" placeholder="******" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} /></div>
                               {loginError && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg text-center">{loginError}</div>}
                               <button type="submit" disabled={isLoggingIn} className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2">{isLoggingIn ? <Loader2 className="animate-spin" /> : 'Criar Senha e Entrar'}</button>
                           </form>
                      ) : activeLoginTab === 'EMAIL' ? (
                        <form onSubmit={handleEmailLogin} className="space-y-4">
                            <div><label className="block text-sm font-medium text-gray-700 mb-1">Email</label><div className="relative"><UserIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" /><input type="email" required className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500" placeholder="seu@email.com" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} /></div></div>
                            <div><label className="block text-sm font-medium text-gray-700 mb-1">Senha</label><div className="relative"><Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" /><input type="password" required className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500" placeholder="••••••" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} /></div></div>
                            {loginError && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg text-center">{loginError}</div>}
                            <button type="submit" disabled={isLoggingIn} className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2">{isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Entrar no Sistema'}</button>
                        </form>
                      ) : (
                        <form onSubmit={handleCpfCheck} className="space-y-4">
                             <div><label className="block text-sm font-medium text-gray-700 mb-1">CPF do Responsável</label><div className="relative"><UsersIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" /><input type="text" required className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500" placeholder="000.000.000-00" value={loginCpf} onChange={(e) => setLoginCpf(e.target.value)} /></div></div>
                            <div><label className="block text-sm font-medium text-gray-700 mb-1">Senha <span className="text-gray-400 font-normal text-xs">(Deixe em branco no 1º acesso)</span></label><div className="relative"><Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" /><input type="password" placeholder="••••••" className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} /></div></div>
                            {loginError && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg text-center">{loginError}</div>}
                            <button type="submit" disabled={isLoggingIn} className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2">{isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Acessar / Primeiro Acesso'}</button>
                        </form>
                      )}
                      <div className="mt-6 text-center text-xs text-gray-400">© 2024 Garotos do Martinica.</div>
                  </div>
              </div>
          </div>
      );
  }

  const renderContent = () => {
    switch (currentPage) {
      case 'dashboard': return <DashboardPage students={students} transactions={transactions} activities={activities} role={currentUser!.role} onNavigate={handleNavigate} />;
      case 'students': return <StudentsPage students={students} groups={groups} plans={plans} transactions={transactions} activities={activities} onAddStudent={handleAddStudent} onBatchAddStudents={handleBatchAddStudents} onUpdateStudent={handleUpdateStudent} onUpdateTransaction={handleUpdateTransaction} onAddTransaction={handleAddTransaction} onGenerateTuitions={handleGenerateGlobalTuitions} initialFilter={pageData?.filter} currentUser={currentUser} />;
      case 'groups': if (currentUser!.role === UserRole.RESPONSAVEL) return <div className="p-10 text-center text-gray-500">Acesso Restrito</div>; return <GroupsPage groups={groups} students={students} onAddGroup={handleAddGroup} onUpdateGroup={handleUpdateGroup} onDeleteGroup={handleDeleteGroup} onBatchAssignStudents={handleBatchAssignStudents} />;
      case 'plans': if (currentUser!.role !== UserRole.ADMIN) return <div className="p-10 text-center text-gray-500">Acesso Restrito</div>; return <PlansPage plans={plans} onAddPlan={handleAddPlan} onUpdatePlan={handleUpdatePlan} onDeletePlan={handleDeletePlan} />;
      case 'schedule': return <SchedulePage activities={activities} students={students} groups={groups} onAddActivity={handleAddActivity} onUpdateActivity={handleUpdateActivity} onUpdateAttendance={handleUpdateAttendance} onUpdateFeePayment={handleUpdateFeePayment} onDeleteActivity={handleDeleteActivity} currentUser={currentUser} onAddTransaction={handleAddTransaction} transactions={transactions} />;
      case 'finance': return (currentUser!.role === UserRole.ADMIN) ? <FinancePage students={students} transactions={transactions} plans={plans} onAddTransaction={handleAddTransaction} onUpdateTransaction={handleUpdateTransaction} /> : <div className="p-10 text-center text-gray-500">Acesso Restrito</div>;
      case 'users': return currentUser!.role === UserRole.ADMIN ? <UsersPage users={systemUsers} onAddUser={handleAddUser} onUpdateUser={handleUpdateUser} onDeleteUser={handleDeleteUser} /> : <div className="p-10 text-center text-gray-500">Acesso Restrito ao Administrador</div>;
      default: return <DashboardPage students={students} transactions={transactions} activities={activities} role={currentUser!.role} onNavigate={handleNavigate} />;
    }
  };

  const isCheckingReconciliation = checkingRefs.current.size > 0;

  return (
    <div className="flex bg-gray-50 min-h-screen font-sans overflow-x-hidden">
      <Sidebar currentUser={currentUser!} currentPage={currentPage} onNavigate={handleNavigate} onLogout={handleLogout} isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
      <main className="flex-1 md:ml-64 p-4 md:p-8 min-w-0 max-w-full overflow-x-hidden">
        <header className="mb-8 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
            <div className="flex items-center gap-3"><button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden p-2 bg-white rounded-lg shadow-sm border border-gray-200 text-gray-700 hover:bg-gray-50"><Menu className="w-6 h-6" /></button><div><h1 className="text-xl md:text-2xl font-bold text-gray-900">{currentPage === 'dashboard' && 'Visão Geral'}{currentPage === 'students' && (currentUser?.role === UserRole.RESPONSAVEL ? 'Meus Filhos' : 'Gestão de Alunos')}{currentPage === 'groups' && 'Gestão de Grupos'}{currentPage === 'plans' && 'Planos e Mensalidades'}{currentPage === 'schedule' && 'Agenda'}{currentPage === 'finance' && 'Fluxo de Caixa'}{currentPage === 'users' && 'Gestão de Usuários'}</h1></div></div>
            <div className="bg-orange-100 text-orange-800 text-xs px-3 py-1 rounded-full border border-orange-200 w-fit self-start md:self-auto flex items-center gap-2"><div className={`w-2 h-2 rounded-full bg-green-500 ${isCheckingReconciliation ? 'animate-ping' : 'animate-pulse'}`}></div>Sistema Online</div>
        </header>
        {isLoading && !currentUser ? (<div className="flex h-64 w-full items-center justify-center flex-col gap-4"><Loader2 className="w-10 h-10 text-primary-500 animate-spin" /><p className="text-gray-500 font-medium">Sincronizando dados...</p></div>) : renderContent()}
      </main>
    </div>
  );
}

export default App;
