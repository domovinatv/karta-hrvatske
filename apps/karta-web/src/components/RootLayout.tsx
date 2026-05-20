import { Outlet } from "react-router-dom";
import { BrandStripe } from "./BrandStripe";
import { MapStateProvider } from "@/lib/MapState";

interface Props {
  error?: boolean;
}

export function RootLayout({ error = false }: Props) {
  return (
    <MapStateProvider>
      <div className="flex h-full flex-col">
        <BrandStripe />
        {error ? (
          <main className="flex flex-1 items-center justify-center px-6 text-center">
            <div>
              <h1 className="font-display text-2xl text-ink">Greška u učitavanju</h1>
              <p className="mt-2 text-sm text-muted">
                Pokušaj osvježiti stranicu. Ako problem traje, javi na info@domovina.ai.
              </p>
            </div>
          </main>
        ) : (
          <Outlet />
        )}
      </div>
    </MapStateProvider>
  );
}
