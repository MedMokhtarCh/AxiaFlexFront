# Roadmap post-homologation (ameliorations)

Objectif: consolider la plateforme apres cloture des sprints de conformite NACEF.

## Priorite P0 (stabilite immediate)

1. [x] Unifier la configuration de ports backend/dev (web vs desktop) pour eviter les conflits `EADDRINUSE`.
   - Backend: port par defaut `3003` (override possible via `PORT`)
   - Desktop backend: port par defaut `3004` (override possible via `PORT`)
2. Ajouter un script unique de verification pre-release:
   - `nacef:test-ticket-a3`
   - `nacef:test-states`
   - `audit:verify-proof`
3. Ajouter des garde-fous de configuration demarrage:
   - validation variables critiques (IMDF, mode impression, URL API externes),
   - message d'erreur actionnable si configuration invalide.

## Priorite P1 (robustesse exploitation)

1. Ajouter un endpoint de sante consolide:
   - DB connectivity,
   - statut S-MDF,
   - statut securite operationnelle.
2. Ajouter retention/rotation des fichiers preuve exportes (`tmp/audit-proof-*`).
3. Ajouter export CSV des checks securite (en plus JSON/PDF) pour suivi OPS.

## Priorite P2 (qualite produit)

1. Ajouter tests automatises UI ciblant le panneau securite:
   - filtres checks,
   - export signatures,
   - verification locale SHA.
2. Ajouter i18n/messages uniformes (erreurs/alerts) dans settings securite.
3. Ameliorer UX des boutons incident:
   - regroupement visuel par scenario (diagnostic, critiques, verification).

## Priorite P3 (performance et maintenabilite)

1. Refactoriser le composant `SettingsManager` (split en sous-composants module par module).
2. Ajouter instrumentation legere (temps de chargement panel securite, nb checks critiques).
3. Ajouter budget de taille/complexite par composant frontend.

## Plan d'execution recommande (2 semaines)

- Semaine 1:
  - P0 complet
  - P1.1 (endpoint sante)
- Semaine 2:
  - P1.2 + P1.3
  - P2.1
  - cadrage P3 (decoupage `SettingsManager`)

## Criteres de succes

- Aucun echec de demarrage lie aux ports/config critiques.
- Verification pre-release en PASS 100% sur web + desktop.
- Temps de diagnostic incident reduit (copie/export/verification en moins de 2 minutes).
- Regression fonctionnelle nulle sur les modules fiscaux/sprint 2-7.
