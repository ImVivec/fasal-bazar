// Generates src/lib/master.ts (crops, districts, mandis). Master data lives in the repo, never in Mongo.
//   npm run gen:master               build from the committed snapshot
//   npm run gen:master -- --refresh  re-download Agmarknet's master list into the snapshot first
//
// What's in scope is decided here:
//   - DISTRICTS: which districts the app covers (an admin decision). Every Agmarknet mandi in these
//     districts is included automatically; new ones are also flagged daily by the market watch.
//   - CROPS: the curated farmer crop list. `ids` may hold Agmarknet aliases of the same crop.
import { readFileSync, writeFileSync } from 'node:fs';

const SNAPSHOT = 'scripts/master-src/agmarknet.json';

type State = { id: number; en: string; hi: string; short: string };
const STATES: State[] = [
  { id: 19, en: 'Madhya Pradesh', hi: 'मध्य प्रदेश', short: 'म.प्र.' },
  { id: 29, en: 'Rajasthan', hi: 'राजस्थान', short: 'राज.' },
];

const DISTRICTS = [
  { id: 287, state: 19, slug: 'agar-malwa', en: 'Agar Malwa', hi: 'आगर मालवा' },
  { id: 301, state: 19, slug: 'dewas', en: 'Dewas', hi: 'देवास' },
  { id: 308, state: 19, slug: 'indore', en: 'Indore', hi: 'इंदौर' },
  { id: 318, state: 19, slug: 'neemuch', en: 'Neemuch', hi: 'नीमच' },
  { id: 321, state: 19, slug: 'rajgarh', en: 'Rajgarh', hi: 'राजगढ़' },
  { id: 328, state: 19, slug: 'shajapur', en: 'Shajapur', hi: 'शाजापुर' },
  { id: 335, state: 19, slug: 'ujjain', en: 'Ujjain', hi: 'उज्जैन' },
  { id: 502, state: 29, slug: 'jhalawar', en: 'Jhalawar', hi: 'झालावाड़' },
  { id: 508, state: 29, slug: 'kota', en: 'Kota', hi: 'कोटा' },
];

type Group = 'cereals' | 'pulses' | 'oilseeds' | 'spices' | 'vegetables' | 'fruits';
type CropDef = { ids: number[]; slug: string; en: string; hi: string; group: Group; icon: string; unit?: 'qtl' | 'bundle' };

