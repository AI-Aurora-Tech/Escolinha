// Busca de empresas próximas a um endereço:
// - Nominatim (OpenStreetMap, gratuito): transforma o endereço digitado em coordenadas;
// - Google Places API (New): lista as empresas num raio em volta dessas coordenadas.
//   Precisa de uma chave de API do Google (guardada em app_settings).

export interface GeoPoint {
  lat: number;
  lon: number;
  label: string;      // nome do local devolvido pelo mapa
  address?: string;   // endereço como foi digitado (o que aparece na tela)
  isClub?: boolean;   // true quando é o endereço do clube
}

export interface NearbyBusiness {
  id: string;             // id do lugar no Google
  name: string;
  category: string;       // ex.: "Padaria", "Farmácia"
  address: string;
  neighborhood: string;
  phone: string;
  whatsapp: string;       // celular (provável WhatsApp); o Google não informa WhatsApp
  whatsappIsGuess: boolean;
  email: string;          // o Google não informa e-mail; fica vazio
  website: string;
  distanceMeters: number;
  segment: string;        // segmento da busca (ver SEGMENTS)
  rating: number | null;  // nota média no Google (1 a 5)
  ratingCount: number;    // total de avaliações no Google (usado como indicador de porte)
}

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // resultados guardados no navegador por 24 h

// ---------- Geocodificação (endereço -> coordenadas) ----------

export const geocodeAddress = async (attempts: Record<string, string>[]): Promise<GeoPoint | null> => {
  for (const params of attempts) {
    const qs = new URLSearchParams({ format: 'json', limit: '1', countrycodes: 'br', ...params });
    try {
      const res = await fetch(`${NOMINATIM}?${qs.toString()}`, { headers: { Accept: 'application/json' } });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data) && data[0]) {
        return { lat: Number(data[0].lat), lon: Number(data[0].lon), label: data[0].display_name || '' };
      }
    } catch { /* tenta a próxima forma */ }
  }
  return null;
};

// Aceita "-23.6, -46.7" (como copiado do Google Maps).
export const parseLatLon = (text: string): { lat: number; lon: number } | null => {
  const m = text.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
};

// ---------- Utilitários ----------

// Celular brasileiro: DDD + 9 dígitos começando com 9 (com ou sem 55).
export const isBrazilianMobile = (phone: string) => {
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  return d.length === 11 && d[2] === '9';
};

export const distanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371000, toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// ---------- Google Places (New) ----------

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchNearby';
// Mesmo endereço passando pelo proxy do próprio site (vercel.json / vite.config.ts),
// usado se o navegador bloquear a chamada direta.
const PLACES_PROXY_URL = '/api/places/v1/places:searchNearby';
const PLACES_TIMEOUT_MS = 20000;

const FIELD_MASK = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.addressComponents',
  'places.location', 'places.primaryType', 'places.primaryTypeDisplayName',
  'places.nationalPhoneNumber', 'places.internationalPhoneNumber', 'places.websiteUri',
  'places.rating', 'places.userRatingCount',
].join(',');

// Segmentos de empresas. Cada segmento é um pedido ao Google (que devolve no máximo 20
// lugares por pedido); os segmentos escolhidos são buscados ao mesmo tempo e juntados.
export interface Segment { id: string; label: string; hint: string; types: string[] }
export const SEGMENTS: Segment[] = [
  { id: 'food', label: 'Alimentação', hint: 'padarias, restaurantes, lanchonetes, bares', types: ['bakery', 'restaurant', 'cafe', 'coffee_shop', 'meal_takeaway', 'bar', 'ice_cream_shop', 'pizza_restaurant', 'fast_food_restaurant', 'hamburger_restaurant', 'sandwich_shop', 'steak_house'] },
  { id: 'grocery', label: 'Mercados', hint: 'supermercados, mercearias, conveniências', types: ['supermarket', 'grocery_store', 'convenience_store', 'market', 'liquor_store', 'food_store'] },
  { id: 'health', label: 'Saúde', hint: 'farmácias, clínicas, dentistas, veterinários', types: ['pharmacy', 'drugstore', 'dentist', 'dental_clinic', 'doctor', 'physiotherapist', 'medical_lab', 'veterinary_care'] },
  { id: 'sports', label: 'Academias e esporte', hint: 'academias, clubes, quadras', types: ['gym', 'fitness_center', 'sports_club', 'sports_complex', 'yoga_studio', 'swimming_pool'] },
  { id: 'auto', label: 'Automotivo', hint: 'oficinas, postos, lava-rápidos, autopeças', types: ['car_repair', 'car_wash', 'gas_station', 'car_dealer', 'auto_parts_store'] },
  { id: 'beauty', label: 'Beleza e serviços', hint: 'salões, barbearias, lavanderias, floriculturas', types: ['beauty_salon', 'hair_salon', 'barber_shop', 'hair_care', 'nail_salon', 'spa', 'laundry', 'florist'] },
  { id: 'retail', label: 'Lojas', hint: 'roupas, calçados, materiais, móveis, eletrônicos, pet', types: ['clothing_store', 'shoe_store', 'hardware_store', 'home_goods_store', 'home_improvement_store', 'furniture_store', 'electronics_store', 'cell_phone_store', 'sporting_goods_store', 'book_store', 'pet_store', 'jewelry_store', 'gift_shop'] },
  { id: 'business', label: 'Escritórios e outros', hint: 'imobiliárias, contabilidade, bancos, hotéis', types: ['real_estate_agency', 'insurance_agency', 'accounting', 'lawyer', 'travel_agency', 'bank', 'hotel', 'lodging', 'department_store', 'shopping_mall'] },
];
export const ALL_SEGMENT_IDS = SEGMENTS.map(s => s.id);
export const segmentLabel = (id: string) => SEGMENTS.find(s => s.id === id)?.label || '';

