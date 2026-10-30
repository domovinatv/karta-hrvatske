import { fold, processTerm } from "./normalize";

// Razumijevanje upita bez LLM-a: rječnik riječi → filtar.
//
// Upit „AI firme za zdravstvo u Zagrebu" rastavi se na:
//   ai, firme   → slojevi {croai, ekosustav} ∩ {croai, ekosustav, inkubatori}
//   zdravstvo   → kategorija sadrži „healthcare" (CroAI kategorije su na engleskom)
//   u Zagrebu   → mjesto (radi se u engine.ts, jer treba popis mjesta iz indeksa)
// Što ostane nakon toga ide u full-text.
//
// Pravila se uspoređuju na ISTIM tokenima kao indeks (processTerm), dakle
// „zdravstvu", „zdravstva" i „zdravstvo" padaju u isti korijen. Usporedba je
// jednakost; prefiks samo za korijene od 6+ slova, jer bi „zupa" kao prefiks
// progutao „županija".

export interface Rule {
  /** Oznaka u retku „Tumačim kao…". */
  label: string;
  words: string[];
  /** Ograniči na ove slojeve (presjek s ostalim pravilima). */
  layers?: string[];
  /** Kategorija dokumenta (`k`, foldano) mora sadržavati barem jedan od ovih izraza. */
  kat?: string[];
  status?: "aktivan" | "ugasen";
}

const FIRME = ["croai", "ekosustav", "inkubatori"];

