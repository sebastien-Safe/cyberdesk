// ==========================================================================
// CyberDesk — Vérifie qu'un utilisateur authentifié est bien le créateur du
// dossier (created_by) ou un admin, avant d'agir dessus (devis, rapport,
// assistant IA, tâches, avis client...).
//
// Nécessaire en plus de has_module_access('cyberdesk') : ces fonctions
// utilisent toutes un client service_role pour lire/écrire cybervictim_leads,
// ce qui contourne la policy RLS cyberdesk_leads_access (créateur uniquement
// depuis la migration 011_cyberdesk_leads_ownership.sql) — ce garde-fou
// reproduit la même règle côté serveur.
// ==========================================================================
import { createClient } from "@supabase/supabase-js";

export async function canAccessLead(
  sbAnon: ReturnType<typeof createClient>,
  createdBy: string | null,
  userId: string,
): Promise<boolean> {
  if (createdBy === userId) return true;
  const [{ data: isAdmin }, { data: isSuperAdmin }] = await Promise.all([
    sbAnon.rpc("is_admin"),
    sbAnon.rpc("is_super_admin"),
  ]);
  return isAdmin === true || isSuperAdmin === true;
}
