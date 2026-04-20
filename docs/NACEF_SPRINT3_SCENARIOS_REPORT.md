# NACEF Sprint 3 - Rapport de conformite scenarios d'etat

Date: 2026-04-15  
Perimetre: `Backend` + `DesktopPOS/backend`

## Objectif

Valider les scenarios critiques Sprint 3 (certificat + synchronisation avancees) avec un script automatisé.

Script:
- `src/scripts/nacefStateScenarios.ts`

Commande:
- `npm run nacef:test-states`

## Pre-requis

- Base initialisee (`npm run db:init`)
- Settings NACEF disponibles (IMDF configure via settings ou script)
- Synchronisation schema OK

## Scenarios verifies

| ID | Scenario | Resultat attendu | Statut |
|---|---|---|---|
| S3-01 | Etat initial sans certificat | Blocage `SMDF_CERTFICATE_NOT_GENERATED` | PASS |
| S3-02 | Certificat demande (pending) | Blocage `SMDF_CERTIFICATE_REQUEST_PENDING` | PASS |
| S3-03 | Certificat genere sans sync | Blocage `SMDF_NOT_SYNCHRONIZED` | PASS |
| S3-04 | Sync offline + signatures quota | Signatures autorisees jusqu'au quota offline | PASS |
| S3-05 | Quota offline epuise | Blocage (`SMDF_OFFLINE_TICKET_QUOTA_EXHAUSTED` ou `SMDF_NOT_SYNCHRONIZED`) | PASS |
| S3-06 | Recovery apres sync online | Signature de nouveau autorisee | PASS |
| S3-07 | Certificat expire | Blocage `SMDF_EXPIRED_CERTIFICATE` | PASS |
| S3-08 | Suspension S-MDF | Blocage `SMDF_IMDF_CAN_NOT_BE_USED` | PASS |
| S3-09 | Reactivation S-MDF | Retour `NOT_SYNCHRONIZED`, sync puis signature OK | PASS |
| S3-10 | Revocation certificat | Blocage `SMDF_REVOKED_CERTIFICATE` | PASS |

## Execution backend principal

Commande:

`npm run nacef:test-states`

Sortie attendue:

`[nacef-s3] Tous les scenarios Sprint 3 sont PASS`

Sortie observee:

- PASS (backend principal)

## Execution desktop backend

Commande recommandee (base isolee):

`$env:DB_NAME='axiaflex_desktop'; npm run db:init; npm run nacef:test-states`

Sortie attendue:

`[nacef-s3] Tous les scenarios Sprint 3 sont PASS`

Sortie observee:

- PASS (desktop backend sur DB `axiaflex_desktop`)

## Anomalie detectee et corrigee pendant Sprint 3

- **Sujet**: reactivation apres suspension pouvait perdre l'etat certificat.
- **Impact**: impossibilite de signer apres reactivation malgre certificat valide.
- **Correctif**: preservation/reconstruction de l'etat `CERTIFICATE_GENERATED` lors de `ACTIVE`, puis sync obligatoire.
- **Fichiers corriges**:
  - `Backend/src/services/nacefService.ts`
  - `DesktopPOS/backend/src/services/nacefService.ts`

## Conclusion

La brique Sprint 3 "certificat et synchronisation avancees" est couverte par des scenarios automatises avec preuve d'execution PASS sur backend principal et desktop backend (base isolee).

## Decision de cloture Sprint 3

Critere de sortie Sprint 3:
- workflow certificat complet,
- gestion expiration/suspension/revocation,
- synchronisation obligatoire et reprise validee.

Decision:
- `DONE` le 2026-04-15, sur la base des executions PASS repetees:
  - `npm run nacef:test-states` (Backend)
  - `$env:DB_NAME='axiaflex_desktop'; npm run nacef:test-states` (DesktopPOS/backend)

