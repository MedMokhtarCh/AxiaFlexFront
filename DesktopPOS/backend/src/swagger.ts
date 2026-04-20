import 'dotenv/config';
import swaggerJSDoc from 'swagger-jsdoc';
import { openApiPaths } from './swagger/paths.js';

const port = String(process.env.PORT || '3001');

const swaggerSpec = swaggerJSDoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'POS Backend API',
      version: '1.0.0',
      description:
        'Documentation OpenAPI du backend caisse / POS. ' +
        'Interface Swagger UI : **GET /docs**. ' +
        'Les schémas de corps (request/response) peuvent être complétés au fil des besoins ; les routes listées correspondent au routeur Express.',
    },
    servers: [
      {
        url: `http://localhost:${port}`,
        description: `Backend local (variable PORT dans .env, défaut Node 3001)`,
      },
      { url: `http://127.0.0.1:${port}`, description: 'Loopback IPv4' },
      { url: '/', description: 'Même origine que cette page (Swagger UI)' },
    ],
    tags: [
      { name: 'Auth', description: 'Authentification caisse' },
      { name: 'Session', description: 'Session de caisse' },
      { name: 'Shifts', description: 'Shifts utilisateurs' },
      { name: 'Funds', description: 'Fonds / caisses multiples' },
      { name: 'FundSessions', description: 'Sessions de fond' },
      { name: 'Users', description: 'Utilisateurs' },
      { name: 'Products', description: 'Produits' },
      { name: 'Categories', description: 'Catégories' },
      { name: 'Recipes', description: 'Recettes / nomenclature' },
      { name: 'Orders', description: 'Commandes' },
      { name: 'Tickets', description: 'Tickets de caisse et PDF' },
      { name: 'Payments', description: 'Paiements partiels' },
      { name: 'PaymentInstruments', description: 'Cartes prépayées, bons, tests externes' },
      { name: 'Clients', description: 'Clients (facturation)' },
      { name: 'Suppliers', description: 'Fournisseurs' },
      { name: 'Invoices', description: 'Factures' },
      { name: 'Zones', description: 'Zones du plan de salle' },
      { name: 'Tables', description: 'Tables et réservations' },
      { name: 'ClientPortal', description: 'API commande client (QR)' },
      { name: 'Printers', description: 'Imprimantes' },
      { name: 'Promotions', description: 'Promotions' },
      { name: 'Settings', description: 'Paramètres et médias' },
      { name: 'Stock', description: 'Stock, entrepôts, documents' },
      { name: 'StockReports', description: 'Rapports de stock' },
      { name: 'Reports', description: 'Rapports ventes / caisse / clients' },
      { name: 'SaaS', description: 'Licence et administration SaaS' },
      { name: 'Preorders', description: 'Précommandes client (app mobile / web)' },
    ],
    paths: openApiPaths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'token',
          description: 'Jeton renvoyé par POST /pos/preorders/auth/signin (champ `token`).',
        },
      },
      schemas: {
        ApiError: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            statusCode: { type: 'integer' },
          },
        },
        PreorderError: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
        PreorderSignupBody: {
          type: 'object',
          required: ['fullName', 'email', 'password'],
          properties: {
            fullName: { type: 'string', example: 'Jean Dupont' },
            email: { type: 'string', format: 'email' },
            password: { type: 'string', format: 'password', minLength: 4 },
            phone: { type: 'string', example: '+216 XX XXX XXX' },
          },
        },
        PreorderSigninBody: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', format: 'password' },
          },
        },
        PreorderSigninResponse: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            fullName: { type: 'string' },
            phone: { type: 'string', nullable: true },
            token: { type: 'string' },
          },
        },
        PreorderCreateBody: {
          type: 'object',
          required: ['customerName', 'mode', 'items'],
          properties: {
            customerName: { type: 'string' },
            customerPhone: { type: 'string', nullable: true },
            preorderUserId: { type: 'string', nullable: true },
            mode: {
              type: 'string',
              enum: ['DELIVERY', 'PICKUP', 'DINE_LATER'],
              example: 'PICKUP',
            },
            scheduledAt: { type: 'integer', format: 'int64', nullable: true },
            note: { type: 'string', nullable: true },
            items: {
              type: 'array',
              items: {
                type: 'object',
                required: ['productId', 'quantity'],
                properties: {
                  productId: { type: 'string' },
                  quantity: { type: 'number', minimum: 1 },
                  note: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
        PreorderStatusBody: {
          type: 'object',
          required: ['status'],
          properties: {
            status: {
              type: 'string',
              enum: ['PENDING', 'CONFIRMED', 'READY', 'COMPLETED', 'CANCELLED'],
            },
          },
        },
      },
    },
  },
  apis: [],
});

export default swaggerSpec;
