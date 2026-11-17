import { Break, BreakSeverity } from '../../domain/breaks/break';
import { ACCOUNT_CURRENCY, accountBalances, assertBalanced } from '../../domain/ledger/ledger';
import { formatInZone, Instant } from '../../domain/shared/time';
import { ReconcileResult } from '../../application/reconcile';
import { SourceParseError } from '../files/reconcile-files';

/** What a report is made from: the reconciliation, plus the rows of the input files that could not be read (if any). */
export type ReportInput = ReconcileResult & { parseErrors?: SourceParseError[] };

export interface ReportOptions {
  /** Report instant, as configured (ISO-8601 with offset). */
  cutoff: string;
  /** IANA zone used to display instants. */
  timeZone: string;
}

/** Adds thousands separators to a decimal string: "-2480.55" -> "-2,480.55". */
export function formatAmount(amount: string): string {
  const sign = amount.startsWith('-') ? '-' : '';
  const [integer, fraction] = amount.replace('-', '').split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${grouped}${fraction === undefined ? '' : `.${fraction}`}`;
}

const SEVERITIES: Array<{ severity: BreakSeverity; singular: string; plural: string }> = [
  { severity: 'BREAK', singular: 'break', plural: 'breaks' },
  { severity: 'REVIEW', singular: 'review', plural: 'reviews' },
  { severity: 'INFO', singular: 'info', plural: 'info' },
];

const pad = (text: string, width: number): string => text.padEnd(width);
const money = (amount: { toString(): string }, currency: string): string => `${formatAmount(amount.toString())} ${currency}`;

export function renderTextReport(result: ReportInput, options: ReportOptions): string {
  const parseErrors = result.parseErrors ?? [];
  const local = (instant: Instant): string => formatInZone(instant, options.timeZone).slice(0, 19).replace('T', ' ');
  const lines: string[] = [];
  const section = (title: string) => lines.push('', title);

  lines.push('RAMPA RECONCILIATION REPORT', `As of ${options.cutoff} (${options.timeZone})`);

  const b = result.balances;
  section('BALANCES');
  const balanceRows: Array<[string, string]> = [
    ['USDT sent, not yet converted', money(b.usdtUnconverted, 'USDT')],
    ['USDT converted', money(b.usdtConverted, 'USDT')],
    ['Bs funded', money(b.bsFunded, 'Bs')],
    ['Bs available at provider', money(b.bsAvailable, 'Bs')],
    ['Bs paid out', money(b.bsPaidOut, 'Bs')],
    ['Bs in pay-outs not final', money(b.bsInFlight, 'Bs')],
  ];
  for (const [label, value] of balanceRows) lines.push(`  ${pad(label, 30)}${value.padStart(24)}`);

  const counts = SEVERITIES.map(({ severity, singular, plural }) => {
    const n = result.breaks.filter((x) => x.severity === severity).length;
    return n === 0 ? '' : `${n} ${n === 1 ? singular : plural}`;
  }).filter(Boolean);
  section(`BREAKS (${counts.length === 0 ? 'none' : counts.join(', ')})`);
  for (const x of result.breaks) {
    const interval = x.until ? `[${local(x.at)} -> ${local(x.until)}] ` : '';
    lines.push(`  ${pad(x.severity, 8)}${pad(local(x.at), 21)}${pad(x.type, 26)}${x.subject}`, `    ${interval}${x.reason}`);
  }

  section('LEDGER ACCOUNTS (debit +, credit -)');
  const balances = accountBalances(result.ledger);
  for (const [account, currency] of Object.entries(ACCOUNT_CURRENCY)) {
    const balance = balances.get(account as keyof typeof ACCOUNT_CURRENCY);
    if (balance) lines.push(`  ${pad(account, 22)}${money(balance, currency === 'BS' ? 'Bs' : currency).padStart(26)}`);
  }
  let balanced = true;
  try {
    assertBalanced(result.ledger);
  } catch {
    balanced = false;
  }
  lines.push(`  Ledger balanced: ${balanced ? 'yes' : 'NO'} (${result.ledger.length} entries)`);

  section(`INPUT PROBLEMS (${parseErrors.length === 0 ? 'none' : parseErrors.length})`);
  for (const e of parseErrors) lines.push(`  ${pad(`${e.file}:${e.line}`, 30)}${e.reason}`);

  return `${lines.join('\n')}\n`;
}
