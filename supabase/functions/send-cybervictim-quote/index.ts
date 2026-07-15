// ==========================================================================
// CyberDesk — Envoi du devis par e-mail (Brevo) + création d'une session
// Stripe Checkout au montant exact du devis composé côté client.
// POST { lead_id, devis, pdf_base64, pdf_filename }
//   devis: { prestation_label, ht, tva, ttc, ... } (voir victimes17-quote.js)
// Le PDF est généré côté client (jsPDF, source de vérité visuelle unique
// avec le téléchargement local) et transmis ici en base64 pour être joint
// à l'e-mail — pas de re-génération serveur.
// ==========================================================================
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { durationForPrestation } from "../_shared/google-calendar.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*", // TODO: restreindre au domaine cyberdesk une fois déployé
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const SITE_URL = "https://cyberdesk.safe-digitalisation.fr";
const SENDER = { name: "S@FE — CyberDesk", email: "noreply@safe-digitalisation.fr" };

async function getSecret(sb: ReturnType<typeof createClient>, name: string): Promise<string> {
  const { data, error } = await sb.rpc("get_edge_secret", { secret_name: name });
  if (error || !data) throw new Error(`Secret "${name}" introuvable dans le Vault.`);
  return data as string;
}

Deno.serve(async (req) => {
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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const { lead_id, devis, pdf_base64, pdf_filename } = body;
  if (!lead_id || !devis || !pdf_base64) return json({ error: "missing_fields" }, 400);
  const ttc = Number(devis.ttc);
  if (!ttc || ttc <= 0) return json({ error: "invalid_amount" }, 400);

  const sb = createClient(SB_URL, SB_SR);

  const { data: lead, error: eLead } = await sb
    .from("cybervictim_leads")
    .select("id, first_name, last_name, email, pipeline_stage, client_token")
    .eq("id", lead_id)
    .single();
  if (eLead || !lead) return json({ error: "not_found" }, 404);
  if (!lead.email) return json({ error: "no_email", details: "Aucun e-mail renseigné pour ce dossier." }, 400);

  let stripeKey: string, brevoKey: string;
  try {
    [stripeKey, brevoKey] = await Promise.all([
      getSecret(sb, "stripe_secret_key"),
      getSecret(sb, "brevo_api_key"),
    ]);
  } catch (e) {
    return json({ error: "secrets_unavailable", details: String(e.message || e) }, 500);
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
  const clientNom = `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "Madame, Monsieur";

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "eur",
          product_data: { name: devis.prestation_label || "Intervention 17Cyber" },
          unit_amount: Math.round(ttc * 100),
        },
        quantity: 1,
      }],
      customer_email: lead.email,
      client_reference_id: lead_id,
      metadata: { lead_id },
      success_url: `${SITE_URL}/paiement-confirme.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/paiement-annule.html`,
    });
  } catch (e) {
    return json({ error: "stripe_error", details: String(e.message || e) }, 502);
  }

  const bookingUrl = `${SITE_URL}/reserver-creneau.html`;

  const htmlContent = `
    <div style="font-family:Arial,sans-serif;color:#1d1d1b;max-width:560px;margin:0 auto;line-height:1.6">
      <div style="border-bottom:3px solid #000091;padding-bottom:10px;margin-bottom:20px">
        <strong style="font-size:18px">S<span style="color:#e1000f">@</span>FE</strong>
        <div style="font-size:11px;color:#666">Prestataire référencé cybermalveillance.gouv.fr / 17Cyber</div>
      </div>
      <p>Bonjour ${clientNom},</p>
      <p>Vous trouverez ci-joint votre devis d'intervention <strong>${devis.prestation_label || "17Cyber"}</strong>
      d'un montant de <strong>${ttc.toFixed(2)} € TTC</strong>.</p>
      <p style="text-align:center;margin:24px 0 10px">
        <a href="${session.url}" style="background:#000091;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:bold;display:inline-block">
          Payer en ligne
        </a>
      </p>
      <p style="text-align:center;margin:0 0 24px">
        <a href="${bookingUrl}" style="color:#000091;text-decoration:underline;font-size:14px">
          📅 Réserver un créneau d'intervention
        </a>
      </p>
      <p style="font-size:13px;color:#666">Devis gratuit et sans engagement, valable 30 jours.
      Garantie de reprise de 7 jours si l'incident n'est pas résolu par l'intervention.</p>
      <p style="font-size:12px;color:#999;margin-top:24px">
        S@FE — 66 avenue des Champs-Élysées, 75008 Paris — contact@safe-digitalisation.fr
      </p>
    </div>
  `;

  const brevoResp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": brevoKey, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      sender: SENDER,
      to: [{ email: lead.email, name: clientNom }],
      subject: `Votre devis d'intervention 17Cyber — ${ttc.toFixed(2)} € TTC`,
      htmlContent,
      attachment: [{ content: pdf_base64, name: pdf_filename || "devis-17cyber.pdf" }],
    }),
  });
  if (!brevoResp.ok) {
    const details = await brevoResp.text();
    return json({ error: "brevo_error", details }, 502);
  }

  const updatePayload: Record<string, unknown> = {
    quote_sent_at: new Date().toISOString(),
    stripe_session_id: session.id,
    stripe_checkout_url: session.url,
    payment_status: "en_attente",
    quote_prestation_id: devis.prestation_id || null,
    appointment_duration_minutes: durationForPrestation(devis.prestation_id || null, devis.selection_type || null),
    // Active le lien de réservation publique (client_token) pour 30 jours.
    client_token_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
  };
  if (["signalement", "qualification"].includes(lead.pipeline_stage)) {
    updatePayload.pipeline_stage = "devis_envoye";
  }

  const { data: updated, error: eUpdate } = await sb
    .from("cybervictim_leads")
    .update(updatePayload)
    .eq("id", lead_id)
    .select()
    .single();
  if (eUpdate) return json({ error: "db_update_failed", details: eUpdate.message }, 500);

  return json({ success: true, checkout_url: session.url, lead: updated });
});
