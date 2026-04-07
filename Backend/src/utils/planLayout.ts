/** Valeurs 0–100 pour le plan de salle (pourcentages du canevas). */

export const clampPlanPercent = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, n));
};

export const optionalPlanPercent = (
  value: unknown,
): number | null | undefined => {
  if (value === undefined) return undefined;
  return clampPlanPercent(value);
};