export const RULES: Rule[] = [
  // ── Gospodarstvo / CroAI ────────────────────────────────────────────────
  { label: "AI", words: ["ai", "croai", "umjetna", "inteligencija", "ml", "llm"], layers: ["croai", "ekosustav"] },
  {
    label: "tvrtke",
    words: ["firma", "firme", "firmi", "tvrtka", "tvrtke", "tvrtki", "kompanija", "kompanije", "poduzeće", "poduzeća", "company", "companies", "startup", "startupi", "startupa", "startups"],
    layers: FIRME,
  },
  { label: "investitori", words: ["investitor", "investitori", "investitora", "fond", "fondovi", "fondova", "vc", "investor", "investors", "ulagač", "ulagači"], kat: ["investor", "fond"] },
  { label: "inkubatori", words: ["inkubator", "inkubatori", "akcelerator", "akceleratori", "accelerator", "incubator"], kat: ["incubator", "inkubator", "akcelerator", "accelerator"] },
  { label: "coworking", words: ["coworking", "hub"], kat: ["coworking"] },
  { label: "zdravstvo", words: ["zdravstvo", "zdravlje", "medicina", "medicinski", "health", "healthcare", "bolnica"], kat: ["healthcare", "zdravstven", "ljekarna", "dom zdravlja"] },
  { label: "fintech", words: ["fintech", "financije", "financijski", "banka", "banke", "osiguranje", "insurtech", "plaćanja"], kat: ["fintech"] },
  { label: "poljoprivreda i okoliš", words: ["poljoprivreda", "agro", "agri", "agritech", "greentech", "okoliš", "energija"], kat: ["agriculture"] },
  { label: "turizam", words: ["turizam", "hotel", "hoteli", "tourism", "ugostiteljstvo"], kat: ["hospitality"] },
  { label: "obrazovne tehnologije", words: ["edukacija", "edtech", "edutech", "učenje"], kat: ["edutech"] },
  { label: "robotika", words: ["robot", "roboti", "robotika", "robotics"], kat: ["robotics"] },
  { label: "mobilnost", words: ["mobilnost", "promet", "mobility", "automobil", "automobili", "vozila", "autonomna"], kat: ["mobility"] },
  { label: "marketing", words: ["marketing", "oglašavanje", "reklame", "adtech", "prodaja", "sales"], kat: ["adtech"] },
  { label: "računalni vid", words: ["vid", "slike", "slika", "video", "vision", "prepoznavanje"], kat: ["image & video"] },
  { label: "analitika podataka", words: ["podaci", "podataka", "analitika", "analytics"], kat: ["data analytics"] },
  { label: "sigurnost", words: ["kibernetička", "cyber", "cybersecurity", "sigurnost"], kat: ["cybersecurity", "vatrogasna", "policijska"] },
  { label: "istraživanje", words: ["istraživanje", "istraživački", "znanost", "research", "institut", "instituti"], kat: ["research"] },
  { label: "konferencije", words: ["konferencija", "konferencije", "meetup", "meetupi", "događaj", "događaji", "event", "eventi"], kat: ["conferences"] },
  { label: "zajednice", words: ["zajednica", "zajednice", "community", "communities"], kat: ["communities", "zajednica"] },
  { label: "mediji", words: ["mediji", "media", "novine", "portal"], kat: ["media"] },
  { label: "HR i pravo", words: ["pravo", "pravni", "zapošljavanje", "regrutacija", "law", "legal"], kat: ["hr & law"] },
  { label: "umjetnost", words: ["umjetnost", "art", "glazba", "dizajn"], kat: ["art"] },
  { label: "automatizacija", words: ["automatizacija", "automation"], kat: ["automation"] },
  { label: "javni sektor", words: ["javni", "javna", "uprava", "public", "govtech"], kat: ["public"] },
  { label: "pametni gradovi", words: ["pametni", "pametne", "smart"], kat: ["smart cities"] },
  { label: "chatbotovi", words: ["chatbot", "chatbotovi", "korisnička", "podrška", "customer"], kat: ["customer communication"] },
  { label: "agencije", words: ["agencija", "agencije", "konzalting", "consulting", "usluge", "outsourcing"], kat: ["service providers"] },
  { label: "platforme", words: ["platforma", "platforme", "infrastruktura", "cloud"], kat: ["platforms"] },
  { label: "razvojni alati", words: ["devtools", "alati", "framework", "frameworks"], kat: ["devtools"] },
  { label: "sveučilišta", words: ["sveučilište", "sveučilišta", "fakultet", "fakulteti", "university", "veleučilište"], kat: ["universities", "visoko uciliste"] },

  // ── Status (FINA / registri) ────────────────────────────────────────────
  { label: "aktivni", words: ["aktivne", "aktivni", "aktivna", "posluju", "aktivan"], status: "aktivan" },
  { label: "ugašeni", words: ["ugašene", "ugašeni", "ugašena", "zatvorene", "likvidacija", "stečaj", "brisane"], status: "ugasen" },

  // ── Ostali slojevi ──────────────────────────────────────────────────────
  { label: "škole", words: ["škola", "škole", "školi", "škola", "oš", "osnovna", "osnovne", "srednja", "srednje", "gimnazija", "gimnazije"], kat: ["skola", "gimnazija"] },
  { label: "vrtići", words: ["vrtić", "vrtići", "vrtića", "jaslice", "vrtic", "vrtici"], kat: ["vrtic", "jaslic", "predskolski"] },
  { label: "crkve", words: ["crkva", "crkve", "crkvi", "crkava"], layers: ["crkve"] },
  { label: "kapele", words: ["kapela", "kapele", "kapelica"], kat: ["kapela"] },
  { label: "samostani", words: ["samostan", "samostani"], kat: ["samostan"] },
  { label: "katedrale", words: ["katedrala", "katedrale", "bazilika"], kat: ["katedrala", "bazilika"] },
  { label: "džamije", words: ["džamija", "džamije", "dzemat"], kat: ["dzamija", "dzemat"] },
  { label: "župe", words: ["župa", "župe", "župi", "župu", "župama", "župni", "župna"], layers: ["zupe"] },
  { label: "biskupije", words: ["biskupija", "biskupije", "nadbiskupija", "nadbiskupije"], layers: ["biskupije", "zupe"], kat: ["biskupij"] },
  { label: "udruge", words: ["udruga", "udruge", "udruga", "bratovština", "bratovštine"], layers: ["udruge"] },
  { label: "klubovi", words: ["klub", "klubovi", "klubova", "nk", "hnk", "nogomet", "nogometni"], layers: ["klubovi"] },
  { label: "stadioni", words: ["stadion", "stadioni"], layers: ["stadioni", "klubovi"] },
  { label: "zračne luke", words: ["aerodrom", "aerodromi", "zračna", "zračne", "airport"], layers: ["zracne-luke"] },
  { label: "županije", words: ["županija", "županije", "županiji"], layers: ["granice-zupanija"] },
  { label: "gradovi i općine", words: ["grad", "gradovi", "općina", "općine", "jls"], layers: ["granice-jls"] },
  { label: "naselja", words: ["naselje", "naselja", "selo", "sela"], layers: ["naselja"] },
  { label: "kvartovi", words: ["kvart", "kvartovi", "kvartu"], layers: ["kvartovi"] },
  { label: "četvrti i MO", words: ["četvrt", "četvrti", "odbor", "odbori"], layers: ["cetvrti"] },
  { label: "ljekarne", words: ["ljekarna", "ljekarne", "apoteka"], kat: ["ljekarna"] },
  { label: "ambulante", words: ["ambulanta", "ambulante", "doktor"], kat: ["ambulanta", "dom zdravlja"] },
  { label: "domovi za starije", words: ["starački", "umirovljenici"], kat: ["dom za starije"] },
  { label: "tramvaj", words: ["tramvaj", "tramvajsko", "tramvajska"], kat: ["tramvajsko"] },
  { label: "autobus", words: ["autobus", "autobusno", "bus"], kat: ["autobusno"] },
  { label: "vlak", words: ["vlak", "željeznička", "kolodvor"], kat: ["zeljeznicko"] },
  { label: "punionice", words: ["punionica", "punionice", "punjač"], kat: ["punionica"] },
  { label: "reciklaža", words: ["reciklaža", "reciklažno", "otpad"], kat: ["reciklazno", "spremnik"] },
  { label: "tržnice", words: ["tržnica", "tržnice", "plac"], kat: ["trznica"] },
];

