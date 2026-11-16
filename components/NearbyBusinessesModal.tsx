import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  NearbyBusiness, GeoPoint, geocodeAddress, parseLatLon, searchNearbyBusinesses, isAlreadyContact, PlacesApiError,
} from '../services/nearbyBusinesses';
import { X, MapPin, Loader2, Search, CheckSquare, Square, Phone, MessageCircle, Mail, Globe, AlertTriangle, Plus, Home, KeyRound } from 'lucide-react';

// Raio da busca (em metros): padrão 1 km, ajustável na tela entre 100 m e 5 km.
export const DEFAULT_RADIUS_METERS = 1000;
const MIN_RADIUS_METERS = 100;
const MAX_RADIUS_METERS = 5000;
const RADIUS_PRESETS = [500, 1000, 2000, 3000, 5000];
const RADIUS_SETTING_KEY = 'marketing_search_radius';

// Porte mínimo: o Google não informa funcionários; o total de avaliações serve de indicador
// (empresa com mais movimento tende a ter mais funcionários). Filtro aplicado sobre o resultado.
const MIN_REVIEWS_PRESETS = [0, 10, 30, 50, 100, 200];
const DEFAULT_MIN_REVIEWS = 30;
const MIN_REVIEWS_SETTING_KEY = 'marketing_min_reviews';

const CLUB_ADDRESS = 'Rua Roque de Mingo, 550 – Jardim Samara – São Paulo/SP – CEP 05759-290';

// Endereço do clube, em formas diferentes: usa a primeira que o mapa encontrar.
const CLUB_GEOCODE_ATTEMPTS: Record<string, string>[] = [
  { street: '550 Rua Roque de Mingo', city: 'São Paulo', state: 'SP', postalcode: '05759-290' },
  { q: 'Rua Roque de Mingo, 550, Jardim Samara, São Paulo' },
  { street: 'Rua Roque de Mingo', city: 'São Paulo', state: 'SP' },
  { postalcode: '05759-290', city: 'São Paulo' },
];
const CENTER_SETTING_KEY = 'marketing_search_center';
const GOOGLE_KEY_SETTING = 'google_places_api_key';

interface Props {
  existingContacts: { name: string; phone: string }[];
  onAdd: (items: NearbyBusiness[]) => Promise<number>; // devolve quantos foram adicionados
  onClose: () => void;
}

