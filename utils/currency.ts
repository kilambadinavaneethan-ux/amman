/**
 * Rounds a monetary value to 2 decimal places using epsilon-compensated rounding,
 * preventing binary floating-point drift (e.g. 0.0000000002, -0.00000001, or -0).
 */
export const roundCurrency = (val: number | string | null | undefined): number => {
  const num = Number(val || 0);
  if (!Number.isFinite(num)) return 0;
  const epsilon = num >= 0 ? Number.EPSILON : -Number.EPSILON;
  const rounded = Math.round((num + epsilon) * 100) / 100;
  return rounded === 0 ? 0 : rounded;
};
