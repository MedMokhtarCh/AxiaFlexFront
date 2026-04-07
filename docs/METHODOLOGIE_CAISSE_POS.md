# Méthodologie caisse — cartographie avec POS Axiaflex

Ce document relie les **bonnes pratiques d’ouverture / clôture de caisse** aux **objets du logiciel**, aux **écrans** et aux **API** du dépôt `d:\pos`.

---

## 1. Terminologie dans l’application

| Concept métier | Dans le code / la base | Rôle |
|----------------|------------------------|------|
| Créneau de travail caissier ou serveur | **`Shift`** (`shifts`) | Session « équipe » : qui travaille, fond théorique d’ouverture (`openingFund`), clôture (`closingFund`, `closingFund` côté shift). Filtré par **`terminalId`** quand le poste est configuré. |
| Caisse physique ou logique | **`Fund`** (`funds`) | Ressource « tiroir / point d’encaisse ». Peut être liée à un **`terminalId`** pour le **multi-caisses**. |
| Session de fonds (fond réel + ventes caisse) | **`FundSession`** (`fund_sessions`) | Lien **`shiftId`** + **`fundId`**. Stocke `openingBalance`, `closingBalance`, `cashSales`, `cardSales`, `totalSales`, statut `OPEN` / `CLOSED`. |
| Entrées / sorties espèces (dépôt, petite dépense…) | **`FundMovement`** | Types `IN` / `OUT` rattachés à une `FundSession`. |
| Identifiant de poste | **`RestaurantSettings.terminalId`** | Sur chaque instance front / poste : isole shifts et fonds **par terminal** (magasin multi-caisses). |

**Ordre métier imposé par le backend** : une **`FundSession`** ouverte doit être **clôturée** avant de pouvoir **clôturer le `Shift`** associé (`shiftService.closeShift` vérifie `getActiveFundSessionByShift`). Les commandes **non terminées** bloquent aussi la clôture du shift.

---

## 2. Écran principal : **Caisse** (`Frontend/components/CashManagement.tsx`)

| Onglet UI | Usage métier |
|-----------|--------------|
| **Shift & Caisse** | Ouverture shift → ouverture session de caisse → mouvements → clôture caisse (comptage coupures) → clôture shift. |
| **Clôture Serveurs** | Vue agrégée des shifts / serveurs (`/pos/shifts/summary`) : adaptée **restaurant** (plusieurs serveurs). |
| **Flux de Caisse** | Historique des **`FundSession`** clôturées sur une date (`listFundSessions`). |
| **IA & Tickets** | Optionnel (Gemini) : analyse sur session + commandes. |

**Rôles** (comportement UI) :

- Ouverture **shift** : `ADMIN`, `MANAGER`, `CASHIER`, `SERVER`.
- Ouverture / clôture **fonds** et mouvements : `canManageFund === true` ou rôles par défaut `ADMIN`, `MANAGER`, `CASHIER` (voir `fundSessionController` côté API).

---

## 3. Formules utilisées dans l’UI (clôture détaillée)

Cohérentes avec la méthodologie « fond + ventes espèces + entrées − sorties » :

- **Espèces attendues** :  
  `openingBalance` + `cashSales` + somme mouvements `IN` − somme mouvements `OUT`.
- **Espèces comptées** : somme des coupures saisies (billets/pièces **en dinars tunisiens** dans l’UI : 50, 20, 10, …).
- **Écart** : `espèces comptées − espèces attendues` (affiché avant validation clôture).

À la clôture, l’UI envoie **`closingBalance`** = total compté (voir `handleCloseFund` → `closeFundSession`).

---

## 4. API utiles (préfixe `/pos`)