const kmText = (m: number) => (m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const formatDistance = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`);
// Endereço digitado: tenta como está e, se não achar, completando com a cidade.
const typedAddressAttempts = (text: string): Record<string, string>[] => {
  const t = text.trim();
  const attempts: Record<string, string>[] = [{ q: t }];
  if (!/s[ãa]o paulo/i.test(t)) attempts.push({ q: `${t}, São Paulo, SP` });
  return attempts;
};

// Texto mostrado como referência (pontos salvos antes desta versão não têm "address").
const centerAddressText = (c: GeoPoint) =>
  c.address || (c.label === 'Ponto ajustado manualmente' ? 'Ponto ajustado manualmente' : CLUB_ADDRESS);
const centerIsClub = (c: GeoPoint) => c.isClub ?? (!c.address && c.label !== 'Ponto ajustado manualmente');

const mapLink = (lat: number, lon: number) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;

export const NearbyBusinessesModal: React.FC<Props> = ({ existingContacts, onAdd, onClose }) => {
  const [center, setCenter] = useState<GeoPoint | null>(null);
  const [centerLoading, setCenterLoading] = useState(true);
  const [centerError, setCenterError] = useState<string | null>(null);
  const [editingCenter, setEditingCenter] = useState(false);
  const [centerInput, setCenterInput] = useState('');
  const [locating, setLocating] = useState(false);

  // Chave da API do Google (Places API New), guardada em app_settings.
  const [apiKey, setApiKey] = useState('');
  const [apiKeyLoaded, setApiKeyLoaded] = useState(false);
  const [editingKey, setEditingKey] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [savingKey, setSavingKey] = useState(false);

  const [radius, setRadius] = useState(DEFAULT_RADIUS_METERS);            // raio escolhido (ainda não buscado)
  const [radiusInput, setRadiusInput] = useState(kmText(DEFAULT_RADIUS_METERS)); // km, como digitado
  const [searchedRadius, setSearchedRadius] = useState<number | null>(null); // raio da última busca feita
  const [searching, setSearching] = useState(false);
  const [elapsed, setElapsed] = useState(0);                      // segundos de busca
  const [cachedAt, setCachedAt] = useState<number | null>(null);   // resultado veio da memória
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<NearbyBusiness[] | null>(null);
  const [ignoredCount, setIgnoredCount] = useState(0);
  const [minReviews, setMinReviews] = useState(DEFAULT_MIN_REVIEWS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const saveCenter = async (p: GeoPoint) => {
    // Guarda o ponto para as próximas buscas (e para quem ajustar manualmente).
    await supabase.from('app_settings').upsert({ key: CENTER_SETTING_KEY, value: JSON.stringify(p) });
  };

  const runSearch = useCallback(async (c: GeoPoint, r: number, force = false) => {
    setSearchedRadius(r);
    setSearching(true); setSearchError(null); setResults(null); setSelected(new Set()); setElapsed(0);
    const started = Date.now();
    const tick = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    try {
      const { items: found, cachedAt: fromCache } = await searchNearbyBusinesses(apiKey, c, r, { force });
      const fresh = found.filter(b => !isAlreadyContact(b, existingContacts));
      setIgnoredCount(found.length - fresh.length);
      setResults(fresh);
      setCachedAt(fromCache);
    } catch (e: any) {
      setSearchError(e?.message || 'Erro ao buscar empresas.');
      // Chave inválida ou sem permissão: abre o campo para trocar a chave.
      if (e instanceof PlacesApiError && (e.kind === 'invalid_key' || e.kind === 'permission')) { setKeyInput(''); setEditingKey(true); }
    } finally {
      clearInterval(tick);
      setSearching(false);
    }
  }, [existingContacts, apiKey]);

  // Ao abrir: usa o endereço salvo (ou o do clube) e o último raio. A busca só começa
  // quando o usuário clicar em "Buscar empresas".
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCenterLoading(true);
      let c: GeoPoint | null = null;
      try {
        const { data } = await supabase.from('app_settings').select('value').eq('key', CENTER_SETTING_KEY).maybeSingle();
        if (data?.value) {
          const v = JSON.parse(data.value);
          if (typeof v?.lat === 'number' && typeof v?.lon === 'number') c = v;
        }
      } catch { /* sem ponto salvo */ }
      let r = DEFAULT_RADIUS_METERS;
      try {
        const { data } = await supabase.from('app_settings').select('value').eq('key', RADIUS_SETTING_KEY).maybeSingle();
        const saved = Number(data?.value);
        if (Number.isFinite(saved) && saved >= MIN_RADIUS_METERS && saved <= MAX_RADIUS_METERS) r = saved;
      } catch { /* usa o padrão */ }
      try {
        const { data } = await supabase.from('app_settings').select('value').eq('key', MIN_REVIEWS_SETTING_KEY).maybeSingle();
        const saved = Number(data?.value);
        if (data?.value != null && Number.isFinite(saved) && saved >= 0) setMinReviews(saved);
      } catch { /* usa o padrão */ }
      let key = '';
      try {
        const { data } = await supabase.from('app_settings').select('value').eq('key', GOOGLE_KEY_SETTING).maybeSingle();
        key = (data?.value || '').trim();
      } catch { /* sem chave */ }
      if (cancelled) return;
      setApiKey(key); setApiKeyLoaded(true); if (!key) setEditingKey(true);
      setRadius(r); setRadiusInput(kmText(r));
      if (!c) {
        const found = await geocodeAddress(CLUB_GEOCODE_ATTEMPTS);
        if (found) { c = { ...found, address: CLUB_ADDRESS, isClub: true }; void saveCenter(c); }
      }
      if (cancelled) return;
      setCenterLoading(false);
      if (!c) {
        setCenterError('Não foi possível localizar o endereço do clube no mapa. Digite o endereço de referência abaixo.');
        setCenterInput(CLUB_ADDRESS);
        setEditingCenter(true);
        return;
      }
      setCenter(c);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Novo endereço de referência: os resultados anteriores deixam de valer até a próxima busca.
  const applyCenter = async (c: GeoPoint) => {
    setCenter(c); setCenterError(null); setEditingCenter(false);
    setResults(null); setSearchError(null); setSelected(new Set()); setSearchedRadius(null);
    await saveCenter(c);
  };

  // Localiza o endereço digitado e passa a usá-lo como referência.
  const applyTypedAddress = async () => {
    const text = centerInput.trim();
    if (text.length < 5) return setCenterError('Digite o endereço com rua, número e bairro (ou CEP).');
    setLocating(true); setCenterError(null);
    // Quem colar coordenadas (ex.: do Google Maps) também é atendido.
    const coords = parseLatLon(text);
    const found = coords ? { ...coords, label: text } : await geocodeAddress(typedAddressAttempts(text));
    setLocating(false);
    if (!found) return setCenterError('Endereço não encontrado no mapa. Confira rua, número, bairro e cidade, ou tente informar o CEP.');
    await applyCenter({ ...found, address: text, isClub: false });
  };

  // Volta a usar o endereço do clube.
  const resetToClub = async () => {
    setLocating(true); setCenterError(null);
    const found = await geocodeAddress(CLUB_GEOCODE_ATTEMPTS);
    setLocating(false);
    if (!found) return setCenterError('O mapa não encontrou o endereço do clube agora. Tente novamente em instantes.');
    await applyCenter({ ...found, address: CLUB_ADDRESS, isClub: true });
  };

  const saveApiKey = async () => {
    const k = keyInput.trim();
    if (k.length < 20) return alert('Cole a chave de API completa do Google (começa com "AIza").');
    setSavingKey(true);
    const { error } = await supabase.from('app_settings').upsert({ key: GOOGLE_KEY_SETTING, value: k });
    setSavingKey(false);
    if (error) return alert(`Não foi possível salvar a chave: ${error.message}`);
    setApiKey(k); setEditingKey(false); setSearchError(null);
  };

  const parseRadiusInput = (text: string) => Math.round(Number(text.replace(',', '.')) * 1000);
  const radiusIsValid = (m: number) => Number.isFinite(m) && m >= MIN_RADIUS_METERS && m <= MAX_RADIUS_METERS;

  // Só escolhe o raio (atalho ou digitado); a busca acontece no botão "Buscar empresas".
  const selectRadius = (m: number) => { setRadius(m); setRadiusInput(kmText(m)); };
  const onRadiusTyped = (text: string) => {
    setRadiusInput(text);
    const m = parseRadiusInput(text);
    if (radiusIsValid(m)) setRadius(m);
  };

  // Inicia a busca com o raio escolhido e guarda o raio para as próximas vezes.
  const startSearch = () => {
    if (!center) return;
    if (!apiKey) { setEditingKey(true); return alert('Cadastre primeiro a chave de API do Google.'); }
    const m = parseRadiusInput(radiusInput);
    if (!radiusIsValid(m)) return alert(`Informe um raio entre ${kmText(MIN_RADIUS_METERS)} e ${kmText(MAX_RADIUS_METERS)} km.`);
    selectRadius(m);
    // O Supabase só executa a gravação quando o resultado é aguardado.
    void (async () => { await supabase.from('app_settings').upsert({ key: RADIUS_SETTING_KEY, value: String(m) }); })();
    void runSearch(center, m);
  };

  // Empresas que passam no porte mínimo (total de avaliações no Google).
  const visible = useMemo(() => (results || []).filter(b => (b.ratingCount || 0) >= minReviews), [results, minReviews]);
  const hiddenBySize = (results?.length || 0) - visible.length;

  const changeMinReviews = (n: number) => {
    setMinReviews(n);
    // Desmarca quem saiu da lista com o novo filtro.
    setSelected(prev => new Set([...prev].filter(id => (results || []).some(b => b.id === id && (b.ratingCount || 0) >= n))));
    void (async () => { await supabase.from('app_settings').upsert({ key: MIN_REVIEWS_SETTING_KEY, value: String(n) }); })();
  };

  const allSelected = visible.length > 0 && visible.every(r => selected.has(r.id));
  const toggle = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(visible.map(r => r.id)));

  const stats = useMemo(() => ({
    phone: visible.filter(b => b.phone).length, whatsapp: visible.filter(b => b.whatsapp).length, website: visible.filter(b => b.website).length,
  }), [visible]);

  const handleAdd = async () => {
    if (!results) return;
    const items = visible.filter(r => selected.has(r.id));
    if (items.length === 0) return;
    setAdding(true);
    const added = await onAdd(items);
    setAdding(false);
    if (added > 0) {
      setResults(prev => (prev || []).filter(r => !selected.has(r.id)));
      setSelected(new Set());
      alert(`${added} empresa(s) adicionada(s) aos contatos como possíveis patrocinadores (etapa "Novo").`);
    }
  };

  const dash = <span className="text-gray-300">—</span>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl p-4 sm:p-6 my-4 sm:my-8">
        <div className="flex justify-between items-start gap-3 mb-4 border-b pb-3">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><MapPin className="w-5 h-5 text-primary-600" /> Empresas próximas {!center || centerIsClub(center) ? 'do clube' : 'do endereço informado'}</h3>
            <p className="text-xs text-gray-500">Empresas que já estão nos seus contatos são ignoradas.{apiKey && !editingKey && <> · <button onClick={() => { setKeyInput(''); setEditingKey(true); }} className="underline hover:text-primary-600">trocar chave do Google</button></>}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {/* Ponto central da busca */}
        <div className="bg-gray-50 border rounded-xl p-3 mb-4 text-sm">
          {centerLoading ? (
            <p className="flex items-center gap-2 text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Localizando o endereço no mapa...</p>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="min-w-0">
                {center && (
                  <p className="text-gray-700 break-words">
                    <Home className="w-4 h-4 inline mr-1 text-gray-400 -mt-0.5" />
                    <span className="text-gray-500">Endereço de referência:</span> <strong>{centerAddressText(center)}</strong>
                    <a href={mapLink(center.lat, center.lon)} target="_blank" rel="noreferrer" className="text-primary-600 font-bold underline ml-2 whitespace-nowrap">ver no mapa</a>
                  </p>
                )}
              </div>
              {!editingCenter && center && <button onClick={() => { setEditingCenter(true); setCenterError(null); setCenterInput(centerAddressText(center) === 'Ponto ajustado manualmente' ? '' : centerAddressText(center)); }} className="text-xs font-bold text-gray-600 hover:text-primary-600 shrink-0">Alterar endereço</button>}
            </div>
          )}
          {editingCenter && (
            <form onSubmit={e => { e.preventDefault(); void applyTypedAddress(); }} className="mt-3 space-y-2">
              <label className="block text-xs text-gray-500">Digite o endereço a partir do qual buscar as empresas (rua, número, bairro, cidade ou CEP):</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input autoFocus className="flex-1 border rounded-lg p-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" placeholder="Ex.: Av. Carlos Lacerda, 1200 – Campo Limpo, São Paulo" value={centerInput} onChange={e => setCenterInput(e.target.value)} disabled={locating} />
                <button type="submit" disabled={locating} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-bold hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-1.5 whitespace-nowrap">{locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Usar este endereço</button>
                {center && !centerIsClub(center) && <button type="button" onClick={() => void resetToClub()} disabled={locating} className="px-4 py-2 border rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-100 whitespace-nowrap disabled:opacity-50">Voltar ao endereço do clube</button>}
                {center && <button type="button" onClick={() => { setEditingCenter(false); setCenterError(null); }} className="px-3 py-2 text-sm text-gray-500">Cancelar</button>}
              </div>
            </form>
          )}
          {centerError && <p className="mt-2 text-amber-700 flex items-start gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {centerError}</p>}
        </div>

        {/* Chave do Google */}
        {apiKeyLoaded && editingKey && (
          <form onSubmit={e => { e.preventDefault(); void saveApiKey(); }} className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm space-y-2">
            <p className="font-bold text-amber-900 flex items-center gap-1.5"><KeyRound className="w-4 h-4" /> {apiKey ? 'Trocar a chave do Google' : 'Cadastre a chave do Google para buscar empresas'}</p>
            <ol className="text-xs text-amber-900 list-decimal pl-5 space-y-0.5">
              <li>No <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" className="underline font-bold">Google Cloud Console</a>, crie (ou escolha) um projeto com faturamento ativo.</li>
              <li>Em "APIs e serviços", ative a <strong>Places API (New)</strong>.</li>
              <li>Em "Credenciais", crie uma <strong>chave de API</strong> e restrinja-a à Places API (New) e ao endereço deste site.</li>
              <li>Cole a chave abaixo (ela começa com "AIza").</li>
            </ol>
            <div className="flex flex-col sm:flex-row gap-2">
              <input className="flex-1 border rounded-lg p-2 text-sm font-mono focus:ring-2 focus:ring-primary-500 outline-none bg-white" placeholder="AIza..." value={keyInput} onChange={e => setKeyInput(e.target.value)} autoComplete="off" />
              <button type="submit" disabled={savingKey} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-bold hover:bg-primary-700 disabled:opacity-50 whitespace-nowrap">Salvar chave</button>
              {apiKey && <button type="button" onClick={() => setEditingKey(false)} className="px-3 py-2 text-sm text-gray-500">Cancelar</button>}
            </div>
          </form>
        )}

        {/* Raio da busca + botão Buscar */}
        <form onSubmit={e => { e.preventDefault(); startSearch(); }} className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4 text-sm border rounded-xl p-3">
          <span className="font-bold text-gray-700 whitespace-nowrap">1. Escolha o raio:</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {RADIUS_PRESETS.map(m => (
              <button type="button" key={m} onClick={() => selectRadius(m)} disabled={searching} className={`px-3 py-1.5 rounded-full border text-xs font-bold disabled:opacity-50 ${radius === m && parseRadiusInput(radiusInput) === m ? 'bg-primary-600 border-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{formatDistance(m)}</button>
            ))}
            <span className="text-gray-500 text-xs ml-1">ou</span>
            <input inputMode="decimal" className="w-20 border rounded-lg px-2 py-1.5 text-sm text-right focus:ring-2 focus:ring-primary-500 outline-none" value={radiusInput} onChange={e => onRadiusTyped(e.target.value)} disabled={searching} aria-label="Raio em km" />
            <span className="text-gray-500 text-xs">km <span className="text-gray-400">(0,1 a 5)</span></span>
          </div>
          <button type="submit" disabled={searching || !center || locating || centerLoading || !apiKey} className="lg:ml-auto px-5 py-2.5 bg-primary-600 text-white rounded-lg font-bold hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap">
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} 2. Buscar empresas
          </button>
        </form>

        {/* Porte mínimo (avaliações no Google) */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-2 mb-4 text-sm">
          <span className="font-bold text-gray-700 whitespace-nowrap">Porte mínimo:</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {MIN_REVIEWS_PRESETS.map(n => (
              <button type="button" key={n} onClick={() => changeMinReviews(n)} className={`px-3 py-1.5 rounded-full border text-xs font-bold ${minReviews === n ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{n === 0 ? 'Todas' : `${n}+ avaliações`}</button>
            ))}
          </div>
          <span className="text-xs text-gray-400 lg:ml-2">O Google não informa funcionários; o nº de avaliações indica o movimento da empresa. Mudar este filtro não faz nova consulta.</span>
        </div>

        {center && !searching && !results && !searchError && (
          <div className="py-10 text-center bg-gray-50 rounded-xl border border-dashed text-gray-500 text-sm">
            <MapPin className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            Escolha o raio de distância e clique em <strong>Buscar empresas</strong>.
          </div>
        )}

        {searching && <div className="py-16 text-center text-gray-500"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" /> Buscando empresas próximas...<p className="text-xs text-gray-400 mt-1">{elapsed > 0 ? `${elapsed} s · ` : ''}consultando o Google Maps</p></div>}

        {searchError && !searching && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span>{searchError}</span>
            {center && <button onClick={() => void runSearch(center, searchedRadius ?? radius, true)} className="font-bold underline shrink-0">Tentar novamente</button>}
          </div>
        )}

        {results && !searching && (
          <>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3 text-sm">
              <p className="text-gray-600">
                <strong className="text-gray-900">{visible.length}</strong> empresa(s) nova(s) encontrada(s){searchedRadius != null && <> num raio de <strong>{formatDistance(searchedRadius)}</strong></>}
                {hiddenBySize > 0 && <> · <strong>{hiddenBySize}</strong> com menos de {minReviews} avaliações ocultada(s) pelo porte mínimo</>}
                {ignoredCount > 0 && <> · <strong>{ignoredCount}</strong> já estava(m) nos contatos e foi(ram) ignorada(s)</>}
                {visible.length > 0 && <span className="text-gray-400"> · com telefone: {stats.phone} · celular: {stats.whatsapp} · com site: {stats.website}</span>}
                {cachedAt && center && (
                  <span className="block text-xs text-gray-400 mt-0.5">
                    Resultado guardado da busca de {new Date(cachedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} (sem custo).{' '}
                    <button onClick={() => void runSearch(center, searchedRadius ?? radius, true)} className="text-primary-600 font-bold underline">Buscar de novo no Google</button>
                  </span>
                )}
              </p>
              <div className="flex flex-wrap gap-2 md:shrink-0">
                <button onClick={() => void handleAdd()} disabled={selected.size === 0 || adding} className="flex-1 md:flex-none justify-center px-4 py-2 bg-primary-600 text-white rounded-lg font-bold hover:bg-primary-700 disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap">
                  {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Adicionar {selected.size > 0 ? selected.size : ''} aos contatos
                </button>
              </div>
            </div>

            {visible.length === 0 ? (
              <div className="py-12 text-center bg-gray-50 rounded-xl border border-dashed text-gray-400">
                <p className="font-medium">{hiddenBySize > 0 ? `Nenhuma empresa com ${minReviews} ou mais avaliações. Diminua o porte mínimo para ver as ${hiddenBySize} encontradas.` : 'Nenhuma empresa nova encontrada neste raio.'}</p>
              </div>
            ) : (
              <div className="border rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-[60vh]">
                  <table className="w-full text-sm min-w-[900px]">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr className="text-left text-xs font-bold text-gray-500 uppercase">
                        <th className="p-3 w-10"><button onClick={toggleAll}>{allSelected ? <CheckSquare className="w-5 h-5 text-primary-600" /> : <Square className="w-5 h-5 text-gray-300" />}</button></th>
                        <th className="p-3">Nome da empresa</th>
                        <th className="p-3">Endereço</th>
                        <th className="p-3">Telefone</th>
                        <th className="p-3">WhatsApp</th>
                        <th className="p-3">E-mail</th>
                        <th className="p-3 text-right">Distância</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {visible.map(b => (
                        <tr key={b.id} onClick={() => toggle(b.id)} className={`cursor-pointer ${selected.has(b.id) ? 'bg-primary-50' : 'hover:bg-gray-50'}`}>
                          <td className="p-3">{selected.has(b.id) ? <CheckSquare className="w-5 h-5 text-primary-600" /> : <Square className="w-5 h-5 text-gray-300" />}</td>
                          <td className="p-3">
                            <p className="font-bold text-gray-900">{b.name}</p>
                            <p className="text-xs text-gray-500">{b.category}</p>
                            <p className="text-xs text-amber-600 font-medium">{b.ratingCount > 0 ? <>★ {b.rating != null ? b.rating.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '–'} · {b.ratingCount.toLocaleString('pt-BR')} avaliações</> : <span className="text-gray-400">sem avaliações</span>}</p>
                            {b.website && <a href={/^https?:/i.test(b.website) ? b.website : `https://${b.website}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-xs text-primary-600 flex items-center gap-1 truncate max-w-[220px]"><Globe className="w-3 h-3" /> {b.website.replace(/^https?:\/\//, '')}</a>}
                          </td>
                          <td className="p-3 text-gray-600">{b.address || dash}</td>
                          <td className="p-3 text-gray-700 whitespace-nowrap">{b.phone ? <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5 text-gray-400" /> {b.phone}</span> : dash}</td>
                          <td className="p-3 text-gray-700 whitespace-nowrap">{b.whatsapp ? (
                            <span className="flex flex-col">
                              <span className="flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5 text-green-600" /> {b.whatsapp}</span>
                              {b.whatsappIsGuess && <span className="text-[10px] text-gray-400">celular (provável WhatsApp)</span>}
                            </span>
                          ) : dash}</td>
                          <td className="p-3 text-gray-700">{b.email ? <a href={`mailto:${b.email}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-primary-700 break-all"><Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" /> {b.email}</a> : dash}</td>
                          <td className="p-3 text-right text-gray-500 whitespace-nowrap">{formatDistance(b.distanceMeters)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <p className="text-xs text-gray-400 mt-3">
              Dados do Google Maps. O Google não informa e-mail nem WhatsApp: celulares aparecem como "provável WhatsApp", e o e-mail pode ser obtido no site da empresa.
              Cada busca nova usa até 8 consultas da cota do Google; repetir a mesma busca em até 24 h não gera custo.
            </p>
          </>
        )}
      </div>
    </div>
  );
};
