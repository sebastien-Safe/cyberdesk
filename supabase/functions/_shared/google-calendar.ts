// ==========================================================================
// S@FE CYBER PILOT — Helper de calcul de durée d'intervention selon la prestation
// choisie dans le devis (grille tarifaire 17Cyber). Utilisé par
// send-cybervictim-quote pour estimer la durée attendue de l'intervention.
//
// La réservation de créneau elle-même est désormais gérée par le widget
// Google Calendar Appointment Scheduling embarqué dans reserver-creneau.html
// (plus d'appel serveur, plus de vérification freebusy multi-agenda ici).
// ==========================================================================

// prestationId peut désormais contenir plusieurs identifiants séparés par
// une virgule (modale devis : plusieurs prestations sélectionnables par
// niveau, voir victimes17-quote.js _quoteBuildDevisObject) — la durée
// additionne celle de chaque prestation cochée.
export function durationForPrestation(prestationId: string | null, selectionType: string | null): number {
  if (prestationId) {
    const ids = prestationId.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length) {
      return ids.reduce((sum, id) => {
        if (id.startsWith("N1")) return sum + 30;
        if (id.startsWith("N2")) return sum + 90;
        if (id.startsWith("N3")) return sum + 120;
        if (id.startsWith("N4")) return sum + 180;
        if (id.startsWith("P")) return sum + 90;
        return sum + 60;
      }, 0);
    }
  }
  if (selectionType === "complexe") return 120;
  return 60;
}
