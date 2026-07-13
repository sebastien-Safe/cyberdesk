-- Durcissement : fixe search_path sur la fonction trigger (recommandation
-- du security advisor Supabase — évite un search_path mutable exploitable).
create or replace function public.cybervictim_set_purge_dates()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.pipeline_stage = 'cloture' and (old.pipeline_stage is distinct from 'cloture') then
    new.closed_at := now();
    new.purge_due_at := now() + interval '5 years';
    new.documents_purge_due_at := now() + interval '10 years';
  end if;
  return new;
end;
$function$;
