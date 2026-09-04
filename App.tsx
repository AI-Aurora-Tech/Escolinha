
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { Sidebar } from './components/Sidebar';
import { DashboardPage } from './pages/DashboardPage';
import { StudentsPage } from './pages/StudentsPage';
import { GroupsPage } from './pages/GroupsPage';
import { PlansPage } from './pages/PlansPage';
import { SchedulePage } from './pages/SchedulePage';
import { FinancePage } from './pages/FinancePage';
import { UsersPage } from './pages/UsersPage';
import { AICoachPage } from './pages/AICoachPage';
import { RSVPPage } from './src/pages/RSVPPage';
import LogsPage from './src/pages/LogsPage';
import { Student, Group, Plan, Transaction, Activity, User, UserRole, PaymentStatus, TransactionType, PaymentMethod, Occurrence } from './types';
import { supabase } from './lib/supabaseClient';
import { Menu, Loader2 } from 'lucide-react';
import { sendZApiMessage } from './services/zapiService';

const TX_SELECT_FIELDS = '*';

// Chave usada para persistir a sessão do usuário logado (sobrevive ao refresh da página).
const AUTH_STORAGE_KEY = 'gm_current_user';

// Executa uma leitura no Supabase com novas tentativas em caso de falha transitória.
// IMPORTANTE: o cliente PostgREST NÃO lança exceção quando uma leitura falha — ele resolve
// { data: null, error }. Antes, o código lia apenas `data` e ignorava `error`, então uma
// falha momentânea (timeout, oscilação de rede, 5xx) fazia a tela renderizar com os dados
// zerados (ex.: "Alunos Ativos: 0") em vez de tentar novamente ou avisar o usuário.
async function selectWithRetry<T = any>(
  label: string,
  build: () => PromiseLike<{ data: T[] | null; error: any }>,
  retries = 2
): Promise<T[]> {
  let lastError: any = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { data, error } = await build();
      if (!error) return data ?? [];
      lastError = error;
    } catch (err) {
      lastError = err;
    }
    console.warn(`[fetchData] Falha ao carregar '${label}' (tentativa ${attempt + 1}/${retries + 1}):`, (lastError as any)?.message || lastError);
    if (attempt < retries) {
      await new Promise(res => setTimeout(res, 500 * Math.pow(2, attempt)));
    }
  }
  throw new Error(`Não foi possível carregar '${label}': ${(lastError as any)?.message || 'erro de conexão'}`);
}

