# AppWin (Electron + Node)

Application Windows (Electron + Node) pour piloter l'agent d'impression local AxiaFlex via interface graphique.

## Prerequis

- Windows
- Node.js 20+
- Dossier `Agent/` present a la racine du projet (script `Agent/index.js`)

## Lancer en local

```bash
cd AppWin
npm install
npm start
```

## Fonctions V2

- Configuration des parametres agent:
  - `CLOUD_API_URL`
  - `AGENT_MASTER_TOKEN`
  - `TERMINAL_ALIAS`
  - `SITE_NAME`
  - `AGENT_POLL_MS`
- Sauvegarde locale de config dans `%APPDATA%` (userData Electron)
- Demarrage / arret de l'agent
- Logs en temps reel dans l'interface
- Installation / desinstallation du service Windows depuis l'UI
- Verification du statut du service Windows
- Detection des imprimantes locales
- Test impression sur imprimante selectionnee

## Build EXE (NSIS)

```bash
cd AppWin
npm install
npm run dist:win
```

Le setup est genere dans `AppWin/dist/`.

Si vous avez une erreur TLS type `bad record MAC` pendant le telechargement Electron:

```bash
npm run dist:win:safe
```

Ce mode:
- vide les caches download Electron
- desactive le telechargement multipart (plus stable)
- relance le build automatiquement

## Notes

- Cette version demarre un worker local `src/agent-worker.js` (independant de `Agent/index.js`).
- Pour installer/supprimer le service depuis l'UI, lancer AppWin en mode administrateur.
