# Roadmap d'exécution NACEF (Web + Desktop)

Ce document est la feuille de route de référence. On suit les phases dans l'ordre, sans sauter les critères de sortie.

## Phase 0 — Baseline et cadrage (terminee)

- Matrice initiale conformité.
- Backlog priorisé.
- Plan de validation par phase.

**Sortie**: go Phase 1 valide.

## Phase 1 — Socle integration S-MDF/NACEF (2 a 3 semaines)

### Objectifs

- Introduire un module `nacef` dans le backend.
- Exposer des services internes:
  - `getManifest()`
  - `requestCertificate()`
  - `synchronize()`
  - `signTicket()`
- Mettre une machine d'etats S-MDF.

### Livrables

- Entites/config NACEF (IMDF, etat, certificat, horodatages).
- Services backend + routes internes.
- Erreurs mappees vers messages utilisateur.

### Critere de sortie

- Un ticket de test ne peut pas etre fiscalise sans sequence etat correcte.
- Les etats critiques sont visibles et traces.

## Phase 2 — Ticket fiscal conforme A3 (2 semaines)

### Objectifs

- Aligner la structure ticket sur annexe A3.
- Ajouter reference MDF, champs fiscaux obligatoires.
- Generer QR online/offline conforme.

### Livrables

- Modele ticket fiscal v1.
- Moteur d'impression aligne format reglementaire.
- Validation des formats montant/taxe/mentions.

### Critere de sortie

- Ticket genere conforme sur echantillons de tests.

## Phase 3 — Certificat et synchronisation avancees (2 semaines)

### Objectifs

- Workflow certificat complet.
- Gestion expiration/suspension/revocation.
- Ticket 0 + synchronisation obligatoire.

### Livrables

- Statuts certificat persistants.
- Garde-fous transaction selon statut.
- Ecrans/info contribuable cotes web et desktop.

### Critere de sortie

- Scenarios PROCTEST d'etat passes.

## Phase 4 — Traçabilite, inalterabilite, archivage (2 a 3 semaines)

### Objectifs

- Piste d'audit conforme.
- Mecanisme d'integrite verifiable.
- Export/archives exploitables controle fiscal.

### Livrables

- Journal fiscal normalise.
- Chaine d'integrite ou preuve equivalente.
- Fonctions export/purge/conservation alignees.

### Critere de sortie

- Donnees auditable et verifiables end-to-end.

## Phase 5 — Parametrage fiscal et qualite donnees (1 a 2 semaines)

### Objectifs

- IMDF configurable.
- Familles articles + TVA A4/A5.
- Validation JSON normative E0803.

### Critere de sortie

- Rejets automatiques des objets non conformes.

## Phase 6 — Durcissement securite et exploitation (2 semaines)

### Objectifs

- Gestion robuste des secrets/certificats.
- Observabilite et procedures incident.
- Preparation environnement pre-production.

### Critere de sortie

- Niveau operationnel stable et supportable.

## Phase 7 — Pre-homologation et dossier officiel (2 a 3 semaines)

### Objectifs

- Dossier complet E0201..E0209 + A6/A7.
- Execution PROCTEST complete.
- Traitement des non-conformites finales.

### Critere de sortie

- Package pret pour soumission homologation.

## Mode de pilotage

- Un seul statut actif par phase: `A faire`, `En cours`, `Validee`.
- Revue hebdomadaire:
  - avancee vs livrables
  - risques
  - decisions
- Interdiction de passer a la phase suivante sans criteres de sortie atteints.
