# DesktopPOS (Standalone)

Application desktop POS autonome dans son propre dossier.

`Frontend` et `Backend` d'origine restent intacts.

## Principe

DesktopPOS cree un **snapshot local** de:
- `Frontend` -> `DesktopPOS/frontend`
- `Backend` -> `DesktopPOS/backend`

Ensuite, DesktopPOS tourne avec ces copies locales.

## Installation

```bash
cd DesktopPOS
npm install
npm run install:standalone
```

## Installation one-click Windows (Node + PostgreSQL + setup app)

Depuis l'explorateur Windows, lance:

- `setup-desktoppos-oneclick.cmd` (idealement en Administrateur)

Ou en terminal:

```bash
cd DesktopPOS
npm run setup:oneclick
```

Ce setup:
- installe Node.js (si absent)
- installe PostgreSQL (si absent)
- demarre le service PostgreSQL
- demande les parametres PostgreSQL (host/port/user/password/database)
- installe les dependances DesktopPOS
- prepare le snapshot standalone frontend/backend
- ecrit `backend/.env` avec les parametres saisis et cree la base si absente
- demande le type de societe (FastFood, Restaurant cafe, Shop single, Shop multi)
- demande le compte admin initial (nom + PIN 4-8 chiffres)
- applique les parametres par defaut lies au type choisi

## Dev (autonome)

```bash
npm run dev
```

Ce mode lance:
- backend local copie sur `127.0.0.1:3003`
- frontend local copie sur `127.0.0.1:3000` (avec `VITE_API_URL` pointe vers 3003)
- Electron plein ecran

## Build standalone

```bash
npm run build
```

L'executable NSIS est genere dans `DesktopPOS/dist`.
Lors de l'installation via l'executable, l'installeur tente aussi
d'installer automatiquement les pre-requis runtime (`PostgreSQL`)
via `winget` (fallback `choco`).
Si les pre-requis ne peuvent pas etre installes automatiquement,
l'installation est stoppee avec un message d'erreur explicite.
Pendant l'installation, un choix de type de societe est demande
et la base est initialisee avec les parametres par defaut associes.
Les parametres PostgreSQL sont egalement demandes avant initialisation.
Le compte admin initial est aussi configure pendant le setup.
En cas d'echec setup, le log detaille est ecrit dans:
`%ProgramData%\AxiaDesktopPOS\installer-prereqs.log`.
Sur les postes sans Node.js, l'initialisation metier (type societe + admin)
est appliquee automatiquement au premier lancement de l'application.

## Important

- Aucune modification n'est faite dans `Frontend` / `Backend` source.
- Pour recuperer les dernieres evolutions source dans DesktopPOS:

```bash
npm run prepare:standalone
```
