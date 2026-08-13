// ==========================================================================
// S@FE CYBER PILOT — Webhook Stripe : cycle de vie de l'abonnement SaaS tenant
// (public.cyberdesk_tenants). Distinct de cyberdesk-stripe-webhook (paiement
// des dossiers victimes, migration 005) — endpoint et secret de signature
// séparés (un secret Stripe par endpoint webhook, voir CLAUDE.md).
// Appelé directement par Stripe (pas de JWT Supabase) — authenticité
// vérifiée via la signature de la requête (stripe_billing_webhook_secret),
// donc déployée avec verify_jwt=false.
// ==========================================================================
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

async function getSecret(sb: ReturnType<typeof createClient>, name: string): Promise<string> {
  const { data, error } = await sb.rpc("get_edge_secret", { secret_name: name });
  if (error || !data) throw new Error(`Secret "${name}" introuvable dans le Vault.`);
  return data as string;
}

function toIso(unixSeconds: number | null | undefined): string | null {
  return unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;
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
      getSecret(sb, "stripe_billing_webhook_secret"),
    ]);
  } catch (e) {
    console.error("[cyberdesk-billing-webhook] secrets:", e);
    return new Response("Server misconfigured", { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature!, webhookSecret);
  } catch (e) {
    console.error("[cyberdesk-billing-webhook] signature invalide:", e.message);
    return new Response("Webhook signature verification failed", { status: 400 });
  }

  async function logAudit(action: string, tenantId: string, details: Record<string, unknown>) {
    await sb.from("audit_logs").insert({
      action,
      module: "CyberDesk",
      entity_type: "cyberdesk_tenant",
      entity_id: tenantId,
      donnees_concernees: "Cycle de vie de l'abonnement SaaS tenant",
      criticite: "Info",
      resultat: "Succès",
      details,
    });
  }

  async function tenantIdBySubscription(subscriptionId: string): Promise<string | null> {
    const { data } = await sb
      .from("cyberdesk_tenants")
      .select("id")
      .eq("stripe_subscription_id", subscriptionId)
      .maybeSingle();
    return data?.id ?? null;
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription" || !session.subscription) break;
      const tenantId = session.client_reference_id;
      if (!tenantId) break;

      const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
      await sb.from("cyberdesk_tenants").update({
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: subscription.id,
        stripe_price_id: subscription.items.data[0]?.price.id ?? null,
        subscription_status: subscription.status,
        trial_ends_at: toIso(subscription.trial_end),
        current_period_end: toIso(subscription.current_period_end),
      }).eq("id", tenantId);

      await logAudit("tenant_abonnement_active", tenantId, {
        stripe_subscription_id: subscription.id, status: subscription.status,
      });
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const tenantId = await tenantIdBySubscription(subscription.id);
      if (!tenantId) break;

      await sb.from("cyberdesk_tenants").update({
        subscription_status: subscription.status,
        stripe_price_id: subscription.items.data[0]?.price.id ?? null,
        trial_ends_at: toIso(subscription.trial_end),
        current_period_end: toIso(subscription.current_period_end),
      }).eq("id", tenantId);

      await logAudit("tenant_abonnement_modifie", tenantId, { status: subscription.status });
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const tenantId = await tenantIdBySubscription(subscription.id);
      if (!tenantId) break;

      await sb.from("cyberdesk_tenants").update({ subscription_status: "canceled" }).eq("id", tenantId);
      await logAudit("tenant_abonnement_annule", tenantId, { stripe_subscription_id: subscription.id });
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoice.subscription as string | null;
      if (!subscriptionId) break;
      const tenantId = await tenantIdBySubscription(subscriptionId);
      if (!tenantId) break;

      await sb.from("cyberdesk_tenant_invoices").upsert({
        tenant_id: tenantId,
        stripe_invoice_id: invoice.id,
        amount_ht: invoice.subtotal != null ? invoice.subtotal / 100 : null,
        amount_ttc: (invoice.amount_paid ?? 0) / 100,
        currency: invoice.currency,
        status: "paye",
        period_start: toIso(invoice.period_start),
        period_end: toIso(invoice.period_end),
        hosted_invoice_url: invoice.hosted_invoice_url,
        paid_at: new Date().toISOString(),
      }, { onConflict: "stripe_invoice_id" });

      await logAudit("tenant_paiement_recu", tenantId, {
        stripe_invoice_id: invoice.id, amount_ttc: (invoice.amount_paid ?? 0) / 100,
      });
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoice.subscription as string | null;
      if (!subscriptionId) break;
      const tenantId = await tenantIdBySubscription(subscriptionId);
      if (!tenantId) break;

      await sb.from("cyberdesk_tenant_invoices").upsert({
        tenant_id: tenantId,
        stripe_invoice_id: invoice.id,
        amount_ttc: (invoice.amount_due ?? 0) / 100,
        currency: invoice.currency,
        status: "echoue",
        period_start: toIso(invoice.period_start),
        period_end: toIso(invoice.period_end),
        hosted_invoice_url: invoice.hosted_invoice_url,
      }, { onConflict: "stripe_invoice_id" });

      // past_due seulement depuis active : ne dégrade pas un statut trialing
      // ou déjà canceled à la suite d'un échec de paiement.
      const { data: tenant } = await sb
        .from("cyberdesk_tenants").select("subscription_status").eq("id", tenantId).single();
      if (tenant?.subscription_status === "active") {
        await sb.from("cyberdesk_tenants").update({ subscription_status: "past_due" }).eq("id", tenantId);
      }

      await logAudit("tenant_paiement_echoue", tenantId, { stripe_invoice_id: invoice.id });
      break;
    }
  }

  return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
});
