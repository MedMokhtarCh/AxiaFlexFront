# Sprint 7 - Checklist pre-homologation (execution)

Objectif: rejouer un parcours de verification complet avant dossier final d'homologation.

## A. Preconditions environnement

- [x] Base de donnees de test identifiee (backend + desktop)
- [x] Parametres fiscaux verifies (IMDF, TVA, familles, certificats)
- [x] Horloge/systeme stabilisee (date/heure)
- [x] Acces admin operationnel (Settings, endpoints, scripts)

## B. Rejeu technique des scripts

- [x] `nacef:test-ticket-a3` execute (backend) -> PASS
- [x] `nacef:test-ticket-a3` execute (desktop) -> PASS
- [x] `nacef:test-states` execute (backend) -> PASS
- [x] `nacef:test-states` execute (desktop) -> PASS
- [x] `audit:verify-proof` execute sur au moins 1 bundle -> PASS

## C. Verifications fonctionnelles UI

- [x] Panneau securite: statut charge + auto-refresh actif
- [x] Alerte fraicheur visible quand statut ancien
- [x] Export JSON/PDF statut + `.sha256.txt` genere
- [x] Verification locale `.sha256.txt` -> verdict attendu
- [x] Outils incident: copier/telecharger diagnostic + critiques

## D. Verifications de conformite documentaire

- [x] Rapport Sprint 2 conforme et present
- [x] Rapport Sprint 3 scenarios conforme et present
- [x] Runbook Sprint 6 present et coherent
- [x] Matrice des preuves Sprint 7 completee

## E. Decision Go/No-Go interne

- [x] Tous les tests critiques en PASS
- [x] Aucune anomalie bloquante ouverte
- [x] Dossier de preuves archive et horodate
- [x] Decision interne documentee (Go ou No-Go)
