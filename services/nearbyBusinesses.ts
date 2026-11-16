// Busca de empresas próximas ao clube usando dados abertos do OpenStreetMap:
// - Nominatim: transforma o endereço do clube em coordenadas;
// - Overpass: lista estabelecimentos com nome num raio em volta dessas coordenadas.
// Ambos são gratuitos, não exigem chave e aceitam chamadas direto do navegador.

export interface GeoPoint {
  lat: number;
  lon: number;
  label: string;      // nome do local devolvido pelo mapa
  address?: string;   // endereço como foi digitado (o que aparece na tela)
  isClub?: boolean;   // true quando é o endereço do clube
}

export interface NearbyBusiness {
  osmId: string;          // ex.: "node/123"
  name: string;
  category: string;       // ex.: "Padaria", "Farmácia"
  address: string;
  neighborhood: string;
  phone: string;
  whatsapp: string;       // da tag do OSM ou celular (provável WhatsApp)
  whatsappIsGuess: boolean;
  email: string;
  website: string;
  distanceMeters: number;
}

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
// Servidores públicos do Overpass. São consultados AO MESMO TEMPO e vale a primeira
// resposta boa: um servidor lento ou fora do ar não atrasa mais a busca.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const OVERPASS_TIMEOUT_MS = 25000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // resultados guardados no navegador por 24 h

// ---------- Geocodificação ----------

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

// ---------- Busca no Overpass ----------

const AMENITIES = 'restaurant|cafe|fast_food|bar|pub|biergarten|food_court|ice_cream|pharmacy|bank|clinic|dentist|doctors|veterinary|fuel|car_wash|car_rental|driving_school|marketplace|bureau_de_change|money_transfer|internet_cafe|cinema|nightclub|language_school|music_school|prep_school';
const LEISURE = 'fitness_centre|sports_centre|dance|bowling_alley|escape_game|amusement_arcade';
const TOURISM = 'hotel|motel|guest_house|hostel';

// Retângulo que contém o círculo do raio (sul, oeste, norte, leste).
export const boundingBox = (lat: number, lon: number, radius: number) => {
  const dLat = radius / 111320;
  const dLon = radius / (111320 * Math.cos((lat * Math.PI) / 180));
  const f = (n: number) => n.toFixed(6);
  return `${f(lat - dLat)},${f(lon - dLon)},${f(lat + dLat)},${f(lon + dLon)}`;
};

// Busca por retângulo + índice de tags (bem mais rápido no Overpass do que "around").
// O corte exato pelo raio é feito depois, em parseOverpassResult.
export const buildOverpassQuery = (lat: number, lon: number, radius: number) => {
  const b = `(${boundingBox(lat, lon, radius)})`;
  return `[out:json][timeout:25];
(
  nwr["shop"]["name"]${b};
  nwr["office"]["name"]${b};
  nwr["craft"]["name"]${b};
  nwr["healthcare"]["name"]${b};
  nwr["amenity"~"^(${AMENITIES})$"]["name"]${b};
  nwr["leisure"~"^(${LEISURE})$"]["name"]${b};
  nwr["tourism"~"^(${TOURISM})$"]["name"]${b};
);
out center tags qt;`;
};

const CATEGORY_PT: Record<string, string> = {
  bakery: 'Padaria', supermarket: 'Supermercado', convenience: 'Conveniência', butcher: 'Açougue', greengrocer: 'Hortifruti',
  clothes: 'Loja de roupas', shoes: 'Calçados', hairdresser: 'Cabeleireiro', beauty: 'Estética', hardware: 'Material de construção',
  doityourself: 'Material de construção', car_repair: 'Oficina mecânica', car_parts: 'Autopeças', tyres: 'Pneus', mobile_phone: 'Celulares',
  electronics: 'Eletrônicos', optician: 'Ótica', pet: 'Pet shop', sports: 'Artigos esportivos', stationery: 'Papelaria', florist: 'Floricultura',
  furniture: 'Móveis', variety_store: 'Variedades', alcohol: 'Bebidas', beverages: 'Bebidas', kiosk: 'Banca', laundry: 'Lavanderia',
  restaurant: 'Restaurante', cafe: 'Café', fast_food: 'Lanchonete', bar: 'Bar', pub: 'Bar', ice_cream: 'Sorveteria', pharmacy: 'Farmácia',
  bank: 'Banco', clinic: 'Clínica', dentist: 'Dentista', doctors: 'Consultório', veterinary: 'Veterinário', fuel: 'Posto de combustível',
  car_wash: 'Lava-rápido', driving_school: 'Autoescola', marketplace: 'Feira / mercado', fitness_centre: 'Academia', sports_centre: 'Centro esportivo',
  hotel: 'Hotel', motel: 'Motel', guest_house: 'Pousada', hostel: 'Hostel', language_school: 'Escola de idiomas', music_school: 'Escola de música',
  company: 'Empresa', estate_agent: 'Imobiliária', insurance: 'Seguros', lawyer: 'Advocacia', accountant: 'Contabilidade',
};

const categoryOf = (t: Record<string, string>) => {
  const raw = t.shop || t.amenity || t.leisure || t.tourism || t.office || t.craft || t.healthcare || '';
  if (CATEGORY_PT[raw]) return CATEGORY_PT[raw];
  const group = t.shop ? 'Comércio' : t.office ? 'Escritório' : t.craft ? 'Serviço' : t.healthcare ? 'Saúde' : 'Estabelecimento';
  return raw && raw !== 'yes' ? `${group} (${raw.replace(/_/g, ' ')})` : group;
};

