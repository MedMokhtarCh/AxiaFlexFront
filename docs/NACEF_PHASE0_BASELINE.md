# NACEF — Phase 0 (Baseline conformité initiale)

Ce document fixe la baseline de conformité actuelle du projet POS (`Web + Desktop`) face aux exigences du ministère (documents NACEF analysés).

## 1) Périmètre analysé

- `Backend/src`
- `Frontend`
- `DesktopPOS/backend/src`
- `DesktopPOS/frontend`

## 2) Résultat global baseline

- **Conforme**: 5%
- **Partiel**: 25%
- **Manquant**: 70%
- **Conclusion**: non conforme à l'homologation NACEF à ce stade.

## 3) Matrice initiale (exigences clés)

| Domaine | Réf. NACEF | Statut | Écart principal | Preuve actuelle (code) |
|---|---|---|---|---|
| Intégration S-MDF | Partie 3 / PROCTEST | Manquant | Aucun flux complet CE <-> S-MDF <-> NACEF | Recherche sans résultats NACEF/SMDF dans `Backend/src` et `DesktopPOS/backend/src` |
| Manifest & états S-MDF | `getManifest`, `FACTORY`, `CERT_REQUESTED`, `SYNCHRONIZED` | Manquant | Machine d'états absente | Aucun endpoint/service dédié trouvé |
| Certificat électronique | Cycle demande/renouvellement/suspension/révocation | Manquant | Workflow certificat non implémenté | Aucun module certificat NACEF |
| Signature ticket | `CAdES` détachée + DER ASN.1 | Manquant | Signature fiscale non implémentée | Aucun service CAdES |
| QR fiscal | `H0302`, `H0303` (online/offline) | Manquant | QR fiscal réglementaire absent | Aucun flux QR NACEF |
| Ticket 0 | Synchronisation initiale obligatoire | Manquant | Non géré | Aucun scénario ticket 0 |
| Mode offline/online fiscal | Quotas + resynchronisation | Manquant | Règles fiscales offline absentes | Pas de logique `availableOfflineTickets` |
| Blocage transaction selon état S-MDF | PROCTEST étapes 4, 7, 8, 19, 21 | Manquant | Le moteur transaction ne dépend pas de l'état fiscal | Aucune garde métier S-MDF |
| Paramétrage IMDF | `E0801` | Manquant | Pas d'interface/stockage IMDF standardisé | Aucun modèle/route IMDF dédié |
| Familles + TVA A4/A5 | `E0802` | Partiel | TVA existe métier, codification fiscale à aligner | Entités produits/taxes présentes |
| JSON normatif | `E0803` | Manquant | Validation normative stricte NACEF absente | Pas de couche validation dédiée NACEF |
| Piste d'audit | `E0901..E0905` | Partiel | Journal présent, format + inaltérabilité fiscale à renforcer | `Backend/src/entity/AuditLogEntry.ts`, `Backend/src/services/fileAuditLogService.ts` |
| Enregistrement des données | `E1001..E1003` | Partiel | Données transactionnelles présentes, mode Formation fiscal incomplet | `Order`, `Ticket`, `Payment` |
| Inaltérabilité | `E1101`, `E1102` | Manquant | Mécanisme preuve d'intégrité non démontré | Pas de chaîne d'intégrité/empreinte fiscale |
| Clôtures | `E1201..E1205` | Partiel | Clôture caisse disponible, pas encore qualifiée conformité fiscale | `fundSessionService`, `shiftService`, reporting |
| Archivage | `E1301..E1304` | Partiel | Archive applicative existe, exigences fiscales d'intégrité à compléter | `pdfArchiveService`, `PdfArchiveEntry` |
| Purge | `E1401`, `E1402` | Partiel | Mécanisme de purge partiel/non formalisé conformité | Services présents mais non alignés NACEF |
| Conservation | `E1501..E1503` | Partiel | Politique mémoire/alerte/pérennité réglementaire non finalisée | Persistance DB existante |
| Sauvegarde/restauration | `E1601` | Partiel | Traçabilité formelle des opérations à compléter | Traces existantes non normalisées fiscal |
| Accès admin fiscale | `E1702` | Manquant | Manuel fiscal + export standard contrôlable non finalisé | Documentation réglementaire absente |
| Documentation homologation | `E0201..E0209`, A6/A7 | Manquant | Dossier officiel incomplet | Pas de package homologation structuré |

## 4) Backlog priorisé (Phase 0 -> exécution)

### Blocants homologation (P1)

1. Module d'intégration NACEF (manifest, cert, sync, sign).
2. Machine d'états S-MDF + blocages transaction.
3. Signature CAdES + QR online/offline + ticket 0.
4. Paramétrage IMDF + codification fiscale ticket.

### Majeurs conformité (P2)

5. Piste d'audit fiscale complète (`E0901..E0905`).
6. Inaltérabilité prouvable (`E1101`, `E1102`).
7. Offline fiscal + quota + resynchronisation.
8. Alignement A3/A4/A5 complet ticket/taxes.

### Industrialisation homologation (P3)

9. Archivage/purge/conservation conformes.
10. Dossiers techniques et fonctionnels en français.
11. Matrice A6/A7 avec preuves de tests.
12. Pré-audit PROCTEST complet et corrections.

## 5) Critère de sortie Phase 0

- Baseline validée.
- Priorités fixées.
- Prochaine phase (Phase 1) cadrée et prête à exécuter.
