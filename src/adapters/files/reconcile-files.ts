import { reconcile, ReconcileConfig, ReconcileResult } from '../../application/reconcile';
import { ParseError } from './csv';
import { parseDeposits } from './parse-deposits';

/** Raw contents of the source files. */
export interface FileInput {
  /** usdt_deposits.csv */
  deposits: string;
}

export interface SourceParseError extends ParseError {
  file: string;
}

export interface FileReconcileResult extends ReconcileResult {
  parseErrors: SourceParseError[];
}

/** Inbound adapter: parses the files, runs the use case, and surfaces bad rows instead of dropping them. */
export function reconcileFiles(files: FileInput, config: ReconcileConfig): FileReconcileResult {
  const { records, errors } = parseDeposits(files.deposits);
  return {
    ...reconcile({ deposits: records }, config),
    parseErrors: errors.map((e) => ({ file: 'usdt_deposits.csv', ...e })),
  };
}
