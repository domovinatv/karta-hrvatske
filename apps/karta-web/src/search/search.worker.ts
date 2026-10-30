/// <reference lib="webworker" />
import { SearchEngine, type QueryOpts, type RawIndex, type SearchResponse } from "./engine";

// Web Worker: dohvat indeksa, izgradnja MiniSearcha (~300 ms na M-čipu) i
// upiti izvan glavne niti, da tipkanje i karta ne zapinju dok se indeks gradi.
//
// Protokol: { type: "init", url } → { type: "ready", docs, ms }
//           { type: "query", id, q, opts } → { type: "result", id, res }
// Odgovor nosi id upita; useSearch baca odgovore za zastarjele upite.

export type WorkerIn =
  | { type: "init"; url: string }
  | { type: "query"; id: number; q: string; opts: QueryOpts };

export type WorkerOut =
  | { type: "ready"; docs: number; ms: number }
  | { type: "error"; message: string }
  | { type: "result"; id: number; res: SearchResponse };

let engine: SearchEngine | null = null;
let pending: Extract<WorkerIn, { type: "query" }> | null = null;

const post = (m: WorkerOut) => (self as DedicatedWorkerGlobalScope).postMessage(m);

function run(m: Extract<WorkerIn, { type: "query" }>) {
  post({ type: "result", id: m.id, res: engine!.search(m.q, m.opts) });
}

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const m = e.data;
  if (m.type === "init") {
    if (engine) return;
    try {
      const t0 = performance.now();
      const raw = (await (await fetch(m.url)).json()) as RawIndex;
      engine = new SearchEngine(raw);
      post({ type: "ready", docs: engine.docs.length, ms: Math.round(performance.now() - t0) });
      // Upit koji je stigao dok se indeks gradio — samo zadnji je bitan.
      if (pending) run(pending);
      pending = null;
    } catch (err) {
      post({ type: "error", message: String(err) });
    }
  } else if (m.type === "query") {
    if (engine) run(m);
    else pending = m;
  }
};
