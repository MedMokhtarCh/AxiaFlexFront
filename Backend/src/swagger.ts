import swaggerJSDoc from 'swagger-jsdoc';
import { openApiPaths } from './swagger/paths.js';

const port = process.env.PORT || '3001';

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
      { url: `http://localhost:${port}`, description: 'Backend local (PORT par défaut 3001)' },
      { url: '/', description: 'Même origine (proxy / production)' },
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
    ],
    paths: openApiPaths,
    components: {
      schemas: {
        ApiError: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            statusCode: { type: 'integer' },
          },
        },
      },
    },
  },
  apis: [],
});

export default swaggerSpec;
