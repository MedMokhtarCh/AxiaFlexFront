# PRODPOS Deployment

Ce dossier contient une configuration Docker **production** pour exposer:

- Frontend (internet)
- Backend API (internet)
- PostgreSQL (internet, optionnel - non recommande)

## 1) Preparer les variables

Copier le fichier d'exemple:

```bash
cp .env.prod.example .env.prod
```

Puis remplir les secrets dans `.env.prod`.

## 2) Construire et demarrer

Depuis la racine du projet (`d:\pos`):

```bash
docker compose -f PRODPOS/docker-compose.prod.yml --env-file PRODPOS/.env.prod up -d --build
```

## 3) Verifier

- Frontend: `http://<SERVER_IP>:8080`
- Backend: `http://<SERVER_IP>:3003`
- PostgreSQL: `tcp://<SERVER_IP>:5432` (si expose)

## 4) Arreter

```bash
docker compose -f PRODPOS/docker-compose.prod.yml --env-file PRODPOS/.env.prod down
```

## 5) Notes importantes

- Le service `db` est persiste dans le volume `prod_pgdata`.
- Exposer PostgreSQL sur Internet est risqué. Limitez via firewall/IP whitelist.
- Pour un vrai domaine + SSL, placez un reverse proxy (Nginx/Traefik/Caddy) devant.
