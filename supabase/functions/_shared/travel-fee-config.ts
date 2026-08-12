// ==========================================================================
// CyberDesk — Config frais de déplacement (option O4 du devis 17Cyber).
// Dupliqué depuis assets/data/tarifs-cyberdesk.json (clé "deplacement") :
// contenu statique partagé entre la modale devis client-side et cette
// Edge Function, même patron que product-texts.ts — pas de dépendance
// runtime entre les deux côtés, à garder synchronisé manuellement.
//
// coefficientEurKm ici n'est qu'un repli défensif si la table
// cyberdesk_travel_fee_settings (migration 016) est vide — la valeur
// réellement utilisée est lue en base par l'Edge Function, ajustable par
// un admin depuis la modale devis (option Déplacement), sans déploiement.
// ==========================================================================

export const TRAVEL_FEE_CONFIG = {
  origineAdresse: "66 avenue des Champs-Élysées, 75008 Paris",
  coefficientEurKm: 1, // repli seulement — source de vérité : cyberdesk_travel_fee_settings
  allerRetour: true,
};
