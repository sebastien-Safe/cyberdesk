-- ==========================================================================
-- CyberDesk — Corrige un excès de privilège introduit par la migration 010 :
-- cyberdesk_reporting_leads/payments/reviews et cyberdesk_staff_list avaient
-- fait `revoke all ... from public` sans lister explicitement `anon`, alors
-- que le pattern déjà établi (get_edge_secret, 006/008) revoke toujours
-- `public, anon, authenticated` avant de regrant au strict nécessaire.
-- `anon` pouvait donc appeler ces fonctions SECURITY DEFINER via PostgREST
-- (détecté par l'advisor de sécurité). En pratique auth.uid() est NULL pour
-- un appelant anonyme, donc ces fonctions renvoyaient 0 ligne — mais on ne
-- laisse pas reposer la sécurité sur ce comportement implicite.
--
-- Additive/correctif uniquement, aucune donnée touchée.
-- ==========================================================================

revoke all on function public.cyberdesk_reporting_leads(uuid) from public, anon;
grant execute on function public.cyberdesk_reporting_leads(uuid) to authenticated;

revoke all on function public.cyberdesk_reporting_payments(uuid) from public, anon;
grant execute on function public.cyberdesk_reporting_payments(uuid) to authenticated;

revoke all on function public.cyberdesk_reporting_reviews(uuid) from public, anon;
grant execute on function public.cyberdesk_reporting_reviews(uuid) to authenticated;

revoke all on function public.cyberdesk_staff_list() from public, anon;
grant execute on function public.cyberdesk_staff_list() to authenticated;
