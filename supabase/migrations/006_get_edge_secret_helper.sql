-- Helper SECURITY DEFINER pour lire un secret du Vault depuis une Edge
-- Function via le client service-role (sb.rpc). Accès restreint à
-- service_role uniquement — jamais accessible à anon/authenticated.
create or replace function public.get_edge_secret(secret_name text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v text;
begin
  select decrypted_secret into v from vault.decrypted_secrets where name = secret_name;
  return v;
end;
$function$;

revoke execute on function public.get_edge_secret(text) from public;
revoke execute on function public.get_edge_secret(text) from anon;
revoke execute on function public.get_edge_secret(text) from authenticated;
grant execute on function public.get_edge_secret(text) to service_role;
