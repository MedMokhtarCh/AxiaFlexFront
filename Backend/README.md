# POS Backend

Express + TypeORM backend for the POS app using PostgreSQL.

Quick start:

1. Copy `.env.example` to `.env` and adjust if needed.
2. Start Postgres with Docker Compose:

```bash
cd Backend
docker-compose up -d
```

3. Install and run the backend:

```bash
npm install
npm run dev
```

Endpoints (example):

- `GET /pos/products`
- `GET /pos/orders`
- `POST /pos/orders`
- `POST /pos/auth/login` (pin `1234` or `0000`)
- `GET /pos/session`
- `POST /pos/session/open`
