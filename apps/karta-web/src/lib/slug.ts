// Croatian-aware slug generator. Used for /jls/:slug and /zupanija/:slug
// where the underlying data only has `name`. Clubs already have `slug` in
// their properties (canonical from clubs.db), so this helper isn't used
// for clubs — for clubs we look up by p.slug directly.

const CROATIAN_MAP: Record<string, string> = {
  č: "c",
  ć: "c",
  ž: "z",
  š: "s",
  đ: "d",
  Č: "c",
  Ć: "c",
  Ž: "z",
  Š: "s",
  Đ: "d",
};

export function slugify(s: string): string {
  let out = "";
  for (const ch of s) {
    out += CROATIAN_MAP[ch] ?? ch;
  }
  return out
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics (any remaining)
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}
