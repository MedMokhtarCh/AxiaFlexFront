import { RestaurantSettings } from '../entity/RestaurantSettings.js';

type PrefixKind =
  | 'order'
  | 'ticket'
  | 'invoice'
  | 'client'
  | 'stockDocument'
  | 'product'
  | 'supplier';

const config: Record<
  PrefixKind,
  {
    prefixKey: keyof RestaurantSettings;
    sequenceKey: keyof RestaurantSettings;
    fallbackPrefix: string;
  }
> = {
  ticket: {
    prefixKey: 'ticketPrefix',
    sequenceKey: 'ticketSequence',
    fallbackPrefix: 'TK-',
  },
  order: {
    prefixKey: 'orderPrefix',
    sequenceKey: 'orderSequence',
    fallbackPrefix: 'ORD-',
  },
  invoice: {
    prefixKey: 'invoicePrefix',
    sequenceKey: 'invoiceSequence',
    fallbackPrefix: 'INV-',
  },
  client: {
    prefixKey: 'clientPrefix',
    sequenceKey: 'clientSequence',
    fallbackPrefix: 'CLI-',
  },
  stockDocument: {
    prefixKey: 'stockDocumentPrefix',
    sequenceKey: 'stockDocumentSequence',
    fallbackPrefix: 'SD-',
  },
  product: {
    prefixKey: 'productPrefix',
    sequenceKey: 'productSequence',
    fallbackPrefix: 'ART-',
  },
  supplier: {
    prefixKey: 'supplierPrefix' as any,
    sequenceKey: 'supplierSequence' as any,
    fallbackPrefix: 'SUP-',
  },
};

const normalizePrefix = (value: unknown, fallbackPrefix: string) => {
  const text = String(value ?? '').trim().slice(0, 20);
  return text || fallbackPrefix;
};

export async function generateNextPrefixedCode(
  manager: any,
  kind: PrefixKind,
  options?: { pad?: number },
) {
  const pad = Number(options?.pad ?? 6) || 6;
  const settingsRepo = manager.getRepository(RestaurantSettings);

  let settings = await settingsRepo.findOne({ where: {} as any });
  if (!settings) {
    settings = settingsRepo.create({} as any);
    settings = await settingsRepo.save(settings as any);
  }

  const { prefixKey, sequenceKey, fallbackPrefix } = config[kind];
  const nextPrefix = normalizePrefix((settings as any)[prefixKey], fallbackPrefix);
  const nextSequence = (Number((settings as any)[sequenceKey] || 0) || 0) + 1;

  (settings as any)[prefixKey] = nextPrefix;
  (settings as any)[sequenceKey] = nextSequence;
  await settingsRepo.save(settings as any);

  return `${nextPrefix}${String(nextSequence).padStart(pad, '0')}`;
}
