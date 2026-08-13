// ==========================================================================
// CyberDesk — Calcul automatique des frais de déplacement (option O4 du
// devis 17Cyber) : forfait de base + distance réelle (OpenRouteService,
// aller-retour) × coefficient du barème kilométrique, PAR AGENT — chacun
// facture son propre barème (coefficient + forfait + adresse de départ),
// réglé depuis Paramétrage → Profil (cyberdesk_user_settings, migration
// 024_cyberdesk_travel_fee_per_agent.sql), jamais en dur dans le code et
// jamais un réglage global partagé.
// POST { lead_id } → { success, distance_km, forfait_eur, coefficient_eur_km, amount_ht, city }
// Précision ville à ville (champ cybervictim_leads.city, migration 003) —
// pas d'adresse complète captée dans le formulaire de diagnostic. Distance
// doublée par défaut (allerRetour) : le barème kilométrique professionnel
// s'applique au trajet complet, pas au seul aller.
// Jamais bloquant pour le reste du devis : en cas d'échec (ville absente,
// non géolocalisée, service indisponible), le front retombe sur la saisie
// manuelle déjà existante — voir victimes17-quote.js.
// ==========================================================================
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import { canAccessLead } from "../_shared/lead-access.ts";
import { TRAVEL_FEE_CONFIG } from "../_shared/travel-fee-config.ts";

async function getSecret(sb: ReturnType<typeof createClient>, name: string): Promise<string> {
  const { data, error } = await sb.rpc("get_edge_secret", { secret_name: name });
  if (error || !data) throw new Error(`Secret "${name}" introuvable dans le Vault.`);
  return data as string;
}

interface Coordinates { lon: number; lat: number }

// Géocodage via l'API ORS (Pelias) — limité à la France, un seul résultat.
async function geocode(apiKey: string, address: string): Promise<Coordinates | null> {
  const url = new URL("https://api.openrouteservice.org/geocode/search");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("text", address);
  url.searchParams.set("boundary.country", "FR");
  url.searchParams.set("size", "1");

  const resp = await fetch(url.toString());
  if (!resp.ok) throw new Error(`ORS geocode HTTP ${resp.status}`);
  const data = await resp.json();
  const coords = data?.features?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  return { lon: coords[0], lat: coords[1] };
}

// Distance routière (mètres) entre deux points via l'API Directions ORS.
async function drivingDistanceMeters(apiKey: string, from: Coordinates, to: Coordinates): Promise<number> {
  const url = new URL("https://api.openrouteservice.org/v2/directions/driving-car");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("start", `${from.lon},${from.lat}`);
  url.searchParams.set("end", `${to.lon},${to.lat}`);

  const resp = await fetch(url.toString());
  if (!resp.ok) throw new Error(`ORS directions HTTP ${resp.status}`);
  const data = await resp.json();
  // Forme documentée par défaut (GeoJSON) ; repli sur la forme "routes" au cas où.
  const distance = data?.features?.[0]?.properties?.segments?.[0]?.distance
    ?? data?.routes?.[0]?.summary?.distance;
  if (typeof distance !== "number") throw new Error("Réponse ORS inattendue (distance introuvable).");
  return distance;
}

Deno.serve(async (req) => {
  const CORS = corsHeaders(req);
  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "bad_method" }, 405);

  const SB_URL = Deno.env.get("SUPABASE_URL")!;
  const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SB_SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  const sbAnon = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authErr } = await sbAnon.auth.getUser();
  if (authErr || !user) return json({ error: "unauthorized" }, 401);

  const { data: hasAccess, error: accessErr } = await sbAnon.rpc("has_module_access", { p_module: "cyberdesk" });
  if (accessErr || hasAccess !== true) return json({ error: "forbidden" }, 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const leadId = body.lead_id;
  if (!leadId) return json({ error: "missing_lead_id" }, 400);

  const sb = createClient(SB_URL, SB_SR);
  const { data: lead, error: eLead } = await sb
    .from("cybervictim_leads")
    .select("id, city, created_by")
    .eq("id", leadId)
    .single();
  if (eLead || !lead) return json({ error: "not_found" }, 404);
  if (!(await canAccessLead(sbAnon, lead.created_by, user.id))) return json({ error: "forbidden" }, 403);

  const city = (lead.city || "").trim();
  if (!city) return json({ error: "missing_city" }, 400);

  let apiKey: string;
  try {
    apiKey = await getSecret(sb, "openrouteservice_api_key");
  } catch (e) {
    return json({ error: "secrets_unavailable", details: String(e.message || e) }, 500);
  }

  // Barème par agent (coefficient + forfait + adresse de départ), réglé
  // depuis Paramétrage → Profil (migration 024_cyberdesk_travel_fee_per_
  // agent.sql) — c'est l'agent qui compose CE devis qui est facturé à son
  // propre barème, pas le créateur du dossier. TRAVEL_FEE_CONFIG ne sert
  // plus que de repli défensif si l'agent n'a pas encore de ligne
  // cyberdesk_user_settings (jamais ouvert Paramétrage) ou pas d'adresse
  // renseignée.
  const { data: agentSettings } = await sb
    .from("cyberdesk_user_settings")
    .select("travel_fee_coefficient_eur_km, travel_fee_forfait_eur, billing_address")
    .eq("user_id", user.id)
    .maybeSingle();
  const coefficientEurKm = agentSettings ? Number(agentSettings.travel_fee_coefficient_eur_km) : TRAVEL_FEE_CONFIG.coefficientEurKm;
  const forfaitEur = agentSettings ? Number(agentSettings.travel_fee_forfait_eur) : TRAVEL_FEE_CONFIG.forfaitBasEur;
  const origineAdresse = agentSettings?.billing_address?.trim() || TRAVEL_FEE_CONFIG.origineAdresse;

  try {
    const [origin, destination] = await Promise.all([
      geocode(apiKey, origineAdresse),
      geocode(apiKey, `${city}, France`),
    ]);
    if (!origin) throw new Error("Adresse d'origine non géolocalisée — vérifiez votre adresse dans Paramétrage → Profil → Identification.");
    if (!destination) return json({ error: "city_not_found", details: city }, 422);

    const oneWayMeters = await drivingDistanceMeters(apiKey, origin, destination);
    const distanceKm = Math.round(((oneWayMeters / 1000) * (TRAVEL_FEE_CONFIG.allerRetour ? 2 : 1)) * 10) / 10;
    const amountHt = Math.round((forfaitEur + distanceKm * coefficientEurKm) * 100) / 100;

    return json({
      success: true,
      distance_km: distanceKm,
      forfait_eur: forfaitEur,
      coefficient_eur_km: coefficientEurKm,
      amount_ht: amountHt,
      city,
    });
  } catch (e) {
    return json({ error: "routing_error", details: String(e.message || e) }, 502);
  }
});
