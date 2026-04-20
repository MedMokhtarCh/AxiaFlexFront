# Sprint 6 - Runbook incident securite/exploitation

Ce runbook decrit la procedure operationnelle minimale en cas d'alerte securite dans le POS (web + desktop).

## 1) Detection initiale

1. Ouvrir `Settings > Materiel > Observabilite securite (Sprint 6)`.
2. Verifier le `Statut global` (`ok` / `warning` / `critical`).
3. Verifier l'age du statut (alerte de fraicheur si > 5 min, critique si > 15 min).
4. Utiliser le filtre rapide des checks (`Tous`, `Critiques`, `Warnings`, `OK`) pour isoler les points bloquants.

## 2) Triage et priorisation

- Si au moins un check `critical`:
  - traiter immediatement les checks critiques;
  - suspendre toute operation sensible jusqu'a retour a un etat non critique.
- Si seulement des `warning`:
  - planifier correction a court terme;
  - conserver la surveillance active.

## 3) Collecte des preuves incident

Depuis le panneau securite:

- `Copier diagnostic` (JSON complet)
- `Telecharger diagnostic` (JSON local)
- `Copier critiques` (JSON des checks critiques uniquement)
- `Telecharger critiques` (JSON des checks critiques)

Chaque export telecharge genere aussi son fichier de preuve:

- `*.sha256.txt`

## 4) Verification d'integrite des preuves

1. Utiliser `Verification locale SHA-256`.
2. Fournir le fichier exporte (JSON/PDF) + son fichier `.sha256.txt`.
3. Verifier le verdict `Valide`.
4. Conserver la trace dans l'historique local (8 dernieres verifications).

## 5) Remediation technique standard

Checks couverts par Sprint 6:

- `nacef.imdf`: corriger IMDF si fiscalisation active.
- `externalRestaurantCardApi.url` / `token`: completer URL/token si API active.
- `desktopBridge.url` / `token`: completer URL/token si mode `DESKTOP_BRIDGE`.

Apres correction:

1. cliquer `Verifier` (ou attendre l'auto-refresh 120s),
2. verifier la disparition des checks critiques,
3. exporter un diagnostic final signe (`JSON + .sha256.txt`).

## 6) Criteres de sortie incident

Un incident est considere stabilise si:

- `Statut global != critical`,
- aucun check critique restant,
- preuves exportees et verifiees (`*.sha256.txt` valide),
- diagnostic final partage au support/exploitation.

## 7) Liens de suivi sprint

- `docs/SPRINTS_STATUS.md`
- `docs/SPRINTS_CHECKLIST.md`