export class PlacesApiError extends Error {
  constructor(message: string, public kind: 'invalid_key' | 'permission' | 'quota' | 'network' | 'other') { super(message); }
}

const cleanAddress = (a: string) => (a || '').replace(/,?\s*(Brazil|Brasil)$/i, '').trim();

export const parsePlace = (p: any, center: { lat: number; lon: number }, segment = ''): NearbyBusiness | null => {
  const name = p?.displayName?.text?.trim();
  const lat = p?.location?.latitude, lon = p?.location?.longitude;
  if (!name || typeof lat !== 'number' || typeof lon !== 'number') return null;
  const comps: any[] = Array.isArray(p.addressComponents) ? p.addressComponents : [];
  const neighborhood = comps.find(c => (c.types || []).some((t: string) => t === 'sublocality_level_1' || t === 'sublocality' || t === 'neighborhood'))?.longText || '';
  const phone = p.nationalPhoneNumber || p.internationalPhoneNumber || '';
  const mobile = isBrazilianMobile(phone) ? phone : '';
  return {
    id: p.id || `${name}|${lat},${lon}`,
    name,
    category: p.primaryTypeDisplayName?.text || '',
    address: cleanAddress(p.formattedAddress || ''),
    neighborhood,
    phone,
    whatsapp: mobile,
    whatsappIsGuess: !!mobile,
    email: '',
    website: p.websiteUri || '',
    distanceMeters: Math.round(distanceMeters(center.lat, center.lon, lat, lon)),
    segment,
    rating: typeof p.rating === 'number' ? p.rating : null,
    ratingCount: typeof p.userRatingCount === 'number' ? p.userRatingCount : 0,
  };
};

const describeHttpError = (status: number, msg: string): PlacesApiError => {
  if (/api key not valid|API_KEY_INVALID/i.test(msg)) return new PlacesApiError('A chave do Google é inválida. Confira a chave cadastrada.', 'invalid_key');
  if (status === 403) return new PlacesApiError(`O Google recusou a chave (${msg || 'sem permissão'}). Confira se a "Places API (New)" está ativada no projeto e se a chave permite este site.`, 'permission');
  if (status === 429) return new PlacesApiError('A cota de consultas do Google foi atingida. Tente mais tarde ou aumente a cota no Google Cloud.', 'quota');
  return new PlacesApiError(`O Google respondeu com erro ${status}${msg ? `: ${msg}` : ''}.`, 'other');
};

// Um pedido ao Google para um grupo de tipos. Se algum tipo não for aceito, tenta de novo sem ele.
const searchGroup = async (apiKey: string, center: { lat: number; lon: number }, radius: number, types: string[], signal: AbortSignal, useProxy: boolean): Promise<any[]> => {
  let current = [...types];
  for (let tries = 0; tries < 3 && current.length; tries++) {
    const res = await fetch(useProxy ? PLACES_PROXY_URL : PLACES_URL, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': FIELD_MASK },
      body: JSON.stringify({
        includedTypes: current,
        maxResultCount: 20,
        rankPreference: 'DISTANCE',
        languageCode: 'pt-BR',
        regionCode: 'BR',
        locationRestriction: { circle: { center: { latitude: center.lat, longitude: center.lon }, radius } },
      }),
    });
    if (res.ok) return (await res.json())?.places || [];
    const errJson = await res.json().catch(() => null);
    const msg: string = errJson?.error?.message || '';
    const unsupported = msg.match(/Unsupported types?:\s*([^.]+)/i);
    if (res.status === 400 && unsupported) {
      const bad = unsupported[1].split(/[,\s]+/).filter(Boolean);
      current = current.filter(t => !bad.includes(t));
      continue;
    }
    throw describeHttpError(res.status, msg);
  }
  return [];
};

