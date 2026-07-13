# CyberDesk

CyberDesk est une plateforme SaaS de gestion de dossiers victimes
cyber, extraite du CRM safecrm et rendue autonome.

Elle s'adresse aux prestataires en cybersécurité, assureurs,
avocats et collectivités qui accompagnent des victimes
(particuliers ou entreprises) suite à un incident : phishing,
ransomware, fraude bancaire, usurpation d'identité, fuite de
données...

## Fonctionnalités

- **Kanban de dossiers** — suivi du signalement à la clôture
  (signalement → qualification → devis → paiement → rapport →
  clôture), avec canal d'entrée multi-source (17Cyber,
  formulaire web, email, API, manuel).
- **Arbre de tâches dynamique** — checklist d'intervention
  adaptée au type d'incident et à l'OS de la victime.
- **Génération de devis et rapports** — PDF côté client et DOCX
  généré côté serveur (Edge Function).
- **Module d'audit cybersécurité B2B** — checklist ANSSI/CIS,
  score de sécurité, registre d'incidents et plan d'action pour
  vos clients suivis.
- **Assistant IA** — analyse d'incidents et recommandations,
  propulsé par l'API Anthropic Claude.
- **Quiz de diagnostic public** — outil de qualification de
  leads pour la prospection.
- **Purge RGPD automatique** — anonymisation et suppression des
  dossiers à l'expiration des délais légaux de conservation.

## Stack

Frontend vanilla JS/HTML/CSS, backend Supabase (PostgreSQL +
Edge Functions Deno), IA Anthropic Claude. Voir [CLAUDE.md](./CLAUDE.md)
pour l'architecture détaillée et les conventions du projet.

## Statut

Projet en cours d'extraction — voir la feuille de route dans
CLAUDE.md pour l'état d'avancement du MVP.
