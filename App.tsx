
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
                 awayScore: a.away_score, 
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

    const handleChanges = (payload: any) => {
        fetchData(true); 
    };

    const channel = supabase
      .channel('public-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, handleChanges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, handleChanges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, handleChanges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, handleChanges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plans' }, handleChanges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_users' }, handleChanges)
      .subscribe();

    return () => {
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
        setLoginError('Credenciais inválidas.');
      } else {
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
      }
    } catch (err) {
      setLoginError('Erro ao realizar login.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleCpfLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');
    try {
      const cleanCpf = loginCpf.replace(/\D/g, '');
      const { data, error } = await supabase
        .from('students')
        .select('guardian')
        .filter('guardian->>cpf', 'eq', cleanCpf)
        .limit(1);

      if (error || !data || data.length === 0) {
        setLoginError('Responsável não encontrado para este CPF.');
      } else {
        const guardian = data[0].guardian;
        setCurrentUser({
          id: cleanCpf,
          name: guardian.name,
          email: guardian.email || '',
          role: UserRole.RESPONSAVEL,
          avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(guardian.name)}&background=random`,
          cpf: cleanCpf
        });
        setIsAuthenticated(true);
      }
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
      const payload = { name: updatedStudent.name, birth_date: updatedStudent.birthDate, rg: updatedStudent.rg, cpf: updatedStudent.cpf, phone: updatedStudent.phone, medical_expiry: updatedStudent.medicalCertificateExpiry, photo_url: finalPhotoUrl, address: updatedStudent.address, guardian: updatedStudent.guardian, plan_id: updatedStudent.planId, group_ids: updatedStudent.groupIds, group_id: primaryGroupId, active: updatedStudent.active, documents: updatedStudent.documents };
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
      const startDate = new Date(a.date + 'T00:00:00'); 
      const startYear = startDate.getFullYear();

      // Snapshot inicial: Captura todos os atletas ativos do grupo NO MOMENTO do agendamento
      // Isso impede que mudanças futuras no grupo alterem quem deveria estar no jogo hoje.
      let initialParticipants = a.participants || [];
      if (a.groupId && initialParticipants.length === 0) {
          initialParticipants = students
            .filter(s => s.active && (s.groupIds || []).includes(a.groupId))
            .map(s => s.id);
      }

      const basePayload = { 
          title: a.title, 
          activity_type: a.type, 
          fee: a.fee || 0, 
          location: a.location || '', 
          group_id: a.groupId || null, 
          participants: initialParticipants, 
          start_time: a.startTime, 
          end_time: a.endTime, 
          recurrence: a.recurrence, 
          attendance: a.attendance || [], 
          fee_payments: a.fee_payments || [], 
          presentation_time: a.presentationTime, 
          opponent: a.opponent, 
          home_score: a.homeScore ?? null, 
          away_score: a.awayScore ?? null, 
          scorers: a.scorers || [] 
      };

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
               feePayments: newItem.fee_payments || [],
               homeScore: newItem.home_score,
               awayScore: newItem.away_score,
               scorers: newItem.scorers || [],
               presentationTime: newItem.presentation_time
           }));
           setActivities(prev => [...prev, ...mapped]);
      }
      setIsLoading(false);
  };
  
  const handleUpdateActivity = async (a: Activity) => { 
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
          presentation_time: a.presentationTime, 
          opponent: a.opponent, 
          home_score: (typeof a.homeScore === 'number') ? a.homeScore : null, 
          away_score: (typeof a.awayScore === 'number') ? a.awayScore : null, 
          scorers: a.scorers || [] 
      };
      
      const { error } = await supabase.from('activities').update(basePayload).eq('id', a.id);
      if (!error) fetchData(true);
  };

  const handleUpdateAttendance = async (aid: string, sid: string) => { 
      const activity = activities.find(a => a.id === aid); if(!activity) return;
      const newAttendance = activity.attendance.includes(sid) ? activity.attendance.filter(id => id !== sid) : [...activity.attendance, sid];
      
      const updates: any = { attendance: newAttendance };
      // Se o aluno interagiu (presença), garante que ele esteja "ancorado" no snapshot de participantes
      if (!activity.participants?.includes(sid)) {
          updates.participants = [...(activity.participants || []), sid];
      }
      const { error } = await supabase.from('activities').update(updates).eq('id', aid);
      if(!error) setActivities(prev => prev.map(a => a.id === aid ? { ...a, ...updates } : a));
  };

  const handleUpdateFeePayment = async (aid: string, sid: string) => {
      const activity = activities.find(a => a.id === aid); if(!activity) return;
      const current = activity.feePayments || [];
      const isPaidNow = !current.includes(sid);
      const next = isPaidNow ? [...current, sid] : current.filter(id => id !== sid);
      
      const updates: any = { fee_payments: next };
      // Garante ancoragem no snapshot se houver pagamento
      if (!activity.participants?.includes(sid)) {
          updates.participants = [...(activity.participants || []), sid];
      }
      const { error } = await supabase.from('activities').update(updates).eq('id', aid);
      if(!error) {
          setActivities(prev => prev.map(a => a.id === aid ? { ...a, ...updates } : a));
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

  const handleDeleteActivity = async (id: string) => {
      setIsLoading(true);
      const { error } = await supabase.from('activities').delete().eq('id', id);
      if (!error) setActivities(prev => prev.filter(a => a.id !== id));
      setIsLoading(false);
  };

  const handleAddTransaction = async (t: any) => { 
    const { error } = await supabase.from('transactions').insert([t]);
    if (!error) fetchData(true);
  };

  const handleUpdateTransaction = async (t: Partial<Transaction>) => { 
      if (!t.id) return;
      const { error } = await supabase.from('transactions').update(t).eq('id', t.id);
      if (!error) fetchData(true);
  };

  const handleAddGroup = async (g: any): Promise<string | null> => { 
      const { data, error } = await supabase.from('groups').insert([{ name: g.name }]).select().single();
      if(data && !error) { fetchData(true); return data.id; }
      return null;
  };
  
  const handleUpdateGroup = async (g: any) => { 
      const { error } = await supabase.from('groups').update({ name: g.name }).eq('id', g.id);
      if(!error) fetchData(true);
  };
  
  const handleDeleteGroup = async (id: string) => { 
      const { error } = await supabase.from('groups').delete().eq('id', id);
      if(!error) fetchData(true);
  };

  const handleLogoutAdmin = () => { setCurrentUser(null); setIsAuthenticated(false); setCurrentPage('dashboard'); };
  const handleNavigate = (page: string, data?: any) => { setCurrentPage(page); setPageData(data || null); };

  if (!isAuthenticated) {
      return (
          <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                  <div className="bg-primary-600 p-8 text-center relative">
                      <h1 className="text-2xl font-bold text-white mb-1">Garotos do Martinica</h1>
                      <p className="text-primary-100">Portal do Aluno e Gestão</p>
                  </div>
                  <div className="flex border-b border-gray-100">
                      <button className={`flex-1 py-4 text-sm font-semibold transition-colors ${activeLoginTab === 'EMAIL' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500'}`} onClick={() => setActiveLoginTab('EMAIL')}>Admin / Professor</button>
                      <button className={`flex-1 py-4 text-sm font-semibold transition-colors ${activeLoginTab === 'CPF' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500'}`} onClick={() => setActiveLoginTab('CPF')}>Responsável</button>
                  </div>
                  <div className="p-8">
                      {activeLoginTab === 'EMAIL' ? (
                        <form onSubmit={handleEmailLogin} className="space-y-4">
                            <input type="email" required className="w-full p-3 border rounded-lg" placeholder="Email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} />
                            <input type="password" required className="w-full p-3 border rounded-lg" placeholder="Senha" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
                            {loginError && <div className="text-red-600 text-sm">{loginError}</div>}
                            <button type="submit" disabled={isLoggingIn} className="w-full bg-primary-600 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2">
                                {isLoggingIn ? <Loader2 className="animate-spin" /> : 'Entrar'}
                            </button>
                        </form>
                      ) : (
                        <form onSubmit={handleCpfLogin} className="space-y-4">
                            <input type="text" required className="w-full p-3 border rounded-lg" placeholder="Seu CPF (Somente números)" value={loginCpf} onChange={e => setLoginCpf(e.target.value)} />
                            {loginError && <div className="text-red-600 text-sm">{loginError}</div>}
                            <button type="submit" disabled={isLoggingIn} className="w-full bg-primary-600 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2">
                                {isLoggingIn ? <Loader2 className="animate-spin" /> : 'Acessar Portal'}
                            </button>
                        </form>
                      )}
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="flex bg-gray-50 min-h-screen font-sans overflow-x-hidden">
      <Sidebar currentUser={currentUser!} currentPage={currentPage} onNavigate={handleNavigate} onLogout={handleLogout} isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
      <main className="flex-1 md:ml-64 p-4 md:p-8">
        <header className="mb-8 flex justify-between items-center">
            <div className="flex items-center gap-3">
                <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden p-2 bg-white rounded-lg border text-gray-700"><Menu /></button>
                <h1 className="text-xl md:text-2xl font-bold text-gray-900">Garotos do Martinica</h1>
            </div>
        </header>
        {isLoading ? (<div className="flex h-64 w-full items-center justify-center"><Loader2 className="animate-spin" /></div>) : (
            <>
                {currentPage === 'dashboard' && <DashboardPage students={students} transactions={transactions} activities={activities} role={currentUser!.role} onNavigate={handleNavigate} />}
                {currentPage === 'students' && <StudentsPage students={students} groups={groups} plans={plans} transactions={transactions} activities={activities} onAddStudent={handleAddStudent} onBatchAddStudents={handleBatchAddStudents} onUpdateStudent={handleUpdateStudent} onUpdateTransaction={handleUpdateTransaction} onAddTransaction={handleAddTransaction} onGenerateTuitions={handleGenerateGlobalTuitions} initialFilter={pageData?.filter} currentUser={currentUser} />}
                {currentPage === 'groups' && <GroupsPage groups={groups} students={students} onAddGroup={handleAddGroup} onUpdateGroup={handleUpdateGroup} onDeleteGroup={handleDeleteGroup} onBatchAssignStudents={handleBatchAssignStudents} />}
                {currentPage === 'schedule' && <SchedulePage activities={activities} students={students} groups={groups} onAddActivity={handleAddActivity} onUpdateActivity={handleUpdateActivity} onUpdateAttendance={handleUpdateAttendance} onUpdateFeePayment={handleUpdateFeePayment} onDeleteActivity={handleDeleteActivity} currentUser={currentUser} onAddTransaction={handleAddTransaction} onUpdateTransaction={handleUpdateTransaction} transactions={transactions} />}
                {currentPage === 'finance' && <FinancePage students={students} transactions={transactions} plans={plans} onAddTransaction={handleAddTransaction} onUpdateTransaction={handleUpdateTransaction} />}
            </>
        )}
      </main>
    </div>
  );
}

export default App;