// Busca os segmentos pedidos ao mesmo tempo; devolve os lugares com o segmento de origem
// e a lista de segmentos que responderam.
const runSegments = async (apiKey: string, center: { lat: number; lon: number }, radius: number, segmentIds: string[], useProxy: boolean) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PLACES_TIMEOUT_MS);
  try {
    const segs = SEGMENTS.filter(s => segmentIds.includes(s.id));
    const settled = await Promise.allSettled(segs.map(s => searchGroup(apiKey, center, radius, s.types, ctrl.signal, useProxy)));
    const okIdx = settled.map((r, i) => (r.status === 'fulfilled' ? i : -1)).filter(i => i >= 0);
    if (okIdx.length === 0) throw (settled[0] as PromiseRejectedResult).reason;
    return {
      places: okIdx.flatMap(i => ((settled[i] as PromiseFulfilledResult<any[]>).value).map(p => ({ p, segment: segs[i].id }))),
      doneSegments: okIdx.map(i => segs[i].id),
    };
  } finally {
    clearTimeout(timer);
  }
};

const isNetworkError = (e: any) => e instanceof TypeError || e?.name === 'AbortError';

// ---------- Memória de resultados (no navegador) ----------

interface CachedSearch { radius: number; savedAt: number; segments: string[]; items: NearbyBusiness[] }
const cacheKey = (c: { lat: number; lon: number }) => `nearby_google_v3:${c.lat.toFixed(5)},${c.lon.toFixed(5)}`;

const loadCache = (c: { lat: number; lon: number }): CachedSearch | null => {
  try {
    const raw = localStorage.getItem(cacheKey(c));
    if (!raw) return null;
    const v: CachedSearch = JSON.parse(raw);
    if (!v || !Array.isArray(v.segments) || Date.now() - v.savedAt > CACHE_TTL_MS) return null;
    return v;
  } catch { return null; }
};

const saveCache = (c: { lat: number; lon: number }, v: CachedSearch) => {
  try { localStorage.setItem(cacheKey(c), JSON.stringify(v)); } catch { /* sem memória: segue */ }
};

// ---------- Busca ----------

export interface NearbySearchResult {
  items: NearbyBusiness[];    // empresas dos segmentos pedidos, dentro do raio
  cachedAt: number | null;    // preenchido quando tudo veio da memória do navegador
  requests: number;           // pedidos feitos ao Google nesta busca (0 = sem custo)
}

export const searchNearbyBusinesses = async (
  apiKey: string,
  center: { lat: number; lon: number },
  radius: number,
  segmentIds: string[],
  opts: { force?: boolean } = {},
): Promise<NearbySearchResult> => {
  const wanted = segmentIds.length ? segmentIds : ALL_SEGMENT_IDS;
  // Memória: vale se a busca guardada tem raio igual ou maior (filtra pela distância).
  const cache = !opts.force ? loadCache(center) : null;
  const usable = cache && cache.radius >= radius ? cache : null;
  const missing = usable ? wanted.filter(id => !usable.segments.includes(id)) : wanted;
  const pick = (list: NearbyBusiness[]) => list.filter(b => b.distanceMeters <= radius && wanted.includes(b.segment)).sort((a, b) => a.distanceMeters - b.distanceMeters);

  if (usable && missing.length === 0) return { items: pick(usable.items), cachedAt: usable.savedAt, requests: 0 };

  // Busca no Google só os segmentos que ainda não estão na memória.
  let result: { places: { p: any; segment: string }[]; doneSegments: string[] };
  try {
    result = await runSegments(apiKey, center, radius, missing, false);
  } catch (e: any) {
    if (!isNetworkError(e)) throw e;
    // Chamada direta bloqueada ou sem resposta: tenta pelo proxy do próprio site.
    try {
      result = await runSegments(apiKey, center, radius, missing, true);
    } catch (e2: any) {
      if (isNetworkError(e2)) throw new PlacesApiError('Não foi possível falar com o Google agora (sem conexão ou sem resposta). Tente novamente.', 'network');
      throw e2;
    }
  }

  // Junta com o que já estava na memória (mesmo lugar em dois segmentos fica no primeiro).
  const byId = new Map<string, NearbyBusiness>();
  for (const b of usable?.items || []) if (b.distanceMeters <= radius) byId.set(b.id, b);
  for (const { p, segment } of result.places) {
    const b = parsePlace(p, center, segment);
    if (b && b.distanceMeters <= radius + 1 && !byId.has(b.id)) byId.set(b.id, b);
  }
  const all = [...byId.values()];
  saveCache(center, {
    radius,
    savedAt: Date.now(),
    segments: [...new Set([...(usable?.segments || []), ...result.doneSegments])],
    items: all,
  });
  return { items: pick(all), cachedAt: null, requests: missing.length };
};

// ---------- Comparação com os contatos já cadastrados ----------

export const normalizeName = (s: string) => (s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/\b(ltda|me|epp|eireli|s\/?a|sa|cia|comercio|com)\b\.?/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const phoneKey = (p: string) => {
  const d = (p || '').replace(/\D/g, '');
  return d.length >= 8 ? d.slice(-8) : '';
};

export const isAlreadyContact = (b: NearbyBusiness, contacts: { name: string; phone: string }[]) => {
  const n = normalizeName(b.name);
  const phones = [phoneKey(b.phone), phoneKey(b.whatsapp)].filter(Boolean);
  return contacts.some(c => {
    if (n && normalizeName(c.name) === n) return true;
    const cp = phoneKey(c.phone);
    return !!cp && phones.includes(cp);
  });
};
