# AxiaFlex Mobile

Application mobile client (précommandes) pour AxiaFlex POS.

## Démarrage

1. `cd MobileApp`
2. `npm install`
3. `npm run start`

## Fonctions MVP

- Inscription client (`/pos/preorders/auth/signup`)
- Connexion client (`/pos/preorders/auth/signin`)
- Consultation menu (`/pos/preorders/menu`)
- Création précommande (`/pos/preorders`)
- Historique précommandes (`/pos/preorders?preorderUserId=...`)

## Configuration API (émulateur)

Le projet lit `EXPO_PUBLIC_API_BASE_URL` depuis `.env`.

- Android Emulator: `http://10.0.2.2:3003`
- iOS Simulator: `http://localhost:3003`
- Web: `http://localhost:3003`

Pour Android émulateur, la config est déjà prête dans `.env`.
