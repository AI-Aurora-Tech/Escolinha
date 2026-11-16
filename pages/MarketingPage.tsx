import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User, UserRole } from '../types';
import { supabase } from '../lib/supabaseClient';
import { jsPDF } from 'jspdf';
import { sendZApiMessage } from '../services/zapiService';
import {
  Megaphone, Plus, Search, X, Edit, Trash2, MessageCircle, Phone, MapPin, CalendarClock, AlertTriangle,
  Users, Handshake, CheckSquare, Square, Pause, Play, Loader2, BarChart3, ListChecks, History, Send, RefreshCw, Tags, Eye, EyeOff, FileText
} from 'lucide-react';

// ---------- Tipos e constantes ----------

type LeadType = 'STUDENT' | 'SPONSOR';
type LeadStatus = 'NEW' | 'CONTACTED' | 'NEGOTIATING' | 'WON' | 'LOST';

interface LeadHistoryEntry {
  date: string;   // ISO
  text: string;
  author?: string;
}

interface Lead {
  id: string;
  leadType: LeadType;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  neighborhood: string;
  source: string;
  interest: string;
  status: LeadStatus;
  nextContactDate: string; // 'YYYY-MM-DD' ou ''
  history: LeadHistoryEntry[];
  sponsorshipTypeIds: string[]; // tipos de patrocínio de interesse (só patrocinador)
  dealValue: string;            // valor negociado, como digitado ('' = não informado)
  dealFrequency: 'MONTHLY' | 'ONCE';
  sponsorDocument: string;      // CNPJ / CPF do patrocinador
  partnershipStart: string;     // 'YYYY-MM-DD' ou ''
  partnershipEnd: string;       // prazo final da parceria, 'YYYY-MM-DD' ou ''
  createdAt?: string;
}

interface SponsorshipType {
  id: string;
  name: string;
  description: string;
  suggestedValue: number | null;
  active: boolean;
}

const STATUS_LIST: { id: LeadStatus; label: string; badge: string; bar: string }[] = [
  { id: 'NEW', label: 'Novo', badge: 'bg-blue-50 text-blue-700 border-blue-200', bar: 'bg-blue-500' },
  { id: 'CONTACTED', label: 'Contatado', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200', bar: 'bg-indigo-500' },
  { id: 'NEGOTIATING', label: 'Negociando', badge: 'bg-amber-50 text-amber-700 border-amber-200', bar: 'bg-amber-500' },
  { id: 'WON', label: 'Fechado', badge: 'bg-green-50 text-green-700 border-green-200', bar: 'bg-green-500' },
  { id: 'LOST', label: 'Perdido', badge: 'bg-gray-100 text-gray-500 border-gray-200', bar: 'bg-gray-400' },
];
const statusInfo = (s: LeadStatus) => STATUS_LIST.find(x => x.id === s) || STATUS_LIST[0];

const TYPE_LABEL: Record<LeadType, string> = { STUDENT: 'Possível aluno', SPONSOR: 'Possível patrocinador' };

const SOURCES = ['Indicação', 'Instagram', 'Facebook', 'WhatsApp', 'Panfleto', 'Evento / Jogo', 'Visita', 'Google', 'Outro'];

const EMPTY_LEAD: Omit<Lead, 'id'> = {
  leadType: 'STUDENT', name: '', contactName: '', phone: '', email: '', neighborhood: '', source: '',
  interest: '', status: 'NEW', nextContactDate: '', history: [], sponsorshipTypeIds: [], dealValue: '',
  dealFrequency: 'MONTHLY', sponsorDocument: '', partnershipStart: '', partnershipEnd: '',
};

const formatMoney = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
// Aceita "1.500,50", "1500,50", "1500.50" e "1500".
const parseMoney = (v: string): number | null => {
  let t = String(v ?? '').replace(/[^\d.,]/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (!/^\d+(\.\d{1,2})?$/.test(t)) t = t.replace(/\./g, '');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
};

const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

const formatDate = (d?: string) => {
  if (!d) return '';
  const p = d.slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
};

const formatDateTime = (iso: string) => {
  try { return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }); }
  catch { return iso; }
};

const isOpenStatus = (s: LeadStatus) => s !== 'WON' && s !== 'LOST';

const mapRow = (r: any): Lead => ({
  id: r.id,
  leadType: r.lead_type === 'SPONSOR' ? 'SPONSOR' : 'STUDENT',
  name: r.name || '',
  contactName: r.contact_name || '',
  phone: r.phone || '',
  email: r.email || '',
  neighborhood: r.neighborhood || '',
  source: r.source || '',
  interest: r.interest || '',
  status: (STATUS_LIST.some(s => s.id === r.status) ? r.status : 'NEW') as LeadStatus,
  nextContactDate: r.next_contact_date || '',
  history: Array.isArray(r.history) ? r.history : [],
  sponsorshipTypeIds: Array.isArray(r.sponsorship_type_ids) ? r.sponsorship_type_ids : [],
  dealValue: r.deal_value != null ? String(r.deal_value).replace('.', ',') : '',
  dealFrequency: r.deal_frequency === 'ONCE' ? 'ONCE' : 'MONTHLY',
  sponsorDocument: r.sponsor_document || '',
  partnershipStart: r.partnership_start || '',
  partnershipEnd: r.partnership_end || '',
  createdAt: r.created_at,
});

const mapTypeRow = (r: any): SponsorshipType => ({
  id: r.id, name: r.name || '', description: r.description || '',
  suggestedValue: r.suggested_value != null ? Number(r.suggested_value) : null, active: r.active !== false,
});

const toRow = (l: Omit<Lead, 'id'>) => ({
  lead_type: l.leadType,
  name: l.name.trim(),
  contact_name: l.contactName.trim() || null,
  phone: l.phone.trim() || null,
  email: l.email.trim() || null,
  neighborhood: l.neighborhood.trim() || null,
  source: l.source || null,
  interest: l.interest.trim() || null,
  status: l.status,
  next_contact_date: l.nextContactDate || null,
  history: l.history,
  sponsorship_type_ids: l.leadType === 'SPONSOR' ? l.sponsorshipTypeIds : [],
  deal_value: l.leadType === 'SPONSOR' ? parseMoney(l.dealValue) : null,
  deal_frequency: l.leadType === 'SPONSOR' ? l.dealFrequency : null,
  sponsor_document: l.leadType === 'SPONSOR' ? (l.sponsorDocument.trim() || null) : null,
  partnership_start: l.leadType === 'SPONSOR' ? (l.partnershipStart || null) : null,
  partnership_end: l.leadType === 'SPONSOR' ? (l.partnershipEnd || null) : null,
  updated_at: new Date().toISOString(),
});

// A tabela é criada pelo script marketing_setup.sql; sem ela mostramos as instruções.
const isMissingTable = (err: any) =>
  /(marketing_leads|sponsorship_types)/i.test(err?.message || '') && /(does not exist|could not find|schema cache)/i.test(err?.message || '');
// Colunas novas (tipos de patrocínio / valor) ausentes: o script precisa ser executado de novo.
const isMissingColumn = (err: any) => /(sponsorship_type_ids|deal_value|deal_frequency|sponsor_document|partnership_start|partnership_end)/i.test(err?.message || '');
const SETUP_HINT = 'Execute novamente o script marketing_setup.sql no SQL Editor do Supabase (ele foi atualizado com novos campos).';

// Dias entre hoje e uma data 'YYYY-MM-DD' (negativo = já passou).
const daysUntil = (date: string, today: string) =>
  Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
const EXPIRING_DAYS = 30;

// ---------- Componente ----------

interface MarketingPageProps {
  currentUser: User | null;
}

