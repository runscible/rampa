import { createRatePoint, RatePoint } from '../../domain/rates/rate-table';
import { CsvRow, ParseError, parseTable } from './csv';

export interface ParsedRates {
  records: RatePoint[];
  errors: ParseError[];
}

const RATE_COLUMNS = ['timestamp', 'usdt_bs'];

/** Maps a CSV row to the domain: column names stay here, the rules live in createRatePoint. */
function toRatePoint({ values }: CsvRow): RatePoint {
  return createRatePoint({ timestamp: values.timestamp, rate: values.usdt_bs });
}

export function parseRates(csv: string): ParsedRates {
  return parseTable(csv, RATE_COLUMNS, toRatePoint);
}
