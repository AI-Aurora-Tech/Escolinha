
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
import { Student, Group, Plan, Transaction, Activity, User, UserRole, PaymentStatus, TransactionType, PaymentMethod, Occurrence } from './types';
import { supabase } from './lib/supabaseClient';
import { Menu, Loader2, User as UserIcon, Lock, Users as UsersIcon } from 'lucide-react';
import { checkMPPaymentStatus } from './services/mercadoPago';
import { sendZApiMessage, sendZApiDocument } from './services/zapiService';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);

  // Ref para evitar múltiplas verificações simultâneas do mesmo pagamento
  const checkingRefs = useRef<Set<string>>(new Set());

  // Helper para formatar data DD/MM/AAAA
  const formatFriendlyDate = (dateString: string) => {
    if (!dateString) return '';
    const parts = dateString.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateString;
  };

  // --- DATA FETCHING ---
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

        if (occurrencesData) {
            setOccurrences(occurrencesData.map((o: any) => ({
                id: o.id,
                studentId: o.student_id,
                description: o.description,
                date: o.date,
                createdAt: o.created_at
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
                     payment_method: t.payment_method,
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

  // --- REALTIME ---
  useEffect(() => {
    if (!isAuthenticated) return;
    const handleChanges = (payload: any) => fetchData(true);
    const channel = supabase
      .channel('public-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, handleChanges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, handleChanges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, handleChanges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, handleChanges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plans' }, handleChanges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_users' }, handleChanges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_occurrences' }, handleChanges)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isAuthenticated, fetchData]);

  // --- RECONCILIATION ---
  useEffect(() => {
    if (!isAuthenticated || transactions.length === 0) return;
    const reconcilePayments = async () => {
        const pendingWithRefs = transactions.filter(t => t.status === PaymentStatus.PENDING && t.externalReference && !checkingRefs.current.has(t.externalReference));
        if (pendingWithRefs.length === 0) return;
        for (const tx of pendingWithRefs) {
            const ref = tx.externalReference!;
            checkingRefs.current.add(ref);
            try {
                const status = await checkMPPaymentStatus(ref);
                if (status === 'approved') {
                    await handleUpdateTransaction({ id: tx.id, status: PaymentStatus.PAID, paymentMethod: PaymentMethod.PIX_MERCADO_PAGO, paymentDate: new Date().toISOString().split('T')[0] });
                }
            } catch (e) { console.error("Erro na reconciliação:", e); } finally { setTimeout(() => checkingRefs.current.delete(ref), 30000); }
        }
    };
    const interval = setInterval(reconcilePayments, 5 * 60 * 1000); 
    return () => clearInterval(interval);
  }, [isAuthenticated, transactions]);

  useEffect(() => { if (isAuthenticated) fetchData(); }, [isAuthenticated, fetchData]);

  const handleEmailLogin = async (e: React.FormEvent) => {
      e.preventDefault(); setIsLoggingIn(true); setLoginError('');
      try {
          const { data, error } = await supabase.from('app_users').select('*').eq('email', loginEmail).eq('password', loginPassword).single();
          if (error || !data) { setLoginError('Email ou senha inválidos.'); setIsLoggingIn(false); return; }
          const user: User = { id: data.id, name: data.name, email: data.email, role: data.role as UserRole, avatar: data.avatar || `https://ui-avatars.com/api/?name=${data.name}`, cpf: data.cpf };
          setCurrentUser(user); setIsAuthenticated(true);
      } catch (err) { setLoginError('Erro ao conectar ao servidor.'); } finally { setIsLoggingIn(false); }
  };

  const handleCpfCheck = async (e: React.FormEvent) => {
      e.preventDefault(); setIsLoggingIn(true); setLoginError('');
      const cleanCpf = loginCpf.replace(/\D/g, ''); 
      try {
          const { data: existingUser } = await supabase.from('app_users').select('*').eq('cpf', loginCpf).maybeSingle();
          if (existingUser) {
               if (loginPassword) {
                   if (existingUser.password === loginPassword) {
                        const user: User = { id: existingUser.id, name: existingUser.name, email: existingUser.email, role: existingUser.role as UserRole, avatar: existingUser.avatar || `https://ui-avatars.com/api/?name=${existingUser.name}`, cpf: existingUser.cpf };
                        setCurrentUser(user); setIsAuthenticated(true); setIsLoggingIn(false); return;
                   } else { setLoginError('Senha incorreta.'); setIsLoggingIn(false); return; }
               } else { setLoginError('Por favor, digite sua senha.'); setIsLoggingIn(false); return; }
          }
          const { data: studentsData } = await supabase.from('students').select('guardian');
          if (studentsData) {
              const matchedStudent = studentsData.find((s: any) => (s.guardian?.cpf?.replace(/\D/g, '') === cleanCpf));
              if (matchedStudent) { setIsFirstAccess(true); setTempGuardianName(matchedStudent.guardian.name); setTempGuardianEmail(matchedStudent.guardian.email || `${cleanCpf}@temp.com`); setLoginError(''); setIsLoggingIn(false); return; }
          }
          setLoginError('CPF não encontrado como responsável cadastrado.');
      } catch (err) { setLoginError('Erro ao validar CPF.'); } finally { setIsLoggingIn(false); }
  };

  const handleCreatePassword = async (e: React.FormEvent) => {
      e.preventDefault(); if (newPassword !== confirmNewPassword) { setLoginError('As senhas não coincidem.'); return; }
      if (newPassword.length < 6) { setLoginError('A senha deve ter pelo menos 6 caracteres.'); return; }
      setIsLoggingIn(true);
      try {
          const newUserPayload = { name: tempGuardianName, email: tempGuardianEmail, password: newPassword, role: UserRole.RESPONSAVEL, cpf: loginCpf, avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(tempGuardianName)}&background=random` };
          const { data, error } = await supabase.from('app_users').insert([newUserPayload]).select().single();
          if (data && !error) {
               const user: User = { id: data.id, name: data.name, email: data.email, role: data.role as UserRole, avatar: data.avatar, cpf: data.cpf };
                setCurrentUser(user); setIsAuthenticated(true);
          } else { setLoginError('Erro ao criar usuário.'); }
      } catch (err) { setLoginError('Erro ao registrar senha.'); } finally { setIsLoggingIn(false); }
  };

  const handleLogout = () => { setCurrentUser(null); setIsAuthenticated(false); setLoginEmail(''); setLoginPassword(''); setLoginCpf(''); setIsFirstAccess(false); setNewPassword(''); setConfirmNewPassword(''); setCurrentPage('dashboard'); };

  const handleGenerateGlobalTuitions = async () => {
      setIsLoading(true);
      try {
        if (students.length === 0 || plans.length === 0) { alert("Dados ainda não carregados."); setIsLoading(false); return; }
        const activeStudents = students.filter(s => s.active && s.planId);
        const targetYear = 2026;
        const monthsToGenerate = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; 
        const newTransactionsPayload = [];
        const studentIdsNotified = new Set<string>();

        for (const monthIdx of monthsToGenerate) {
            const monthPrefix = `${targetYear}-${(monthIdx + 1).toString().padStart(2, '0')}`;
            for (const student of activeStudents) {
                const plan = plans.find(p => p.id === student.planId);
                if (!plan || Number(plan.price) <= 0) continue;
                const alreadyExists = transactions.some(t => t.studentId === student.id && t.type === TransactionType.INCOME && t.description.includes('[Mensalidade]') && t.date.startsWith(monthPrefix));
                if (!alreadyExists) {
                    const lastDayOfMonth = new Date(targetYear, monthIdx + 1, 0).getDate();
                    const targetDayFromPlan = plan.dueDay || 10;
                    const actualDay = Math.min(targetDayFromPlan, lastDayOfMonth);
                    const dateStr = `${targetYear}-${(monthIdx + 1).toString().padStart(2, '0')}-${actualDay.toString().padStart(2, '0')}`;
                    const monthName = new Date(targetYear, monthIdx, 1).toLocaleString('pt-BR', { month: 'long' });
                    const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
                    const description = `[Mensalidade] ${student.name.split(' ')[0]} - ${capitalizedMonth} / ${targetYear}`;
                    const externalReference = crypto.randomUUID();
                    newTransactionsPayload.push({ description, amount: Number(plan.price), type: TransactionType.INCOME, date: dateStr, status: PaymentStatus.PENDING, student_id: student.id, plan_id: plan.id, payment_method: PaymentMethod.PIX_MERCADO_PAGO, external_reference: externalReference });
                    studentIdsNotified.add(student.id);
                }
            }
        }

        if (newTransactionsPayload.length > 0) {
            const { error } = await supabase.from('transactions').insert(newTransactionsPayload);
            if (!error) {
                await fetchData(true);
                alert("Mensalidades geradas. Iniciando disparos WhatsApp.");
                const athleteIds = Array.from(studentIdsNotified);
                for (let i = 0; i < athleteIds.length; i++) {
                    const student = students.find(s => s.id === athleteIds[i]);
                    if (student && student.guardian.phone) {
                        const msg = `⚽ *MENSALIDADES 2026 - Garotos do Martinica*\n\nOlá *${student.guardian.name}*! Informamos que as mensalidades de 2026 do atleta *${student.name}* foram geradas e já estão disponíveis no Portal do Aluno.`;
                        await sendZApiMessage(student.guardian.phone, msg);
                    }
                    if (i < athleteIds.length - 1) await new Promise(resolve => setTimeout(resolve, 10000));
                }
            }
        }
      } catch (err: any) { alert("Houve um erro na geração global."); } finally { setIsLoading(false); }
  };

  const handleUpdateTransaction = async (t: Partial<Transaction>) => { 
      if (!t.id) return;
      const payload: any = {};
      const originalTx = transactions.find(x => x.id === t.id);
      if (!originalTx) return;

      const safeVal = (v: any) => (v === '' || v === undefined || v === 'null') ? null : v;

      // REQUISITO: Enviar confirmação via WhatsApp se status mudou para PAGO
      if (t.status === PaymentStatus.PAID && originalTx.status !== PaymentStatus.PAID) {
          const pDate = t.paymentDate || new Date().toISOString().split('T')[0];
          const cleanDescription = originalTx.description.split(' (Pago em')[0];
          payload.description = `${cleanDescription} (Pago em ${formatFriendlyDate(pDate)})`;
          
          if (originalTx.studentId) {
              const student = students.find(s => s.id === originalTx.studentId);
              if (student && student.guardian.phone) {
                  const isGameFee = cleanDescription.includes("[Taxa de Jogo]") || cleanDescription.includes("[Taxa]");
                  const footerMsg = isGameFee ? "Obrigado por apoiar nossos atletas nos jogos! 🏆" : "Agradecemos a parceria! Sua mensalidade está em dia. ✅";
                  const msg = `Olá *${student.guardian.name}*! ⚽\n\nRecebemos o pagamento referente a:\n*${cleanDescription}*\nValor: *R$ ${originalTx.amount.toFixed(2)}*\nData: ${formatFriendlyDate(pDate)}\n\n${footerMsg}`;
                  
                  // Dispara mensagem de texto imediatamente
                  await sendZApiMessage(student.guardian.phone, msg);

                  // Aguarda 5 segundos para o envio do PDF conforme solicitado
                  await new Promise(resolve => setTimeout(resolve, 5000));

                  // --- GERAÇÃO E ENVIO DE RECIBO PDF ---
                  try {
                      const doc = new jsPDF();
                      doc.setFillColor(249, 115, 22);
                      doc.rect(0, 0, 210, 40, 'F');
                      doc.setFontSize(22);
                      doc.setTextColor(255, 255, 255);
                      doc.setFont("helvetica", "bold");
                      doc.text("GAROTOS DO MARTINICA", 105, 20, { align: 'center' });
                      doc.setFontSize(10);
                      doc.text("RECIBO DE PAGAMENTO", 105, 30, { align: 'center' });

                      doc.setTextColor(50, 50, 50);
                      doc.setFontSize(12);
                      doc.setFont("helvetica", "normal");
                      const bodyY = 60;
                      doc.text(`Nº do Recibo: ${originalTx.id.substring(0, 8).toUpperCase()}`, 14, bodyY);
                      doc.text(`Data de Emissão: ${new Date().toLocaleDateString('pt-BR')}`, 140, bodyY);
                      doc.line(14, bodyY + 5, 196, bodyY + 5);

                      doc.setFont("helvetica", "bold");
                      doc.text("DADOS DO PAGAMENTO:", 14, bodyY + 15);
                      
                      const paymentInfo = [
                        ['Responsável:', student.guardian.name],
                        ['Atleta:', student.name],
                        ['Referente a:', cleanDescription],
                        ['Valor Pago:', `R$ ${originalTx.amount.toFixed(2)}`],
                        ['Data do Pagamento:', formatFriendlyDate(pDate)],
                        ['Método:', t.paymentMethod || originalTx.paymentMethod || 'Dinheiro']
                      ];

                      autoTable(doc, {
                        startY: bodyY + 20,
                        body: paymentInfo,
                        theme: 'plain',
                        styles: { fontSize: 10, cellPadding: 2 },
                        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } }
                      });

                      const finalY = (doc as any).lastAutoTable.finalY || 150;
                      doc.setFontSize(9);
                      doc.setFont("helvetica", "italic");
                      doc.text(`Declaramos recebimento da importância citada para quitação da pendência mencionada.`, 105, finalY + 20, { align: 'center' });
                      doc.text("https://escolinha.martinicaoficial.com.br", 105, 285, { align: 'center' });

                      // Extração resiliente do Base64 do PDF
                      const pdfDataUri = doc.output('datauristring');
                      const commaIndex = pdfDataUri.indexOf(',');
                      const pdfBase64 = commaIndex !== -1 ? pdfDataUri.substring(commaIndex + 1) : null;
                      
                      if (pdfBase64) {
                        const safeName = `Recibo_${student.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
                        await sendZApiDocument(student.guardian.phone, pdfBase64, safeName);
                      }
                  } catch (pdfErr) { console.error("Falha ao processar recibo PDF:", pdfErr); }
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
      if (t.preferenceId !== undefined) payload.preference_id = safeVal(t.preferenceId);

      const { error } = await supabase.from('transactions').update(payload).eq('id', t.id);
      if(!error) setTransactions(prev => prev.map(tx => tx.id === t.id ? { ...tx, ...t, description: payload.description || tx.description } : tx));
  };

  const uploadPhoto = async (base64: string, name: string) => {
    try {
      const fileName = `${Date.now()}_${name.replace(/\s+/g, '_')}.jpg`;
      const base64Data = base64.split(',')[1];
      const binaryData = atob(base64Data);
      const uint8Array = new Uint8Array(binaryData.length);
      for (let i = 0; i < binaryData.length; i++) {
        uint8Array[i] = binaryData.charCodeAt(i);
      }
      const { data, error } = await supabase.storage.from('student-photos').upload(fileName, uint8Array, { contentType: 'image/jpeg' });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('student-photos').getPublicUrl(fileName);
      return urlData.publicUrl;
    } catch (err) {
      console.error("Error uploading photo:", err);
      return base64; 
    }
  };

  const handleAddStudent = async (studentData: Omit<Student, 'id'>) => {
    setIsLoading(true);
    let finalPhotoUrl = studentData.photoUrl;
    if (studentData.photoUrl && studentData.photoUrl.startsWith('data:')) finalPhotoUrl = await uploadPhoto(studentData.photoUrl, studentData.name);
    const primaryGroupId = (studentData.groupIds && studentData.groupIds.length > 0) ? studentData.groupIds[0] : null;
    const payload = { ...studentData, photo_url: finalPhotoUrl, group_id: primaryGroupId, birth_date: studentData.birthDate, medical_expiry: studentData.medicalCertificateExpiry };
    const { data, error } = await supabase.from('students').insert([payload]).select().single();
    if (data && !error) {
        setStudents(prev => [...prev, { ...studentData, id: data.id, photoUrl: finalPhotoUrl } as Student]);
        if (studentData.guardian.phone) sendZApiMessage(studentData.guardian.phone, `Bem-vindo(a) à Garotos do Martinica! ⚽`);
        await handleGenerateGlobalTuitions();
    }
    setIsLoading(false);
  };

  const handleUpdateStudent = async (student: Student) => {
    setIsLoading(true);
    let finalPhotoUrl = student.photoUrl;
    if (student.photoUrl && student.photoUrl.startsWith('data:')) {
      finalPhotoUrl = await uploadPhoto(student.photoUrl, student.name);
    }
    const primaryGroupId = (student.groupIds && student.groupIds.length > 0) ? student.groupIds[0] : null;
    const payload = { 
      name: student.name,
      birth_date: student.birthDate,
      rg: student.rg,
      cpf: student.cpf,
      phone: student.phone,
      medical_expiry: student.medicalCertificateExpiry,
      photo_url: finalPhotoUrl,
      address: student.address,
      guardian: student.guardian,
      plan_id: student.planId,
      group_ids: student.groupIds,
      group_id: primaryGroupId,
      active: student.active,
      documents: student.documents
    };
    const { error } = await supabase.from('students').update(payload).eq('id', student.id);
    if (!error) fetchData(true);
    setIsLoading(false);
  };

  const handleAddOccurrence = async (studentId: string, description: string, date: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.from('student_occurrences').insert([{
        student_id: studentId,
        description,
        date,
        created_at: new Date().toISOString()
      }]).select().single();

      if (!error && data) {
        const student = students.find(s => s.id === studentId);
        if (student && student.guardian.phone) {
          const msg = `⚽ *OCORRÊNCIA - Garotos do Martinica*\n\nOlá *${student.guardian.name}*!\n\nRegistramos a seguinte ocorrência para o atleta *${student.name}*:\n\n"${description}"\n\nData: ${formatFriendlyDate(date)}\n\nQualquer dúvida, estamos à disposição.`;
          await sendZApiMessage(student.guardian.phone, msg);
        }
        await fetchData(true);
        return true;
      }
      return false;
    } catch (err) {
      console.error("Error adding occurrence:", err);
      return false;
    }
  };

  const handleBatchAssignStudents = async (studentIds: string[], groupId: string) => {
    setIsLoading(true);
    try {
      const currentMembers = students.filter(s => s.groupIds?.includes(groupId));
      const membersToRemove = currentMembers.filter(s => !studentIds.includes(s.id));

      for (const student of membersToRemove) {
        const nextGroups = student.groupIds.filter(id => id !== groupId);
        await supabase.from('students').update({ group_ids: nextGroups, group_id: nextGroups[0] || null }).eq('id', student.id);
      }

      for (const id of studentIds) {
        const student = students.find(s => s.id === id);
        if (student && !student.groupIds.includes(groupId)) {
          const nextGroups = [...student.groupIds, groupId];
          await supabase.from('students').update({ group_ids: nextGroups, group_id: nextGroups[0] }).eq('id', id);
        }
      }
      await fetchData(true);
    } catch (err) {
      console.error("Error batch assigning:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddActivity = async (a: any) => { 
      setIsLoading(true);
      const payloadList = [];
      const base = { title: a.title, activity_type: a.type, fee: a.fee || 0, location: a.location || '', group_id: a.groupId || null, participants: a.participants || [], start_time: a.startTime, end_time: a.endTime, recurrence: a.recurrence, date: a.date };
      payloadList.push(base);
      const { data, error } = await supabase.from('activities').insert(payloadList).select();
      if(data && !error) fetchData(true);
      setIsLoading(false);
  };

  const handleUpdateActivity = async (a: Activity) => {
    setIsLoading(true);
    const payload = {
      title: a.title,
      activity_type: a.type,
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
    };
    const { error } = await supabase.from('activities').update(payload).eq('id', a.id);
    if (!error) fetchData(true);
    setIsLoading(false);
  };

  const handleUpdateAttendance = async (activityId: string, studentId: string) => {
    const activity = activities.find(a => a.id === activityId);
    if (!activity) return;
    const nextAttendance = activity.attendance.includes(studentId)
      ? activity.attendance.filter(id => id !== studentId)
      : [...activity.attendance, studentId];
    
    await supabase.from('activities').update({ attendance: nextAttendance }).eq('id', activityId);
    setActivities(prev => prev.map(a => a.id === activityId ? { ...a, attendance: nextAttendance } : a));
  };

  const handleUpdateFeePayment = async (activityId: string, studentId: string) => {
    const activity = activities.find(a => a.id === activityId);
    if (!activity || !activity.fee) return;
    const isPaying = !activity.feePayments?.includes(studentId);
    const nextPayments = isPaying
      ? [...(activity.feePayments || []), studentId]
      : (activity.feePayments || []).filter(id => id !== studentId);
    
    const extRef = `game_fee_${activityId}_${studentId}`;

    if (isPaying) {
        const student = students.find(s => s.id === studentId);
        await supabase.from('transactions').insert([{
            description: `[Taxa de Jogo] ${student?.name.split(' ')[0]} - ${activity.title}`,
            amount: activity.fee,
            type: TransactionType.INCOME,
            date: activity.date,
            status: PaymentStatus.PAID,
            student_id: studentId,
            payment_method: PaymentMethod.CASH,
            external_reference: extRef
        }]);
    } else {
        await supabase.from('transactions').update({ status: PaymentStatus.CANCELLED }).eq('external_reference', extRef);
    }

    await supabase.from('activities').update({ fee_payments: nextPayments }).eq('id', activityId);
    setActivities(prev => prev.map(a => a.id === activityId ? { ...a, feePayments: nextPayments } : a));
  };

  const handleDeleteActivity = async (id: string) => {
    const { error } = await supabase.from('activities').delete().eq('id', id);
    if (!error) setActivities(prev => prev.filter(a => a.id !== id));
  };

  const handleAddTransaction = async (t: Omit<Transaction, 'id'> & { recurrenceMonths?: number }) => {
    setIsLoading(true);
    try {
        const payload = {
            description: t.description,
            amount: t.amount,
            type: t.type,
            date: t.date,
            status: t.status,
            student_id: t.studentId,
            plan_id: t.planId,
            payment_method: t.paymentMethod,
            external_reference: t.externalReference
        };

        if (t.recurrence === 'MONTHLY' && t.recurrenceMonths && t.recurrenceMonths > 1) {
            const batch = [];
            for (let i = 0; i < t.recurrenceMonths; i++) {
                const date = new Date(t.date + 'T00:00:00');
                date.setMonth(date.getMonth() + i);
                batch.push({ ...payload, date: date.toISOString().split('T')[0] });
            }
            await supabase.from('transactions').insert(batch);
        } else {
            await supabase.from('transactions').insert([payload]);
        }
        await fetchData(true);
    } catch (err) {
        console.error("Error adding transaction:", err);
    } finally {
        setIsLoading(false);
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

  // --- PLANS HANDLERS ---
  const handleAddPlan = async (p: Omit<Plan, 'id'>) => {
    setIsLoading(true);
    const { data, error } = await supabase.from('plans').insert([{
        name: p.name,
        price: p.price,
        due_day: p.dueDay,
        description: p.description
    }]).select().single();
    if (!error && data) await fetchData(true);
    setIsLoading(false);
  };

  const handleUpdatePlan = async (p: Plan) => {
    setIsLoading(true);
    const { error } = await supabase.from('plans').update({
        name: p.name,
        price: p.price,
        due_day: p.dueDay,
        description: p.description
    }).eq('id', p.id);
    if (!error) await fetchData(true);
    setIsLoading(false);
  };

  const handleDeletePlan = async (id: string) => {
    setIsLoading(true);
    const { error } = await supabase.from('plans').delete().eq('id', id);
    if (!error) await fetchData(true);
    setIsLoading(false);
  };

  // --- USERS HANDLERS ---
  const handleAddUser = async (u: Omit<User, 'id'>) => {
    setIsLoading(true);
    const { data, error } = await supabase.from('app_users').insert([{
        name: u.name,
        email: u.email,
        password: u.password,
        role: u.role,
        avatar: u.avatar,
        cpf: u.cpf
    }]).select().single();
    if (!error && data) await fetchData(true);
    setIsLoading(false);
  };

  const handleUpdateUser = async (u: User) => {
    setIsLoading(true);
    const payload: any = {
        name: u.name,
        email: u.email,
        role: u.role,
        avatar: u.avatar,
        cpf: u.cpf
    };
    if (u.password) payload.password = u.password;
    const { error } = await supabase.from('app_users').update(payload).eq('id', u.id);
    if (!error) await fetchData(true);
    setIsLoading(false);
  };

  const handleDeleteUser = async (id: string) => {
    setIsLoading(true);
    const { error } = await supabase.from('app_users').delete().eq('id', id);
    if (!error) await fetchData(true);
    setIsLoading(false);
  };

  const handleNavigate = (page: string, data?: any) => { setCurrentPage(page); setPageData(data || null); };

  if (!isAuthenticated) {
      return (
          <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-md overflow-hidden">
                  <div className="bg-primary-600 p-8 text-center relative">
                      <div className="inline-flex bg-white/20 p-4 rounded-full mb-4 backdrop-blur-sm"><img src="/logo.svg" alt="Logo" className="w-16 h-16" /></div>
                      <h1 className="text-2xl font-bold text-white mb-1">Garotos do Martinica</h1>
                      <p className="text-primary-100">Portal do Aluno e Gestão</p>
                  </div>
                  <div className="flex border-b border-gray-100">
                      <button className={`flex-1 py-4 text-sm font-semibold transition-colors ${activeLoginTab === 'EMAIL' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}`} onClick={() => setActiveLoginTab('EMAIL')}>Admin / Professor</button>
                      <button className={`flex-1 py-4 text-sm font-semibold transition-colors ${activeLoginTab === 'CPF' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}`} onClick={() => setActiveLoginTab('CPF')}>Sou Responsável</button>
                  </div>
                  <div className="p-8">
                      {isFirstAccess ? (
                           <form onSubmit={handleCreatePassword} className="space-y-4">
                               <div className="text-center mb-4"><h3 className="font-bold text-gray-800">Primeiro Acesso</h3><p className="text-sm text-gray-500">Olá, <strong>{tempGuardianName}</strong>. Crie uma senha.</p></div>
                               <div><label className="block text-sm font-medium text-gray-700 mb-1">Nova Senha</label><input type="password" required className="w-full border rounded-lg p-3" value={newPassword} onChange={e => setNewPassword(e.target.value)} /></div>
                               <div><label className="block text-sm font-medium text-gray-700 mb-1">Confirmar Senha</label><input type="password" required className="w-full border rounded-lg p-3" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} /></div>
                               {loginError && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg text-center">{loginError}</div>}
                               <button type="submit" disabled={isLoggingIn} className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2">{isLoggingIn ? <Loader2 className="animate-spin" /> : 'Criar Senha e Entrar'}</button>
                           </form>
                      ) : activeLoginTab === 'EMAIL' ? (
                        <form onSubmit={handleEmailLogin} className="space-y-4">
                            <div><label className="block text-sm font-medium text-gray-700 mb-1">Email</label><div className="relative"><UserIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" /><input type="email" required className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg outline-none" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} /></div></div>
                            <div><label className="block text-sm font-medium text-gray-700 mb-1">Senha</label><div className="relative"><Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" /><input type="password" required className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg outline-none" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} /></div></div>
                            {loginError && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg text-center">{loginError}</div>}
                            <button type="submit" disabled={isLoggingIn} className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2">{isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Entrar no Sistema'}</button>
                        </form>
                      ) : (
                        <form onSubmit={handleCpfCheck} className="space-y-4">
                             <div><label className="block text-sm font-medium text-gray-700 mb-1">CPF do Responsável</label><div className="relative"><UsersIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" /><input type="text" required className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg outline-none" value={loginCpf} onChange={(e) => setLoginCpf(e.target.value)} /></div></div>
                            <div><label className="block text-sm font-medium text-gray-700 mb-1">Senha</label><div className="relative"><Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" /><input type="password" placeholder="Deixe em branco no 1º acesso" className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg outline-none" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} /></div></div>
                            {loginError && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg text-center">{loginError}</div>}
                            <button type="submit" disabled={isLoggingIn} className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2">{isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Acessar / Primeiro Acesso'}</button>
                        </form>
                      )}
                  </div>
              </div>
          </div>
      );
  }

  const renderContent = () => {
    switch (currentPage) {
      case 'dashboard': return <DashboardPage students={students} transactions={transactions} activities={activities} role={currentUser!.role} onNavigate={handleNavigate} />;
      case 'students': return <StudentsPage students={students} groups={groups} plans={plans} transactions={transactions} activities={activities} onAddStudent={handleAddStudent} onBatchAddStudents={() => {}} onUpdateStudent={handleUpdateStudent} onUpdateTransaction={handleUpdateTransaction} onAddTransaction={handleAddTransaction} onGenerateTuitions={handleGenerateGlobalTuitions} initialFilter={pageData?.filter} currentUser={currentUser} occurrences={occurrences} onAddOccurrence={handleAddOccurrence} />;
      case 'groups': return <GroupsPage groups={groups} students={students} onAddGroup={handleAddGroup} onUpdateGroup={handleUpdateGroup} onDeleteGroup={handleDeleteGroup} onBatchAssignStudents={handleBatchAssignStudents} />;
      case 'plans': return <PlansPage plans={plans} onAddPlan={handleAddPlan} onUpdatePlan={handleUpdatePlan} onDeletePlan={handleDeletePlan} />;
      case 'schedule': return <SchedulePage activities={activities} students={students} groups={groups} onAddActivity={handleAddActivity} onUpdateActivity={handleUpdateActivity} onUpdateAttendance={handleUpdateAttendance} onUpdateFeePayment={handleUpdateFeePayment} onDeleteActivity={handleDeleteActivity} currentUser={currentUser} onAddTransaction={handleAddTransaction} onUpdateTransaction={handleUpdateTransaction} transactions={transactions} />;
      case 'finance': return <FinancePage students={students} transactions={transactions} plans={plans} onAddTransaction={handleAddTransaction} onUpdateTransaction={handleUpdateTransaction} />;
      case 'users': return <UsersPage users={systemUsers} onAddUser={handleAddUser} onUpdateUser={handleUpdateUser} onDeleteUser={handleDeleteUser} />;
      default: return <DashboardPage students={students} transactions={transactions} activities={activities} role={currentUser!.role} onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="flex bg-gray-50 min-h-screen font-sans overflow-x-hidden">
      {isLoading && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
              <div className="bg-white p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4">
                  <Loader2 className="w-10 h-10 text-primary-600 animate-spin" />
                  <p className="font-bold text-gray-700 animate-pulse">Sincronizando dados...</p>
              </div>
          </div>
      )}
      <Sidebar currentUser={currentUser!} currentPage={currentPage} onNavigate={handleNavigate} onLogout={handleLogout} isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
      <main className="flex-1 md:ml-64 p-4 md:p-8 min-w-0 max-w-full overflow-x-hidden">
        <header className="mb-8 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
            <div className="flex items-center gap-3"><button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden p-2 bg-white rounded-lg border text-gray-700 hover:bg-gray-50"><Menu className="w-6 h-6" /></button><h1 className="text-xl md:text-2xl font-bold text-gray-900">{currentPage.toUpperCase()}</h1></div>
        </header>
        {renderContent()}
      </main>
    </div>
  );
}

export default App;
