import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 text-center">
      <div>
        <h1 className="font-display text-3xl text-ink">404</h1>
        <p className="mt-2 text-sm text-muted">Tražena stranica ne postoji.</p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm hover:text-[var(--ui-active)]"
          style={{ borderColor: "var(--line)", color: "var(--text)" }}
        >
          <ArrowLeft size={15} /> Vrati se na kartu
        </Link>
      </div>
    </main>
  );
}
