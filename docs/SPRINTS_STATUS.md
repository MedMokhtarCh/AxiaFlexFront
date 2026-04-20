# Suivi des sprints NACEF (Web + Desktop)

Ce fichier sert de tableau de bord unique.
Quand un sprint est termine, remplacer son statut par `done`.

## Convention de statut

- `todo` : pas commence
- `in_progress` : en cours
- `done` : termine

## Etat actuel estime (apres revue du code + docs)

- Sprint 0 : `done`
- Sprint 1 : `done`
- Sprint 2 : `done`
- Sprint 3 : `done`
- Sprint 4 : `done`
- Sprint 5 : `done`
- Sprint 6 : `done`
- Sprint 7 : `done`

## Tableau des sprints

| Sprint | Theme | Statut | Definition of Done (DoD) |
|---|---|---|---|
| Sprint 0 | Baseline et cadrage | `done` | Matrice conformite + backlog priorise + plan de tests disponibles |
| Sprint 1 | Socle integration S-MDF/NACEF | `done` | Endpoints manifest/certificate/sync/sign actifs + etats S-MDF persistes |
| Sprint 2 | Ticket fiscal conforme A3 | `done` | Ticket fiscal aligne annexe A3, mentions et formats verifies |
| Sprint 3 | Certificat et synchronisation avancees | `done` | Blocages par etat verifies (CERT_REQUESTED, NOT_SYNCHRONIZED, SYNCHRONIZED), ticket 0 et sync valides |
| Sprint 4 | Tracabilite et inalterabilite | `done` | Journal fiscal complet + verification integrite prouvable |
| Sprint 5 | Parametrage fiscal et qualite JSON | `done` | IMDF + TVA/familles A4/A5 + validation JSON normative E0803 |
| Sprint 6 | Securite et exploitation | `done` | Secrets/certificats durcis + observabilite + procedures incident |
| Sprint 7 | Pre-homologation et dossier final | `done` | Rejeu PROCTEST complet + evidences + dossier homologation pret |

## Comment marquer un sprint termine

1. Localiser la ligne du sprint dans ce tableau.
2. Remplacer `in_progress` (ou `todo`) par `done`.
3. Ajouter une preuve dans la section ci-dessous (date + livrables/tests).

## Journal de validation

