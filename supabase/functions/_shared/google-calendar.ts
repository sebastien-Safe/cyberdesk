// ==========================================================================
// CyberDesk — Helper de calcul de durée d'intervention selon la prestation
// choisie dans le devis (grille tarifaire 17Cyber). Utilisé par
// send-cybervictim-quote pour estimer la durée attendue de l'intervention.
//
// La réservation de créneau elle-même est désormais gérée par le widget
// Google Calendar Appointment Scheduling embarqué dans reserver-creneau.html
// (plus d'appel serveur, plus de vérification freebusy multi-agenda ici).
// ==========================================================================

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