// Busca todos os registros em páginas, evitando estourar o statement_timeout do Postgres
// em tabelas pesadas. É o caso de 'students': as fotos são gravadas como base64 dentro da
// coluna photo_url, então um único select('*') serializa megabytes de dados de uma vez e é
// cancelado pelo servidor ('canceling statement due to statement timeout'). Trazendo em
// lotes menores, cada requisição termina bem abaixo do limite.
async function selectAllPaginated<T = any>(
  label: string,
  buildRange: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize = 200
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const to = from + pageSize - 1;
    const page = await selectWithRetry(`${label} (${from}-${to})`, () => buildRange(from, to));
    all.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

// Colunas dos alunos SEM o photo_url. As fotos são gravadas como base64 e, trazidas junto,
// deixam o select tão grande que estoura o statement_timeout do Postgres. Elas são carregadas
// à parte, em segundo plano e em lotes pequenos (ver loadStudentPhotos).
const STUDENT_CORE_COLUMNS = 'id,name,birth_date,rg,cpf,phone,medical_expiry,address,guardian,plan_id,group_ids,positions,active,inactive_reason,enrollment_date,inactivation_date,documents';

const avatarFallback = (name: string) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'Aluno')}&background=random&color=fff&size=200`;

// Converte uma linha da tabela 'students' (snake_case) para o tipo Student usado na UI.
const mapStudentRow = (s: any): Student => ({
  id: s.id, name: s.name, birthDate: s.birth_date, rg: s.rg, cpf: s.cpf, phone: s.phone,
  medicalCertificateExpiry: s.medical_expiry, photoUrl: s.photo_url, address: s.address || {},
  guardian: s.guardian || {}, planId: s.plan_id || '', groupIds: s.group_ids || [],
  positions: s.positions || [], active: s.active, inactiveReason: s.inactive_reason,
  enrollmentDate: s.enrollment_date, inactivationDate: s.inactivation_date, documents: s.documents || {}
});

// Alunos do plano Bolsista não geram mensalidade.
const isBolsistaPlan = (plan?: Plan | null) =>
  !!plan && (plan.name || '').trim().toLowerCase().includes('bolsista');

// Monta as parcelas de mensalidade de um aluno para os meses [fromMonth..toMonth] do ano,
// pulando os meses que já possuem mensalidade lançada (evita duplicidade).
const buildTuitionPayloads = (
  student: Student,
  plan: Plan,
  existingTx: Transaction[],
  fromMonth: number,
  toMonth: number,
  year: number
) => {
  const payloads: any[] = [];
  const yearStr = String(year);
  for (let m = fromMonth; m <= toMonth; m++) {
    const monthStr = String(m).padStart(2, '0');
    const alreadyExists = existingTx.some(t =>
      t.studentId === student.id &&
      t.category === 'Mensalidade' &&
      (t.date || '').startsWith(`${yearStr}-${monthStr}`)
    );
    if (alreadyExists) continue;
    const dueDay = plan.dueDay || 10;
    payloads.push({
      description: `Mensalidade (${student.name}) ${monthStr}/${yearStr}`,
      category: 'Mensalidade',
      amount: plan.price,
      type: TransactionType.INCOME,
      date: `${yearStr}-${monthStr}-${String(dueDay).padStart(2, '0')}`,
      status: PaymentStatus.PENDING,
      student_id: student.id,
      plan_id: student.planId,
      payment_method: PaymentMethod.CASH,
      recurrence: 'NONE'
    });
  }
  return payloads;
};

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

const AppContent: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    // Restaura a sessão salva para que um refresh não derrube o usuário para a tela de login.
    try {
      const saved = localStorage.getItem(AUTH_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as User) : null;
    } catch {
      return null;
    }
  });
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      return !!localStorage.getItem(AUTH_STORAGE_KEY);
    } catch {
      return false;
    }
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeLoginTab, setActiveLoginTab] = useState<'EMAIL' | 'CPF'>('EMAIL');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginCpf, setLoginCpf] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const currentPage = location.pathname.substring(1) || 'dashboard';
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const [students, setStudents] = useState<Student[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [systemUsers, setSystemUsers] = useState<User[]>([]);
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const activitiesRef = useRef<Activity[]>([]);

  useEffect(() => { activitiesRef.current = activities; }, [activities]);

  const safeDate = (d?: string) => (d === '' || !d) ? null : d;
  const safeId = (id?: string) => (id === '' || !id) ? null : id;

  const fetchRSVPsOnly = async () => {
    const { data: rsvpsData } = await supabase.from('activity_rsvps').select('*').order('created_at', { ascending: false });
    if (!rsvpsData) return;
    
    setActivities(prev => prev.map(a => ({
        ...a,
        rsvps: rsvpsData.filter((r: any) => r.activity_id === a.id).map((r: any) => ({
            id: r.id,
            activityId: r.activity_id,
            studentId: r.student_id,
            status: r.status,
            transportOption: r.transport_option,
            createdAt: r.created_at
        }))
    })));
  };

  const currentUserRef = useRef<User | null>(null);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  // Cache das fotos já carregadas (id -> photo_url), para não rebaixar o desempenho
  // recarregando o base64 de todos os alunos a cada refresh em tempo real.
  const studentPhotosRef = useRef<Map<string, string>>(new Map());

  // Mantém a sessão persistida sincronizada com o estado de autenticação (sem gravar a senha).
  useEffect(() => {
    try {
      if (isAuthenticated && currentUser) {
        const { password, ...safeUser } = currentUser;
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(safeUser));
      } else {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    } catch { /* ignora indisponibilidade do storage */ }
  }, [isAuthenticated, currentUser]);
  
  // Busca as fotos dos alunos (base64) em segundo plano, em lotes pequenos, e preenche os
  // avatares conforme chegam. Só busca as que ainda não estão em cache, evitando rebaixar o
  // desempenho a cada refresh em tempo real. É best-effort: falha de foto não zera a tela.
  const loadStudentPhotos = useCallback(async (ids: string[]) => {
    const pending = ids.filter(id => !studentPhotosRef.current.has(id));
    const BATCH = 20;
    for (let i = 0; i < pending.length; i += BATCH) {
        const batch = pending.slice(i, i + BATCH);
        try {
            const rows = await selectWithRetry('fotos dos alunos', () =>
                supabase.from('students').select('id, photo_url').in('id', batch));
            rows.forEach((r: any) => studentPhotosRef.current.set(r.id, r.photo_url || ''));
            setStudents(prev => prev.map(s => {
                const photo = studentPhotosRef.current.get(s.id);
                return photo ? { ...s, photoUrl: photo } : s;
            }));
        } catch {
            // Fotos são secundárias — se um lote falhar, segue com o avatar temporário.
        }
    }
  }, []);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    const currentUser = currentUserRef.current;

    // Cada tabela é carregada de forma independente: uma falha em uma delas não aborta as
    // outras nem sobrescreve com vazio os dados já carregados. Falhas são acumuladas e
    // exibidas ao usuário no lugar de silenciosamente mostrar tudo zerado.
    const errors: string[] = [];

    // Confirmações de presença (RSVPs) — necessárias para montar as atividades.
    let rsvpsData: any[] = [];
    try {
        rsvpsData = await selectWithRetry('confirmações de presença', () =>
            supabase.from('activity_rsvps').select('*').order('created_at', { ascending: false }));
    } catch (e: any) { errors.push(e.message); }

    // Grupos
    try {
        const groupsData = await selectWithRetry('grupos', () => supabase.from('groups').select('*'));
        setGroups(groupsData);
    } catch (e: any) { errors.push(e.message); }

    // Planos
    try {
        const plansData = await selectWithRetry('planos', () => supabase.from('plans').select('*'));
        setPlans(plansData.map((p: any) => ({ id: p.id, name: p.name, price: Number(p.price), dueDay: p.due_day, description: p.description })));
    } catch (e: any) { errors.push(e.message); }

    // Ocorrências
    try {
        const occurrencesData = await selectWithRetry('ocorrências', () => supabase.from('student_occurrences').select('*'));
        setOccurrences(occurrencesData.map((o: any) => ({ id: o.id, studentId: o.student_id, description: o.description, date: o.date, createdAt: o.created_at })));
    } catch (e: any) { errors.push(e.message); }

    // Alunos + transações (varia conforme o perfil do usuário logado).
    try {
        // Carrega os alunos SEM a foto (leve e rápido). As fotos vêm depois, em segundo plano.
        let studentsData: any[];
        let transactionsData: any[] = [];

        if (currentUser?.role === UserRole.RESPONSAVEL && currentUser.cpf) {
             const allStudents = await selectAllPaginated('alunos', (from, to) =>
                 supabase.from('students').select(STUDENT_CORE_COLUMNS).order('id', { ascending: true }).range(from, to), 500);
             const cleanUserCpf = currentUser.cpf.replace(/\D/g, '');
             studentsData = allStudents.filter((s: any) => (s.guardian?.cpf?.replace(/\D/g, '') || '') === cleanUserCpf);

             if (studentsData.length > 0) {
                 const studentIds = studentsData.map((s: any) => s.id);
                 transactionsData = await selectWithRetry('transações', () =>
                     supabase.from('transactions').select(TX_SELECT_FIELDS).in('student_id', studentIds));
             }
        } else {
             studentsData = await selectAllPaginated('alunos', (from, to) =>
                 supabase.from('students').select(STUDENT_CORE_COLUMNS).order('id', { ascending: true }).range(from, to), 500);
             transactionsData = await selectAllPaginated('transações', (from, to) =>
                 supabase.from('transactions').select(TX_SELECT_FIELDS).order('date', { ascending: false }).order('created_at', { ascending: false }).range(from, to));
        }

        // Aplica a foto já em cache (se houver) ou um avatar temporário; preserva fotos já carregadas.
        setStudents(studentsData.map((s: any) => {
            const cached = studentPhotosRef.current.get(s.id);
            return { ...mapStudentRow(s), photoUrl: cached || avatarFallback(s.name) };
        }));

        // Segundo plano: busca as fotos (base64) apenas dos alunos ATIVOS, em lotes pequenos.
        void loadStudentPhotos(studentsData.filter((s: any) => s.active).map((s: any) => s.id));

        setTransactions(transactionsData.map((t: any) => ({
            id: t.id,
            description: t.description,
            category: t.category,
            amount: Number(t.amount),
            type: t.type,
            date: t.date,
            paymentDate: t.payment_date,
            status: t.status,
            studentId: t.student_id,
            planId: t.plan_id,
            paymentMethod: t.payment_method,
            payment_link: t.payment_link,
            externalReference: t.external_reference,
            preferenceId: t.preference_id,
            recurrence: t.recurrence || 'NONE',
            createdAt: t.created_at
        } as Transaction)));
    } catch (e: any) { errors.push(e.message); }

    // Usuários do sistema
    try {
        const usersData = await selectWithRetry('usuários', () => supabase.from('app_users').select('*'));
        setSystemUsers(usersData as User[]);
    } catch (e: any) { errors.push(e.message); }

    // Atividades
    try {
        const activitiesData = await selectWithRetry('atividades', () => supabase.from('activities').select('*'));
        setActivities(activitiesData.map((a: any) => ({
            id: a.id,
            title: a.title,
            type: a.activity_type || 'TRAINING',
            fee: a.fee || 0,
            location: a.location || '',
            presentationLocation: a.presentation_location,
            presentationTime: a.presentation_time,
            directToGameTime: a.direct_to_game_time,
            askTransport: a.ask_transport,
            opponent: a.opponent,
            homeScore: a.home_score,
            awayScore: a.away_score,
            scorers: a.scorers || [],
            groupId: a.group_id,
            participants: a.participants || [],
            date: a.date,
            startTime: a.start_time,
            endTime: a.end_time,
            recurrence: a.recurrence || 'none',
            attendance: a.attendance || [],
            feePayments: a.fee_payments || [],
            lineup: a.activity_type === 'GAME' ? a.lineup : undefined,
            evaluations: (a.activity_type === 'TRAINING' || a.activity_type === 'MONTHLY_EVALUATION') ? a.lineup : undefined,
            description: a.description,
            rsvps: (rsvpsData || []).filter((r: any) => r.activity_id === a.id).map((r: any) => ({
                id: r.id,
                activityId: r.activity_id,
                studentId: r.student_id,
                status: r.status,
                transportOption: r.transport_option,
                createdAt: r.created_at
            }))
        } as Activity)));
    } catch (e: any) { errors.push(e.message); }

    if (errors.length > 0) {
        console.error("Erros ao carregar dados:", errors);
        // Mostra o detalhe de qual carregamento falhou (e o erro do banco) para facilitar o diagnóstico.
        const detalhes = errors.join(' | ');
        setLoadError(`${detalhes}. Toque em "Recarregar" para tentar novamente.`);
    } else {
        setLoadError(null);
    }

    if (!silent) setIsLoading(false);
  }, []);

  // Busca no BANCO as mensalidades já existentes dos alunos informados no ano (qualquer status).
  // Usado como fonte da verdade na geração, evitando duplicar quando o estado local está desatualizado.
  const fetchExistingTuitions = async (studentIds: string[], year: number): Promise<Transaction[]> => {
    if (studentIds.length === 0) return [];
    const rows = await selectWithRetry('mensalidades existentes', () =>
      supabase.from('transactions')
        .select('id,student_id,date,status,category')
        .eq('category', 'Mensalidade')
        .in('student_id', studentIds)
        .gte('date', `${year}-01-01`)
        .lte('date', `${year}-12-31`));
    return rows.map((r: any) => ({ id: r.id, studentId: r.student_id, date: r.date, status: r.status, category: r.category } as Transaction));
  };

  // Insere mensalidades tolerando conflitos: tenta em lote e, se falhar, uma a uma ignorando duplicatas.
  const insertTuitions = async (payloads: any[]) => {
    if (payloads.length === 0) return;
    const { error } = await supabase.from('transactions').insert(payloads);
    if (!error) return;
    for (const p of payloads) {
      const { error: e } = await supabase.from('transactions').insert([p]);
      if (e && !/duplicate|unique|conflict/i.test(e.message || '')) {
        console.warn('Erro ao inserir mensalidade:', e.message);
      }
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    // Sincronização em tempo real: quando qualquer usuário altera dados, os demais recebem
    // a atualização sem precisar recarregar a página. Os refreshes são "debounced" para
    // agrupar rajadas de mudanças em uma única recarga.
    let fullTimer: ReturnType<typeof setTimeout>;
    const scheduleFullRefresh = () => {
        clearTimeout(fullTimer);
        fullTimer = setTimeout(() => fetchData(true), 600);
    };

    // Confirmações de presença mudam com frequência (página pública de RSVP) — refresh leve.
    let rsvpTimer: ReturnType<typeof setTimeout>;
    const scheduleRsvpRefresh = () => {
        clearTimeout(rsvpTimer);
        rsvpTimer = setTimeout(() => fetchRSVPsOnly(), 500);
    };

    const channel = supabase
        .channel('realtime-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_rsvps' }, scheduleRsvpRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, scheduleFullRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, scheduleFullRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, scheduleFullRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, scheduleFullRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'plans' }, scheduleFullRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'student_occurrences' }, scheduleFullRefresh)
        .subscribe();

    return () => { supabase.removeChannel(channel); clearTimeout(fullTimer); clearTimeout(rsvpTimer); };
  }, [isAuthenticated, fetchData]);

  useEffect(() => { if (isAuthenticated && currentUser) fetchData(); }, [isAuthenticated, currentUser, fetchData]);

  const handleEmailLogin = async (e: React.FormEvent) => {
      e.preventDefault(); setIsLoggingIn(true); setLoginError('');
      try {
          const { data, error } = await supabase.from('app_users').select('*').eq('email', loginEmail).eq('password', loginPassword).single();
          if (error || !data) { setLoginError('Email ou senha inválidos.'); setIsLoggingIn(false); return; }
          setCurrentUser(data as User); setIsAuthenticated(true);
      } catch (err) { setLoginError('Erro ao conectar ao servidor.'); } finally { setIsLoggingIn(false); }
  };

  const handleCpfCheck = async (e: React.FormEvent) => {
      e.preventDefault(); 
      setIsLoggingIn(true); 
      setLoginError('');
      
      const cleanInputCpf = loginCpf.replace(/\D/g, ''); 
      if (!cleanInputCpf) {
          setLoginError('Informe o CPF.');
          setIsLoggingIn(false);
          return;
      }

      try {
          const { data: existingUser } = await supabase
              .from('app_users')
              .select('*')
              .eq('cpf', cleanInputCpf)
              .maybeSingle();

          if (existingUser) {
               if (loginPassword) {
                   if (existingUser.password === loginPassword) { 
                       setCurrentUser(existingUser as User); 
                       setIsAuthenticated(true); 
                       setIsLoggingIn(false); 
                       return; 
                   } else { 
                       setLoginError('Senha incorreta.'); 
                       setIsLoggingIn(false); 
                       return; 
                   }
               } else { 
                   setLoginError('Usuário já cadastrado. Por favor, digite sua senha.'); 
                   setIsLoggingIn(false); 
                   return; 
               }
          }

          const { data: studentsData } = await supabase.from('students').select('guardian');
          const matchedStudent = studentsData?.find((s: any) => 
              s.guardian?.cpf?.replace(/\D/g, '') === cleanInputCpf
          );

          if (matchedStudent) {
              if (!loginPassword) {
                  setLoginError('CPF validado! Por favor, digite uma senha para criar seu primeiro acesso.');
                  setIsLoggingIn(false);
                  return;
              }

              const newUserPayload = {
                  name: matchedStudent.guardian.name,
                  email: matchedStudent.guardian.email || `${cleanInputCpf}@martinica.com`,
                  password: loginPassword,
                  role: UserRole.RESPONSAVEL,
                  cpf: cleanInputCpf,
                  avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(matchedStudent.guardian.name)}&background=random`
              };

              const { data: createdUser, error: createError } = await supabase
                  .from('app_users')
                  .insert([newUserPayload])
                  .select()
                  .single();

              if (createError) {
                  setLoginError('Erro ao criar seu acesso. Tente novamente.');
              } else {
                  setCurrentUser(createdUser as User);
                  setIsAuthenticated(true);
                  alert('Acesso criado com sucesso! Bem-vindo(a) ao Portal do Responsável.');
              }
          } else {
              setLoginError('CPF não encontrado em nossa base de atletas.');
          }
      } catch (err) { 
          setLoginError('Erro ao validar CPF.'); 
      } finally { 
          setIsLoggingIn(false); 
      }
  };

  const handleLogout = () => { setCurrentUser(null); setIsAuthenticated(false); navigate('/dashboard'); };

  const handleAddStudent = async (studentData: Omit<Student, 'id'>) => {
    // setIsLoading(true);
    try {
        const payload = {
          name: studentData.name,
          birth_date: safeDate(studentData.birthDate),
          rg: studentData.rg || null,
          cpf: studentData.cpf || null,
          phone: studentData.phone || null,
          medical_expiry: safeDate(studentData.medicalCertificateExpiry),
          photo_url: studentData.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(studentData.name)}&background=random`,
          address: studentData.address || {},
          guardian: studentData.guardian || {},
          plan_id: safeId(studentData.planId),
          group_ids: studentData.groupIds || [],
          positions: studentData.positions || [],
          active: studentData.active ?? true,
          inactive_reason: studentData.inactiveReason || null,
          enrollment_date: safeDate(studentData.enrollmentDate),
          inactivation_date: safeDate(studentData.inactivationDate),
          documents: studentData.documents || {}
        };
        // Retorna a linha criada para atualizar o estado local, sem recarregar toda a base.
        const { data: inserted, error } = await supabase.from('students').insert([payload]).select().single();
        if (error) throw error;

        let generatedTuitions = false;
        if (inserted) {
            studentPhotosRef.current.set(inserted.id, inserted.photo_url || '');
            setStudents(prev => [...prev, mapStudentRow(inserted)]);

            // Gera as mensalidades do novo aluno: do mês da matrícula até dezembro do ano corrente.
            const plan = plans.find(p => p.id === studentData.planId);
            if ((studentData.active ?? true) && plan && !isBolsistaPlan(plan)) {
                const now = new Date();
                const currentYear = now.getFullYear();
                let fromMonth = now.getMonth() + 1;
                const enroll = studentData.enrollmentDate; // 'YYYY-MM-DD'
                if (enroll && enroll.startsWith(String(currentYear))) {
                    const em = parseInt(enroll.slice(5, 7), 10);
                    if (!Number.isNaN(em) && em >= 1 && em <= 12) fromMonth = em;
                }
                const studentForGen = { id: inserted.id, name: studentData.name, planId: studentData.planId } as Student;
                const tuitions = buildTuitionPayloads(studentForGen, plan, [], fromMonth, 12, currentYear);
                if (tuitions.length > 0) {
                    await insertTuitions(tuitions);
                    generatedTuitions = true;
                }
            }
        }
        alert("Atleta cadastrado!");
        // Traz as mensalidades recém-geradas para a tela (em segundo plano).
        if (generatedTuitions) void fetchData(true);
    } catch (err: any) { alert(`Erro: ${err.message}`); } finally { setIsLoading(false); }
  };

  const handleUpdateStudent = async (student: Student) => {
    // setIsLoading(true);
    try {
        // As fotos são carregadas sob demanda; ao editar um aluno cuja foto ainda não foi
        // carregada, student.photoUrl é apenas o avatar temporário. Nesse caso NÃO gravamos
        // photo_url, para não sobrescrever a foto real que está no banco.
        const isPlaceholderPhoto = !student.photoUrl || student.photoUrl.includes('ui-avatars.com');

        // Detecta as transições de status para disparar as ações de inativação/reativação.
        const previous = students.find(s => s.id === student.id);
        const isBeingInactivated = (previous ? previous.active : true) && !student.active;
        const isBeingReactivated = !!previous && previous.active === false && student.active === true;

        // Ao inativar, remove o aluno de todos os grupos.
        const groupIdsToSave = isBeingInactivated ? [] : (student.groupIds || []);

        const payload: any = {
          name: student.name,
          birth_date: safeDate(student.birthDate),
          rg: student.rg || null,
          cpf: student.cpf || null,
          phone: student.phone || null,
          medical_expiry: safeDate(student.medicalCertificateExpiry),
          address: student.address,
          guardian: student.guardian,
          plan_id: safeId(student.planId),
          group_ids: groupIdsToSave,
          positions: student.positions || [],
          active: student.active,
          inactive_reason: student.inactiveReason || null,
          enrollment_date: safeDate(student.enrollmentDate),
          inactivation_date: safeDate(student.inactivationDate),
          documents: student.documents
        };
        if (!isPlaceholderPhoto) payload.photo_url = student.photoUrl;

        const { error } = await supabase.from('students').update(payload).eq('id', student.id);
        if (error) throw error;

        // Ao inativar, pergunta se deve cancelar as cobranças em aberto (pendentes/atrasadas).
        let cancelledIds: string[] = [];
        if (isBeingInactivated) {
            const openCharges = transactions.filter(t =>
                t.studentId === student.id &&
                (t.status === PaymentStatus.PENDING || t.status === PaymentStatus.LATE)
            );
            if (openCharges.length > 0 && window.confirm(
                `Este aluno possui ${openCharges.length} cobrança(s) em aberto (pendentes/atrasadas). Deseja cancelá-la(s)?`
            )) {
                const { error: cancelErr } = await supabase
                    .from('transactions')
                    .update({ status: PaymentStatus.CANCELLED })
                    .eq('student_id', student.id)
                    .in('status', [PaymentStatus.PENDING, PaymentStatus.LATE]);
                if (cancelErr) {
                    console.error('Erro ao cancelar cobranças:', cancelErr);
                    alert(`Aluno inativado, mas houve erro ao cancelar as cobranças: ${cancelErr.message}`);
                } else {
                    cancelledIds = openCharges.map(t => t.id);
                }
            }
        }

        // Ao reativar, gera as parcelas do mês da reativação até dezembro do ano corrente:
        // reativa as canceladas desses meses e cria as que faltam (sem duplicar).
        let reactivationChanged = false;
        if (isBeingReactivated && student.planId) {
            const plan = plans.find(p => p.id === student.planId);
            if (plan && !isBolsistaPlan(plan)) {
                const now = new Date();
                const currentYear = now.getFullYear();
                const fromMonth = now.getMonth() + 1; // mês da reativação

                // Fonte da verdade vem do BANCO (não do estado local), para não duplicar.
                const yearTx = await fetchExistingTuitions([student.id], currentYear);

                // Reativa parcelas totalmente canceladas dos meses [fromMonth..dez].
                const toReactivate: string[] = [];
                for (let m = fromMonth; m <= 12; m++) {
                    const mm = String(m).padStart(2, '0');
                    const inMonth = yearTx.filter(t => (t.date || '').slice(5, 7) === mm);
                    if (inMonth.length === 0) continue; // será criada abaixo
                    const hasActive = inMonth.some(t => t.status !== PaymentStatus.CANCELLED);
                    if (!hasActive) toReactivate.push(inMonth[0].id);
                }
                if (toReactivate.length > 0) {
                    await supabase.from('transactions').update({ status: PaymentStatus.PENDING }).in('id', toReactivate);
                    reactivationChanged = true;
                }

                // Cria parcelas para os meses [fromMonth..dez] que não têm nenhuma mensalidade.
                const studentForGen = { id: student.id, name: student.name, planId: student.planId } as Student;
                const missing = buildTuitionPayloads(studentForGen, plan, yearTx, fromMonth, 12, currentYear);
                if (missing.length > 0) {
                    await insertTuitions(missing);
                    reactivationChanged = true;
                }
            }
        }

        // Atualiza o estado local (aluno + eventuais cobranças canceladas) sem recarregar toda a base.
        if (!isPlaceholderPhoto) studentPhotosRef.current.set(student.id, student.photoUrl!);
        const savedStudent: Student = { ...student, groupIds: groupIdsToSave };
        setStudents(prev => prev.map(s => s.id === student.id
            ? { ...savedStudent, photoUrl: isPlaceholderPhoto ? (s.photoUrl || student.photoUrl) : student.photoUrl }
            : s));
        if (cancelledIds.length > 0) {
            setTransactions(prev => prev.map(t =>
                cancelledIds.includes(t.id) ? { ...t, status: PaymentStatus.CANCELLED } : t));
        }
        // Reflete as parcelas geradas/reativadas na tela (em segundo plano).
        if (reactivationChanged) void fetchData(true);
        alert("Atleta atualizado!");
    } catch (err: any) { alert(`Erro: ${err.message}`); } finally { setIsLoading(false); }
  };

  const handleAddPlan = async (p: Omit<Plan, 'id'>) => {
      await supabase.from('plans').insert([{ name: p.name, price: p.price, due_day: p.dueDay, description: p.description }]);
      await fetchData(true);
  };
  const handleUpdatePlan = async (p: Plan) => {
      await supabase.from('plans').update({ name: p.name, price: p.price, due_day: p.dueDay, description: p.description }).eq('id', p.id);
      await fetchData(true);
  };
  const handleDeletePlan = async (id: string) => {
      await supabase.from('plans').delete().eq('id', id);
      await fetchData(true);
  };

  const handleAddGroup = async (g: Group) => {
      const { data, error } = await supabase.from('groups').insert([{ name: g.name, type: g.type || 'TRAINING' }]).select();
      if (data && data[0]) {
          setGroups(prev => [...prev, { id: data[0].id, name: data[0].name, type: data[0].type }]);
      }
      fetchData(true);
      return data?.[0]?.id || null;
  };
  const handleUpdateGroup = async (g: Group) => {
      setGroups(prev => prev.map(group => group.id === g.id ? { ...group, name: g.name, type: g.type } : group));
      await supabase.from('groups').update({ name: g.name, type: g.type || 'TRAINING' }).eq('id', g.id);
      await fetchData(true);
  };
  const handleDeleteGroup = async (id: string) => {
      // 1. Remove group from all students
      const studentsInGroup = students.filter(s => (s.groupIds || []).includes(id));
      const updatePromises = studentsInGroup.map(s => 
          supabase.from('students').update({ group_ids: (s.groupIds || []).filter(gid => gid !== id) }).eq('id', s.id)
      );
      await Promise.all(updatePromises);

      // 2. Disassociate activities from the group
      const { error: activityError } = await supabase.from('activities').update({ group_id: null }).eq('group_id', id);
      if (activityError) {
          console.error("Error disassociating activities:", activityError);
          alert("Erro ao desassociar atividades do grupo.");
          return;
      }

      // 3. Delete the group
      setGroups(prev => prev.filter(group => group.id !== id));
      const { error } = await supabase.from('groups').delete().eq('id', id);
      
      if (error) {
          console.error("Error deleting group:", error);
          alert("Erro ao excluir grupo.");
      }
      await fetchData(true);
  };

  const handleBatchAssignStudents = async (studentIds: string[], groupId: string) => {
      setStudents(prev => prev.map(s => {
          if (studentIds.includes(s.id)) {
              if (!(s.groupIds || []).includes(groupId)) {
                  return { ...s, groupIds: [...(s.groupIds || []), groupId] };
              }
          } else if ((s.groupIds || []).includes(groupId)) {
              return { ...s, groupIds: (s.groupIds || []).filter(id => id !== groupId) };
          }
          return s;
      }));

      const promises = [];
      for (const sId of studentIds) {
          const student = students.find(s => s.id === sId);
          if (!student) continue;
          if (!(student.groupIds || []).includes(groupId)) {
              const nextGroups = [...(student.groupIds || []), groupId];
              promises.push(supabase.from('students').update({ group_ids: nextGroups }).eq('id', sId));
          }
      }
      const others = students.filter(s => !studentIds.includes(s.id) && (s.groupIds || []).includes(groupId));
      for (const s of others) {
          const nextGroups = (s.groupIds || []).filter(id => id !== groupId);
          promises.push(supabase.from('students').update({ group_ids: nextGroups }).eq('id', s.id));
      }
      
      await Promise.all(promises);
      await fetchData(true); // Atualiza em background
  };

  const handleAddUser = async (u: Omit<User, 'id'>) => {
      await supabase.from('app_users').insert([u]);
      await fetchData(true);
  };
  const handleUpdateUser = async (u: User) => {
      await supabase.from('app_users').update(u).eq('id', u.id);
      await fetchData(true);
  };
  const handleDeleteUser = async (id: string) => {
      await supabase.from('app_users').delete().eq('id', id);
      await fetchData(true);
  };

  const handleUpdateTransaction = async (t: Partial<Transaction>) => { 
      if (!t.id) return;
      const payload: any = {};
      if (t.description !== undefined) payload.description = t.description;
      if (t.category !== undefined) payload.category = t.category;
      if (t.amount !== undefined) payload.amount = t.amount;
      if (t.type !== undefined) payload.type = t.type;
      if (t.date !== undefined) payload.date = t.date;
      if (t.paymentDate !== undefined) payload.payment_date = t.paymentDate;
      if (t.status !== undefined) payload.status = t.status;
      if (t.studentId !== undefined) payload.student_id = safeId(t.studentId);
      if (t.planId !== undefined) payload.plan_id = safeId(t.planId);
      if (t.paymentMethod !== undefined) payload.payment_method = t.paymentMethod;
      if (t.paymentLink !== undefined) payload.payment_link = t.paymentLink;
      if (t.externalReference !== undefined) payload.external_reference = t.externalReference;
      if (t.preferenceId !== undefined) payload.preference_id = t.preferenceId;
      if (t.recurrence !== undefined) payload.recurrence = t.recurrence;

      // Optimistic update
      setTransactions(prev => prev.map(tx => tx.id === t.id ? { ...tx, ...t } : tx));

      const { error } = await supabase.from('transactions').update(payload).eq('id', t.id);
      if(!error) {
        if (t.status === PaymentStatus.PAID) {
            const fullTx = transactions.find(tx => tx.id === t.id);
            const student = students.find(s => s.id === (fullTx?.studentId));
            if (student && student.guardian.phone && fullTx) {
                const amount = t.amount || fullTx.amount;
                const description = t.description || fullTx.description;
                const msg = `✅ *PAGAMENTO RECEBIDO* ⚽\n\nOlá *${student.guardian.name}*!\nConfirmamos o recebimento do pagamento do atleta *${student.name}*:\n\n📌 *${description}*\n💰 Valor: *R$ ${amount.toFixed(2)}*\n\nObrigado! Garotos do Martinica.`;
                sendZApiMessage(student.guardian.phone, msg);
            }
        }
        // Background fetch will happen via realtime subscription, no need to await it here
        fetchData(true);
      } else {
        // Revert on error
        fetchData(true);
      }
  };

  const handleAddTransaction = async (t: Omit<Transaction, 'id'>) => {
    const payload = { description: t.description, category: t.category || 'Outros', amount: t.amount, type: t.type, date: t.date, payment_date: t.paymentDate, status: t.status, student_id: safeId(t.studentId), plan_id: safeId(t.planId), payment_method: t.paymentMethod, recurrence: t.recurrence || 'NONE' };
    await supabase.from('transactions').insert([payload]);
    await fetchData(true);
  };

  const handleGenerateGlobalTuitions = async (studentId?: string) => {
    setIsLoading(true);
    try {
      const now = new Date();
      const currentMonth = now.getMonth() + 1; // gera do mês corrente...
      const currentYear = now.getFullYear();   // ...até dezembro do ano corrente.

      // Um aluno específico (se informado) ou todos os ativos; sempre só ativos.
      const targets = (studentId ? students.filter(s => s.id === studentId) : students)
        .filter(s => s.active);

      // Fonte da verdade vem do BANCO (não do estado local), para não duplicar mensalidades.
      const existing = await fetchExistingTuitions(targets.map(s => s.id), currentYear);

      const allPayloads: any[] = [];
      for (const student of targets) {
        if (!student.planId) continue;
        const plan = plans.find(p => p.id === student.planId);
        if (!plan || isBolsistaPlan(plan)) continue; // Bolsista não gera mensalidade.
        // Ignora meses anteriores (começa no mês corrente) e meses já lançados.
        allPayloads.push(...buildTuitionPayloads(student, plan, existing, currentMonth, 12, currentYear));
      }

      await insertTuitions(allPayloads);
      await fetchData(true);
    } catch (err) {
      console.error("Error generating tuitions", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddActivity = async (a: Omit<Activity, 'id'>) => {
      const payload = { 
          title: a.title, 
          activity_type: a.type, 
          fee: a.fee || 0, 
          location: a.location || '', 
          presentation_location: a.presentationLocation,
          presentation_time: a.presentationTime, 
          direct_to_game_time: a.directToGameTime,
          ask_transport: a.askTransport,
          opponent: a.opponent, 
          home_score: a.homeScore, 
          away_score: a.awayScore, 
          scorers: a.scorers || [], 
          group_id: safeId(a.groupId), 
          participants: a.participants || [], 
          date: a.date, 
          start_time: a.startTime, 
          end_time: a.endTime, 
          recurrence: a.recurrence || 'none', 
          attendance: a.attendance || [], 
          fee_payments: a.feePayments || [],
          lineup: (a.type === 'TRAINING' || a.type === 'MONTHLY_EVALUATION') ? a.evaluations : a.lineup,
          description: a.description
      };
      
      const { data: newActivityData, error } = await supabase
        .from('activities')
        .insert([payload])
        .select()
        .single();

      if (error) {
        console.error("Error creating activity:", error);
        alert(`Erro ao criar atividade: ${error.message}`);
        return;
      }

      if (newActivityData) {
        setActivities(prev => [...prev, {
          id: newActivityData.id,
          title: newActivityData.title,
          type: newActivityData.activity_type || 'TRAINING',
          fee: newActivityData.fee || 0,
          location: newActivityData.location || '',
          presentationLocation: newActivityData.presentation_location,
          presentationTime: newActivityData.presentation_time,
          directToGameTime: newActivityData.direct_to_game_time,
          askTransport: newActivityData.ask_transport,
          opponent: newActivityData.opponent,
          homeScore: newActivityData.home_score,
          awayScore: newActivityData.away_score,
          scorers: newActivityData.scorers || [],
          groupId: newActivityData.group_id,
          participants: newActivityData.participants || [],
          date: newActivityData.date,
          startTime: newActivityData.start_time,
          endTime: newActivityData.end_time,
          recurrence: newActivityData.recurrence || 'none',
          attendance: newActivityData.attendance || [],
          feePayments: newActivityData.fee_payments || [],
          lineup: newActivityData.activity_type === 'GAME' ? newActivityData.lineup : undefined,
          evaluations: (newActivityData.activity_type === 'TRAINING' || newActivityData.activity_type === 'MONTHLY_EVALUATION') ? newActivityData.lineup : undefined,
          description: newActivityData.description,
          rsvps: []
        } as Activity]);
      }
  };

  const handleUpdateActivity = async (a: Activity) => {
      const originalActivity = activities.find(act => act.id === a.id);

      const payload = { 
          title: a.title, activity_type: a.type, fee: a.fee, location: a.location, 
          presentation_location: a.presentationLocation, presentation_time: a.presentationTime, 
          direct_to_game_time: a.directToGameTime, ask_transport: a.askTransport, opponent: a.opponent, home_score: a.homeScore, 
          away_score: a.awayScore, scorers: a.scorers, group_id: safeId(a.groupId), 
          participants: a.participants, date: a.date, start_time: a.startTime, 
          end_time: a.endTime, recurrence: a.recurrence, attendance: a.attendance, 
          fee_payments: a.feePayments, lineup: (a.type === 'TRAINING' || a.type === 'MONTHLY_EVALUATION') ? a.evaluations : a.lineup, description: a.description
      };
      await supabase.from('activities').update(payload).eq('id', a.id);

      const isGameWithFee = a.type === 'GAME' && a.fee && a.fee > 0;
      const wasGameWithFee = originalActivity?.type === 'GAME' && originalActivity.fee && originalActivity.fee > 0;

      // --- Sync Transactions ---
      if (isGameWithFee) {
          let participantIds: string[] = [];
          if (a.groupId) {
              participantIds = students.filter(s => s.active && (s.groupIds || []).includes(a.groupId!)).map(s => s.id);
          } else if (a.participants) {
              participantIds = a.participants;
          }

          const existingTxs = transactions.filter(t => t.externalReference?.startsWith(`game_fee_${a.id}_`));
          const participantIdSet = new Set(participantIds);
          
          const transactionsToInsert = [];
          const transactionsToUpdate = [];

          for (const studentId of participantIds) {
              const extRef = `game_fee_${a.id}_${studentId}`;
              const existingTx = existingTxs.find(t => t.externalReference === extRef);
              const isPresent = (a.attendance || []).includes(studentId);
              const hasConfirmedRsvp = a.rsvps?.some(r => r.studentId === studentId && r.status === 'CONFIRMED');

              if (!existingTx) {
                  transactionsToInsert.push({
                      description: `Taxa Jogo: ${a.title}`, category: 'Taxa de Atividade',
                      amount: a.fee, type: TransactionType.INCOME, date: a.date,
                      status: PaymentStatus.PENDING, 
                      student_id: studentId,
                      external_reference: extRef, recurrence: 'NONE',
                  });
              } else {
                  const updates: any = {};
                  let needsUpdate = false;

                  if (existingTx.status === PaymentStatus.PENDING && (existingTx.amount !== a.fee || existingTx.date !== a.date)) {
                      updates.amount = a.fee;
                      updates.date = a.date;
                      needsUpdate = true;
                  }

                  // Sincronizar status com presença (apenas para transações não pagas)
                  const isGameFinished = typeof a.homeScore === 'number' && typeof a.awayScore === 'number';
                  
                  if (existingTx.status === PaymentStatus.PENDING && !isPresent && isGameFinished) {
                      updates.status = PaymentStatus.CANCELLED;
                      needsUpdate = true;
                  } else if (existingTx.status === PaymentStatus.CANCELLED && isPresent) {
                      updates.status = PaymentStatus.PENDING;
                      needsUpdate = true;
                  }

                  if (needsUpdate) {
                      transactionsToUpdate.push(
                          supabase.from('transactions').update(updates).eq('id', existingTx.id)
                      );
                  }
              }
          }

          const txsToDelete = existingTxs
              .filter(tx => !participantIdSet.has(tx.studentId!) && tx.status === PaymentStatus.PENDING)
              .map(tx => tx.id);

          if (transactionsToInsert.length > 0) await supabase.from('transactions').insert(transactionsToInsert);
          if (transactionsToUpdate.length > 0) await Promise.all(transactionsToUpdate);
          if (txsToDelete.length > 0) await supabase.from('transactions').delete().in('id', txsToDelete);

      } else if (wasGameWithFee && !isGameWithFee) {
          await supabase.from('transactions').delete().like('external_reference', `game_fee_${a.id}_%`).eq('status', PaymentStatus.PENDING);
      }

      setActivities(prev => prev.map(act => act.id === a.id ? a : act));
  };

  const handleDeleteActivity = async (id: string) => {
      // Also delete associated pending fee transactions
      await supabase.from('transactions').delete().like('external_reference', `game_fee_${id}_%`).eq('status', PaymentStatus.PENDING);
      await supabase.from('activities').delete().eq('id', id);
      setActivities(prev => prev.filter(act => act.id !== id));
  };

  const handleUpdateAttendance = async (activityId: string, studentId: string) => {
    const activity = activities.find(a => a.id === activityId);
    if (!activity) return;
    
    const isPresent = activity.attendance.includes(studentId);
    const nextAttendance = isPresent 
      ? activity.attendance.filter(id => id !== studentId) 
      : [...activity.attendance, studentId];
    
    // Optimistic update for activities
    setActivities(prev => prev.map(a => a.id === activityId ? { ...a, attendance: nextAttendance } : a));

    await supabase.from('activities').update({ attendance: nextAttendance }).eq('id', activityId);

    // Regra: Se for um JOGO com taxa, sincronizar o status da cobrança com a presença.
    if (activity.type === 'GAME' && activity.fee && activity.fee > 0) {
        const extRef = `game_fee_${activityId}_${studentId}`;
        const isGameFinished = typeof activity.homeScore === 'number' && typeof activity.awayScore === 'number';

        // Fonte da verdade é o BANCO, não o estado local (que pode estar desatualizado se a
        // cobrança foi criada pela confirmação do RSVP). Isso evita gerar cobrança duplicada.
        const { data: existingRows } = await supabase
            .from('transactions')
            .select('*')
            .eq('external_reference', extRef)
            .order('created_at', { ascending: true });
        const existing = existingRows && existingRows.length > 0 ? existingRows[0] : null;

        if (isPresent) {
            // Estava presente e agora está marcando FALTA → cancela a cobrança pendente (se o jogo já acabou).
            if (existing && existing.status === PaymentStatus.PENDING && isGameFinished) {
                await supabase.from('transactions').update({ status: PaymentStatus.CANCELLED }).eq('id', existing.id);
                setTransactions(prev => prev.map(tx => tx.id === existing.id ? { ...tx, status: PaymentStatus.CANCELLED } : tx));
            }
        } else {
            // Estava ausente e agora está marcando PRESENÇA.
            if (existing) {
                // Já existe cobrança → nunca duplica. Reativa apenas se estava cancelada; mantém paga/pendente.
                if (existing.status === PaymentStatus.CANCELLED) {
                    await supabase.from('transactions').update({ status: PaymentStatus.PENDING }).eq('id', existing.id);
                    setTransactions(prev => prev.map(tx => tx.id === existing.id ? { ...tx, status: PaymentStatus.PENDING } : tx));
                }
            } else {
                // Não existe nenhuma → cria. O índice único no banco é o backstop contra corrida.
                const txPayload = {
                    description: `Taxa Jogo: ${activity.title}`,
                    category: 'Taxa de Atividade',
                    amount: activity.fee,
                    type: TransactionType.INCOME,
                    date: activity.date,
                    status: PaymentStatus.PENDING,
                    student_id: studentId,
                    payment_method: PaymentMethod.PIX_MERCADO_PAGO,
                    external_reference: extRef
                };
                const { error: insErr } = await supabase.from('transactions').insert([txPayload]);
                if (insErr) {
                    // Provável violação do índice único (a cobrança já foi criada em paralelo) — ignora.
                    console.warn('Cobrança de taxa já existente; duplicidade evitada:', insErr.message);
                } else {
                    setTransactions(prev => [...prev, { ...txPayload, id: 'temp-' + Date.now() } as any]);
                }
            }
        }
    }

    // Background fetch will happen via realtime subscription
  };

  const handleUpdateFeePayment = async (activityId: string, studentId: string) => {
    const activity = activities.find(a => a.id === activityId);
    const student = students.find(s => s.id === studentId);
    if (!activity || !student) return;

    const extRef = `game_fee_${activityId}_${studentId}`;
    const existingTx = transactions.find(t => t.externalReference === extRef);
    
    // Check if paid based on transaction status
    const isCurrentlyPaid = existingTx?.status === PaymentStatus.PAID;
    const becomingPaid = !isCurrentlyPaid;

    // Keep feePayments array updated just in case, but we rely on transactions
    const feePayments = activity.feePayments || [];
    const nextFeePayments = becomingPaid
        ? [...feePayments, studentId]
        : feePayments.filter(id => id !== studentId);

    // Optimistic update for activities
    setActivities(prev => prev.map(a => a.id === activityId ? { ...a, feePayments: nextFeePayments } : a));

    const { error: actError } = await supabase.from('activities').update({ fee_payments: nextFeePayments }).eq('id', activityId);
    if (actError) {
        console.error("Error updating activity fee payments:", actError);
        // Revert on error
        fetchData(true);
        return;
    }

    if (becomingPaid) {
        if (existingTx) {
            // Optimistic update for transactions
            setTransactions(prev => prev.map(tx => tx.id === existingTx.id ? { ...tx, status: PaymentStatus.PAID, paymentDate: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }), paymentMethod: PaymentMethod.CASH } : tx));
            await supabase.from('transactions').update({
                status: PaymentStatus.PAID,
                payment_date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }),
                payment_method: PaymentMethod.CASH
            }).eq('id', existingTx.id);
        } else {
            // This is a fallback, but with the new logic it should be rare.
            const txPayload = {
                description: `Taxa: ${activity.title}`,
                category: 'Taxa de Atividade',
                amount: Number(activity.fee) || 0,
                type: TransactionType.INCOME,
                date: activity.date,
                payment_date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }),
                status: PaymentStatus.PAID,
                student_id: studentId,
                payment_method: PaymentMethod.CASH,
                external_reference: extRef
            };
            // Optimistic update for transactions (we don't have the ID yet, so we just append a temporary one)
            setTransactions(prev => [...prev, { ...txPayload, id: 'temp-' + Date.now() } as any]);
            await supabase.from('transactions').insert([txPayload]);
        }

        if (student.guardian.phone) {
            const msg = `✅ *PAGAMENTO DE TAXA RECEBIDO* ⚽\n\nOlá *${student.guardian.name}*!\n\nConfirmamos o recebimento da taxa de *R$ ${Number(activity.fee).toFixed(2)}* referente à atividade: *${activity.title}* do atleta *${student.name}*.\n\nObrigado! Garotos do Martinica.`;
            sendZApiMessage(student.guardian.phone, msg);
        }
    } else {
        if (existingTx) {
            // Optimistic update for transactions
            setTransactions(prev => prev.map(tx => tx.id === existingTx.id ? { ...tx, status: PaymentStatus.PENDING, paymentDate: undefined } : tx));
            await supabase.from('transactions').update({
                status: PaymentStatus.PENDING,
                payment_date: null
            }).eq('id', existingTx.id);
        }
    }

    // Background fetch will happen via realtime subscription
  };

  const handleAddOccurrence = async (studentId: string, description: string, date: string) => {
      const { error } = await supabase.from('student_occurrences').insert([{ student_id: studentId, description, date }]);
      if (error) return false;
      const student = students.find(s => s.id === studentId);
      if (student?.guardian.phone) {
          const msg = `⚽ *COMUNICADO DE OCORRÊNCIA* ⚽\n\nOlá *${student.guardian.name}*!\n\nRegistramos a seguinte ocorrência para o atleta *${student.name}* em ${date.split('-').reverse().join('/')}:\n\n"${description}"\n\nQualquer dúvida, procure a coordenação. Garotos do Martinica.`;
          sendZApiMessage(student.guardian.phone, msg);
      }
      // await fetchData(true);
      return true;
  };

  const handleNavigate = (page: string, data?: any) => { navigate(`/${page}`, { state: data }); };

  // Special case for logs page to render outside the main layout
  if (location.pathname === '/logs') {
    return <LogsPage />;
  }

  // Special case for RSVP page (Public)
  if (location.pathname.startsWith('/rsvp/')) {
    return (
      <Routes>
        <Route path="/rsvp/:activityId/:studentId" element={<RSVPPage />} />
      </Routes>
    );
  }

  if (!isAuthenticated) {
    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-md overflow-hidden">
                <div className="bg-primary-600 p-8 text-center">
                    <h1 className="text-2xl font-bold text-white mb-1">Garotos do Martinica</h1>
                    <p className="text-primary-100">Gestão de Escolinha</p>
                </div>
                <div className="flex border-b">
                    <button className={`flex-1 py-4 text-sm font-semibold ${activeLoginTab === 'EMAIL' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500'}`} onClick={() => setActiveLoginTab('EMAIL')}>Gestão</button>
                    <button className={`flex-1 py-4 text-sm font-semibold ${activeLoginTab === 'CPF' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500'}`} onClick={() => setActiveLoginTab('CPF')}>Responsável</button>
                </div>
                <div className="p-8">
                    {activeLoginTab === 'EMAIL' ? (
                        <form onSubmit={handleEmailLogin} className="space-y-4">
                            <input type="email" placeholder="Email" className="w-full border rounded-lg p-3 outline-none" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} />
                            <input type="password" placeholder="Senha" className="w-full border rounded-lg p-3 outline-none" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
                            <button className="w-full bg-primary-600 text-white py-3 rounded-lg font-bold">Entrar</button>
                        </form>
                    ) : (
                        <form onSubmit={handleCpfCheck} className="space-y-4">
                            <input type="text" placeholder="CPF do Responsável" className="w-full border rounded-lg p-3 outline-none" value={loginCpf} onChange={e => setLoginCpf(e.target.value)} />
                            <input type="password" placeholder="Senha (ou escolha uma no 1º acesso)" className="w-full border rounded-lg p-3 outline-none" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
                            <button className="w-full bg-primary-600 text-white py-3 rounded-lg font-bold">Acessar</button>
                        </form>
                    )}
                    {loginError && <p className="text-red-500 text-sm mt-4 text-center">{loginError}</p>}
                </div>
            </div>
        </div>
    );
  }

  return (
    <div className="flex bg-gray-50 min-h-screen pb-20 md:pb-0">
      {isLoading && <div className="fixed inset-0 z-[100] bg-black/20 flex items-center justify-center"><Loader2 className="animate-spin text-primary-600 w-12 h-12" /></div>}
      <Sidebar currentUser={currentUser!} currentPage={currentPage} onNavigate={handleNavigate} onLogout={handleLogout} isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
      
      <main className="flex-1 md:ml-64 p-4 md:p-8 w-full max-w-full overflow-x-hidden">
        <header className="mb-6 md:mb-8 flex items-center justify-between md:justify-start gap-4 bg-white md:bg-transparent p-4 md:p-0 -mx-4 md:mx-0 -mt-4 md:mt-0 shadow-sm md:shadow-none sticky top-0 z-30">
            <div className="flex items-center gap-3">
              <img src="/logo.svg" alt="Logo" className="w-8 h-8 md:hidden" />
              <h1 className="text-xl md:text-2xl font-bold text-gray-900 uppercase tracking-tight">{currentPage}</h1>
            </div>
            <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden p-2 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"><Menu className="w-5 h-5" /></button>
        </header>

        <div className="max-w-7xl mx-auto">
          {loadError && (
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-4">
              <span className="text-sm font-medium">{loadError}</span>
              <button
                onClick={() => fetchData()}
                disabled={isLoading}
                className="shrink-0 inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                {isLoading && <Loader2 className="animate-spin w-4 h-4" />}
                Recarregar
              </button>
            </div>
          )}
          <Routes>
            <Route path="/dashboard" element={<DashboardPage students={students} transactions={transactions} activities={activities} role={currentUser!.role} onNavigate={handleNavigate} />} />
            <Route path="/students" element={<StudentsPage students={students} groups={groups} plans={plans} transactions={transactions} activities={activities} occurrences={occurrences} onAddStudent={handleAddStudent} onUpdateStudent={handleUpdateStudent} onUpdateTransaction={handleUpdateTransaction} onAddTransaction={handleAddTransaction} onAddOccurrence={handleAddOccurrence} onAddActivity={handleAddActivity} onUpdateActivity={handleUpdateActivity} onGenerateTuitions={handleGenerateGlobalTuitions} initialFilter={location.state?.filter} currentUser={currentUser} onBatchAddStudents={() => {}} />} />
            <Route path="/finance" element={<FinancePage students={students} groups={groups} transactions={transactions} plans={plans} onAddTransaction={handleAddTransaction} onUpdateTransaction={handleUpdateTransaction} />} />
            <Route path="/schedule" element={<SchedulePage activities={activities} students={students} groups={groups} onAddActivity={handleAddActivity} onUpdateActivity={handleUpdateActivity} onUpdateAttendance={handleUpdateAttendance} onUpdateFeePayment={handleUpdateFeePayment} onDeleteActivity={handleDeleteActivity} currentUser={currentUser} onAddTransaction={handleAddTransaction} onUpdateTransaction={handleUpdateTransaction} transactions={transactions} onRefresh={() => fetchData(true)} />} />
            <Route path="/groups" element={<GroupsPage groups={groups} students={students} transactions={transactions} onAddGroup={handleAddGroup} onUpdateGroup={handleUpdateGroup} onDeleteGroup={handleDeleteGroup} onBatchAssignStudents={handleBatchAssignStudents} />} />
            <Route path="/plans" element={<PlansPage plans={plans} onAddPlan={handleAddPlan} onUpdatePlan={handleUpdatePlan} onDeletePlan={handleDeletePlan} />} />
            <Route path="/users" element={<UsersPage users={systemUsers} onAddUser={handleAddUser} onUpdateUser={handleUpdateUser} onDeleteUser={handleDeleteUser} />} />
            <Route path="/aicoach" element={<AICoachPage income={transactions.filter(t => t.type === TransactionType.INCOME && t.status === PaymentStatus.PAID).reduce((acc, curr) => acc + curr.amount, 0)} expense={transactions.filter(t => t.type === TransactionType.EXPENSE && t.status === PaymentStatus.PAID).reduce((acc, curr) => acc + curr.amount, 0)} />} />
            <Route path="/" element={<DashboardPage students={students} transactions={transactions} activities={activities} role={currentUser!.role} onNavigate={handleNavigate} />} />
          </Routes>
        </div>
      </main>

      {/* Bottom Navigation for Mobile */}
      <BottomNav 
        currentUser={currentUser!} 
        currentPage={currentPage} 
        onNavigate={handleNavigate} 
        onOpenMenu={() => setIsMobileMenuOpen(true)} 
      />
    </div>
  );
}

export default App;
