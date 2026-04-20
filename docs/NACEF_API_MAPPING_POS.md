# Mapping APIs NACEF <-> POS

Ce document mappe les APIs publiques du portail NACEF avec les services deja presents dans le projet POS (web + desktop).

## Base API NACEF (portail dev)

- Portail: `https://developers.nacef.tn`
- Spec Redoc chargee via: `jsonAllDocs/nacef-smdf-api-docs-1.2.0.json`
- Endpoints exposes:
  - `GET /sic/external/manifest`
  - `POST /sic/external/certificate/request`
  - `POST /sic/external/sync/request`
  - `POST /sic/external/sign/request`
  - `POST /sic/external/log/`

## Mapping fonctionnel

| API NACEF | Role metier | Service POS actuel | Statut integration |
|---|---|---|---|
| `GET /sic/external/manifest` | Lire etat S-MDF/certificat/quota | `nacefService.getManifest(imdf)` | Simule (local), pret pour branchement HTTP reel |
| `POST /sic/external/certificate/request` | Demander generation certificat | `nacefService.requestCertificate(imdf)` | Simule (local), pret pour branchement HTTP reel |
| `POST /sic/external/sync/request` | Lancer synchronisation S-MDF | `nacefService.synchronize(imdf, mode)` | Simule (local), pret pour branchement HTTP reel |
| `POST /sic/external/sign/request` | Signer ticket fiscal (QR/identifiant) | `nacefService.signTicket(imdf, payload)` appele via `nacefFiscalizationService.maybeFiscalizeTicket` | Simule (local), coeur metier deja en place |
| `POST /sic/external/log/` | Journaliser event SIC | Pas encore relie explicitement au endpoint NACEF; audit interne existe (`appAdminAuditService`, `fileAuditLogService`) | A brancher |

## Payloads NACEF vs POS

### 1) Manifest
- NACEF: pas de body (IMDF via contexte/module)
- POS: `imdf` issu de `settings.nacefImdf`

### 2) Certificate request
- NACEF: body `SICCertificateRequest` (champ principal `cashRegisterInfo`)
- POS: contexte caisse deja disponible dans settings/session, a mapper vers `cashRegisterInfo`

### 3) Sync request
- NACEF: body `SMDFSyncRequest` (`requestPINupdate`, `updateSMDFURL`)
- POS: `synchronize(imdf, mode)`; besoin d'un mapper mode -> champs NACEF

### 4) Sign request
- NACEF: body `SMDFTicketInfo` (`base64Ticket`, `totalHT`, `totalTax`, `operationType`, `transactionType`)
- POS: payload fiscal deja construit dans `nacefFiscalizationService` (A3/A4/A5, TVA, breakdown, familyCode, taxCode), puis passe a `signTicket`
- Action: ajouter adaptateur payload POS -> `SMDFTicketInfo` (encodage base64 + totaux)

### 5) SIC log
- NACEF: body `SICLogEntry` (`module`, `operation`, `level`, `message`)
- POS: logs internes existants, mais pas de push NACEF
- Action: creer un sender `logToNacef(...)` branche sur evenements critiques (cert, sync, sign fail)

## Plan technique de branchement reel (propose)

1. Introduire un client HTTP dedie (`nacefHttpClient`) avec:
   - `baseUrl` configurable (settings/env),
   - timeout/retry,
   - trace id corrige pour audit.
2. Garder le simulateur actuel en fallback via feature flag:
   - `nacefMode = SIMULATED | REMOTE`.
3. Adapter `nacefService`:
   - en mode `REMOTE`, appeler les 5 endpoints NACEF reels;
   - en mode `SIMULATED`, conserver le comportement actuel.
4. Ajouter tests d'integration API (mock HTTP) pour:
   - manifest, cert, sync, sign, log,
   - mapping erreurs NACEF -> codes metier POS.

## Gaps identifies

- Security scheme non explicite dans la spec du portail (pas de `securitySchemes` declares) -> a confirmer avec NACEF (headers/token/certificat reseau).
- Serveur spec par defaut `http://localhost:10006` (indicatif) -> base URL de production a fournir par NACEF.

## Fichiers POS concernes pour integration reelle

- `Backend/src/services/nacefService.ts`
- `Backend/src/services/nacefFiscalizationService.ts`
- `DesktopPOS/backend/src/services/nacefService.ts`
- `DesktopPOS/backend/src/services/nacefFiscalizationService.ts`
- (nouveau) client HTTP NACEF partage web/desktop backend
