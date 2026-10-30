import { useCallback, useEffect, useRef, useState } from "react";
import { v } from "@/lib/version";
import type { QueryOpts, SearchResponse } from "./engine";
import type { WorkerIn, WorkerOut } from "./search.worker";

// Jedan Worker po stranici, dijeljen među svim poljima za pretragu
// (FloatingSearch, lijevi sidebar, BottomSheet). Indeks se dohvaća tek kad
// korisnik prvi put fokusira polje — početno učitavanje karte ga ne plaća.

type Listener = (m: WorkerOut) => void;
let worker: Worker | null = null;
let ready = false;
const listeners = new Set<Listener>();
let seq = 0;

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./search.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<WorkerOut>) => {
    if (e.data.type === "ready") ready = true;
    listeners.forEach((l) => l(e.data));
  };
  const init: WorkerIn = { type: "init", url: v("/data/search-index.json") };
  worker.postMessage(init);
  return worker;
}

export type SearchStatus = "idle" | "loading" | "ready" | "error";

export function useSearch(q: string, opts: Omit<QueryOpts, "limit"> & { limit?: number }) {
  const [res, setRes] = useState<SearchResponse | null>(null);
  const [status, setStatus] = useState<SearchStatus>(ready ? "ready" : "idle");
  const lastId = useRef(0);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const l: Listener = (m) => {
      if (m.type === "ready") setStatus("ready");
      else if (m.type === "error") setStatus("error");
      else if (m.type === "result" && m.id === lastId.current) setRes(m.res);
    };
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  /** Pozovi na fokus polja — pokrene dohvat indeksa. */
  const warm = useCallback(() => {
    if (!worker) {
      setStatus("loading");
      ensureWorker();
    }
  }, []);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) {
      lastId.current = ++seq;
      setRes(null);
      return;
    }
    if (!worker) {
      setStatus("loading");
      ensureWorker();
    }
    // Kratki debounce: upit traje par ms, ali svaki odgovor re-renderira listu.
    const h = setTimeout(() => {
      const id = ++seq;
      lastId.current = id;
      const msg: WorkerIn = { type: "query", id, q: t, opts: { limit: 40, ...optsRef.current } };
      worker!.postMessage(msg);
    }, 60);
    return () => clearTimeout(h);
  }, [q]);

  return { res, status, warm };
}
