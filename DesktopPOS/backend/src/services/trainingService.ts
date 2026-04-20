import { AppDataSource } from '../data-source.js';
import { TrainingProgress } from '../entity/TrainingProgress.js';

type TrainingStep = {
  id: string;
  title: string;
  description: string;
  targetTab?: string;
};

export type TrainingModule = {
  id: string;
  title: string;
  description: string;
  target: 'WEB_DESKTOP';
  steps: TrainingStep[];
};

export const TRAINING_MODULES: TrainingModule[] = [
  {
    id: 'getting-started',
    title: 'Demarrage POS',
    description: 'Prise en main rapide: connexion, navigation et ouverture caisse.',
    target: 'WEB_DESKTOP',
    steps: [
      {
        id: 'login-pin',
        title: 'Connexion',
        description: 'Connectez-vous avec votre PIN utilisateur.',
      },
      {
        id: 'open-shift',
        title: 'Ouverture shift',
        description: 'Ouvrez un shift pour votre poste.',
      },
      {
        id: 'open-session',
        title: 'Ouverture caisse',
        description: 'Ouvrez une session de caisse avec fond initial.',
        targetTab: 'cash',
      },
      {
        id: 'view-dashboard',
        title: 'Tableau de bord',
        description: 'Consultez les indicateurs globaux.',
        targetTab: 'dashboard',
      },
    ],
  },
  {
    id: 'pos-sales-flow',
    title: 'Cycle de vente complet',
    description: 'Creer, valider et encaisser une commande au POS.',
    target: 'WEB_DESKTOP',
    steps: [
      {
        id: 'select-mode',
        title: 'Choisir le mode',
        description: 'Selectionnez sur place, livraison ou a emporter.',
        targetTab: 'pos',
      },
      {
        id: 'create-order',
        title: 'Creation commande',
        description: 'Ajoutez des articles et verifiez le total.',
        targetTab: 'pos',
      },
      {
        id: 'validate-order',
        title: 'Validation',
        description: 'Validez la commande pour production.',
        targetTab: 'pos',
      },
      {
        id: 'collect-payment',
        title: 'Encaissement',
        description: 'Encaissez la commande avec le mode de paiement adapte.',
        targetTab: 'cash',
      },
    ],
  },
  {
    id: 'catalog-stock-basics',
    title: 'Catalogue et stock',
    description: 'Gerer les produits, categories et mouvements de stock.',
    target: 'WEB_DESKTOP',
    steps: [
      {
        id: 'manage-categories',
        title: 'Categories',
        description: 'Creez ou modifiez les categories.',
        targetTab: 'gestion-categories',
      },
      {
        id: 'manage-products',
        title: 'Articles',
        description: 'Ajoutez un article avec prix et visibilite POS.',
        targetTab: 'gestion-article',
      },
      {
        id: 'create-stock-movement',
        title: 'Mouvement stock',
        description: 'Saisissez une entree ou sortie de stock.',
        targetTab: 'gestion-stock',
      },
    ],
  },
];

const VALID_STATUS = new Set(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']);

export async function listTrainingModules() {
  return TRAINING_MODULES;
}

export async function listTrainingProgressByUser(userIdRaw: string) {
  const userId = String(userIdRaw || '').trim();
  if (!userId) throw new Error('Utilisateur invalide');
  const repo = AppDataSource.getRepository(TrainingProgress);
  return await repo.find({
    where: { userId } as any,
    order: { updatedAt: 'DESC' } as any,
  });
}

export async function upsertTrainingProgress(
  userIdRaw: string,
  moduleIdRaw: string,
  payload: {
    status?: string;
    currentStepIndex?: number;
    completedStepIds?: string[];
    score?: number;
    startedAt?: number | null;
    completedAt?: number | null;
  },
) {
  const userId = String(userIdRaw || '').trim();
  const moduleId = String(moduleIdRaw || '').trim();
  if (!userId) throw new Error('Utilisateur invalide');
  if (!moduleId) throw new Error('Module invalide');

  const module = TRAINING_MODULES.find((m) => m.id === moduleId);
  if (!module) throw new Error('Module introuvable');

  const statusRaw = String(payload?.status || '').trim().toUpperCase();
  const _status = VALID_STATUS.has(statusRaw) ? statusRaw : undefined;
  const currentStepIndex = Math.max(
    0,
    Math.min(module.steps.length, Math.floor(Number(payload?.currentStepIndex ?? 0))),
  );
  const completedStepIds = Array.isArray(payload?.completedStepIds)
    ? Array.from(
        new Set(
          payload.completedStepIds
            .map((v) => String(v || '').trim())
            .filter(Boolean)
            .filter((id) => module.steps.some((s) => s.id === id)),
        ),
      )
    : undefined;
  const _score = Math.max(0, Math.min(100, Math.floor(Number(payload?.score ?? 0))));
  const now = Date.now();

  const repo = AppDataSource.getRepository(TrainingProgress);
  const existing = (await repo.findOneBy({ userId } as any)) as TrainingProgress | null;
  const existingPayload = (existing?.payload || {}) as {
    activeModuleId?: string;
    activeStep?: number;
    doneByModule?: Record<string, number[]>;
  };
  const doneByModule = { ...(existingPayload.doneByModule || {}) };

  const mergedCompletedStepIds = completedStepIds
    ? completedStepIds
    : Array.isArray(doneByModule[moduleId])
      ? doneByModule[moduleId]
      : [];
  const completedIndexes = mergedCompletedStepIds
    .map((id) => module.steps.findIndex((s) => s.id === id))
    .filter((idx) => idx >= 0);

  doneByModule[moduleId] = completedIndexes;

  const row = repo.create({
    ...(existing || {}),
    userId,
    payload: {
      ...existingPayload,
      activeModuleId: moduleId,
      activeStep: currentStepIndex,
      doneByModule,
    },
    updatedAt: now,
  });
  return await repo.save(row as any);
}
