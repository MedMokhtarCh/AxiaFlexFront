# NACEF — Plan de tests par phase

Plan minimal pour valider chaque phase avant passage a la suivante.

## Phase 1 — Socle S-MDF/NACEF

- **T1.1** Appel `manifest` retourne un etat coherent.
- **T1.2** Demande certificat interdite si prerequis manquants.
- **T1.3** Synchronisation requise avant signature ticket.
- **T1.4** Codes d'erreurs traduits en messages utilisateur.

## Phase 2 — Ticket fiscal A3

- **T2.1** Ticket contient tous champs fiscaux obligatoires.
- **T2.2** Formats numeriques conformes (montants, taxes).
- **T2.3** Mentions transaction (`NORMAL`, `FORMATION`, `REMBOURSEMENT`, `COPIE`) correctes.
- **T2.4** QR online/offline genere selon regles de contenu.

## Phase 3 — Certificat et sync

- **T3.1** Etat `CERT_REQUESTED` bloque la vente.
- **T3.2** Etat `NOT_SYNCHRONIZED` bloque la vente.
- **T3.3** Etat `SYNCHRONIZED` autorise la vente.
- **T3.4** Certificat expire/revoque suspend les transactions.

## Phase 4 — Audit et inalterabilite

- **T4.1** Toute operation critique cree une trace.
- **T4.2** Trace non editable via API applicative.
- **T4.3** Export audit lisible et exploitable sans l'application.
- **T4.4** Verification d'integrite detecte une alteration.

## Phase 5 — Parametrage fiscal

- **T5.1** IMDF parametrable et mis a jour.
- **T5.2** Codification TVA/familles A4/A5 appliquee.
- **T5.3** JSON non conforme rejete avec message explicite.

## Phase 6 — Securite/exploitation

- **T6.1** Rotation/stockage certif et secrets valide.
- **T6.2** Reprise sur incident testee.
- **T6.3** Logs techniques suffisants pour diagnostic.

## Phase 7 — Pre-homologation

- **T7.1** Rejouer scenario PROCTEST complet.
- **T7.2** Produire evidences de tests (captures, logs, rapports).
- **T7.3** Aucun ecart bloquant restant avant soumission.

## Format de preuve a conserver

- ID test, date, environnement, resultat.
- Evidence jointe (log, capture, ticket, export JSON).
- Decision: `OK`, `KO`, `A corriger`.
