-- ==========================================================================
-- CyberDesk — Cloisonnement du Kanban lui-même par créateur de dossier.
--
-- Jusqu'ici, cyberdesk_leads_access (008) autorisait tout le staff cyberdesk
-- à voir/modifier TOUS les dossiers (Kanban partagé). Ce n'est plus le
-- comportement voulu : un utilisateur standard ne doit voir/modifier que
-- les dossiers dont il est le créateur ; un admin (is_admin()/is_super_admin())
-- continue de tout voir, y compris pour réattribuer un dossier.
--
-- Fait important : `created_by` n'a jamais été renseigné nulle part dans le
-- code applicatif (vérifié — aucune Edge Function, aucun appel front ne
-- l'écrit). Tous les dossiers existants ont donc created_by = NULL. Avec la
-- policy ci-dessous, un NULL n'égale jamais auth.uid() : ces dossiers
-- deviennent visibles uniquement par un admin (choix produit confirmé),
-- jusqu'à réattribution manuelle. Le trigger ci-dessous garantit que tout
-- NOUVEAU dossier reçoit désormais un created_by dès la création.
--
-- Ne recrée PAS : profiles, contacts, audit_logs, is_admin()/is_super_admin(),
-- has_module_access() (déjà en place). Additive uniquement.
-- ==========================================================================

create or replace function public.cybervictim_set_created_by()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_cybervictim_set_created_by on public.cybervictim_leads;
create trigger trg_cybervictim_set_created_by
  before insert on public.cybervictim_leads
  for each row execute function public.cybervictim_set_created_by();

drop policy if exists "cyberdesk_leads_access" on "public"."cybervictim_leads";
create policy "cyberdesk_leads_access"
  on "public"."cybervictim_leads" as permissive for all to authenticated
  using (
    public.has_module_access('cyberdesk')
    and (created_by = auth.uid() or is_admin() or is_super_admin())
  )
  with check (
    public.has_module_access('cyberdesk')
    and (created_by = auth.uid() or is_admin() or is_super_admin())
  );

comment on column public.cybervictim_leads.created_by
  is 'Propriétaire du dossier — détermine sa visibilité dans le Kanban (policy cyberdesk_leads_access). Renseigné automatiquement à la création (trg_cybervictim_set_created_by) ; réattribuable par un admin depuis la modale dossier.';
