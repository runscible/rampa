import { reconcile, ReconcileConfig, ReconcileResult } from '../../application/reconcile';
import { ParseError } from './csv';
import { parseDeposits } from './parse-deposits';
import { parseFundingEvents } from './parse-funding';
import { parsePayoutEvents } from './parse-payouts';

/** Raw contents of the source files. */
export interface FileInput {
  /** usdt_deposits.csv */
  deposits: string;
  /** funding_webhooks.json */
  fundingWebhooks?: string;
  /** payout_events.json */
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
      ...tagged('usdt_deposits.csv', deposits.errors),
      ...tagged('funding_webhooks.json', funding.errors),
      ...tagged('payout_events.json', payouts.errors),
    ],
  };
}
