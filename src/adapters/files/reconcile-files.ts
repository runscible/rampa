import { reconcile, ReconcileConfig, ReconcileResult } from '../../application/reconcile';
import { ParseError } from './csv';
import { parseDeposits } from './parse-deposits';
import { parseFundingEvents } from './parse-funding';
import { parsePayoutEvents } from './parse-payouts';

/** Source file names, as they appear in parse-error reports. */
const FILE_NAMES = {
  deposits: 'usdt_deposits.csv',
  fundingWebhooks: 'funding_webhooks.json',
  payoutEvents: 'payout_events.json',
} as const;

/** Raw contents of the source files. */
export interface FileInput {
  /** FILE_NAMES.deposits */
  deposits: string;
  /** FILE_NAMES.fundingWebhooks */
  fundingWebhooks?: string;
  /** FILE_NAMES.payoutEvents */
  payoutEvents?: string;
}

export interface SourceParseError extends ParseError {
  file: string;
}

export interface FileReconcileResult extends ReconcileResult {
  parseErrors: SourceParseError[];
}

const tagged = (file: string, errors: ParseError[]): SourceParseError[] => errors.map((e) => ({ file, ...e }));

/** Inbound adapter: parses the files, runs the use case, and surfaces bad rows instead of dropping them. */
export function reconcileFiles(files: FileInput, config: ReconcileConfig): FileReconcileResult {
  const deposits = parseDeposits(files.deposits);
  const funding = parseFundingEvents(files.fundingWebhooks ?? '[]');
  const payouts = parsePayoutEvents(files.payoutEvents ?? '[]');
  return {
    ...reconcile({ deposits: deposits.records, fundingEvents: funding.records, payoutEvents: payouts.records }, config),
    parseErrors: [
      ...tagged(FILE_NAMES.deposits, deposits.errors),
      ...tagged(FILE_NAMES.fundingWebhooks, funding.errors),
      ...tagged(FILE_NAMES.payoutEvents, payouts.errors),
    ],
  };
}
