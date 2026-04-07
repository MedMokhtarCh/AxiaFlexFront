const aliases: Record<string, string> = {
  g: 'g',
  gram: 'g',
  grams: 'g',
  gr: 'g',
  kg: 'kg',
  kilo: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  ml: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  l: 'l',
  liter: 'l',
  liters: 'l',
  litre: 'l',
  litres: 'l',
  piece: 'piece',
  pieces: 'piece',
  pcs: 'piece',
  pc: 'piece',
  unit: 'piece',
  units: 'piece',
};

type UnitCategory = 'mass' | 'volume' | 'count';

const unitCategory: Record<string, UnitCategory> = {
  g: 'mass',
  kg: 'mass',
  ml: 'volume',
  l: 'volume',
  piece: 'count',
};

const toBaseFactor: Record<string, number> = {
  g: 1,
  kg: 1000,
  ml: 1,
  l: 1000,
  piece: 1,
};

export function normalizeUnit(unit: string | null | undefined): string {
  const raw = String(unit || '').trim().toLowerCase();
  if (!raw) return 'piece';
  return aliases[raw] || raw;
}

export function canConvertUnits(fromUnit: string, toUnit: string): boolean {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (from === to) return true;
  const fromCategory = unitCategory[from];
  const toCategory = unitCategory[to];
  return Boolean(fromCategory && toCategory && fromCategory === toCategory);
}

export function convertQuantity(value: number, fromUnit: string, toUnit: string): number {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (!Number.isFinite(value)) return 0;
  if (from === to) return value;

  const fromCategory = unitCategory[from];
  const toCategory = unitCategory[to];
  if (!fromCategory || !toCategory || fromCategory !== toCategory) {
    throw new Error(`Cannot convert unit ${from} to ${to}`);
  }

  const fromFactor = toBaseFactor[from];
  const toFactor = toBaseFactor[to];
  if (!fromFactor || !toFactor) {
    throw new Error(`Unsupported unit conversion ${from} to ${to}`);
  }

  const baseValue = value * fromFactor;
  return baseValue / toFactor;
}
