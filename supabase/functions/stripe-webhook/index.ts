// ==========================================================================
// CyberDesk — Webhook Stripe : marque le dossier payé et avance le pipeline
// à "paiement_recu" quand une session Checkout est complétée.
// Appelé directement par Stripe (pas de JWT Supabase) — authenticité
// vérifiée via la signature de la requête (STRIPE_WEBHOOK_SECRET), donc
// déployée avec verify_jwt=false.
// ==========================================================================
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

async function getSecret(sb: ReturnType<typeof createClient>, name: string): Promise<string> {
  const { data, error } = await sb.rpc("get_edge_secret", { secret_name: name });
  if (error || !data) throw new Error(`Secret "${name}" introuvable dans le Vault.`);
  return data as string;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const SB_URL = Deno.env.get("SUPABASE_URL")!;
  const SB_SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SB_URL, SB_SR);

  let stripeKey: string, webhookSecret: string;
  try {
    [stripeKey, webhookSecret] = await Promise.all([
      getSecret(sb, "stripe_secret_key"),
      getSecret(sb, "stripe_webhook_secret"),
    ]);
  } catch (e) {
    console.error("[stripe-webhook] secrets:", e);
    return new Response("Server misconfigured", { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature!, webhookSecret);
  } catch (e) {
    console.error("[stripe-webhook] signature invalide:", e.message);
    return new Response(`Webhook signature verification failed`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const leadId = session.client_reference_id || (session.metadata?.lead_id ?? null);

    if (leadId) {
      const { data: lead } = await sb
        .from("cybervictim_leads")
        .select("pipeline_stage")
        .eq("id", leadId)
        .single();

      const update: Record<string, unknown> = {
        payment_status: "paye",
        paid_at: new Date().toISOString(),
        amount_paid_ttc: (session.amount_total || 0) / 100,
      };
      if (lead && !["paiement_recu", "rapport_livre", "cloture"].includes(lead.pipeline_stage)) {
        update.pipeline_stage = "paiement_recu";
      }

      await sb.from("cybervictim_leads").update(update).eq("id", leadId);

      await sb.from("audit_logs").insert({
        action: "victim_paiement_confirme",
        module: "Victimes17Cyber",
        entity_type: "cybervictim_lead",
        entity_id: leadId,
        donnees_concernees: "Confirmation de paiement Stripe Checkout",
        criticite: "Info",
        details: { stripe_session_id: session.id, amount_total: session.amount_total },
      });
    }
  } else if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    await sb.from("cybervictim_leads")
      .update({ payment_status: "expire" })
      .eq("stripe_session_id", session.id);
  }

  return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
});
