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
// Servidores públicos do Overpass: se um estiver sobrecarregado (504/429) ou demorar, tenta o próximo.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const OVERPASS_TIMEOUT_MS = 35000;

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

// Uma única varredura da área (tudo que tem nome) e o filtro por tipo em memória:
// bem mais leve para o servidor do que uma varredura por tipo.
export const buildOverpassQuery = (lat: number, lon: number, radius: number) => `[out:json][timeout:30];
nwr(around:${radius},${lat},${lon})["name"]->.all;
(
  nwr.all["shop"];
  nwr.all["office"];
  nwr.all["craft"];
  nwr.all["healthcare"];
  nwr.all["amenity"~"^(${AMENITIES})$"];
  nwr.all["leisure"~"^(${LEISURE})$"];
  nwr.all["tourism"~"^(${TOURISM})$"];
);
out center tags;`;

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

export const searchNearbyBusinesses = async (
  center: { lat: number; lon: number },
  radius: number,
  onAttempt?: (attempt: number, total: number) => void,
): Promise<NearbyBusiness[]> => {
  const body = 'data=' + encodeURIComponent(buildOverpassQuery(center.lat, center.lon, radius));
  const errors: string[] = [];
  for (let i = 0; i < OVERPASS_ENDPOINTS.length; i++) {
    const url = OVERPASS_ENDPOINTS[i];
    onAttempt?.(i + 1, OVERPASS_ENDPOINTS.length);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), OVERPASS_TIMEOUT_MS);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: ctrl.signal });
      if (!res.ok) { errors.push(`HTTP ${res.status}`); continue; }
      const json = await res.json();
      // O Overpass às vezes responde 200 com um aviso de tempo esgotado e sem resultados.
      if (json?.remark && /timed out|runtime error|out of memory/i.test(json.remark) && !(json.elements || []).length) {
        errors.push('tempo esgotado no servidor'); continue;
      }
      return parseOverpassResult(json, center, radius);
    } catch (e: any) {
      errors.push(e?.name === 'AbortError' ? 'sem resposta' : (e?.message || 'falha de conexão'));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Os servidores do mapa estão ocupados agora (${errors.join(', ')}). Aguarde alguns minutos e clique em "Tentar novamente"; um raio menor também ajuda.`);
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