// Curated from what actually trades in these mandis (Agmarknet sample, Oct 2026).
const CROPS: CropDef[] = [
  { ids: [1], slug: 'wheat', en: 'Wheat', hi: 'गेहूं', group: 'cereals', icon: '🌾' },
  { ids: [4], slug: 'maize', en: 'Maize', hi: 'मक्का', group: 'cereals', icon: '🌽' },
  { ids: [29], slug: 'barley', en: 'Barley', hi: 'जौ', group: 'cereals', icon: '🌾' },
  { ids: [2], slug: 'paddy', en: 'Paddy', hi: 'धान', group: 'cereals', icon: '🍚' },
  { ids: [5], slug: 'jowar', en: 'Jowar', hi: 'ज्वार', group: 'cereals', icon: '🌾' },

  { ids: [6], slug: 'chana', en: 'Chana (Gram)', hi: 'चना', group: 'pulses', icon: '🫘' },
  { ids: [309], slug: 'kabuli-chana', en: 'Kabuli chana', hi: 'काबुली चना', group: 'pulses', icon: '🫘' },
  { ids: [52], slug: 'masoor', en: 'Masoor (Lentil)', hi: 'मसूर', group: 'pulses', icon: '🫘' },
  { ids: [8], slug: 'urad', en: 'Urad', hi: 'उड़द', group: 'pulses', icon: '🫘' },
  { ids: [9], slug: 'moong', en: 'Moong', hi: 'मूंग', group: 'pulses', icon: '🫘' },
  { ids: [45], slug: 'tur', en: 'Tur (Arhar)', hi: 'तुअर', group: 'pulses', icon: '🫘' },

  { ids: [13], slug: 'soyabean', en: 'Soyabean', hi: 'सोयाबीन', group: 'oilseeds', icon: '🌱' },
  { ids: [12], slug: 'mustard', en: 'Mustard', hi: 'सरसों', group: 'oilseeds', icon: '🌼' },
  { ids: [56], slug: 'linseed', en: 'Linseed (Alsi)', hi: 'अलसी', group: 'oilseeds', icon: '🌱' },
  { ids: [11], slug: 'til', en: 'Til (Sesame)', hi: 'तिल', group: 'oilseeds', icon: '🌱' },
  { ids: [10], slug: 'groundnut', en: 'Groundnut', hi: 'मूंगफली', group: 'oilseeds', icon: '🥜' },

  { ids: [25], slug: 'garlic', en: 'Garlic', hi: 'लहसुन', group: 'spices', icon: '🧄' },
  { ids: [92], slug: 'coriander-seed', en: 'Coriander seed', hi: 'धनिया', group: 'spices', icon: '🌿' },
  { ids: [43], slug: 'methi-seed', en: 'Methi seed', hi: 'मेथी दाना', group: 'spices', icon: '🌿' },
  { ids: [26], slug: 'dry-chilli', en: 'Dry red chilli', hi: 'सूखी लाल मिर्च', group: 'spices', icon: '🌶️' },
  { ids: [115], slug: 'ajwain', en: 'Ajwain', hi: 'अजवाइन', group: 'spices', icon: '🌿' },
  { ids: [27], slug: 'dry-ginger', en: 'Dry ginger', hi: 'सोंठ', group: 'spices', icon: '🌿' },
  { ids: [212], slug: 'isabgol', en: 'Isabgol', hi: 'इसबगोल', group: 'spices', icon: '🌿' },
  { ids: [372, 434], slug: 'ashwagandha', en: 'Ashwagandha', hi: 'अश्वगंधा', group: 'spices', icon: '🌿' },
  { ids: [374, 353], slug: 'kalonji', en: 'Kalonji', hi: 'कलौंजी', group: 'spices', icon: '🌿' },
  { ids: [350], slug: 'poppy-seed', en: 'Poppy seed', hi: 'खसखस', group: 'spices', icon: '🌿' },

  { ids: [23], slug: 'onion', en: 'Onion', hi: 'प्याज', group: 'vegetables', icon: '🧅' },
  { ids: [24], slug: 'potato', en: 'Potato', hi: 'आलू', group: 'vegetables', icon: '🥔' },
  { ids: [65], slug: 'tomato', en: 'Tomato', hi: 'टमाटर', group: 'vegetables', icon: '🍅' },
  // Agmarknet labels these rows "Rs./Bundle", but prices are per quintal (₹4–35/kg); and grain mandis file
  // coriander *seed* under this id. See CORIANDER_LEAVES handling in src/lib/agmarknet.ts.
  { ids: [39], slug: 'coriander-leaves', en: 'Coriander leaves', hi: 'हरा धनिया', group: 'vegetables', icon: '🌿' },
  { ids: [42], slug: 'methi-leaves', en: 'Methi leaves', hi: 'मेथी पत्ती', group: 'vegetables', icon: '🌿' },
  { ids: [31], slug: 'cauliflower', en: 'Cauliflower', hi: 'फूलगोभी', group: 'vegetables', icon: '🥦' },
  { ids: [126], slug: 'cabbage', en: 'Cabbage', hi: 'पत्तागोभी', group: 'vegetables', icon: '🥬' },
  { ids: [71], slug: 'bhindi', en: 'Bhindi', hi: 'भिंडी', group: 'vegetables', icon: '🥬' },
  { ids: [73], slug: 'green-chilli', en: 'Green chilli', hi: 'हरी मिर्च', group: 'vegetables', icon: '🌶️' },
  { ids: [32], slug: 'brinjal', en: 'Brinjal', hi: 'बैंगन', group: 'vegetables', icon: '🍆' },
  { ids: [68], slug: 'bottle-gourd', en: 'Bottle gourd', hi: 'लौकी', group: 'vegetables', icon: '🥒' },
  { ids: [67], slug: 'bitter-gourd', en: 'Bitter gourd', hi: 'करेला', group: 'vegetables', icon: '🥒' },
  { ids: [46], slug: 'green-peas', en: 'Green peas', hi: 'हरी मटर', group: 'vegetables', icon: '🌱' },

  { ids: [18], slug: 'orange', en: 'Orange', hi: 'संतरा', group: 'fruits', icon: '🍊' },
];

// Hindi names for mandi towns (Agmarknet only has English). "(F&V)" = fruit & vegetable mandi.
const MARKET_HI: Record<string, string> = {
  Agar: 'आगर', Akodiya: 'अकोदिया', Badnagar: 'बड़नगर', Badod: 'बड़ोद', Bagli: 'बागली', Berachha: 'बेरछा',
  Biaora: 'ब्यावरा', Chhapiheda: 'छापीहेड़ा', Dewas: 'देवास', Gautampura: 'गौतमपुरा', Haatpipliya: 'हाटपिपल्या',
  Indore: 'इंदौर', Javad: 'जावद', Jeerapur: 'जीरापुर', Kalapipal: 'कालापीपल', Kannod: 'कन्नौद', Khachrod: 'खाचरौद',
  Khategaon: 'खातेगांव', Khilchipur: 'खिलचीपुर', Khujner: 'खुजनेर', Kurawar: 'कुरावर', Loharda: 'लोहारदा',
  Machalpur: 'माचलपुर', Mahidpur: 'महिदपुर', Maksi: 'मक्सी', Manasa: 'मनासा', 'Mhow (Ambedkar Nagar)': 'महू (आंबेडकर नगर)',
  Momanbadodiya: 'मोमन बड़ोदिया', Nagda: 'नागदा', Nalkheda: 'नलखेड़ा', Narsinghgarh: 'नरसिंहगढ़', Neemuch: 'नीमच',
  Pachaur: 'पचोर', Sanwer: 'सांवेर', Sarangpur: 'सारंगपुर', Shajapur: 'शाजापुर', Shujalpur: 'शुजालपुर',
  Sonkatch: 'सोनकच्छ', Soyatkalan: 'सोयतकलां', Susner: 'सुसनेर', Suthalia: 'सुठालिया', Tarana: 'तराना',
  Ujjain: 'उज्जैन', Unhel: 'उन्हेल',
  // Rajasthan (Kota, Jhalawar)
  'Bhawani Mandi': 'भवानी मंडी', Choumahla: 'चौमहला', Dag: 'डग', Iklera: 'इकलेरा', Jhalarapatan: 'झालरापाटन',
  Khanpur: 'खानपुर', Manohararthana: 'मनोहरथाना', Itawa: 'इटावा', Khatauli: 'खातौली', Kota: 'कोटा', Ramganjmandi: 'रामगंजमंडी',
};