const first = (t: Record<string, string>, ...keys: string[]) => {
  for (const k of keys) if (t[k]) return t[k].split(';')[0].trim();
  return '';
};

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

export const parseOverpassResult = (json: any, center: { lat: number; lon: number }, radius: number): NearbyBusiness[] => {
  const seen = new Set<string>();
  const out: NearbyBusiness[] = [];
  for (const el of json?.elements || []) {
    const t: Record<string, string> = el.tags || {};
    const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
    if (!t.name || typeof lat !== 'number' || typeof lon !== 'number') continue;
    const dist = distanceMeters(center.lat, center.lon, lat, lon);
    if (dist > radius + 1) continue;
    // O mesmo lugar pode vir como ponto e como prédio: junta por nome + endereço.
    const dedupKey = `${normalizeName(t.name)}|${t['addr:street'] || ''}|${t['addr:housenumber'] || ''}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(', ');
    const neighborhood = first(t, 'addr:suburb', 'addr:neighbourhood', 'addr:district');
    const address = [street, neighborhood, first(t, 'addr:city'), first(t, 'addr:postcode')].filter(Boolean).join(' – ');
    const phone = first(t, 'phone', 'contact:phone', 'phone:mobile', 'contact:mobile');
    const waTag = first(t, 'contact:whatsapp', 'whatsapp');
    const mobile = first(t, 'phone:mobile', 'contact:mobile') || (isBrazilianMobile(phone) ? phone : '');
    out.push({
      osmId: `${el.type}/${el.id}`,
      name: t.name.trim(),
      category: categoryOf(t),
      address,
      neighborhood,
      phone,
      whatsapp: waTag || mobile,
      whatsappIsGuess: !waTag && !!mobile,
      email: first(t, 'email', 'contact:email'),
      website: first(t, 'website', 'contact:website', 'contact:instagram', 'contact:facebook'),
      distanceMeters: Math.round(dist),
    });
  }
  return out.sort((a, b) => a.distanceMeters - b.distanceMeters);
};

// ---------- Memória de resultados (no navegador) ----------

interface CachedSearch { radius: number; savedAt: number; items: NearbyBusiness[] }
const cacheKey = (c: { lat: number; lon: number }) => `nearby_businesses:${c.lat.toFixed(5)},${c.lon.toFixed(5)}`;

const readCache = (c: { lat: number; lon: number }, radius: number): { items: NearbyBusiness[]; savedAt: number } | null => {
  try {
    const raw = localStorage.getItem(cacheKey(c));
    if (!raw) return null;
    const v: CachedSearch = JSON.parse(raw);
    if (!v || Date.now() - v.savedAt > CACHE_TTL_MS || v.radius < radius) return null;
    // Uma busca maior já feita serve para um raio menor: só filtra pela distância.
    return { items: v.items.filter(b => b.distanceMeters <= radius), savedAt: v.savedAt };
  } catch { return null; }
};

const writeCache = (c: { lat: number; lon: number }, radius: number, items: NearbyBusiness[]) => {
  try {
    const prev = localStorage.getItem(cacheKey(c));
    const old: CachedSearch | null = prev ? JSON.parse(prev) : null;
    // Mantém a busca de raio maior, se ainda estiver valendo.
    if (old && Date.now() - old.savedAt <= CACHE_TTL_MS && old.radius > radius) return;
    localStorage.setItem(cacheKey(c), JSON.stringify({ radius, savedAt: Date.now(), items }));
  } catch { /* navegador sem espaço ou bloqueado: segue sem memória */ }
};

// ---------- Busca ----------

const queryEndpoint = async (url: string, body: string, signal: AbortSignal) => {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  // O Overpass às vezes responde 200 com um aviso de tempo esgotado e sem resultados.
  if (json?.remark && /timed out|runtime error|out of memory/i.test(json.remark) && !(json.elements || []).length) {
    throw new Error('tempo esgotado no servidor');
  }
  return json;
};

export interface NearbySearchResult {
  items: NearbyBusiness[];
  cachedAt: number | null; // preenchido quando veio da memória do navegador
}

export const searchNearbyBusinesses = async (
  center: { lat: number; lon: number },
  radius: number,
  opts: { force?: boolean } = {},
): Promise<NearbySearchResult> => {
  if (!opts.force) {
    const cached = readCache(center, radius);
    if (cached) return { items: cached.items, cachedAt: cached.savedAt };
  }

  const body = 'data=' + encodeURIComponent(buildOverpassQuery(center.lat, center.lon, radius));
  const controllers = OVERPASS_ENDPOINTS.map(() => new AbortController());
  const timer = setTimeout(() => controllers.forEach(c => c.abort()), OVERPASS_TIMEOUT_MS);
  const errors: string[] = [];
  try {
    // Todos ao mesmo tempo; a primeira resposta boa vence e as outras são canceladas.
    const json = await Promise.any(OVERPASS_ENDPOINTS.map((url, i) =>
      queryEndpoint(url, body, controllers[i].signal).catch((e: any) => {
        errors.push(e?.name === 'AbortError' ? 'sem resposta' : (e?.message || 'falha de conexão'));
        throw e;
      })
    ));
    controllers.forEach(c => c.abort());
    const items = parseOverpassResult(json, center, radius);
    writeCache(center, radius, items);
    return { items, cachedAt: null };
  } catch {
    const detail = [...new Set(errors)].join(', ');
    throw new Error(`Os servidores do mapa não responderam agora${detail ? ` (${detail})` : ''}. Clique em "Tentar novamente" em alguns instantes; um raio menor também ajuda.`);
  } finally {
    clearTimeout(timer);
  }
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
