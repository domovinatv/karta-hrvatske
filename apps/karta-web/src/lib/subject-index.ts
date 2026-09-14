/**
 * Indeks subjekata za pretragu i grupiranje u poster pickeru.
 *
 * Dropdown s 18 stavki je bio samo <select>. S planom da uđe svih 556 JLS-ova
 * to pada: bez pretrage i grupa se u listi od nekoliko stotina imena ne može
 * naći ništa. Grupa i tip se NE upisuju ručno po subjektu — izvode se iz
 * matičnog broja preko jls-meta.json (generira ga scripts/build-lookups.mjs iz
 * DGU registra), pa novi subjekt dobije grupu sam od sebe.
 */
import jlsMeta from "./jls-meta.json";
import type { PosterSubject } from "./poster";

/**
 * [ime, tip, županija] po matičnom broju; tip je "Grad" ili "Općina".
 * Generirani JSON se tipizira kao string[] pa se polja čitaju po indeksu —
 * tuple cast bi ovdje bio lažna sigurnost nad datotekom koju piše skripta.
 */
const META = jlsMeta as Record<string, string[]>;

/** Subjekti koji pokrivaju više JLS-ova idu u svoju grupu, ne pod županiju. */
export const GROUP_REGIJE = "Regije i urbana područja";

export interface SubjectEntry {
  subject: PosterSubject;
  group: string;
  /** "Grad" / "Općina" / "regija" — sitni tag desno od imena. */
  kind: string;
  /** Normaliziran tekst po kojem se pretražuje. */
  haystack: string;
}

/**
 * Bez dijakritike i malim slovima: "Đakovo" se mora naći i na "dakovo" i na
 * "djakovo". Ista transformacija ide na upit i na indeks.
 */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/dj/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function buildIndex(subjects: PosterSubject[]): SubjectEntry[] {
  return subjects.map((subject) => {
    const metas = subject.jlsMb.map((mb) => META[mb]).filter(Boolean);
    const zupanije = [...new Set(metas.map((m) => m[2]).filter(Boolean))];
    // Više JLS-ova = kurirano područje (Turopolje, Pula i okolica), ne jedna
    // jedinica lokalne samouprave.
    const viseJls = subject.jlsMb.length > 1;
    const group = viseJls ? GROUP_REGIJE : (zupanije[0] ?? "Ostalo");
    const kind = viseJls ? "regija" : (metas[0]?.[1] ?? "");
    return {
      subject,
      group,
      kind,
      haystack: fold(
        [subject.label, subject.menuLabel, subject.subtitle, kind, ...zupanije].join(" "),
      ),
    };
  });
}

export interface SubjectGroup {
  name: string;
  entries: SubjectEntry[];
}

/**
 * Filtrira upitom i slaže u grupe. "Regije i urbana područja" idu prvo — to su
 * kurirani plakati i najčešći razlog dolaska; županije za njima abecedno.
 * Unutar grupe se poredak subjekata iz registra ČUVA, jer je ručno složen.
 */
export function groupEntries(entries: SubjectEntry[], query: string): SubjectGroup[] {
  const q = fold(query.trim());
  const terms = q ? q.split(/\s+/) : [];
  const hit = terms.length
    ? entries.filter((e) => terms.every((t) => e.haystack.includes(t)))
    : entries;

  const byGroup = new Map<string, SubjectEntry[]>();
  for (const e of hit) {
    const list = byGroup.get(e.group);
    if (list) list.push(e);
    else byGroup.set(e.group, [e]);
  }
  return [...byGroup.entries()]
    .map(([name, list]) => ({ name, entries: list }))
    .sort((a, b) => {
      if (a.name === GROUP_REGIJE) return -1;
      if (b.name === GROUP_REGIJE) return 1;
      return a.name.localeCompare(b.name, "hr");
    });
}

/** Ravni redoslijed kroz grupe — za kretanje strelicama. */
export function flatten(groups: SubjectGroup[]): SubjectEntry[] {
  return groups.flatMap((g) => g.entries);
}
