// ==========================================================================
// CyberDesk — Helpers Google Calendar (API v3), authentification par compte
// de service (JWT RS256 signé manuellement via Web Crypto — pas de
// dépendance npm supplémentaire). Utilisé par get-available-slots et
// book-cybervictim-slot pour la réservation de créneau par la victime.
// ==========================================================================

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

function base64url(bytes: ArrayBuffer | string): string {
  const bin = typeof bytes === "string" ? bytes : String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function getGoogleAccessToken(sa: ServiceAccount, scope = CALENDAR_SCOPE): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;

  const pemBody = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "").replace(/\s+/g, "");
  const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${base64url(signature)}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Google auth failed: ${JSON.stringify(data)}`);
  return data.access_token as string;
}

export async function getFreeBusy(
  sa: ServiceAccount,
  calendarId: string,
  timeMin: string,
  timeMax: string,
): Promise<{ start: string; end: string }[]> {
  const token = await getGoogleAccessToken(sa);
  const resp = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin, timeMax, items: [{ id: calendarId }] }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Google freeBusy failed: ${JSON.stringify(data)}`);
  return data.calendars?.[calendarId]?.busy || [];
}

export async function createCalendarEvent(
  sa: ServiceAccount,
  calendarId: string,
  event: { summary: string; description: string; start: string; end: string },
): Promise<{ id: string; htmlLink: string }> {
  const token = await getGoogleAccessToken(sa);
  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: event.summary,
        description: event.description,
        start: { dateTime: event.start, timeZone: "Europe/Paris" },
        end: { dateTime: event.end, timeZone: "Europe/Paris" },
      }),
    },
  );
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Google event creation failed: ${JSON.stringify(data)}`);
  return { id: data.id, htmlLink: data.htmlLink };
}

// ── Horaires d'ouverture (heure de Paris) ──
// Lundi-Vendredi 9h-21h, Samedi 9h-11h, Dimanche fermé.
const BUSINESS_HOURS: Record<number, [number, number] | null> = {
  0: null, 1: [9, 21], 2: [9, 21], 3: [9, 21], 4: [9, 21], 5: [9, 21], 6: [9, 11],
};

// Décalage Europe/Paris (en minutes) pour un instant UTC donné — gère
// automatiquement le passage heure d'été / heure d'hiver.
function parisOffsetMinutes(utcInstant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(utcInstant)) parts[p.type] = p.value;
  const asIfUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour === 24 ? 0 : +parts.hour, +parts.minute, +parts.second);
  return Math.round((asIfUtc - utcInstant.getTime()) / 60000);
}

// Convertit une heure "murale" Paris (année/mois/jour/heure/minute, tous en
// heure locale Paris) en instant UTC réel.
function parisWallClockToUtc(y: number, mo: number, d: number, h: number, mi: number): Date {
  const utcGuess = new Date(Date.UTC(y, mo, d, h, mi));
  const offset = parisOffsetMinutes(utcGuess);
  return new Date(utcGuess.getTime() - offset * 60000);
}

function parisDateParts(utcInstant: Date): { y: number; mo: number; d: number; dow: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(utcInstant)) parts[p.type] = p.value;
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { y: +parts.year, mo: +parts.month - 1, d: +parts.day, dow: dowMap[parts.weekday] };
}

// Génère les créneaux candidats (pas de 30 min) sur les `days` prochains
// jours calendaires (heure de Paris), d'une durée `durationMinutes`, en
// excluant ceux qui chevauchent une période occupée ou un délai de
// prévenance minimal.
export function generateCandidateSlots(
  durationMinutes: number,
  busy: { start: string; end: string }[],
  days = 14,
  minNoticeHours = 4,
): { start: string; end: string }[] {
  const slots: { start: string; end: string }[] = [];
  const now = new Date();
  const minStart = new Date(now.getTime() + minNoticeHours * 3600 * 1000);
  const busyIntervals = busy.map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }));

  const today = parisDateParts(now);
  const anchor = new Date(Date.UTC(today.y, today.mo, today.d));

  for (let d = 0; d < days; d++) {
    const dayUtcAnchor = new Date(anchor.getTime() + d * 86400000);
    const { y, mo, d: dd, dow } = parisDateParts(dayUtcAnchor);
    const hours = BUSINESS_HOURS[dow];
    if (!hours) continue;

    const [openH, closeH] = hours;
    const dayStart = parisWallClockToUtc(y, mo, dd, openH, 0);
    const dayClose = parisWallClockToUtc(y, mo, dd, closeH, 0);

    for (let t = dayStart.getTime(); t + durationMinutes * 60000 <= dayClose.getTime(); t += 30 * 60000) {
      const slotStart = new Date(t);
      const slotEnd = new Date(t + durationMinutes * 60000);
      if (slotStart < minStart) continue;

      const overlaps = busyIntervals.some((b) => slotStart.getTime() < b.end && slotEnd.getTime() > b.start);
      if (overlaps) continue;

      slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString() });
    }
  }
  return slots;
}

// Durée du créneau selon la prestation choisie dans le devis (grille
// tarifaire 17Cyber) — N1: <30min, N2: 30-90min, N3: intervention
// importante, N4: incident critique multi-heures.
export function durationForPrestation(prestationId: string | null, selectionType: string | null): number {
  if (prestationId) {
    if (prestationId.startsWith("N1")) return 30;
    if (prestationId.startsWith("N2")) return 90;
    if (prestationId.startsWith("N3")) return 120;
    if (prestationId.startsWith("N4")) return 180;
    if (prestationId.startsWith("P")) return 90;
  }
  if (selectionType === "complexe") return 120;
  return 60;
}
