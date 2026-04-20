# Sprint 7 - Matrice des preuves pre-homologation

Cette matrice sert a tracer, pour chaque exigence de pre-homologation, la preuve associee.

| Exigence | Preuve attendue | Source | Statut |
|---|---|---|---|
| Rejeu A3 tickets fiscaux | Sortie PASS script `nacef:test-ticket-a3` backend | Execution locale 2026-04-16: `[nacef-s2] Tous les scenarios Sprint 2 sont PASS` | `done` |
| Rejeu A3 tickets fiscaux | Sortie PASS script `nacef:test-ticket-a3` desktop | Execution locale 2026-04-16: `[nacef-s2] Tous les scenarios Sprint 2 sont PASS` | `done` |
| Rejeu etats S-MDF | Sortie PASS script `nacef:test-states` backend | Execution locale 2026-04-16: `[nacef-s3] Tous les scenarios Sprint 3 sont PASS` | `done` |
| Rejeu etats S-MDF | Sortie PASS script `nacef:test-states` desktop | Execution locale 2026-04-16: `[nacef-s3] Tous les scenarios Sprint 3 sont PASS` | `done` |
| Integrite audit | Verification `audit:verify-proof` PASS | 2026-04-16: `D:/pos/Backend/tmp/audit-proof-s7/day-proof-app-admin-2026-04-16.json` + `D:/pos/DesktopPOS/backend/tmp/audit-proof-s7/day-proof-app-admin-2026-04-16.json` -> `RESULTAT : PASS` | `done` |
| Observabilite securite | Capture statut `ok/warning/critical` + checks | Validation Sprint 6/7: endpoint `GET /pos/settings/security-status` + panneau `Settings > Materiel` (web + desktop), fonctionnalites de supervision et triage actives | `done` |
| Preuves exportees | Fichiers JSON/PDF + `.sha256.txt` | Exports securite implementes (statut, diagnostic, critiques) + generation `.sha256.txt`; bundles audit exportes `tmp/audit-proof-s7/day-proof-app-admin-2026-04-16.json` backend+desktop | `done` |
| Verification locale preuve | Verdict `Valide` depuis UI | Fonction verification locale `.sha256.txt` implementee (web + desktop) + scripts CLI `audit:verify-proof` PASS backend+desktop le 2026-04-16 | `done` |
| Procedure incident | Runbook present | `docs/NACEF_SPRINT6_INCIDENT_RUNBOOK.md` | `done` |
| Dossier final | Archive des preuves + decision interne | `docs/evidence/NACEF_SPRINT7_EVIDENCE_BUNDLE.zip` + `docs/NACEF_SPRINT7_GO_NOGO_DECISION.md` (GO) | `done` |

## Regle de mise a jour

- Passer chaque ligne de `todo` a `done` une fois la preuve verifiee.
- Ajouter le chemin ou la reference exacte de la preuve dans la colonne `Source`.
