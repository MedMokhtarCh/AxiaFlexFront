import express from 'express';
import cors from 'cors';
import posRouter from './routes/pos.js';
import saasRouter from './routes/saas.js';
import fiscalRouter from './routes/fiscal.js';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './swagger.js';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { servePrintPage } from './services/printerService.js';
import * as nacefController from './controllers/nacefController.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '15mb' }));

  app.use((req: any, _res, next) => {
    if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
      if (req.body.auditUserId !== undefined && req.body.auditUserId !== null) {
        req.auditActorId = String(req.body.auditUserId).trim();
        delete req.body.auditUserId;
      }
      if (req.body.auditUserName !== undefined && req.body.auditUserName !== null) {
        req.auditActorName = String(req.body.auditUserName).trim();
        delete req.body.auditUserName;
      }
    }
    next();
  });

  const uploadsRoot = path.join(process.cwd(), 'uploads');
  const uploadsProducts = path.join(uploadsRoot, 'products');
  fs.mkdirSync(uploadsProducts, { recursive: true });
  
  // Configure multer for image uploads
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadsProducts);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  });
  
  // Filter for image files only
  const fileFilter = (req: any, file: any, cb: any) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  };
  
  app.use('/uploads', express.static(uploadsRoot));
  app.get('/openapi.json', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(swaggerSpec);
  });

  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'API POS — Documentation',
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'list',
        filter: true,
        tryItOutEnabled: true,
      },
    } as any),
  );
  
  // Make multer available for route handlers
  app.use((req: any, res: any, next) => {
    req.multerUpload = multer({ storage, fileFilter });
    next();
  });
  
  app.use('/pos', posRouter);
  app.use('/saas', saasRouter);
  app.use('/fiscal', fiscalRouter);
  app.get('/sic/external/manifest', nacefController.externalGetManifest);
  app.post('/sic/external/certificate/request', nacefController.externalRequestCertificate);
  app.post('/sic/external/sync/request', nacefController.externalSyncRequest);
  app.post('/sic/external/sign/request', nacefController.externalSignatureRequest);
  app.post('/sic/external/log', nacefController.externalLog);
  app.post('/sic/external/log/', nacefController.externalLog);

  // ── In-memory print preview endpoint ──────────────────────────────────────
  // Serves HTML registered by printerService.registerPrintPage().
  // The page auto-prints via window.print() in the browser.
  app.get('/print/preview/:token', (req: any, res: any) => {
    const html = servePrintPage(req.params.token);
    if (!html) {
      res.status(404).send('<h2>Page d\'impression expirée ou introuvable. Relancez l\'impression.</h2>');
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(html);
  });

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.get('/', (_req, res) => res.redirect(302, '/docs'));
  return app;
}
