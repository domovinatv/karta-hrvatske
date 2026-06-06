# DOMOVINA / draft_karta_rh — Claude Code instructions

This is the data layer of the DOMOVINA project: a self-contained,
offline-capable map of Croatian administrative geography. Single point
of truth for županije, JLS (Grad/Općina), naselja, and the state border.

## Data sources priority (authority order)

1. **DGU rpj WFS** — geometry for država/županija/JLS/naselje. State authority.
2. **DZS Census 2021** — JLS list, type (Grad/Općina), naselje populations.
3. **ISPU MGIPU** — fallback authoritative source (legacy in this repo).
4. **OSM** — basemap only, NOT authoritative for borders. We hide its
   admin lines and overlay our own DGU geometry.
5. **geoBoundaries** — historical, has known gaps. Kept for archaeology.

## Build pipeline

The canonical builder is **`scripts/19_unified_topology.py`**. It builds
ONE topology over all 6759 naselja, simplifies it once at 20 m, and
derives JLS / županije / država by dissolving. This guarantees pixel-
perfect topological alignment at every level.

```
bash scripts/00_pipeline.sh hr        # full HR pipeline
.venv/bin/python scripts/19_unified_topology.py   # the canonical builder
.venv/bin/python scripts/09_build_hr_full_app.py  # writes HTML + naselja file
.venv/bin/python scripts/10_validate_zupanija.py  # asserts topology + counts
```

After regenerating, copy outputs to workdir root for the local server:

```
cp outputs/hrvatska_full.html hrvatska_full.html
cp outputs/hrvatska_naselja.geojson hrvatska_naselja.geojson
cp data/hr_canonical.geojson hrvatska_adm2.geojson
```

User serves with `python3 -m http.server` from the workdir root.

## Numbers that must hold (validate against these)

- 128 Grad + 428 Općina = **556 JLS**
- **21 županije** (incl. Grad Zagreb)
- **6759 naselja**
- Σ stanovnistvo = **3 871 382** (Census 2021)
- HR area ≈ 56 555 km² (DGU geometry, ~0.07% under official 56 594)
- Validator: 0 hard violations / 1 borderline (Lasinja, known)

## Working conventions

- **Commit semantically before each new iteration.** User's explicit rule
  ("prije nastavka semanticki commitaj"). Use a HEREDOC or
  `git commit -F /tmp/commit_msg.txt` for multi-paragraph bodies.
- **Don't break existing flows.** New features layer on top of the focus /
  naselja / dark-light / hover state machinery. Trace all call sites
  before changing shared functions like `selectJLS` or `applyFocusFilter`.
- **Run the validator after data-affecting changes.** Surface its summary
  in chat replies and commit messages.
- **Reply in Croatian** — that's how the user works on this project.

## UI naming conventions

Button labels are in plain Croatian, describing the *visible state when
active* (not abstract verbs). Tooltips carry the mechanism description.
Keyboard shortcuts: C, L, B, J, N, O, F (see template controls panel).

## Where to learn more

`/Users/ms/.claude/projects/-Users-ms-git-domovina-draft-karta-rh/memory/`
holds Claude's auto-memory:

- `MEMORY.md` — index, loaded each session.
- `project_canonical_pipeline.md` — why the unified topology approach.
- `project_known_quirks.md` — pitfalls (Lasinja, name collisions,
  pandas-NaN, closure scoping, style-toggle re-attach).
- `project_canonical_numbers.md` — official tallies.
- `reference_dgu_wfs.md` — endpoints, schemas, auth key.
- `reference_data_sources.md` — DZS, ISPU, basemaps.
- `feedback_*.md` — user's stated working preferences.
- `user_role.md` — user background.

Read those when context is fresh. Update them when something
non-obvious surfaces.
