-- Migration 004 : année de naissance victime + stockage des preuves (captures d'écran)

alter table "public"."cybervictim_leads"
  add column if not exists "birth_year" integer
    check (birth_year is null or (birth_year >= 1900 and birth_year <= extract(year from now())::int));

comment on column public.cybervictim_leads.birth_year
  is 'Année de naissance de la victime — utilisée pour calculer l''âge affiché sur le dossier';

-- Bucket de stockage privé pour les preuves (captures d'écran, etc.) jointes
-- au diagnostic. Non public : accès uniquement via URL signée générée côté
-- client authentifié (voir assets/victimes17/victimes17.js, _diagUploadProofFile).
insert into storage.buckets (id, name, public)
values ('cybervictim-proofs', 'cybervictim-proofs', false)
on conflict (id) do nothing;

create policy "auth_cybervictim_proofs_all"
  on storage.objects
  as permissive
  for all
  to authenticated
  using (bucket_id = 'cybervictim-proofs')
  with check (bucket_id = 'cybervictim-proofs');