interface CompiledRule extends Rule {
  stems: Set<string>;
  longStems: string[];
  katRe: RegExp[];
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const COMPILED: CompiledRule[] = RULES.map((r) => {
  const stems = new Set(r.words.map((w) => processTerm(w) ?? fold(w)));
  return {
    ...r,
    stems,
    longStems: [...stems].filter((s) => s.length >= 6),
    // Granica riječi samo na početku: „art" ne smije pogoditi „startupi",
    // ali „zdravstven" smije pogoditi „zdravstvena ustanova".
    katRe: (r.kat ?? []).map((k) => new RegExp(`(^|[^a-z0-9])${esc(fold(k))}`)),
  };
});

export interface Intent {
  rules: CompiledRule[];
  /** Presjek `layers` svih pravila koja ih imaju; null = bez ograničenja. */
  layers: Set<string> | null;
  /** Svaka grupa mora biti zadovoljena (AND među pravilima, OR unutar pravila). */
  kat: RegExp[][];
  status: "aktivan" | "ugasen" | null;
  /** Indeksi tokena koje su pravila potrošila. */
  used: Set<number>;
}

export function matchRule(stemmed: string): CompiledRule | undefined {
  return COMPILED.find(
    (r) => r.stems.has(stemmed) || r.longStems.some((s) => stemmed.startsWith(s)),
  );
}

/**
 * `tokens` su već processTerm-ani (null = stopword). Vraća pravila i koje je
 * tokene potrošio rječnik; ostatak ide u full-text.
 */
export function parseIntent(tokens: (string | null)[]): Intent {
  const rules: CompiledRule[] = [];
  const used = new Set<number>();
  tokens.forEach((t, i) => {
    if (!t) return;
    const r = matchRule(t);
    if (r) {
      used.add(i);
      if (!rules.includes(r)) rules.push(r);
    }
  });
  let layers = null as Set<string> | null;
  for (const r of rules) {
    if (!r.layers) continue;
    const s = new Set(r.layers);
    layers = layers ? new Set([...layers].filter((x) => s.has(x))) : s;
  }
  // Kontradikcija („klubovi crkve") — radije ništa nego prazno.
  if (layers && layers.size === 0) layers = null;
  return {
    rules,
    layers,
    kat: rules.filter((r) => r.katRe.length).map((r) => r.katRe),
    status: rules.find((r) => r.status)?.status ?? null,
    used,
  };
}
