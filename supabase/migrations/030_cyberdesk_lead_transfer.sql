-- ==========================================================================
-- CyberDesk — Transfert de dossier en libre-service par son propriétaire.
--
-- Jusqu'ici, seule la réattribution admin existait (vl-owner-bar,
-- reassignLeadOwner() dans victimes17.js, direct update sur
-- cybervictim_leads — passe la policy cyberdesk_leads_access car
-- is_admin()/is_super_admin() satisfait le WITH CHECK, migration 011).
--
-- Un propriétaire non-admin NE PEUT PAS faire ce même update directement :
-- le WITH CHECK de cyberdesk_leads_access exige created_by = auth.uid() sur
-- la ligne APRÈS modification, ce qui rejette justement toute tentative de
-- céder le dossier à quelqu'un d'autre. D'où une RPC security definer
-- dédiée, qui applique ses propres règles d'autorisation :
--   - l'appelant doit être le propriétaire actuel du dossier (ou admin,
--     ce qui reste possible mais l'admin a déjà vl-owner-bar pour ça),
--   - le destinataire doit avoir accès au module cyberdesk
--     (staff_module_access), jamais un utilisateur arbitraire,
--   - contrairement à la réattribution admin, pas de "Non attribué" —
--     un propriétaire ne peut pas orpheliner son propre dossier.
--
-- cyberdesk_staff_list() (010) existant est réservée aux admins
-- (`where is_admin() or is_super_admin()` dans son corps) — inutilisable
-- ici pour peupler la liste des destinataires possibles côté propriétaire
-- non-admin. cyberdesk_transferable_staff_list() ci-dessous est son
-- pendant ouvert à tout membre du staff cyberdesk (mais seulement pour
-- lister ses collègues, jamais pour écrire), exclut l'appelant lui-même.
--
-- Additive uniquement.
-- ==========================================================================


-- ══════════════════════════════════════════════════════════════════════
-- 1. Liste des destinataires possibles — ouverte à tout le staff cyberdesk
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.cyberdesk_transferable_staff_list()
returns table (user_id uuid, email text)
language sql stable security definer set search_path to 'public' as $function$
  select u.id, u.email
  from auth.users u
  join public.staff_module_access sma on sma.user_id = u.id and sma.module = 'cyberdesk'
  where public.has_module_access('cyberdesk')  -- porte sur l'appelant (auth.uid()), pas sur u.id
    and u.id <> auth.uid()
  order by u.email;
$function$;

revoke all on function public.cyberdesk_transferable_staff_list() from public, anon;
grant execute on function public.cyberdesk_transferable_staff_list() to authenticated;

comment on function public.cyberdesk_transferable_staff_list()
  is 'Liste des collègues ayant accès au module cyberdesk, pour peupler le sélecteur de transfert de dossier (vl-transfer-bar) — ouverte à tout le staff, contrairement à cyberdesk_staff_list() qui reste admin-only (utilisée pour la réattribution admin et le sélecteur Comptable).';


-- ══════════════════════════════════════════════════════════════════════
-- 2. Transfert — security definer, contourne le WITH CHECK de
--    cyberdesk_leads_access avec ses propres règles
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.cyberdesk_transfer_lead(p_lead_id uuid, p_new_owner_id uuid)
returns public.cybervictim_leads
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_current_owner uuid;
  v_caller uuid := auth.uid();
  v_result public.cybervictim_leads;
begin
  if not public.has_module_access('cyberdesk') then
    raise exception 'access_denied';
  end if;

  if p_new_owner_id is null then
    raise exception 'new_owner_required';
  end if;

  select created_by into v_current_owner
  from public.cybervictim_leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'lead_not_found';
  end if;

  if v_current_owner is distinct from v_caller
     and not (public.is_admin() or public.is_super_admin()) then
    raise exception 'not_owner';
  end if;

  if p_new_owner_id = v_current_owner then
    raise exception 'already_owner';
  end if;

  -- Le destinataire doit avoir accès au module — un super-admin sans ligne
  -- staff_module_access (accès implicite via is_super_admin()) ne peut pas
  -- être choisi ici : cas marginal assumé, transférer un dossier à un
  -- super-admin (qui voit déjà tout) n'a pas d'usage pratique.
  if not exists (
    select 1 from public.staff_module_access
    where user_id = p_new_owner_id and module = 'cyberdesk'
  ) then
    raise exception 'target_not_eligible';
  end if;

  update public.cybervictim_leads
  set created_by = p_new_owner_id
  where id = p_lead_id
  returning * into v_result;

  return v_result;
end;
$function$;

revoke all on function public.cyberdesk_transfer_lead(uuid, uuid) from public, anon;
grant execute on function public.cyberdesk_transfer_lead(uuid, uuid) to authenticated;

comment on function public.cyberdesk_transfer_lead(uuid, uuid)
  is 'Transfert en libre-service d''un dossier par son propriétaire actuel (ou un admin) vers un autre membre du staff cyberdesk. Journalisé côté client dans audit_logs (action victim_dossier_transfert) après succès, même patron que victim_dossier_reattribue (admin).';
