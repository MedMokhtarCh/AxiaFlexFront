# NACEF Sprint 2 - Rapport de conformite ticket fiscal A3

Date: 2026-04-15  
Perimetre: `Backend` + `DesktopPOS/backend` (+ UI produit/settings web+desktop)

## Objectif

Verifier la conformite de la brique Sprint 2:
- structure ticket fiscal A3,
- formats montants/taxes,
- typologie transaction,
- detail fiscal ligne + aggregation,
- parametrage multi-taux A4/A5 (produit + settings).

## Portee technique validee

- Generation ticket fiscal:
  - `Backend/src/services/nacefFiscalizationService.ts`
  - `DesktopPOS/backend/src/services/nacefFiscalizationService.ts`
- Validation stricte payload:
  - `Backend/src/services/nacefService.ts`
  - `DesktopPOS/backend/src/services/nacefService.ts`
- Parametrage fiscal:
  - `Backend/src/services/settingsService.ts`
  - `DesktopPOS/backend/src/services/settingsService.ts`
  - `Backend/src/entity/RestaurantSettings.ts`
  - `DesktopPOS/backend/src/entity/RestaurantSettings.ts`
- TVA produit (A4/A5):
  - `Backend/src/entity/Product.ts`
  - `DesktopPOS/backend/src/entity/Product.ts`
  - `Backend/src/controllers/productController.ts`
  - `DesktopPOS/backend/src/controllers/productController.ts`

## Criteres Sprint 2 (A3) et statut

| ID | Critere | Resultat attendu | Statut |
|---|---|---|---|
| S2-01 | Type transaction fiscal | `NORMAL/FORMATION/REMBOURSEMENT/COPIE` deduit correctement | PASS |
| S2-02 | Format montants | Champs monetaires conformes `0.000` | PASS |
| S2-03 | Totaux ticket | `totalHt`, `taxTotal`, `totalTtc` coherents | PASS |
| S2-04 | Detail fiscal ligne | `fiscalLines` present avec quantite/PU HT/HT/taxe/TTC/taux | PASS |
| S2-05 | Aggregation par taux | `taxBreakdown` conforme et coherent avec lignes | PASS |
| S2-06 | Validation structurelle | Rejet des payloads invalides avec code erreur explicite | PASS |
| S2-07 | Multi-taux par article | Priorite taux ligne -> produit -> catalogue settings -> taux global | PASS |
| S2-08 | Taxe A5 par code | `taxCode` pris en charge dans la fiscalisation | PASS |
| S2-09 | Remise ticket | Distribution proportionnelle sur lignes avant calcul taxe | PASS |
| S2-10 | Cohesion web/desktop | Meme logique backend principal et desktop backend | PASS |

## Evidence d'implementation

- Validation format et structure:
  - helper `isFixed3Amount`
  - controle `validateTicketPayload`
- Calcul fiscal detaille:
  - `fiscalLines` + `taxBreakdown`
  - recalcul `taxableBase`/`taxTotal`/`totalTtc`
- Multi-taux:
  - resolution taux ligne/produit/settings/global
  - `tvaCatalog` en settings
  - `taxRate` + `taxCode` sur produit

## Resultats attendus / observes

- **Attendu**: ticket fiscal conforme A3 sur structure + formats + calculs.
- **Observe**: logique implementee et alignee dans les deux backends, sans erreur lint sur fichiers modifies.

## Automatisation Sprint 2

Script:
- `Backend/src/scripts/nacefTicketA3Scenarios.ts`
- `DesktopPOS/backend/src/scripts/nacefTicketA3Scenarios.ts`

Commandes:
- `npm run nacef:test-ticket-a3` (backend principal)
- `$env:DB_NAME='axiaflex_desktop'; npm run nacef:test-ticket-a3` (desktop backend)

Sortie attendue:
- `[nacef-s2] Tous les scenarios Sprint 2 sont PASS`

Sortie observee:
- PASS (backend principal)
- PASS (desktop backend)

## Limites actuelles (a finaliser avant cloture sprint)

- Validation QR "contenu reglementaire exact" doit etre confirmee sur corpus PROCTEST complet.

## Conclusion

Le socle Sprint 2 est fonctionnellement en place et coherent (web/desktop) pour la conformite A3 et la base A4/A5 (multi-taux).  
La cloture formelle du sprint requiert la finalisation d'une batterie de tests automatisee de sortie equivalente au niveau Sprint 3.

