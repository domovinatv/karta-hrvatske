// Lucide ikone kao sirovi SVG stringovi.
//
// MapLibre popupi se grade kao HTML stringovi (`setHTML`), izvan Reacta, pa u
// njima ne mogu stajati <MapPin /> komponente. Path podaci su doslovno prepisani
// iz lucide-react paketa da se popup ikone ne razlikuju od onih u sučelju.

const wrap = (body: string, size: number) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
  `stroke="currentColor" stroke-width="2" stroke-linecap="round" ` +
  `stroke-linejoin="round" style="display:inline-block;vertical-align:-0.15em;flex:none">` +
  `${body}</svg>`;

/** lucide: map-pin */
export const svgMapPin = (size = 12) =>
  wrap(
    '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>' +
      '<circle cx="12" cy="10" r="3"/>',
    size,
  );

/** lucide: arrow-up-right */
export const svgArrowUpRight = (size = 11) =>
  wrap('<path d="M7 7h10v10"/><path d="M7 17 17 7"/>', size);

/** lucide: check */
export const svgCheck = (size = 12) => wrap('<path d="M20 6 9 17l-5-5"/>', size);
