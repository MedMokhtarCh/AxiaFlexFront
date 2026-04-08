## AxiaFlex Print Agent (Windows MVP)

Agent local pour relier un backend cloud aux imprimantes locales (USB/réseau installées sur Windows).

### Variables d'environnement

- `CLOUD_API_URL` (ex: `https://api.example.com`)
- `AGENT_MASTER_TOKEN` (doit matcher `Backend` -> `AGENT_MASTER_TOKEN`)
- `TERMINAL_ALIAS` (ex: `CAISSE-1`)
- `SITE_NAME` (ex: `Restaurant Centre`)
- `AGENT_POLL_MS` (optionnel, défaut `3000`)

### Démarrage manuel

```bash
cd Agent
set CLOUD_API_URL=https://your-cloud-api
set AGENT_MASTER_TOKEN=change-me
set TERMINAL_ALIAS=CAISSE-1
set SITE_NAME=SITE-A
npm start
```

### Installer en service Windows (auto-start)

Exécuter PowerShell **en administrateur**:

```powershell
cd Agent
.\install-service.ps1 `
  -CloudApiUrl "https://votre-api-cloud" `
  -AgentMasterToken "change-me" `
  -TerminalAlias "CAISSE-1" `
  -SiteName "SITE-A" `
  -PollMs 3000
```

Vérification:

```powershell
Get-Service AxiaFlexPrintAgent
```

Désinstaller:

```powershell
cd Agent
.\uninstall-service.ps1
```

### Déploiement multi-postes (modèle)

Un modèle prêt est fourni:

- `install-multi-terminals.example.ps1`

Procédure:

1. Copier le dossier `Agent` sur chaque machine (caisse/pc cuisine)
2. Ouvrir PowerShell administrateur
3. Adapter `CloudApiUrl`, `AgentMasterToken`, `SiteName`
4. Décommenter le bloc du poste (`TERMINAL-1`, `TERMINAL-2`, `KITCHEN-PC-1`)
5. Exécuter le script

### Option recommandée: setup dynamique (n'importe quel terminal)

Tu peux utiliser un seul installateur interactif:

- `setup-agent-interactive.cmd` (double-clic)
- ou `setup-agent-interactive.ps1`

Le setup te demande:

- URL API cloud
- `AGENT_MASTER_TOKEN`
- alias terminal (ex: `TERMINAL-1`, `CAISSE-2`, `KITCHEN-PC`)
- nom du site
- intervalle polling

Puis il installe ou met à jour le service automatiquement.
