// Live dohvat pinka.io kampanja s lokacijom — javni PostgREST read na
// self-hosted Supabase (api.domovina.ai), shema pinka_finance. RLS pušta
// anonu samo public kampanje; ovdje dodatno filtriramo aktivne/funded s
// koordinatama i postavljenim Safe-om (= stvarno primaju donacije).
import type { PinkaCampaignCollection, PinkaCampaignFeature } from "./types";

const PINKA_API = "https://api.domovina.ai/rest/v1/campaigns";
// Anon JWT — javan po dizajnu (isti je inlinean u pinka.io bundle); sav
// pristup podacima je RLS-gated na serveru.
const PINKA_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3OTExMTcxMywiZXhwIjo0OTMyNzExNzEzLCJyb2xlIjoiYW5vbiJ9.Q4Ef7xMc2dmjMyfJebPDyqNirnARZzMxTWe7i0dASPI";

export const PINKA_SITE = "https://pinka.io";

interface CampaignRow {
  id: string;
  slug: string;
  type: string;
  title: string;
  description: string | null;
  goal_cents: number | null;
  state: string;
  cover_image_url: string | null;
  location_name: string | null;
  latitude: number;
  longitude: number;
  campaign_stats:
    | { total_raised_cents: number; contribution_count: number; contributor_count: number }
    | { total_raised_cents: number; contribution_count: number; contributor_count: number }[]
    | null;
}

export async function fetchPinkaCampaigns(): Promise<PinkaCampaignCollection> {
  const select =
    "id,slug,type,title,description,goal_cents,state,cover_image_url," +
    "location_name,latitude,longitude," +
    "campaign_stats(total_raised_cents,contribution_count,contributor_count)";
  const filters =
    "visibility=eq.public&state=in.(active,funded)" +
    "&latitude=not.is.null&longitude=not.is.null" +
    "&destination_address=neq.0x0000000000000000000000000000000000000000" +
    "&order=created_at.desc&limit=500";
  const r = await fetch(`${PINKA_API}?select=${encodeURIComponent(select)}&${filters}`, {
    headers: {
      apikey: PINKA_ANON_KEY,
      authorization: `Bearer ${PINKA_ANON_KEY}`,
      // pinka_finance nije default PostgREST shema — bira se headerom
      "accept-profile": "pinka_finance",
    },
  });
  if (!r.ok) throw new Error(`pinka campaigns fetch failed: ${r.status}`);
  const rows = (await r.json()) as CampaignRow[];

  const features: PinkaCampaignFeature[] = rows.map((row, i) => {
    const s = Array.isArray(row.campaign_stats) ? row.campaign_stats[0] : row.campaign_stats;
    return {
      type: "Feature",
      id: i + 1,
      geometry: { type: "Point", coordinates: [row.longitude, row.latitude] },
      properties: {
        num_id: i + 1,
        id: row.id,
        slug: row.slug,
        type: row.type,
        title: row.title,
        description: row.description,
        goal_cents: row.goal_cents,
        state: row.state,
        cover_image_url: row.cover_image_url,
        location_name: row.location_name,
        total_raised_cents: s?.total_raised_cents ?? 0,
        contribution_count: s?.contribution_count ?? 0,
        contributor_count: s?.contributor_count ?? 0,
      },
    };
  });

  return { type: "FeatureCollection", features };
}
