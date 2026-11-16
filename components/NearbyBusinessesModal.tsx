import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  NearbyBusiness, GeoPoint, geocodeAddress, parseLatLon, searchNearbyBusinesses, isAlreadyContact,
} from '../services/nearbyBusinesses';
import { X, MapPin, Loader2, Search, CheckSquare, Square, Phone, MessageCircle, Mail, Globe, AlertTriangle, Plus, Crosshair } from 'lucide-react';

export const SEARCH_RADIUS_METERS = 1000;

// Endereço do clube, em formas diferentes: usa a primeira que o mapa encontrar.
const CLUB_GEOCODE_ATTEMPTS: Record<string, string>[] = [
  { street: '550 Rua Roque de Mingo', city: 'São Paulo', state: 'SP', postalcode: '05759-290' },
  { q: 'Rua Roque de Mingo, 550, Jardim Samara, São Paulo' },
  { street: 'Rua Roque de Mingo', city: 'São Paulo', state: 'SP' },
  { postalcode: '05759-290', city: 'São Paulo' },
];
const CENTER_SETTING_KEY = 'marketing_search_center';

interface Props {
  existingContacts: { name: string; phone: string }[];
  onAdd: (items: NearbyBusiness[]) => Promise<number>; // devolve quantos foram adicionados
  onClose: () => void;
}