| Méthode | Route | Rôle |
|---------|-------|------|
| GET | `/session` | Session de caisse « courante » pour le terminal : shift ouvert + `FundSession` + mouvements. |
| POST | `/session/open` | Ouvre une `FundSession` si un **shift** est déjà ouvert (body : `initialFund`). |
| POST | `/session/close` | Clôture simplifiée (implémentation actuelle : **ne propage pas** `closingBalance` du body — préférer le flux **Caisse** via `/funds/sessions/close` pour une clôture chiffrée). |
| POST | `/session/movement` | Ajoute un mouvement IN/OUT sur la session courante. |
| POST | `/shifts/open` | Ouvre un **shift** (caissier/serveur, fond d’ouverture équipe, notes…). |
| POST | `/shifts/close` | Clôture un shift (soumis aux garde-fous : pas de `FundSession` ouverte, pas de commandes actives). |
| GET | `/shifts/active`, `/shifts/active/:userId` | Shift ouvert pour terminal / utilisateur. |
| GET | `/shifts/summary` | Synthèse pour **multi-serveurs**. |
| GET/POST | `/funds/sessions/*` | Ouverture / clôture / liste sessions de fonds, mouvements (utilisé par l’écran Caisse pour **clôture avec montant**). |

*Swagger* : voir `Backend/src/swagger.ts`.

---

## 5. Comment adapter selon le **type d’établissement**

### 5.1 Fast food

- **Un poste** souvent = un **terminal** + un **Fund** actif.
- **Rythme** : plusieurs shifts / jour → répéter : ouvrir shift → ouvrir caisse → ventes → clôture caisse (comptage rapide) → clôture shift.
- **Paramètres** : fond d’ouverture shift (`shiftOpeningFund`) + fond de session caisse (`fundAmount`) selon politique (souvent faible rotation de monnaie).
- **Traçabilité** : mouvements IN/OUT pour arrêts banque ou achats urgents.

### 5.2 Restaurant / café

- **Plusieurs serveurs** : un **shift par personne** (ou par rôle métier) ; onglet **Clôture Serveurs** pour suivre les totaux par shift.
- **Garde-fou** : impossible de fermer un shift si des **commandes** sont encore `PENDING` / `PREPARING` / etc. (aligné service à table).
- **Caisse centrale** : ouvrir la **FundSession** sur le **Fund** rattaché au terminal de la caisse principale ; les encaissements alimentent `cashSales` / `cardSales` via les commandes liées au shift (selon usage des écrans commande).

### 5.3 Magasin (caisse unique ou peu de postes)

- Configurer **`terminalId`** identique ou laisser vide selon usage ; un **`Fund`** actif par contexte.
- **Clôture** : privilégier le **détail par coupure** dans le modal de clôture (contrôle résiduel).
- **Historique** : onglet **Flux de Caisse** pour audit journalier.

### 5.4 Magasin **multi-caisses**

- **Par poste** : affecter un **`terminalId` distinct** dans les **paramètres restaurant** de chaque instance du front (même API, filtrage par terminal côté serveur pour shifts / fonds actifs).
- **Par caisse** : créer un **`Fund`** par terminal (`terminalId` sur le fund) — l’UI sélectionne le fond aligné sur le terminal (`CashManagement` : fond actif pour `settings.terminalId`).
- **Pilotage** : agréger manuellement ou via reporting à partir de **`listFundSessions`** (filtres `fundId`, `from` / `to`, `status=CLOSED`) plusieurs terminaux = plusieurs séries de sessions.

---

## 6. Synthèse du flux **recommandé** dans l’app

1. Vérifier **`terminalId`** / **fonds** dans Paramètres + **Fonds** si multi-caisses.  
2. **Ouvrir le shift** (utilisateur, notes, fond d’équipe).  
3. **Ouvrir la caisse** (`FundSession`) avec le **fond de départ** réel en espèces.  
4. Exploitation : ventes + **mouvements** IN/OUT si besoin.  
5. **Clôture caisse** : comptage physique, contrôle de l’écart, validation → `CLOSED` sur la `FundSession`.  
6. **Clôture shift** une fois la caisse fermée et **sans commande active** sur ce shift.  

---

## 7. Limites / points d’attention (état du code)

- `POST /pos/session/close` accepte **`closingBalance`** et optionnellement **`notes`** ; ils sont enregistrés sur la **`FundSession`** active du shift courant. Réponse **400** si aucune session de fonds ouverte.  
- Les **pourboires** ou **tiroir multi-devises** ne sont pas modélisés séparément dans les entités ci-dessus : à traiter via **mouvements** ou évolution du modèle.  
- La conformité **fiscale / Z de caisse légale** dépend des obligations locales ; l’app fournit la **traçabilité** sessions / mouvements / ventes, pas un certificat fiscal.

---

*Document généré pour le dépôt POS ; à faire évoluer avec les changements d’API ou d’UI.*
