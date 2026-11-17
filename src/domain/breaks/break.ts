import { Instant } from '../shared/time';

export type BreakSeverity = 'BREAK' | 'REVIEW' | 'INFO';

/** Severity of each kind of finding: BREAK does not reconcile, REVIEW needs a human look, INFO is informational. */
const SEVERITY = {
  SPREAD_EXCEEDED: 'BREAK',
  LATE_FUNDING_WEBHOOK: 'BREAK',
  DEPOSIT_WITHOUT_WEBHOOK: 'BREAK',
  UNKNOWN_DEPOSIT: 'BREAK',
  AMOUNT_MISMATCH: 'BREAK',
  AMOUNT_BS_MISMATCH: 'BREAK',
  DOUBLE_FUNDING: 'BREAK',
  STUCK_PAYOUT: 'BREAK',
  PAYOUT_AMOUNT_MISMATCH: 'BREAK',
  REVERSAL_WITHOUT_COMPLETED: 'BREAK',
  ILLEGAL_TRANSITION: 'BREAK',
  NEGATIVE_BALANCE: 'BREAK',
  EVENT_CONFLICT: 'BREAK',
  MISSING_REFERENCE_RATE: 'REVIEW',
  PAYOUT_REVERSED: 'REVIEW',
  INCOMPLETE_PAYOUT_CHAIN: 'REVIEW',
  DUPLICATE_DELIVERY: 'INFO',
  UNCONFIRMED_PREVIEW: 'INFO',
} as const satisfies Record<string, BreakSeverity>;

export type BreakType = keyof typeof SEVERITY;

/** Something that does not reconcile or needs a human look. */
export interface Break {
  /** Deterministic: the same inputs always produce the same ids. */
  id: string;
  type: BreakType;
  severity: BreakSeverity;
  /** Id of the thing the break is about (event id, payout id, tx hash, ...). */
  subject: string;
  reason: string;
  /** When the problem happened (used to order the report). */
  at: Instant;
  /** End of the problem when it spans an interval; absent for point events and for intervals still open at the cutoff. */
  until?: Instant;
}

interface BreakExtras {
  until?: Instant;
  /** Overrides what the id is built from when the subject alone does not identify the break. */
  idKey?: string;
}

export function createBreak(type: BreakType, subject: string, reason: string, at: Instant, extras: BreakExtras = {}): Break {
  const base: Break = { id: `${type}:${extras.idKey ?? subject}`, type, severity: SEVERITY[type], subject, reason, at };
  return extras.until === undefined ? base : { ...base, until: extras.until };
}

/** Limits the rules check against. Configurable; these are the provider's documented service levels. */
export interface BreakThresholds {
  /** Max minutes between an on-chain deposit and its funding webhook. */
  fundingSlaMinutes: number;
  /** Max minutes between a pay-out CONFIRM and its terminal event. */
  payoutSlaMinutes: number;
  /** Max provider spread vs. the reference rate, as a decimal string (0.005 = 0.5%). */
  maxSpread: string;
}

export const DEFAULT_THRESHOLDS: BreakThresholds = { fundingSlaMinutes: 10, payoutSlaMinutes: 15, maxSpread: '0.005' };
