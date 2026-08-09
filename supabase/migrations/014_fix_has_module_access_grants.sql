-- ==========================================================================
-- CyberDesk — Retire l'exécution anon de has_module_access (migration 008).
--
-- Même défaut que sync_cybervictim_payment (013) et cyberdesk_reporting_*
-- (012) : le `revoke all ... from public` de la migration 008 ne suffit
-- pas sur ce projet à retirer un grant EXECUTE accordé directement au rôle
-- anon (privilèges par défaut du schéma public) — il faut lister `anon`
-- explicitement, comme le fait déjà get_edge_secret.
--
-- has_module_access() est la fonction centrale du cloisonnement
-- CyberDesk/Vente (voir CLAUDE.md, section Cohabitation) : aucun scénario
-- légitime n'appelle cette fonction sans authentification (elle ne fait que
-- vérifier si l'utilisateur COURANT a accès à un module — pour un appelant
-- anonyme, auth.uid() est NULL et la fonction renvoie toujours false).
--
-- Vérifié avant correction que les deux autres fonctions détectées comme
-- anon-exécutables par l'advisor (get_order_by_token, log_login_attempt)
-- sont, elles, volontairement publiques (lookup par token / journalisation
-- pré-authentification) — non touchées ici, hors périmètre CyberDesk de
-- toute façon (fonctions Vente).
-- ==========================================================================

revoke all on function public.has_module_access(text) from public, anon;
grant execute on function public.has_module_access(text) to authenticated;
