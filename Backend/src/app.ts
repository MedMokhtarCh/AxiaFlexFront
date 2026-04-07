import express from 'express';
import cors from 'cors';
import posRouter from './routes/pos.js';
import saasRouter from './routes/saas.js';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './swagger.js';
import path from 'path';
import fs from 'fs';
import multer from 'multer';

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
  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'API POS — Documentation',
    }),
  );
  
  // Make multer available for route handlers
  app.use((req: any, res: any, next) => {
    req.multerUpload = multer({ storage, fileFilter });
    next();
  });
  
  app.use('/pos', posRouter);
  app.use('/saas', saasRouter);

  app.get('/', (req, res) => res.json({ ok: true }));
  return app;
}
