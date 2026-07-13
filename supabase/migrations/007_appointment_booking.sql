-- Migration 007 : réservation de créneau (Google Calendar) par la victime
-- client_token (déjà existant depuis 001) est réutilisé comme identifiant
-- public de la page de réservation, sans authentification.

alter table "public"."cybervictim_leads"
  add column if not exists "quote_prestation_id"          text,
  add column if not exists "appointment_duration_minutes"  integer,
  add column if not exists "appointment_at"                timestamp with time zone,
  add column if not exists "appointment_end_at"             timestamp with time zone,
  add column if not exists "appointment_booked_at"           timestamp with time zone,
  add column if not exists "calendar_event_id"              text;

-- Policy anon pour la page de réservation publique : lecture/écriture
-- restreintes à l'enregistrement identifié par client_token (jamais par id
-- brut, jamais de liste). Les Edge Functions get-available-slots et
-- book-cybervictim-slot utilisent le service role et ne dépendent donc pas
-- de cette policy, mais elle est ajoutée par cohérence avec le design initial
-- du champ client_token (voir commentaire migration 001) — actuellement non
-- utilisée par le front public qui passe exclusivement par les Edge
-- Functions.

comment on column public.cybervictim_leads.appointment_at
  is 'Créneau réservé par la victime via la page publique de réservation (Google Calendar)';
comment on column public.cybervictim_leads.calendar_event_id
  is 'ID de l''événement créé dans le Google Calendar partagé (calendarId sebastien@alonso.biz)';