const formatDistance = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`);
const mapLink = (lat: number, lon: number) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;

export const NearbyBusinessesModal: React.FC<Props> = ({ existingContacts, onAdd, onClose }) => {
  const [center, setCenter] = useState<GeoPoint | null>(null);
  const [centerLoading, setCenterLoading] = useState(true);
  const [centerError, setCenterError] = useState<string | null>(null);
  const [editingCenter, setEditingCenter] = useState(false);
  const [centerInput, setCenterInput] = useState('');

  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<NearbyBusiness[] | null>(null);
  const [ignoredCount, setIgnoredCount] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const saveCenter = async (p: GeoPoint) => {
    // Guarda o ponto para as próximas buscas (e para quem ajustar manualmente).
    await supabase.from('app_settings').upsert({ key: CENTER_SETTING_KEY, value: JSON.stringify(p) });
  };

  const runSearch = useCallback(async (c: GeoPoint) => {
    setSearching(true); setSearchError(null); setResults(null); setSelected(new Set());
    try {
      const found = await searchNearbyBusinesses(c, SEARCH_RADIUS_METERS);
      const fresh = found.filter(b => !isAlreadyContact(b, existingContacts));
      setIgnoredCount(found.length - fresh.length);
      setResults(fresh);
    } catch (e: any) {
      setSearchError(e?.message || 'Erro ao buscar empresas.');
    } finally {
      setSearching(false);
    }
  }, [existingContacts]);

  // Ao abrir: usa o ponto salvo ou localiza o endereço do clube; em seguida já busca.
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
      if (!c) {
        c = await geocodeAddress(CLUB_GEOCODE_ATTEMPTS);
        if (c) void saveCenter(c);
      }
      if (cancelled) return;
      setCenterLoading(false);
      if (!c) {
        setCenterError('Não foi possível localizar o endereço do clube no mapa. Informe as coordenadas (latitude, longitude) do clube.');
        setEditingCenter(true);
        return;
      }
      setCenter(c);
      void runSearch(c);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyCenterInput = async () => {
    const p = parseLatLon(centerInput);
    if (!p) return alert('Informe as coordenadas no formato: -23.6123, -46.7456 (latitude, longitude).');
    const c: GeoPoint = { ...p, label: 'Ponto ajustado manualmente' };
    setCenter(c); setCenterError(null); setEditingCenter(false);
    await saveCenter(c);
    void runSearch(c);
  };

  const relocateFromAddress = async () => {
    setCenterLoading(true);
    const c = await geocodeAddress(CLUB_GEOCODE_ATTEMPTS);
    setCenterLoading(false);
    if (!c) return alert('O mapa não encontrou o endereço do clube. Informe as coordenadas manualmente.');
    setCenter(c); setEditingCenter(false); setCenterError(null);
    await saveCenter(c);
    void runSearch(c);
  };

  const allSelected = !!results && results.length > 0 && results.every(r => selected.has(r.osmId));
  const toggle = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(allSelected || !results ? new Set() : new Set(results.map(r => r.osmId)));

  const stats = useMemo(() => {
    const r = results || [];
    return { phone: r.filter(b => b.phone).length, whatsapp: r.filter(b => b.whatsapp).length, email: r.filter(b => b.email).length };
  }, [results]);

  const handleAdd = async () => {
    if (!results) return;
    const items = results.filter(r => selected.has(r.osmId));
    if (items.length === 0) return;
    setAdding(true);
    const added = await onAdd(items);
    setAdding(false);
    if (added > 0) {
      setResults(prev => (prev || []).filter(r => !selected.has(r.osmId)));
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
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><MapPin className="w-5 h-5 text-primary-600" /> Empresas a até {formatDistance(SEARCH_RADIUS_METERS)} do clube</h3>
            <p className="text-xs text-gray-500">Rua Roque de Mingo, 550 – Jardim Samara. Empresas que já estão nos seus contatos são ignoradas.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {/* Ponto central da busca */}
        <div className="bg-gray-50 border rounded-xl p-3 mb-4 text-sm">
          {centerLoading ? (
            <p className="flex items-center gap-2 text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Localizando o endereço do clube no mapa...</p>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="min-w-0">
                {center && (
                  <p className="text-gray-700 truncate"><Crosshair className="w-4 h-4 inline mr-1 text-gray-400" />Centro da busca: <span className="font-mono text-xs">{center.lat.toFixed(5)}, {center.lon.toFixed(5)}</span> <a href={mapLink(center.lat, center.lon)} target="_blank" rel="noreferrer" className="text-primary-600 font-bold underline ml-1">ver no mapa</a></p>
                )}
                {centerError && <p className="text-amber-700 flex items-start gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {centerError}</p>}
              </div>
              {!editingCenter && <button onClick={() => { setEditingCenter(true); setCenterInput(center ? `${center.lat}, ${center.lon}` : ''); }} className="text-xs font-bold text-gray-600 hover:text-primary-600 shrink-0">Ajustar ponto</button>}
            </div>
          )}
          {editingCenter && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-gray-500">No Google Maps, clique com o botão direito sobre o clube e copie as coordenadas (ex.: -23.6123, -46.7456). Cole abaixo:</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input className="flex-1 border rounded-lg p-2 text-sm font-mono focus:ring-2 focus:ring-primary-500 outline-none" placeholder="-23.6123, -46.7456" value={centerInput} onChange={e => setCenterInput(e.target.value)} />
                <button onClick={() => void applyCenterInput()} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-bold hover:bg-primary-700">Usar este ponto</button>
                <button onClick={() => void relocateFromAddress()} className="px-4 py-2 border rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-100">Localizar pelo endereço</button>
                {center && <button onClick={() => setEditingCenter(false)} className="px-3 py-2 text-sm text-gray-500">Cancelar</button>}
              </div>
            </div>
          )}
        </div>

        {searching && <div className="py-16 text-center text-gray-500"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" /> Buscando empresas próximas...</div>}

        {searchError && !searching && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span>{searchError}</span>
            {center && <button onClick={() => void runSearch(center)} className="font-bold underline shrink-0">Tentar novamente</button>}
          </div>
        )}

        {results && !searching && (
          <>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3 text-sm">
              <p className="text-gray-600">
                <strong className="text-gray-900">{results.length}</strong> empresa(s) nova(s) encontrada(s)
                {ignoredCount > 0 && <> · <strong>{ignoredCount}</strong> já estava(m) nos contatos e foi(ram) ignorada(s)</>}
                {results.length > 0 && <span className="text-gray-400"> · com telefone: {stats.phone} · WhatsApp: {stats.whatsapp} · e-mail: {stats.email}</span>}
              </p>
              <div className="flex gap-2 shrink-0">
                {center && <button onClick={() => void runSearch(center)} className="px-3 py-2 border rounded-lg font-bold text-gray-600 hover:bg-gray-50 flex items-center gap-1.5 whitespace-nowrap"><Search className="w-4 h-4" /> Buscar de novo</button>}
                <button onClick={() => void handleAdd()} disabled={selected.size === 0 || adding} className="px-4 py-2 bg-primary-600 text-white rounded-lg font-bold hover:bg-primary-700 disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap">
                  {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Adicionar {selected.size > 0 ? selected.size : ''} aos contatos
                </button>
              </div>
            </div>

            {results.length === 0 ? (
              <div className="py-12 text-center bg-gray-50 rounded-xl border border-dashed text-gray-400">
                <p className="font-medium">Nenhuma empresa nova encontrada neste raio.</p>
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
                      {results.map(b => (
                        <tr key={b.osmId} onClick={() => toggle(b.osmId)} className={`cursor-pointer ${selected.has(b.osmId) ? 'bg-primary-50' : 'hover:bg-gray-50'}`}>
                          <td className="p-3">{selected.has(b.osmId) ? <CheckSquare className="w-5 h-5 text-primary-600" /> : <Square className="w-5 h-5 text-gray-300" />}</td>
                          <td className="p-3">
                            <p className="font-bold text-gray-900">{b.name}</p>
                            <p className="text-xs text-gray-500">{b.category}</p>
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
            <p className="text-xs text-gray-400 mt-3">Dados abertos do OpenStreetMap (mapa colaborativo). Nem toda empresa da região está cadastrada no mapa, e telefone, WhatsApp e e-mail só aparecem quando foram informados lá.</p>
          </>
        )}
      </div>
    </div>
  );
};
