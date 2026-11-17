import Decimal from 'decimal.js';

/** Isolated Decimal constructor so we never depend on (or mutate) global Decimal config. */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type D = InstanceType<typeof D>;
