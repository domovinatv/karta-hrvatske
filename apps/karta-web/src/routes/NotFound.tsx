import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 text-center">
      <div>
        <h1 className="font-display text-3xl text-ink">404</h1>
        <p className="mt-2 text-sm text-muted">Tražena stranica ne postoji.</p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-md border px-4 py-2 text-sm hover:text-[var(--accent-2)]"
          style={{ borderColor: "var(--line)", color: "var(--text)" }}
        >
          ← Vrati se na kartu
        </Link>
      </div>
    </main>
  );
}
