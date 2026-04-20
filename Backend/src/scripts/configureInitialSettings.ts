import { AppDataSource } from '../data-source.js';
import { getSettings, saveSettings } from '../services/settingsService.js';

type CompanyType = 'FAST_FOOD' | 'RESTAURANT_CAFE' | 'SHOP_SINGLE' | 'SHOP_MULTI';

const allowedCompanyTypes: CompanyType[] = [
  'FAST_FOOD',
  'RESTAURANT_CAFE',
  'SHOP_SINGLE',
  'SHOP_MULTI',
];

function parseCompanyTypeArg(): CompanyType {
  const idx = process.argv.findIndex((arg) => arg === '--companyType');
  const raw = idx >= 0 ? String(process.argv[idx + 1] || '') : '';
  const value = raw.trim().toUpperCase() as CompanyType;
  if (allowedCompanyTypes.includes(value)) return value;
  return 'RESTAURANT_CAFE';
}

function defaultsForCompanyType(companyType: CompanyType) {
  if (companyType === 'FAST_FOOD') {
    return {
      companyType,
      roomDisplayMode: 'simple',
      clientKdsDisplayMode: 'STANDARD',
      cashClosingModePreference: 'INDEPENDENT',
    };
  }
  if (companyType === 'SHOP_SINGLE' || companyType === 'SHOP_MULTI') {
    return {
      companyType,
      roomDisplayMode: 'simple',
      clientKdsDisplayMode: 'STANDARD',
      cashClosingModePreference: 'INDEPENDENT',
      applyTimbreToTicket: false,
    };
  }
  return {
    companyType: 'RESTAURANT_CAFE',
    roomDisplayMode: 'plan',
    clientKdsDisplayMode: 'STANDARD',
    cashClosingModePreference: 'AUTO',
  };
}

async function main() {
  const companyType = parseCompanyTypeArg();
  await AppDataSource.initialize();
  try {
    await getSettings();
    await saveSettings(defaultsForCompanyType(companyType));
    console.log(`[settings:init] Type societe configure: ${companyType}`);
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error('[settings:init] Echec:', error);
  process.exit(1);
});