| Date | Sprint | Decision | Preuves |
|---|---|---|---|
| 2026-04-15 | Sprint 0 | `done` | `docs/NACEF_PHASE0_BASELINE.md`, `docs/NACEF_ROADMAP_EXECUTION.md`, `docs/NACEF_PLAN_TESTS_PAR_PHASE.md` |
| 2026-04-15 | Sprint 2 | `in_progress` | Durcissement ticket fiscal: `transactionType` (NORMAL/FORMATION/REMBOURSEMENT/COPIE) + validation format montants `0.000` dans `nacefService` (Backend + DesktopPOS/backend) |
| 2026-04-15 | Sprint 2 | `in_progress` | TVA reelle calculee depuis settings (`tvaRate`, `applyTvaToTicket`) + enrichissement payload fiscal (`totalTtc`, `taxRate`, `currency`, `sellerTaxId`, `issuedAt`) dans `nacefFiscalizationService` (Backend + DesktopPOS/backend) |
| 2026-04-15 | Sprint 2 | `in_progress` | Detail fiscal par ligne ajoute (`fiscalLines`: quantite, PU HT, HT ligne, taxe ligne, TTC ligne, taux) + validation structurelle dans `nacefService` (Backend + DesktopPOS/backend) |
| 2026-04-15 | Sprint 2 | `in_progress` | Aggregation fiscale par taux ajoutee (`taxBreakdown`: taux, base taxable, montant taxe) + validation format `0.000` (Backend + DesktopPOS/backend) |
| 2026-04-15 | Sprint 2 | `in_progress` | Mode multi-taux active par ligne ticket (`taxRate/tvaRate/vatRate` si present, sinon fallback settings), avec remise distribuee proportionnellement sur les lignes avant calcul taxe |
| 2026-04-15 | Sprint 2 | `in_progress` | Persistance fiscale produit ajoutee (`Product.taxRate`, `Product.taxCode`) + create/patch API + fiscalisation qui priorise le taux de la fiche produit pour chaque ligne |
| 2026-04-15 | Sprint 2 | `in_progress` | Rapport de conformite Sprint 2 formalise dans `docs/NACEF_SPRINT2_CONFORMITY_REPORT.md` (criteres A3, evidence implementation, limites restantes) |
| 2026-04-15 | Sprint 2 | `done` | Automatisation Sprint 2 ajoutee (`nacef:test-ticket-a3`) + execution PASS backend et desktop; criteres A3 valides et sprint cloturable |
| 2026-04-15 | Sprint 3 | `in_progress` | Workflow avance etats certificat/S-MDF renforce: simulation expiration certificat, suspension/revocation/reactivation via API + actions UI web/desktop (NACEF panel) + quick actions de remediation |
| 2026-04-15 | Sprint 3 | `in_progress` | Scenarios automatiques PROCTEST etats ajoutes (`nacef:test-states`) pour backend + desktop: pending cert, non synchronise, quota offline, recovery apres sync, expiration, suspension/reactivation, revocation; execution PASS (`Backend` DB principale + `DesktopPOS` DB isolee `axiaflex_desktop`) |
| 2026-04-15 | Sprint 3 | `in_progress` | Rapport de conformite formalise dans `docs/NACEF_SPRINT3_SCENARIOS_REPORT.md` (tableau scenarios, commandes, resultats attendus/observes, anomalie corrigee) |
| 2026-04-15 | Sprint 3 | `done` | Re-execution scenarios etats Sprint 3 PASS (backend + desktop) + decision de cloture documentee dans `docs/NACEF_SPRINT3_SCENARIOS_REPORT.md` |
| 2026-04-15 | Sprint 4 | `in_progress` | Journal admin adapte audit/inalterabilite: signature chainee SHA-256 par entree (`prevHash/hash`) + verification d'integrite exposee API (`/pos/admin/logs?date=...`) + affichage alerte/OK dans Settings (web + desktop) |
| 2026-04-15 | Sprint 4 | `in_progress` | Backfill historique integrite journal ajoute (`audit:backfill-integrity`) et execute sur backend + desktop (rows updated: 617 chacun) pour signer retroactivement les entrees audit |
| 2026-04-15 | Sprint 4 | `in_progress` | Endpoint rapport d'integrite global ajoute (`/pos/admin/logs/integrity-report`) + bouton Settings "Verifier integrite complete" (web + desktop) avec synthese multi-jours |
| 2026-04-15 | Sprint 4 | `in_progress` | Export "preuve audit signee" ajoute: endpoint `/pos/admin/logs/day-proof` (empreinte finale de chaine + digest de preuve + entries du jour) + bouton Settings "Export preuve audit signée" (web + desktop) |
| 2026-04-15 | Sprint 4 | `in_progress` | Verification externe ajoutee: script CLI `audit:verify-proof` (backend + desktop) pour valider offline le digest, la continuite de chaine (`prevHash/hash`) et la coherence du rapport d'integrite d'un fichier preuve exporte |
| 2026-04-15 | Sprint 4 | `in_progress` | Preuve renforcee: ajout `entriesDigest` dans le bundle exporte et verification externe etendue (digest canonical des entrees + digest global) pour durcir la verifiabilite hors application |
| 2026-04-15 | Sprint 4 | `in_progress` | Commande operationnelle unique ajoutee: `audit:export-verify-proof` (backend + desktop) pour exporter la preuve via API `/pos/admin/logs/day-proof`, sauver le JSON localement, puis lancer la verification complete en une seule execution |
| 2026-04-15 | Sprint 5 | `in_progress` | Durcissement initial Sprint 5 lance: validation format IMDF (A-Z0-9_- / 3-64) et rejet normatif JSON ticket invalide avec code `SMDF_JSON_E0803` dans `nacefService.signTicket` (backend + desktop) |
| 2026-04-15 | Sprint 5 | `in_progress` | Separation metier/fiscal appliquee: familles fiscales decouplees des categories articles via mapping dedie `settings.fiscalCategoryCatalog` (categorie article -> familyCode), injection `fiscalLines[].familyCode` en fiscalisation, validation format cote NACEF (`A-Z0-9_`, 2-32) |
| 2026-04-15 | Sprint 5 | `in_progress` | Durcissement mapping fiscal complete: UI `Settings` passe en select des categories articles existantes + validation front des `familyCode`; backend `settingsService` renforce avec erreurs ciblees (ligne invalide, code famille invalide, duplication categorie article) sur save (backend + desktop) |
| 2026-04-15 | Sprint 5 | `in_progress` | Cohérence TVA A4/A5 renforcée: blocage backend de la fiscalisation si `taxCode` ligne/produit n'existe pas dans `settings.tvaCatalog`, avec message métier explicite (backend + desktop) |
| 2026-04-15 | Sprint 5 | `in_progress` | Prévention côté saisie produit: `taxCode` passe en select alimenté par `settings.tvaCatalog` dans `ProductManagement` (web + desktop), pour réduire les rejets de fiscalisation |
| 2026-04-15 | Sprint 5 | `in_progress` | Assistance de saisie produit: sélection d'un `taxCode` propose automatiquement le `taxRate` du catalogue TVA, tout en conservant la surcharge manuelle du taux (web + desktop) |
| 2026-04-15 | Sprint 5 | `in_progress` | Validation formulaire produit renforcée: blocage save si `taxCode` saisi est absent du catalogue TVA + message d'erreur inline (`Code taxe absent du catalogue TVA`) (web + desktop) |
| 2026-04-15 | Sprint 5 | `in_progress` | Validation NACEF payload durcie: `fiscalLines[].taxCode` validé côté `nacefService` avec format strict (`A-Z0-9_`, 2-40) et erreur normative `SMDF_JSON_E0803` en cas d'anomalie (backend + desktop) |
| 2026-04-15 | Sprint 5 | `in_progress` | Contrôle de cohérence A3/A4 ajouté dans `nacefService`: vérification stricte des sommes `fiscalLines` et `taxBreakdown` vs `totalHt`/`taxTotal` avec rejet normatif `SMDF_JSON_E0803` en cas d'écart (backend + desktop) |
| 2026-04-15 | Sprint 5 | `in_progress` | Automatisation étendue: scénarios `nacefTicketA3Scenarios` enrichis avec cas d'incohérence (`fiscalLines` vs `totalHt`, `taxBreakdown` vs `taxTotal`) et exécution PASS backend + desktop |
| 2026-04-15 | Sprint 5 | `in_progress` | Automatisation étendue (suite): ajout cas négatifs `fiscalLines[].taxCode` invalide et `fiscalLines[].familyCode` invalide dans `nacefTicketA3Scenarios`, exécution PASS backend + desktop |
| 2026-04-15 | Sprint 4 | `done` | Ensemble des preuves Sprint 4 consolidé: chaînage intégrité, backfill, rapport global, export preuve signée, vérification externe et commande combinée export+verify (backend + desktop) |
| 2026-04-15 | Sprint 5 | `done` | Ensemble des preuves Sprint 5 consolidé: validations IMDF/JSON/taxCode/familyCode, mapping fiscal découplé, contrôles de cohérence A3/A4, automatisations A3 étendues PASS (backend + desktop) |
| 2026-04-15 | Sprint 6 | `in_progress` | Démarrage phase sécurité/exploitation: statut activé pour enchaîner durcissement secrets/certificats, observabilité et procédures incident |
| 2026-04-15 | Sprint 6 | `in_progress` | Durcissement secrets applicatifs: tokens sensibles (`desktopPrintBridge.token`, `externalRestaurantCardApi.token`) masqués à la lecture des settings, avec conservation du secret existant lors du save si valeur masquée renvoyée (backend + desktop) |
| 2026-04-15 | Sprint 6 | `in_progress` | Observabilité sécurité initiale: nouvel endpoint admin `GET /pos/settings/security-status` (checks IMDF, API externe, Desktop Bridge) avec statut global `ok/warning/critical` (backend + desktop) |
| 2026-04-15 | Sprint 6 | `in_progress` | Visibilité opérationnelle frontend: panneau Settings (onglet Matériel) pour charger/afficher le statut sécurité (`ok/warning/critical`) et le détail des checks de l'endpoint sécurité (web + desktop) |
| 2026-04-15 | Sprint 6 | `in_progress` | Exportabilité audit sécurité: ajout des exports JSON + PDF du rapport de statut sécurité depuis le panneau Settings (web + desktop) |
| 2026-04-15 | Sprint 6 | `in_progress` | Exploitabilité renforcée: ajout d'un export JSON du rapport sécurité depuis le panneau UI (web + desktop), incluant statut global, checks et horodatage d'export |
| 2026-04-15 | Sprint 6 | `in_progress` | Traçabilité renforcée des preuves sécurité: génération d'un fichier de signature SHA-256 (`.sha256.txt`) pour chaque export sécurité JSON/PDF depuis le panneau Settings (web + desktop) |
| 2026-04-15 | Sprint 6 | `in_progress` | Contrôle local de preuve ajouté: vérification UI d'un couple fichier exporté + `.sha256.txt` (hash + nom de fichier) avec verdict explicite valide/invalide (web + desktop) |
| 2026-04-15 | Sprint 6 | `in_progress` | Suivi opérateur enrichi: mini historique UI des 8 dernières vérifications SHA-256 (horodatage, export, preuve, verdict) dans le panneau sécurité (web + desktop) |
| 2026-04-15 | Sprint 6 | `in_progress` | Supervision proactive UI: auto-chargement du statut sécurité à l'ouverture de l'onglet Matériel + refresh périodique silencieux (120s), indicateur de chargement et bannière d'alerte critique (web + desktop) |
| 2026-04-15 | Sprint 6 | `in_progress` | Qualité opérationnelle renforcée: ajout d'une alerte de fraîcheur du statut sécurité (warning >= 5 min, critique >= 15 min) dans le panneau Matériel (web + desktop) |
| 2026-04-15 | Sprint 6 | `in_progress` | Réponse incident facilitée: bouton “Copier diagnostic” dans le panneau sécurité (JSON avec statut courant + fraîcheur + horodatage), prêt à partager au support (web + desktop) |
| 2026-04-15 | Sprint 6 | `in_progress` | Partage incident outillé: bouton “Télécharger diagnostic” ajoutant un export local JSON du diagnostic sécurité (statut + fraîcheur + horodatage) depuis le panneau Matériel (web + desktop) |
| 2026-04-15 | Sprint 6 | `in_progress` | Intégrité des preuves incident renforcée: export du diagnostic sécurité désormais accompagné d'un fichier `.sha256.txt` pour vérification hors application (web + desktop) |
| 2026-04-15 | Sprint 6 | `in_progress` | Pilotage opérationnel amélioré: résumé visuel des checks sécurité (compteurs critical/warning/ok + recommandation d'action) ajouté au panneau Matériel (web + desktop) |
| 2026-04-15 | Sprint 6 | `in_progress` | Triage incident accéléré: ajout d'un filtre rapide des checks sécurité (`Tous`, `Critiques`, `Warnings`, `OK`) avec état vide explicite dans le panneau Matériel (web + desktop) |
| 2026-04-15 | Sprint 6 | `in_progress` | Escalade incident simplifiée: bouton “Copier critiques” pour copier uniquement les checks de niveau `critical` (JSON prêt support) depuis le panneau Matériel (web + desktop) |
| 2026-04-15 | Sprint 6 | `in_progress` | Escalade hors outil renforcée: bouton “Télécharger critiques” exportant les checks `critical` en JSON avec preuve `.sha256.txt` pour partage/verif externe (web + desktop) |
| 2026-04-15 | Sprint 6 | `in_progress` | Continuité opérateur améliorée: persistance locale du filtre de checks sécurité et de l'historique des vérifications SHA-256 (8 dernières entrées) après redémarrage (web + desktop) |
| 2026-04-15 | Sprint 6 | `done` | Cloture Sprint 6: secrets durcis, observabilite securite complete (endpoint + panneau + auto-refresh + alertes + triage), preuves exportables/verifiables (diagnostic, critiques, SHA-256), et procedure incident formalisee dans `docs/NACEF_SPRINT6_INCIDENT_RUNBOOK.md` (web + desktop) |
| 2026-04-15 | Sprint 7 | `in_progress` | Demarrage pre-homologation: checklist d'execution creee (`docs/NACEF_SPRINT7_PREHOMOLOGATION_CHECKLIST.md`) + matrice des preuves creee (`docs/NACEF_SPRINT7_EVIDENCE_MATRIX.md`) pour piloter le rejeu complet |
| 2026-04-15 | Sprint 7 | `in_progress` | Rejeu technique execute et valide: `nacef:test-ticket-a3` + `nacef:test-states` PASS sur backend et desktop; matrice des preuves mise a jour avec references d'execution |
| 2026-04-16 | Sprint 7 | `in_progress` | Integrite audit pre-homologation validee: `audit:export-verify-proof` puis `audit:verify-proof` PASS sur backend (port 3003) et desktop (port 3004), bundles exportes dans `tmp/audit-proof-s7` |
| 2026-04-16 | Sprint 7 | `done` | Cloture pre-homologation: checklist completee, matrice des preuves entierement `done`, decision interne GO (`docs/NACEF_SPRINT7_GO_NOGO_DECISION.md`) et archive finale des preuves (`docs/evidence/NACEF_SPRINT7_EVIDENCE_BUNDLE.zip`) |
| 2026-04-16 | Post-homologation | `in_progress` | Roadmap d'ameliorations creee et priorisee (`docs/NACEF_POST_HOMOLOGATION_IMPROVEMENTS.md`) pour stabilite, robustesse OPS, qualite UI et maintenabilite |