type Snapshot = {
  fetchedAt: string;
  markets: { id: number; name: string; district: number; state: number }[];
  commodities: Record<string, string>; // id -> Agmarknet name (for curated ids only)
};

async function refresh(): Promise<Snapshot> {
  const res = await fetch('https://api.agmarknet.gov.in/v1/daily-price-arrival/filters', { headers: { 'User-Agent': 'fasal-bazar/0.1' } });
  if (!res.ok) throw new Error(`filters: HTTP ${res.status}`);
  const d = (await res.json()).data;
  const dIds = new Set(DISTRICTS.map((x) => x.id));
  const cIds = new Set(CROPS.flatMap((c) => c.ids));
  return {
    fetchedAt: new Date().toISOString(),
    markets: d.market_data.filter((m: any) => dIds.has(m.district_id))
      .map((m: any) => ({ id: m.id, name: m.mkt_name, district: m.district_id, state: m.state_id }))
      .sort((a: any, b: any) => a.id - b.id),
    commodities: Object.fromEntries(d.cmdt_data.filter((c: any) => cIds.has(c.cmdt_id)).map((c: any) => [c.cmdt_id, c.cmdt_name])),
  };
}

const marketEn = (name: string) => name.replace(/\s*APMC$/i, '').trim();
function marketHi(en: string): string {
  const fv = /\s*\(F&V\)/.test(en);
  const base = en.replace(/\s*\(F&V\)/, '').trim();
  const hi = MARKET_HI[base];
  if (!hi) throw new Error(`No Hindi name for mandi "${base}": add it to MARKET_HI`);
  return fv ? `${hi} (फल-सब्ज़ी)` : hi;
}

const snap: Snapshot = process.argv.includes('--refresh')
  ? await refresh().then((s) => (writeFileSync(SNAPSHOT, JSON.stringify(s, null, 1) + '\n'), s))
  : JSON.parse(readFileSync(SNAPSHOT, 'utf8'));

for (const c of CROPS) for (const id of c.ids) {
  if (!snap.commodities[id]) throw new Error(`Commodity ${id} (${c.en}) not found in Agmarknet's list`);
}
const seenSlug = new Set<string>();
for (const c of CROPS) { if (seenSlug.has(c.slug)) throw new Error(`Duplicate slug ${c.slug}`); seenSlug.add(c.slug); }

const markets = snap.markets.map((m) => {
  const en = marketEn(m.name);
  return { id: m.id, d: m.district, en, hi: marketHi(en) };
}).sort((a, b) => a.d - b.d || a.en.localeCompare(b.en));

const crops = CROPS.map((c) => ({ id: c.ids[0], alias: c.ids.slice(1), agm: snap.commodities[c.ids[0]], slug: c.slug, en: c.en, hi: c.hi, group: c.group, icon: c.icon, unit: c.unit ?? 'qtl' }));

const out = `// GENERATED by scripts/gen-master.ts (snapshot ${snap.fetchedAt.slice(0, 10)}). Do not edit by hand.
// IDs are Agmarknet 2.0 IDs.

export type Group = 'cereals' | 'pulses' | 'oilseeds' | 'spices' | 'vegetables' | 'fruits';
export type Unit = 'qtl' | 'bundle';
export type Crop = { id: number; alias: number[]; agm: string; slug: string; en: string; hi: string; group: Group; icon: string; unit: Unit };
export type State = { id: number; en: string; hi: string; short: string };
export type District = { id: number; state: number; slug: string; en: string; hi: string };
export type Market = { id: number; d: number; en: string; hi: string };

export const GROUPS: Group[] = ['cereals', 'pulses', 'oilseeds', 'spices', 'vegetables', 'fruits'];

export const STATES: State[] = ${JSON.stringify(STATES, null, 2)};

export const CROPS: Crop[] = [
${crops.map((c) => '  ' + JSON.stringify(c)).join(',\n')},
];

export const DISTRICTS: District[] = [
${DISTRICTS.map((d) => '  ' + JSON.stringify(d)).join(',\n')},
];

export const MARKETS: Market[] = [
${markets.map((m) => '  ' + JSON.stringify(m)).join(',\n')},
];
`;
writeFileSync('src/lib/master.ts', out);
console.log(`crops=${crops.length} districts=${DISTRICTS.length} markets=${markets.length} (snapshot ${snap.fetchedAt.slice(0, 10)})`);