export const MarketingPage: React.FC<MarketingPageProps> = ({ currentUser }) => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<'DASHBOARD' | 'LEADS' | 'TYPES'>('DASHBOARD');
  const [types, setTypes] = useState<SponsorshipType[]>([]);
  const [typeForm, setTypeForm] = useState<{ id: string | null; name: string; description: string; suggestedValue: string } | null>(null);
  const [sponsorshipFilter, setSponsorshipFilter] = useState<string>('ALL');

  // Filtros
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | LeadType>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | LeadStatus>('OPEN');
  const [followUpFilter, setFollowUpFilter] = useState<'ALL' | 'DUE'>('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Cadastro / edição
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Lead, 'id'>>(EMPTY_LEAD);
  const [newNote, setNewNote] = useState('');
  const [saving, setSaving] = useState(false);

  // WhatsApp
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTargets, setComposeTargets] = useState<Lead[]>([]);
  const [composeMessage, setComposeMessage] = useState('');
  const [queueOpen, setQueueOpen] = useState(false);
  const [queue, setQueue] = useState<Lead[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [queueRunning, setQueueRunning] = useState(false);
  const [queueCountdown, setQueueCountdown] = useState(10);
  const [queueLogs, setQueueLogs] = useState<string[]>([]);
  const [queueMessage, setQueueMessage] = useState('');
  const queueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueProcessingRef = useRef(false);

  const authorName = currentUser?.name || 'Administrador';
  const today = todayStr();

  // ---------- Carregar ----------

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [leadsRes, typesRes] = await Promise.all([
      supabase.from('marketing_leads').select('*').order('created_at', { ascending: false }).order('id', { ascending: true }),
      supabase.from('sponsorship_types').select('*').order('name', { ascending: true }),
    ]);
    const error = leadsRes.error || typesRes.error;
    if (error) {
      if (isMissingTable(error)) setTableMissing(true);
      else setLoadError(`Não foi possível carregar os contatos: ${error.message}`);
      setLeads([]);
    } else {
      setTableMissing(false);
      setLeads((leadsRes.data || []).map(mapRow));
      setTypes((typesRes.data || []).map(mapTypeRow));
    }
    setLoading(false);
  }, []);

  useEffect(() => { void loadLeads(); }, [loadLeads]);

  // ---------- Derivados ----------

  const isDue = (l: Lead) => isOpenStatus(l.status) && !!l.nextContactDate && l.nextContactDate <= today;

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter(l => {
      if (typeFilter !== 'ALL' && l.leadType !== typeFilter) return false;
      if (statusFilter === 'OPEN' && !isOpenStatus(l.status)) return false;
      if (statusFilter !== 'ALL' && statusFilter !== 'OPEN' && l.status !== statusFilter) return false;
      if (followUpFilter === 'DUE' && !isDue(l)) return false;
      if (sponsorshipFilter !== 'ALL' && !(l.leadType === 'SPONSOR' && l.sponsorshipTypeIds.includes(sponsorshipFilter))) return false;
      if (q && ![l.name, l.contactName, l.phone, l.neighborhood, l.interest, l.email].some(v => (v || '').toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => {
      // Retornos vencidos primeiro, depois por data de retorno, depois nome.
      const da = isDue(a) ? 0 : 1, db = isDue(b) ? 0 : 1;
      if (da !== db) return da - db;
      const na = a.nextContactDate || '9999-12-31', nb = b.nextContactDate || '9999-12-31';
      if (na !== nb) return na.localeCompare(nb);
      return a.name.localeCompare(b.name);
    });
  }, [leads, search, typeFilter, statusFilter, followUpFilter, sponsorshipFilter, today]);

  const stats = useMemo(() => {
    const byStatus: Record<LeadStatus, number> = { NEW: 0, CONTACTED: 0, NEGOTIATING: 0, WON: 0, LOST: 0 };
    const byType: Record<LeadType, { total: number; won: number }> = { STUDENT: { total: 0, won: 0 }, SPONSOR: { total: 0, won: 0 } };
    const bySource: Record<string, { total: number; won: number }> = {};
    let due = 0;
    leads.forEach(l => {
      byStatus[l.status]++;
      byType[l.leadType].total++;
      if (l.status === 'WON') byType[l.leadType].won++;
      const src = l.source || 'Não informada';
      bySource[src] = bySource[src] || { total: 0, won: 0 };
      bySource[src].total++;
      if (l.status === 'WON') bySource[src].won++;
      if (isDue(l)) due++;
    });
    const closed = byStatus.WON + byStatus.LOST;
    return {
      total: leads.length,
      byStatus, byType, due,
      open: byStatus.NEW + byStatus.CONTACTED + byStatus.NEGOTIATING,
      conversion: closed > 0 ? (byStatus.WON / closed) * 100 : 0,
      sources: Object.entries(bySource).sort((a, b) => b[1].total - a[1].total),
    };
  }, [leads, today]);

  // Por tipo de patrocínio: interessados em aberto, fechados e soma dos valores fechados.
  const typeStats = useMemo(() => types.map(t => {
    const sponsors = leads.filter(l => l.leadType === 'SPONSOR' && l.sponsorshipTypeIds.includes(t.id));
    const won = sponsors.filter(l => l.status === 'WON');
    return {
      type: t,
      open: sponsors.filter(l => isOpenStatus(l.status)).length,
      won: won.length,
      wonValue: won.reduce((acc, l) => acc + (parseMoney(l.dealValue) || 0), 0),
    };
  }), [types, leads]);
  const totalWonSponsorValue = useMemo(() => leads.filter(l => l.leadType === 'SPONSOR' && l.status === 'WON').reduce((acc, l) => acc + (parseMoney(l.dealValue) || 0), 0), [leads]);

  const typeName = (id: string) => types.find(t => t.id === id)?.name || 'Tipo removido';

  const dueLeads = useMemo(() => leads.filter(isDue).sort((a, b) => a.nextContactDate.localeCompare(b.nextContactDate)), [leads, today]);

  const pct = (n: number, total: number) => total > 0 ? `${((n / total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '0%';

  // ---------- Salvar / editar ----------

  const openNew = (leadType: LeadType = 'STUDENT') => {
    setEditingId(null);
    setForm({ ...EMPTY_LEAD, leadType });
    setNewNote('');
    setFormOpen(true);
  };

  const openEdit = (l: Lead) => {
    setEditingId(l.id);
    const { id, createdAt, ...rest } = l;
    setForm(rest);
    setNewNote('');
    setFormOpen(true);
  };

  const persistLead = async (id: string | null, data: Omit<Lead, 'id'>): Promise<Lead | null> => {
    const row = toRow(data);
    const req = id
      ? supabase.from('marketing_leads').update(row).eq('id', id).select().single()
      : supabase.from('marketing_leads').insert([row]).select().single();
    const { data: saved, error } = await req;
    if (error || !saved) {
      alert(`Não foi possível salvar o contato: ${error?.message || 'nenhum registro retornado'}${isMissingColumn(error) ? `\n\n${SETUP_HINT}` : ''}`);
      return null;
    }
    const lead = mapRow(saved);
    setLeads(prev => id ? prev.map(x => x.id === id ? lead : x) : [lead, ...prev]);
    return lead;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return alert('Informe o nome.');
    if (form.leadType === 'SPONSOR' && form.partnershipStart && form.partnershipEnd && form.partnershipEnd < form.partnershipStart) {
      return alert('O prazo final da parceria não pode ser antes do início.');
    }
    setSaving(true);
    let data = form;
    const previous = editingId ? leads.find(l => l.id === editingId) : null;
    const extra: LeadHistoryEntry[] = [];
    if (newNote.trim()) extra.push({ date: new Date().toISOString(), text: newNote.trim(), author: authorName });
    if (!editingId) extra.push({ date: new Date().toISOString(), text: 'Contato cadastrado.', author: authorName });
    if (previous && previous.status !== form.status) {
      extra.push({ date: new Date().toISOString(), text: `Etapa alterada: ${statusInfo(previous.status).label} → ${statusInfo(form.status).label}.`, author: authorName });
    }
    if (extra.length) data = { ...form, history: [...extra, ...form.history] };
    const saved = await persistLead(editingId, data);
    setSaving(false);
    if (saved) { setFormOpen(false); setEditingId(null); }
  };

  const handleAddNoteOnly = async () => {
    if (!editingId || !newNote.trim()) return;
    const entry = { date: new Date().toISOString(), text: newNote.trim(), author: authorName };
    const data = { ...form, history: [entry, ...form.history] };
    const saved = await persistLead(editingId, data);
    if (saved) { setForm(f => ({ ...f, history: saved.history })); setNewNote(''); }
  };

  const handleQuickStatus = async (l: Lead, status: LeadStatus) => {
    if (status === l.status) return;
    const entry = { date: new Date().toISOString(), text: `Etapa alterada: ${statusInfo(l.status).label} → ${statusInfo(status).label}.`, author: authorName };
    const { id, createdAt, ...rest } = l;
    await persistLead(l.id, { ...rest, status, history: [entry, ...l.history] });
  };

  const handleDelete = async (l: Lead) => {
    if (!confirm(`Excluir o contato "${l.name}"? Esta ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from('marketing_leads').delete().eq('id', l.id);
    if (error) return alert(`Não foi possível excluir: ${error.message}`);
    setLeads(prev => prev.filter(x => x.id !== l.id));
    setSelectedIds(prev => { const n = new Set(prev); n.delete(l.id); return n; });
  };

  // ---------- Parcerias (patrocinadores fechados) ----------

  // Situação da parceria pelo prazo final: vencida, vencendo (até 30 dias) ou em vigor.
  const partnershipState = (l: Lead): 'EXPIRED' | 'EXPIRING' | 'ACTIVE' | null => {
    if (l.leadType !== 'SPONSOR' || !l.partnershipEnd) return null;
    const d = daysUntil(l.partnershipEnd, today);
    if (d < 0) return 'EXPIRED';
    if (d <= EXPIRING_DAYS) return 'EXPIRING';
    return 'ACTIVE';
  };

  const partnershipBadge = (l: Lead) => {
    const st = partnershipState(l);
    if (!st) return null;
    const d = daysUntil(l.partnershipEnd, today);
    if (st === 'EXPIRED') return { label: `Parceria vencida (${formatDate(l.partnershipEnd)})`, cls: 'bg-red-100 text-red-700' };
    if (st === 'EXPIRING') return { label: d === 0 ? 'Parceria vence hoje' : `Vence em ${d} dia(s)`, cls: 'bg-amber-100 text-amber-700' };
    return { label: `Parceria até ${formatDate(l.partnershipEnd)}`, cls: 'bg-green-100 text-green-700' };
  };

  const partnerships = useMemo(() => leads
    .filter(l => l.leadType === 'SPONSOR' && l.status === 'WON')
    .sort((a, b) => (a.partnershipEnd || '9999-12-31').localeCompare(b.partnershipEnd || '9999-12-31')), [leads]);
  const partnershipsAttention = partnerships.filter(l => { const st = partnershipState(l); return st === 'EXPIRED' || st === 'EXPIRING'; }).length;

  // ---------- Termo de compromisso (PDF) ----------

  const generateTerm = (l: Omit<Lead, 'id'> & { id?: string }): boolean => {
    const missing: string[] = [];
    if (!l.sponsorDocument.trim()) missing.push('CNPJ/CPF');
    if (parseMoney(l.dealValue) == null) missing.push('valor');
    if (!l.partnershipStart) missing.push('início da parceria');
    if (!l.partnershipEnd) missing.push('prazo final');
    if (l.sponsorshipTypeIds.length === 0) missing.push('tipos de patrocínio');
    if (missing.length && !confirm(`Faltam no cadastro: ${missing.join(', ')}.\nEsses campos sairão em branco no termo para preencher à mão. Gerar mesmo assim?`)) return false;

    const doc = new jsPDF();
    const left = 14, width = 182;
    let y = 18;
    const ensure = (h: number) => { if (y + h > 282) { doc.addPage(); y = 18; } };
    const title = (t: string) => { ensure(12); y += 2; doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(t, left, y); y += 5; };
    const para = (t: string, opts: { bold?: boolean; indent?: number } = {}) => {
      doc.setFont('helvetica', opts.bold ? 'bold' : 'normal'); doc.setFontSize(9.5);
      const lines = doc.splitTextToSize(t, width - (opts.indent || 0));
      ensure(lines.length * 4.4);
      doc.text(lines, left + (opts.indent || 0), y, { lineHeightFactor: 1.3 });
      y += lines.length * 4.4 + 1.2;
    };
    const blank = (v: string, size = 22) => v.trim() || '_'.repeat(size);
    const value = parseMoney(l.dealValue);
    const valueText = value != null ? formatMoney(value) : 'R$ ____________';
    const chosenTypes = l.sponsorshipTypeIds.map(id => types.find(t => t.id === id)).filter(Boolean) as SponsorshipType[];
    const start = l.partnershipStart ? formatDate(l.partnershipStart) : '____/____/______';
    const end = l.partnershipEnd ? formatDate(l.partnershipEnd) : '____/____/______';
    const longToday = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'long', year: 'numeric' });

    doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text('TERMO DE COMPROMISSO DE PATROCÍNIO', 105, y, { align: 'center' }); y += 7;
    doc.setFontSize(11); doc.text('Escolinha de Futebol Garotos do Martinica', 105, y, { align: 'center' }); y += 8;

    title('1. DAS PARTES');
    para('PATROCINADO: CLUBE DESPORTIVO MUNICIPAL JARDIM MARTINICA – Escolinha de Futebol Garotos do Martinica, Unidade Martinica, São Paulo/SP, CNPJ: ______________________.');
    para(`PATROCINADOR: ${l.name}, CNPJ/CPF: ${blank(l.sponsorDocument)}, neste ato representado por ${blank(l.contactName, 30)}, telefone ${blank(l.phone, 16)}, e-mail ${blank(l.email, 26)}, endereço/bairro ${blank(l.neighborhood, 30)}.`);

    title('2. DO OBJETO');
    para('O PATROCINADOR apoiará financeiramente as atividades esportivas e sociais da escolinha. Em contrapartida, o PATROCINADO divulgará a marca do PATROCINADOR nas seguintes formas:');
    if (chosenTypes.length) chosenTypes.forEach(t => para(`•  ${t.name}${t.description ? ` – ${t.description}` : ''}`, { indent: 4 }));
    else para('•  ____________________________________________', { indent: 4 });

    title('3. DO VALOR E DO PAGAMENTO');
    para(l.dealFrequency === 'ONCE'
      ? `O PATROCINADOR pagará o valor único de ${valueText}, até ____/____/______.`
      : `O PATROCINADOR pagará o valor de ${valueText} por mês, até o dia ____ de cada mês, durante toda a vigência deste termo.`);
    para('O pagamento será feito por PIX (chave celular 11987019721 – CLUBE DESPORTIVO MUNICIPAL JARDIM MARTINICA) ou outra forma combinada por escrito entre as partes.');

    title('4. DA VIGÊNCIA');
    para(`Este termo vigora de ${start} até ${end} (prazo final da parceria). Poderá ser renovado mediante novo termo assinado pelas partes.`);

    title('5. DAS OBRIGAÇÕES DO PATROCINADO');
    para('a) Aplicar e manter a marca do PATROCINADOR nas formas descritas na cláusula 2 durante toda a vigência;', { indent: 4 });
    para('b) Utilizar os recursos recebidos em atividades da escolinha (uniformes, materiais esportivos, transporte, taxas de competição e afins);', { indent: 4 });
    para('c) Zelar pela boa imagem do PATROCINADOR em seus eventos, jogos e redes sociais.', { indent: 4 });

    title('6. DAS OBRIGAÇÕES DO PATROCINADOR');
    para('a) Efetuar os pagamentos nos valores e prazos acordados;', { indent: 4 });
    para('b) Fornecer sua logomarca em boa resolução em até 10 (dez) dias após a assinatura;', { indent: 4 });
    para('c) Não utilizar a imagem dos atletas sem autorização prévia do PATROCINADO e dos responsáveis legais.', { indent: 4 });

    title('7. DA RESCISÃO');
    para('Qualquer das partes poderá encerrar este termo mediante aviso por escrito com 30 (trinta) dias de antecedência. O atraso no pagamento por mais de 30 (trinta) dias permite ao PATROCINADO suspender a divulgação da marca.');

    title('8. DO FORO');
    para('Fica eleito o foro da Comarca de São Paulo/SP para dirimir eventuais dúvidas oriundas deste termo.');

    ensure(52);
    y += 3; para(`São Paulo, ${longToday}.`); y += 11;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    doc.text('_______________________________________', left, y); doc.text('_______________________________________', 110, y); y += 5;
    doc.text('PATROCINADO', left, y); doc.text('PATROCINADOR', 110, y); y += 4.5;
    doc.text('Clube Desportivo Municipal Jardim Martinica', left, y); doc.text(doc.splitTextToSize(l.contactName ? `${l.name} – ${l.contactName}` : l.name, 86), 110, y); y += 15;
    doc.text('_______________________________________', left, y); doc.text('_______________________________________', 110, y); y += 5;
    doc.text('Testemunha 1 – Nome / CPF', left, y); doc.text('Testemunha 2 – Nome / CPF', 110, y);

    // Nome do arquivo sem acentos: alguns navegadores trocam nomes acentuados por "download".
    const fileName = l.name.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Patrocinador';
    doc.save(`Termo_Patrocinio_${fileName}.pdf`);
    return true;
  };

  const termHistoryEntry = (l: { partnershipStart: string; partnershipEnd: string }): LeadHistoryEntry => ({
    date: new Date().toISOString(),
    text: `Termo de compromisso gerado${l.partnershipStart || l.partnershipEnd ? ` (vigência ${l.partnershipStart ? formatDate(l.partnershipStart) : '?'} a ${l.partnershipEnd ? formatDate(l.partnershipEnd) : '?'})` : ''}.`,
    author: authorName,
  });

  // Gera a partir do cartão: registra no histórico.
  const handleGenerateTermFromCard = async (l: Lead) => {
    if (!generateTerm(l)) return;
    const { id, createdAt, ...rest } = l;
    await persistLead(l.id, { ...rest, history: [termHistoryEntry(l), ...l.history] });
  };

  // Gera a partir do formulário (dados ainda não salvos): o registro entra no histórico ao salvar.
  const handleGenerateTermFromForm = () => {
    if (!form.name.trim()) return alert('Informe o nome do patrocinador.');
    if (!generateTerm(form)) return;
    setForm(f => ({ ...f, history: [termHistoryEntry(f), ...f.history] }));
  };

  // ---------- Tipos de patrocínio ----------

  const handleSaveType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typeForm || !typeForm.name.trim()) return;
    const name = typeForm.name.trim();
    if (types.some(t => t.id !== typeForm.id && t.name.trim().toLowerCase() === name.toLowerCase())) return alert('Já existe um tipo de patrocínio com este nome.');
    const row = { name, description: typeForm.description.trim() || null, suggested_value: parseMoney(typeForm.suggestedValue) };
    const req = typeForm.id
      ? supabase.from('sponsorship_types').update(row).eq('id', typeForm.id).select().single()
      : supabase.from('sponsorship_types').insert([row]).select().single();
    const { data, error } = await req;
    if (error || !data) return alert(`Não foi possível salvar o tipo: ${error?.message || 'nenhum registro retornado'}`);
    const saved = mapTypeRow(data);
    setTypes(prev => (typeForm.id ? prev.map(t => t.id === saved.id ? saved : t) : [...prev, saved]).sort((a, b) => a.name.localeCompare(b.name)));
    setTypeForm(null);
  };

  const handleToggleTypeActive = async (t: SponsorshipType) => {
    const { error } = await supabase.from('sponsorship_types').update({ active: !t.active }).eq('id', t.id);
    if (error) return alert(`Não foi possível alterar: ${error.message}`);
    setTypes(prev => prev.map(x => x.id === t.id ? { ...x, active: !t.active } : x));
  };

  const handleDeleteType = async (t: SponsorshipType) => {
    const inUse = leads.filter(l => l.sponsorshipTypeIds.includes(t.id)).length;
    if (inUse > 0) return alert(`"${t.name}" está em ${inUse} contato(s) e não pode ser excluído. Use "Desativar" para escondê-lo dos novos cadastros.`);
    if (!confirm(`Excluir o tipo de patrocínio "${t.name}"?`)) return;
    const { error } = await supabase.from('sponsorship_types').delete().eq('id', t.id);
    if (error) return alert(`Não foi possível excluir: ${error.message}`);
    setTypes(prev => prev.filter(x => x.id !== t.id));
    if (sponsorshipFilter === t.id) setSponsorshipFilter('ALL');
  };

  const toggleFormType = (id: string) => setForm(f => ({
    ...f,
    sponsorshipTypeIds: f.sponsorshipTypeIds.includes(id) ? f.sponsorshipTypeIds.filter(x => x !== id) : [...f.sponsorshipTypeIds, id],
  }));

  // ---------- Seleção ----------

  const toggleSelect = (id: string) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allVisibleSelected = filteredLeads.length > 0 && filteredLeads.every(l => selectedIds.has(l.id));
  const toggleSelectAllVisible = () => setSelectedIds(prev => {
    const n = new Set(prev);
    if (allVisibleSelected) filteredLeads.forEach(l => n.delete(l.id)); else filteredLeads.forEach(l => n.add(l.id));
    return n;
  });

  // ---------- WhatsApp ----------

  const defaultMessage = (targets: Lead[]) => {
    const onlySponsors = targets.every(t => t.leadType === 'SPONSOR');
    const onlyStudents = targets.every(t => t.leadType === 'STUDENT');
    if (onlySponsors) {
      return 'Olá {nome}, tudo bem? Aqui é da Escolinha de Futebol Garotos do Martinica ⚽\n\nEstamos buscando parceiros da nossa região para apoiar nossos atletas. Podemos conversar sobre uma parceria/patrocínio?';
    }
    if (onlyStudents) {
      return 'Olá {nome}, tudo bem? Aqui é da Escolinha de Futebol Garotos do Martinica ⚽\n\nTemos vagas abertas para treinos! Gostaria de agendar uma aula experimental?';
    }
    return 'Olá {nome}, tudo bem? Aqui é da Escolinha de Futebol Garotos do Martinica ⚽';
  };

  const openCompose = (targets: Lead[]) => {
    const withPhone = targets.filter(t => t.phone.replace(/\D/g, ''));
    if (withPhone.length === 0) return alert('Nenhum dos contatos selecionados tem telefone.');
    setComposeTargets(targets);
    setComposeMessage(defaultMessage(targets));
    setComposeOpen(true);
  };

  const personalize = (msg: string, l: Lead) => msg.replace(/\{nome\}/gi, l.contactName || l.name);

  const startQueue = () => {
    if (!composeMessage.trim()) return;
    const targets = composeTargets.filter(t => t.phone.replace(/\D/g, '')).sort((a, b) => a.name.localeCompare(b.name));
    const skipped = composeTargets.length - targets.length;
    if (targets.length > 1 && !confirm(`Enviar a mensagem para ${targets.length} contatos via WhatsApp?\n(Será aplicado um intervalo de 10 segundos entre cada envio por segurança)`)) return;
    setQueueMessage(composeMessage);
    setQueue(targets);
    setQueueIndex(0);
    setQueueLogs([`Fila iniciada para ${targets.length} contato(s)...${skipped > 0 ? ` (${skipped} sem telefone ficaram de fora)` : ''}`]);
    setQueueCountdown(1);
    setQueueRunning(true);
    setQueueOpen(true);
    setComposeOpen(false);
  };

  useEffect(() => {
    if (!queueOpen || !queueRunning) return;
    if (queueIndex >= queue.length) {
      setQueueRunning(false);
      setQueueLogs(prev => ['✅ Todas as mensagens enviadas!', ...prev]);
      return;
    }
    if (queueCountdown > 0) {
      queueTimerRef.current = setTimeout(() => setQueueCountdown(c => c - 1), 1000);
    } else {
      void processQueueItem(queue[queueIndex]);
    }
    return () => { if (queueTimerRef.current) clearTimeout(queueTimerRef.current); };
  }, [queueOpen, queueRunning, queueCountdown, queueIndex, queue]);

  const processQueueItem = async (target: Lead) => {
    if (queueProcessingRef.current) return;
    queueProcessingRef.current = true;
    try {
      const phone = target.phone.replace(/\D/g, '');
      if (!phone) {
        setQueueLogs(prev => [`⚠️ Sem telefone: ${target.name}`, ...prev]);
      } else {
        const sent = await sendZApiMessage(phone, personalize(queueMessage, target));
        setQueueLogs(prev => [`${sent ? '✅' : '❌'} ${target.name}`, ...prev]);
        if (sent) {
          // Registra no histórico e avança "Novo" para "Contatado".
          const current = leads.find(l => l.id === target.id) || target;
          const entry = { date: new Date().toISOString(), text: `WhatsApp enviado: "${personalize(queueMessage, target).slice(0, 120)}${queueMessage.length > 120 ? '…' : ''}"`, author: authorName };
          const { id, createdAt, ...rest } = current;
          await persistLead(current.id, { ...rest, status: current.status === 'NEW' ? 'CONTACTED' : current.status, history: [entry, ...current.history] });
        }
      }
    } catch {
      setQueueLogs(prev => [`❌ ${target.name}`, ...prev]);
    } finally {
      queueProcessingRef.current = false;
      setQueueIndex(i => i + 1);
      setQueueCountdown(10);
    }
  };

  // ---------- Render ----------

  if (currentUser?.role !== UserRole.ADMIN) {
    return <div className="bg-white p-8 rounded-xl border text-center text-gray-500">Acesso restrito aos administradores.</div>;
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  if (tableMissing) {
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-6 space-y-3">
        <h2 className="text-lg font-bold flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> Falta preparar o banco de dados</h2>
        <p className="text-sm">Para usar o Marketing / Captação, execute uma vez o script <strong>marketing_setup.sql</strong> no <strong>SQL Editor</strong> do Supabase e depois clique em "Tentar novamente".</p>
        <button onClick={() => void loadLeads()} className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold px-4 py-2 rounded-lg"><RefreshCw className="w-4 h-4" /> Tentar novamente</button>
      </div>
    );
  }

  const selectedLeads = leads.filter(l => selectedIds.has(l.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Megaphone className="w-6 h-6 text-primary-600" /> Marketing / Captação</h2>
        <div className="flex gap-2 w-full md:w-auto">
          <button onClick={() => openNew('STUDENT')} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 shadow-sm font-bold text-sm"><Plus className="w-4 h-4" /> Possível aluno</button>
          <button onClick={() => openNew('SPONSOR')} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-800 shadow-sm font-bold text-sm"><Plus className="w-4 h-4" /> Patrocinador</button>
        </div>
      </div>

      {loadError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm flex justify-between items-center gap-2"><span>{loadError}</span><button onClick={() => void loadLeads()} className="font-bold underline">Recarregar</button></div>}

      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-full md:w-fit">
        <button onClick={() => setTab('DASHBOARD')} className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-bold whitespace-nowrap ${tab === 'DASHBOARD' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500'}`}><BarChart3 className="w-4 h-4" /> Painel</button>
        <button onClick={() => setTab('LEADS')} className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-bold whitespace-nowrap ${tab === 'LEADS' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500'}`}><ListChecks className="w-4 h-4" /> Contatos ({leads.length})</button>
        <button onClick={() => setTab('TYPES')} className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-bold whitespace-nowrap ${tab === 'TYPES' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500'}`}><Tags className="w-4 h-4" /> <span className="hidden sm:inline">Tipos de patrocínio</span><span className="sm:hidden">Patrocínios</span></button>
      </div>

      {tab === 'DASHBOARD' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border shadow-sm"><p className="text-xs font-bold text-gray-400 uppercase">Contatos em aberto</p><p className="text-3xl font-black text-gray-900">{stats.open}</p><p className="text-xs text-gray-500">de {stats.total} no total</p></div>
            <div className="bg-white p-4 rounded-xl border shadow-sm"><p className="text-xs font-bold text-gray-400 uppercase">Fechados</p><p className="text-3xl font-black text-green-600">{stats.byStatus.WON}</p><p className="text-xs text-gray-500">{stats.byType.STUDENT.won} aluno(s) · {stats.byType.SPONSOR.won} patrocinador(es)</p></div>
            <div className="bg-white p-4 rounded-xl border shadow-sm"><p className="text-xs font-bold text-gray-400 uppercase">Taxa de conversão</p><p className="text-3xl font-black text-primary-600">{stats.conversion.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</p><p className="text-xs text-gray-500">fechados ÷ (fechados + perdidos)</p></div>
            <button onClick={() => { setTab('LEADS'); setFollowUpFilter('DUE'); setStatusFilter('OPEN'); }} className={`text-left p-4 rounded-xl border shadow-sm ${stats.due > 0 ? 'bg-red-50 border-red-200' : 'bg-white'}`}><p className="text-xs font-bold text-gray-400 uppercase">Retornos para hoje / atrasados</p><p className={`text-3xl font-black ${stats.due > 0 ? 'text-red-600' : 'text-gray-900'}`}>{stats.due}</p><p className="text-xs text-gray-500">clique para ver</p></button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-5 rounded-xl border shadow-sm">
              <h3 className="font-bold text-gray-800 mb-4">Funil por etapa</h3>
              <div className="space-y-3">
                {STATUS_LIST.map(s => (
                  <div key={s.id}>
                    <div className="flex justify-between text-sm mb-1"><span className="font-medium text-gray-700">{s.label}</span><span className="text-gray-500"><strong className="text-gray-900">{stats.byStatus[s.id]}</strong> ({pct(stats.byStatus[s.id], stats.total)})</span></div>
                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden"><div className={`${s.bar} h-2 rounded-full`} style={{ width: stats.total ? `${(stats.byStatus[s.id] / stats.total) * 100}%` : '0%' }} /></div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t">
                <div className="flex items-center gap-2 text-sm"><Users className="w-4 h-4 text-blue-500" /> Possíveis alunos: <strong>{stats.byType.STUDENT.total}</strong></div>
                <div className="flex items-center gap-2 text-sm"><Handshake className="w-4 h-4 text-amber-600" /> Patrocinadores: <strong>{stats.byType.SPONSOR.total}</strong></div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border shadow-sm">
              <h3 className="font-bold text-gray-800 mb-4">Resultado por origem</h3>
              {stats.sources.length === 0 ? <p className="text-sm text-gray-400">Nenhum contato cadastrado ainda.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-gray-400 uppercase text-left"><th className="pb-2">Origem</th><th className="pb-2 text-right">Contatos</th><th className="pb-2 text-right">Fechados</th><th className="pb-2 text-right">Conversão</th></tr></thead>
                  <tbody className="divide-y">
                    {stats.sources.map(([src, v]) => (
                      <tr key={src}><td className="py-2 text-gray-700">{src}</td><td className="py-2 text-right font-bold">{v.total}</td><td className="py-2 text-right text-green-600 font-bold">{v.won}</td><td className="py-2 text-right text-gray-500">{pct(v.won, v.total)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className={`bg-white p-5 rounded-xl border shadow-sm ${partnershipsAttention > 0 ? 'border-amber-300' : ''}`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3">
              <h3 className="font-bold text-gray-800 flex items-center gap-2"><Handshake className="w-5 h-5 text-green-600" /> Parcerias fechadas ({partnerships.length})</h3>
              {partnershipsAttention > 0 && <span className="text-sm font-bold text-amber-700">{partnershipsAttention} vencida(s) ou vencendo em até {EXPIRING_DAYS} dias</span>}
            </div>
            {partnerships.length === 0 ? <p className="text-sm text-gray-400">Nenhum patrocinador na etapa "Fechado" ainda.</p> : (
              <div className="divide-y">
                {partnerships.map(l => {
                  const badge = partnershipBadge(l);
                  const v = parseMoney(l.dealValue);
                  return (
                    <div key={l.id} className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-3">
                      <button onClick={() => openEdit(l)} className="text-left min-w-0">
                        <p className="font-bold text-gray-800 truncate">{l.name}</p>
                        <p className="text-xs text-gray-500">{[l.sponsorshipTypeIds.map(typeName).join(', '), v != null ? `${formatMoney(v)}${l.dealFrequency === 'MONTHLY' ? '/mês' : ''}` : ''].filter(Boolean).join(' · ') || 'Sem tipos/valor'}</p>
                      </button>
                      <div className="flex items-center gap-2 shrink-0">
                        {badge ? <span className={`text-xs font-bold px-2 py-1 rounded-full ${badge.cls}`}>{badge.label}</span> : <span className="text-xs text-gray-400">Sem prazo final</span>}
                        <button onClick={() => void handleGenerateTermFromCard(l)} className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg" title="Gerar termo de compromisso (PDF)"><FileText className="w-4 h-4" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white p-5 rounded-xl border shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-4">
              <h3 className="font-bold text-gray-800 flex items-center gap-2"><Tags className="w-5 h-5 text-amber-600" /> Patrocínios por tipo</h3>
              <span className="text-sm text-gray-500">Total fechado: <strong className="text-green-600">{formatMoney(totalWonSponsorValue)}</strong></span>
            </div>
            {typeStats.length === 0 ? <p className="text-sm text-gray-400">Nenhum tipo cadastrado. Cadastre na aba "Tipos de patrocínio".</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[420px]">
                  <thead><tr className="text-xs text-gray-400 uppercase text-left"><th className="pb-2">Tipo</th><th className="pb-2 text-right">Em negociação</th><th className="pb-2 text-right">Fechados</th><th className="pb-2 text-right">Valor fechado</th></tr></thead>
                  <tbody className="divide-y">
                    {typeStats.map(ts => (
                      <tr key={ts.type.id}><td className="py-2 text-gray-700">{ts.type.name}{!ts.type.active && <span className="ml-2 text-[10px] text-gray-400 uppercase">(inativo)</span>}</td><td className="py-2 text-right font-bold">{ts.open}</td><td className="py-2 text-right text-green-600 font-bold">{ts.won}</td><td className="py-2 text-right text-gray-700">{formatMoney(ts.wonValue)}</td></tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-gray-400 mt-2">Um patrocinador pode ter mais de um tipo; o valor dele aparece em cada tipo marcado.</p>
              </div>
            )}
          </div>

          <div className="bg-white p-5 rounded-xl border shadow-sm">
            <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><CalendarClock className="w-5 h-5 text-red-500" /> Retornos para hoje e atrasados</h3>
            {dueLeads.length === 0 ? <p className="text-sm text-gray-400">Nenhum retorno pendente. 👍</p> : (
              <div className="divide-y">
                {dueLeads.slice(0, 10).map(l => (
                  <div key={l.id} className="py-2 flex items-center justify-between gap-3">
                    <button onClick={() => openEdit(l)} className="text-left min-w-0">
                      <p className="font-bold text-gray-800 truncate">{l.name}</p>
                      <p className="text-xs text-gray-500">{TYPE_LABEL[l.leadType]} · {statusInfo(l.status).label}</p>
                    </button>
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${l.nextContactDate < today ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{l.nextContactDate < today ? `Atrasado (${formatDate(l.nextContactDate)})` : 'Hoje'}</span>
                  </div>
                ))}
                {dueLeads.length > 10 && <button onClick={() => { setTab('LEADS'); setFollowUpFilter('DUE'); }} className="pt-2 text-sm font-bold text-primary-600">Ver todos ({dueLeads.length})</button>}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'LEADS' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
            <div className="lg:col-span-3 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" placeholder="Buscar nome, telefone, bairro..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="lg:col-span-2 border rounded-lg px-3 py-2 text-sm bg-white text-gray-600" value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)}>
              <option value="ALL">Tipo: Todos</option>
              <option value="STUDENT">Possíveis alunos</option>
              <option value="SPONSOR">Possíveis patrocinadores</option>
            </select>
            <select className="lg:col-span-3 border rounded-lg px-3 py-2 text-sm bg-white text-gray-600" value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}>
              <option value="OPEN">Etapa: Em aberto</option>
              <option value="ALL">Etapa: Todas</option>
              {STATUS_LIST.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <select className="lg:col-span-2 border rounded-lg px-3 py-2 text-sm bg-white text-gray-600" value={followUpFilter} onChange={e => setFollowUpFilter(e.target.value as any)}>
              <option value="ALL">Retorno: Todos</option>
              <option value="DUE">Hoje / atrasados</option>
            </select>
            <select className="lg:col-span-2 border rounded-lg px-3 py-2 text-sm bg-white text-gray-600" value={sponsorshipFilter} onChange={e => setSponsorshipFilter(e.target.value)}>
              <option value="ALL">Patrocínio: Todos</option>
              {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
            <button onClick={toggleSelectAllVisible} className="flex items-center gap-2 text-gray-600 font-medium">
              {allVisibleSelected ? <CheckSquare className="w-5 h-5 text-primary-600" /> : <Square className="w-5 h-5 text-gray-300" />}
              Selecionar os {filteredLeads.length} exibidos
            </button>
            {selectedIds.size > 0 && (
              <div className="flex gap-2">
                <button onClick={() => setSelectedIds(new Set())} className="px-3 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-lg">Limpar seleção</button>
                <button onClick={() => openCompose(selectedLeads)} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-bold shadow-sm"><MessageCircle className="w-4 h-4" /> WhatsApp para {selectedIds.size} selecionado(s)</button>
              </div>
            )}
          </div>

          {filteredLeads.length === 0 ? (
            <div className="py-16 text-center bg-white rounded-xl border border-dashed text-gray-400">
              <Megaphone className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="font-medium">{leads.length === 0 ? 'Nenhum contato cadastrado ainda.' : 'Nenhum contato com estes filtros.'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredLeads.map(l => {
                const due = isDue(l);
                const selected = selectedIds.has(l.id);
                return (
                  <div key={l.id} className={`bg-white p-4 rounded-xl border shadow-sm flex flex-col gap-3 ${selected ? 'ring-2 ring-primary-500 border-primary-500' : due ? 'border-red-300' : ''}`}>
                    <div className="flex items-start gap-3">
                      <button onClick={() => toggleSelect(l.id)} className="mt-0.5">{selected ? <CheckSquare className="w-5 h-5 text-primary-600" /> : <Square className="w-5 h-5 text-gray-300" />}</button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-gray-900 truncate">{l.name}</h4>
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${l.leadType === 'SPONSOR' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{l.leadType === 'SPONSOR' ? 'Patrocinador' : 'Aluno'}</span>
                        </div>
                        {l.contactName && <p className="text-xs text-gray-500">Contato: {l.contactName}</p>}
                      </div>
                    </div>
                    <div className="text-xs text-gray-600 space-y-1">
                      {l.phone && <p className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-gray-400" /> {l.phone}</p>}
                      {l.neighborhood && <p className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-gray-400" /> {l.neighborhood}</p>}
                      {l.leadType === 'SPONSOR' && (l.sponsorshipTypeIds.length > 0 || l.dealValue) && (
                        <div className="flex flex-wrap items-center gap-1 pt-0.5">
                          {l.sponsorshipTypeIds.map(id => <span key={id} className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">{typeName(id)}</span>)}
                          {parseMoney(l.dealValue) != null && <span className="text-[11px] font-bold text-green-700 ml-1">{formatMoney(parseMoney(l.dealValue)!)}</span>}
                        </div>
                      )}
                      {l.leadType === 'SPONSOR' && (l.partnershipStart || l.partnershipEnd) && (() => {
                        const badge = partnershipBadge(l);
                        return (
                          <p className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-gray-500">Parceria: {l.partnershipStart ? formatDate(l.partnershipStart) : '?'} a {l.partnershipEnd ? formatDate(l.partnershipEnd) : '?'}</span>
                            {badge && l.status === 'WON' && <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>}
                          </p>
                        );
                      })()}
                      {l.interest && <p className="text-gray-500 line-clamp-2">{l.interest}</p>}
                      {l.source && <p className="text-gray-400">Origem: {l.source}</p>}
                      {l.nextContactDate && isOpenStatus(l.status) && (
                        <p className={`flex items-center gap-1.5 font-bold ${due ? 'text-red-600' : 'text-gray-500'}`}><CalendarClock className="w-3.5 h-3.5" /> Retorno: {formatDate(l.nextContactDate)}{due && (l.nextContactDate < today ? ' (atrasado)' : ' (hoje)')}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-auto pt-2 border-t">
                      <select value={l.status} onChange={e => void handleQuickStatus(l, e.target.value as LeadStatus)} className={`flex-1 text-xs font-bold border rounded-lg px-2 py-1.5 ${statusInfo(l.status).badge}`}>
                        {STATUS_LIST.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                      {l.leadType === 'SPONSOR' && <button onClick={() => void handleGenerateTermFromCard(l)} className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg" title="Gerar termo de compromisso (PDF)"><FileText className="w-4 h-4" /></button>}
                      {l.phone.replace(/\D/g, '') && <button onClick={() => openCompose([l])} className="p-2 text-green-600 hover:bg-green-50 rounded-lg" title="Enviar WhatsApp"><MessageCircle className="w-4 h-4" /></button>}
                      <button onClick={() => openEdit(l)} className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg" title="Editar / histórico"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => void handleDelete(l)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Excluir"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'TYPES' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="text-sm text-gray-500">Cadastre o que a escolinha oferece aos patrocinadores (ex.: Camisa, Placa, Banner). Eles aparecem no cadastro de cada patrocinador.</p>
            <button onClick={() => setTypeForm({ id: null, name: '', description: '', suggestedValue: '' })} className="flex items-center justify-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 shadow-sm font-bold text-sm shrink-0"><Plus className="w-4 h-4" /> Novo tipo</button>
          </div>
          {types.length === 0 ? (
            <div className="py-12 text-center bg-white rounded-xl border border-dashed text-gray-400"><Tags className="w-10 h-10 mx-auto mb-2 opacity-40" /><p className="font-medium">Nenhum tipo de patrocínio cadastrado.</p></div>
          ) : (
            <div className="bg-white rounded-xl border shadow-sm divide-y">
              {types.map(t => {
                const inUse = leads.filter(l => l.sponsorshipTypeIds.includes(t.id)).length;
                return (
                  <div key={t.id} className={`p-4 flex items-center gap-3 ${t.active ? '' : 'opacity-60'}`}>
                    <div className="bg-amber-50 p-2 rounded-lg text-amber-600"><Tags className="w-5 h-5" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900">{t.name}{!t.active && <span className="ml-2 text-[10px] text-gray-500 uppercase bg-gray-100 px-1.5 py-0.5 rounded">inativo</span>}</p>
                      <p className="text-xs text-gray-500 truncate">{[t.description, t.suggestedValue != null ? `Valor sugerido: ${formatMoney(t.suggestedValue)}` : '', `${inUse} contato(s)`].filter(Boolean).join(' · ')}</p>
                    </div>
                    <button onClick={() => setTypeForm({ id: t.id, name: t.name, description: t.description, suggestedValue: t.suggestedValue != null ? String(t.suggestedValue).replace('.', ',') : '' })} className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg" title="Editar"><Edit className="w-4 h-4" /></button>
                    <button onClick={() => void handleToggleTypeActive(t)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" title={t.active ? 'Desativar (esconde dos novos cadastros)' : 'Reativar'}>{t.active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                    <button onClick={() => void handleDeleteType(t)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Excluir"><Trash2 className="w-4 h-4" /></button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {typeForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <form onSubmit={handleSaveType} className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900">{typeForm.id ? 'Editar tipo de patrocínio' : 'Novo tipo de patrocínio'}</h3>
              <button type="button" onClick={() => setTypeForm(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div><label className="block text-xs font-medium text-gray-500 mb-1">Nome *</label><input required autoFocus className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" placeholder="Ex.: Camisa, Placa, Banner" value={typeForm.name} onChange={e => setTypeForm({ ...typeForm, name: e.target.value })} /></div>
            <div><label className="block text-xs font-medium text-gray-500 mb-1">Descrição</label><input className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" placeholder="Ex.: Logo na frente da camisa" value={typeForm.description} onChange={e => setTypeForm({ ...typeForm, description: e.target.value })} /></div>
            <div><label className="block text-xs font-medium text-gray-500 mb-1">Valor sugerido (R$)</label><input inputMode="decimal" className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" placeholder="Opcional" value={typeForm.suggestedValue} onChange={e => setTypeForm({ ...typeForm, suggestedValue: e.target.value })} /></div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setTypeForm(null)} className="px-5 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button type="submit" className="px-6 py-2 bg-primary-600 text-white font-bold rounded-lg hover:bg-primary-700">Salvar</button>
            </div>
          </form>
        </div>
      )}

      {/* Cadastro / edição */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl p-6 my-8">
            <div className="flex justify-between items-center mb-5 border-b pb-3">
              <h3 className="text-lg font-bold text-gray-900">{editingId ? 'Editar contato' : 'Novo contato'}</h3>
              <button onClick={() => setFormOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {(['STUDENT', 'SPONSOR'] as LeadType[]).map(t => (
                    <button type="button" key={t} onClick={() => setForm({ ...form, leadType: t })} className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-sm font-medium ${form.leadType === t ? (t === 'SPONSOR' ? 'bg-amber-50 border-amber-500 text-amber-700' : 'bg-blue-50 border-blue-500 text-blue-700') : 'bg-white text-gray-600'}`}>
                      {t === 'SPONSOR' ? <Handshake className="w-4 h-4" /> : <Users className="w-4 h-4" />} {t === 'SPONSOR' ? 'Patrocinador' : 'Aluno'}
                    </button>
                  ))}
                </div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">{form.leadType === 'SPONSOR' ? 'Nome da empresa' : 'Nome do aluno / família'} *</label><input required className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">{form.leadType === 'SPONSOR' ? 'Pessoa de contato' : 'Responsável'}</label><input className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">WhatsApp / Telefone</label><input className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" placeholder="(11) 90000-0000" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">E-mail</label><input type="email" className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">Bairro / região</label><input className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" value={form.neighborhood} onChange={e => setForm({ ...form, neighborhood: e.target.value })} /></div>
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">Origem</label><select className="w-full border rounded-lg p-2.5 bg-white" value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}><option value="">Selecione...</option>{SOURCES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                </div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">{form.leadType === 'SPONSOR' ? 'Interesse (ex.: uniforme, placa no campo, valor)' : 'Interesse (ex.: idade, categoria, horário)'}</label><textarea rows={2} className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" value={form.interest} onChange={e => setForm({ ...form, interest: e.target.value })} /></div>
                {form.leadType === 'SPONSOR' && (
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-gray-500">Tipos de patrocínio</label>
                    {types.filter(t => t.active || form.sponsorshipTypeIds.includes(t.id)).length === 0 ? (
                      <p className="text-xs text-gray-400">Nenhum tipo cadastrado. Cadastre na aba "Tipos de patrocínio".</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {types.filter(t => t.active || form.sponsorshipTypeIds.includes(t.id)).map(t => {
                          const on = form.sponsorshipTypeIds.includes(t.id);
                          return (
                            <button type="button" key={t.id} onClick={() => toggleFormType(t.id)} title={t.description || undefined} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold ${on ? 'bg-amber-50 border-amber-500 text-amber-700' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                              {on ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />} {t.name}{t.suggestedValue != null && <span className="font-normal text-gray-400">({formatMoney(t.suggestedValue)})</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Valor negociado (R$)</label>
                        <input inputMode="decimal" className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" placeholder={(() => { const sug = form.sponsorshipTypeIds.reduce((acc, id) => acc + (types.find(t => t.id === id)?.suggestedValue || 0), 0); return sug > 0 ? `Sugerido: ${formatMoney(sug)}` : 'Ex.: 500,00'; })()} value={form.dealValue} onChange={e => setForm({ ...form, dealValue: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Pagamento</label>
                        <select className="w-full border rounded-lg p-2.5 bg-white" value={form.dealFrequency} onChange={e => setForm({ ...form, dealFrequency: e.target.value as 'MONTHLY' | 'ONCE' })}>
                          <option value="MONTHLY">Mensal</option>
                          <option value="ONCE">Valor único</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">CNPJ / CPF do patrocinador</label>
                      <input className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" placeholder="00.000.000/0000-00" value={form.sponsorDocument} onChange={e => setForm({ ...form, sponsorDocument: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Início da parceria</label>
                        <input type="date" className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" value={form.partnershipStart} onChange={e => setForm({ ...form, partnershipStart: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Prazo final da parceria</label>
                        <input type="date" min={form.partnershipStart || undefined} className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" value={form.partnershipEnd} onChange={e => setForm({ ...form, partnershipEnd: e.target.value })} />
                      </div>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">Etapa</label><select className="w-full border rounded-lg p-2.5 bg-white" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as LeadStatus })}>{STATUS_LIST.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">Próximo contato</label><input type="date" className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" value={form.nextContactDate} onChange={e => setForm({ ...form, nextContactDate: e.target.value })} /></div>
                </div>
              </div>

              <div className="flex flex-col">
                <h4 className="text-sm font-bold text-gray-700 flex items-center gap-2 mb-2"><History className="w-4 h-4" /> Histórico de contatos</h4>
                <div className="flex gap-2 mb-3">
                  <textarea rows={2} className="flex-1 border rounded-lg p-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" placeholder="O que foi conversado? Próximo passo?" value={newNote} onChange={e => setNewNote(e.target.value)} />
                  {editingId && <button type="button" onClick={() => void handleAddNoteOnly()} disabled={!newNote.trim()} className="self-stretch px-3 bg-primary-600 text-white rounded-lg disabled:opacity-40" title="Adicionar anotação"><Send className="w-4 h-4" /></button>}
                </div>
                <div className="flex-1 min-h-[160px] max-h-[340px] overflow-y-auto border rounded-lg bg-gray-50 divide-y">
                  {form.history.length === 0 ? <p className="p-4 text-sm text-gray-400 text-center">Nenhuma anotação ainda.{!editingId && ' A anotação acima será salva junto com o contato.'}</p> : form.history.map((h, i) => (
                    <div key={i} className="p-3 text-sm">
                      <p className="text-[11px] text-gray-400 font-bold">{formatDateTime(h.date)}{h.author ? ` · ${h.author}` : ''}</p>
                      <p className="text-gray-700 whitespace-pre-wrap">{h.text}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t">
                {form.leadType === 'SPONSOR' && (
                  <button type="button" onClick={handleGenerateTermFromForm} className="sm:mr-auto flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-50"><FileText className="w-4 h-4" /> Gerar termo de compromisso</button>
                )}
                <button type="button" onClick={() => setFormOpen(false)} className="px-5 py-2.5 text-gray-500 font-bold hover:bg-gray-100 rounded-lg">Cancelar</button>
                <button type="submit" disabled={saving} className="px-8 py-2.5 bg-primary-600 text-white font-black rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2">{saving && <Loader2 className="w-4 h-4 animate-spin" />} Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Escrever mensagem */}
      {composeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><MessageCircle className="w-5 h-5 text-green-600" /> Enviar WhatsApp</h3>
              <button onClick={() => setComposeOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-2">{composeTargets.length === 1 ? <>Para <strong>{composeTargets[0].name}</strong></> : <>Para <strong>{composeTargets.filter(t => t.phone.replace(/\D/g, '')).length}</strong> contatos{composeTargets.some(t => !t.phone.replace(/\D/g, '')) && <> ({composeTargets.filter(t => !t.phone.replace(/\D/g, '')).length} sem telefone ficam de fora)</>}</>}. Use <code className="bg-gray-100 px-1 rounded">{'{nome}'}</code> para colocar o nome de cada um.</p>
            <textarea rows={7} className="w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" value={composeMessage} onChange={e => setComposeMessage(e.target.value)} />
            <p className="text-xs text-gray-400 mt-2">Contatos na etapa "Novo" passam para "Contatado" após o envio, e a mensagem fica registrada no histórico.</p>
            <div className="flex justify-end gap-3 pt-4">
              <button onClick={() => setComposeOpen(false)} className="px-5 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button onClick={startQueue} disabled={!composeMessage.trim() || queueRunning} className="px-6 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:opacity-50">Enviar</button>
            </div>
          </div>
        </div>
      )}

      {/* Fila de envio com contagem (igual à convocação) */}
      {queueOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 border-t-4 border-green-500">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-black flex items-center gap-2 text-gray-800 uppercase tracking-tighter"><Megaphone className="w-5 h-5 text-green-600" /> Disparos WhatsApp</h3>
              {!queueRunning && <button onClick={() => setQueueOpen(false)}><X className="text-gray-400" /></button>}
            </div>
            <div className="mb-6">
              <div className="flex justify-between text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider"><span>Progresso da Fila:</span><span>{queueIndex} de {queue.length}</span></div>
              <div className="w-full bg-gray-100 rounded-full h-2.5 mb-4 overflow-hidden"><div className="bg-green-600 h-2.5 rounded-full transition-all duration-500" style={{ width: `${queue.length ? (queueIndex / queue.length) * 100 : 0}%` }} /></div>
              {queueRunning ? (
                <div className="bg-green-50 text-green-800 p-3 rounded-xl text-sm text-center font-bold animate-pulse">Enviando em {queueCountdown}s...</div>
              ) : queueIndex >= queue.length ? (
                <div className="bg-green-50 text-green-800 p-3 rounded-xl text-sm text-center font-bold">Processo Concluído!</div>
              ) : (
                <div className="bg-yellow-50 text-yellow-800 p-3 rounded-xl text-sm text-center font-bold">Envio pausado</div>
              )}
            </div>
            <div className="bg-gray-900 text-green-400 p-4 rounded-xl h-48 overflow-y-auto text-xs font-mono mb-4">{queueLogs.map((log, i) => <div key={i} className="mb-1 border-b border-gray-800 pb-1 last:border-0">{log}</div>)}</div>
            <div className="flex gap-2">
              {queueRunning ? (
                <button onClick={() => setQueueRunning(false)} className="flex-1 px-4 py-2 bg-red-100 text-red-700 rounded-xl text-sm font-bold hover:bg-red-200"><Pause className="w-4 h-4 inline mr-1" /> PAUSAR</button>
              ) : (
                <button onClick={() => setQueueRunning(true)} disabled={queueIndex >= queue.length} className="flex-1 px-4 py-2 bg-green-100 text-green-700 rounded-xl text-sm font-bold hover:bg-green-200 disabled:opacity-50"><Play className="w-4 h-4 inline mr-1" /> CONTINUAR</button>
              )}
              <button onClick={() => { setQueueRunning(false); setQueueOpen(false); setSelectedIds(new Set()); }} className="flex-1 px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-200">FECHAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
