// ==========================================================================
// S@FE CYBER PILOT — Config frais de déplacement (option O4 du devis 17Cyber).
// Le coefficient €/km, le forfait et l'adresse de départ sont désormais
// PAR AGENT (cyberdesk_user_settings, migration
// 024_cyberdesk_travel_fee_per_agent.sql), réglables librement par
// chaque agent depuis Paramétrage → Profil → Facturation. Les valeurs
// ci-dessous ne servent plus que de repli défensif :
// - si l'agent n'a pas encore de ligne cyberdesk_user_settings (jamais
//   ouvert Paramétrage) ;
// - origineAdresse spécifiquement si l'agent n'a pas renseigné d'adresse.
// aller_retour dans assets/data/tarifs-cyberdesk.json (clé "deplacement")
// reste la copie client-side de allerRetour — à garder synchronisé
// manuellement, même patron que product-texts.ts.
// ==========================================================================

export const TRAVEL_FEE_CONFIG = {
  origineAdresse: "66 avenue des Champs-Élysées, 75008 Paris", // repli si l'agent n'a pas renseigné son adresse
  coefficientEurKm: 0.51, // repli seulement — source de vérité : cyberdesk_user_settings.travel_fee_coefficient_eur_km
  forfaitBasEur: 10,      // repli seulement — source de vérité : cyberdesk_user_settings.travel_fee_forfait_eur
  allerRetour: true,
};
