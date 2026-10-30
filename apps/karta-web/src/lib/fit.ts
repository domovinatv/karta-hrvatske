import type { FitBoundsOptions, LngLatBoundsLike, Map as MapLibreMap } from "maplibre-gl";

// Odabir JLS-a / županije mijenja raspored (sidebari se pojave ili nestanu,
// MapView), a fit se poziva u istom potezu kao i setState. Bez odgode MapLibre
// računa zoom i centar za staru širinu kanvasa: na 1280 px Samobor je ispao
// 770 px širok u kanvasu od 580 px i pomaknut udesno. Dva frame-a = React je
// commitao novi raspored; resize() sinkronizira kanvas prije računanja.
export function fitAfterLayout(
  map: MapLibreMap,
  bounds: LngLatBoundsLike,
  opts: FitBoundsOptions,
): void {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      map.resize();
      map.fitBounds(bounds, opts);
    }),
  );
}
