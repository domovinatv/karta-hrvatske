// Normalizacija teksta za pretragu — ISTA funkcija za indeks i za upit, inače
// se tokeni ne sretnu. Arhitektura: docs/2026-10-30-trazilica.md.
//
//  fold:  mala slova, bez dijakritika (č ć → c, š → s, ž → z, đ → d), „dj" → „d"
//         (korisnik bez hrvatske tipkovnice piše „djakovo" za Đakovo; ista
//         zamjena na obje strane drži „podjela" ↔ „podjela" konzistentnim).
//  stem:  lagano rezanje padežnih nastavaka za riječi od 5+ slova, da
//         „Zagrebu", „Splitu", „Osijeku", „Rijeci" nađu nominativ. Nije pravi
//         stemmer: cilj je da se pogodi isti korijen, ne lingvistička točnost.

const DIACRITICS: Record<string, string> = { č: "c", ć: "c", š: "s", ž: "z", đ: "d" };

export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/[čćšžđ]/g, (ch) => DIACRITICS[ch])
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/dj/g, "d");
}

// Najdulji nastavci prvi. Popis je namjerno kratak: svaki dodani nastavak
// spaja više riječi koje ne bi smjele biti iste.
const SUFFIXES = ["ama", "ima", "om", "em", "ih", "u", "a", "e", "i", "o"];

export function stem(t: string): string {
  if (t.length < 5 || /\d/.test(t)) return t;
  // Sibilarizacija u lokativu: Rijeka → Rijeci, Osijek → Osijeku (bez nje).
  if (t.endsWith("ci")) return t.slice(0, -2) + "k";
  if (t.endsWith("zi")) return t.slice(0, -2) + "g";
  for (const s of SUFFIXES) {
    if (t.endsWith(s) && t.length - s.length >= 4) return t.slice(0, -s.length);
  }
  return t;
}

/** Riječi bez značenja za pretragu (hrvatske i engleske, jer CroAI opisi su na engleskom). */
export const STOPWORDS = new Set([
  "i", "u", "na", "za", "od", "do", "s", "sa", "o", "po", "je", "su", "se", "da",
  "li", "ili", "kod", "blizu", "pokraj", "oko", "iz", "sve", "svi", "koji", "koja",
  "koje", "gdje", "ima", "ime", "neki", "neke",
  "the", "and", "of", "a", "an", "in", "to", "for", "with", "on", "by", "is", "its",
]);

/** Tokenizacija: sve što nije slovo ili znamenka razdvaja. */
export function tokenize(s: string): string[] {
  return s.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** Token kakav ide u indeks i u upit; null = izbaci. */
export function processTerm(t: string): string | null {
  const f = fold(t);
  if (!f || STOPWORDS.has(f)) return null;
  return stem(f);
}
