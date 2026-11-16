export interface AppConfig {
  /** IANA time zone used to interpret/display local times (instants are always UTC internally). */
  timeZone: string;
  /** Report state as of this instant (ISO-8601 with offset). */
  cutoff: string;
  /** Max minutes between an on-chain deposit and its funding webhook. */
  fundingSlaMinutes: number;
  /** Max minutes between a pay-out CONFIRM and its terminal event. */
  payoutSlaMinutes: number;
  /** Max provider spread vs. the reference rate, as a decimal string (0.005 = 0.5%). */
  maxSpread: string;
  /** Decimal places kept for FX rates. */
  rateDecimals: number;
  /** SQLite file path, or ':memory:'. */
  dbPath: string;
}

export const DEFAULT_CONFIG: AppConfig = {
  timeZone: 'America/La_Paz',
  cutoff: '2026-10-05T20:00:00-04:00',
  fundingSlaMinutes: 10,
  payoutSlaMinutes: 15,
  maxSpread: '0.005',
  rateDecimals: 6,
  dbPath: ':memory:',
};

export const APP_CONFIG = Symbol('APP_CONFIG');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    timeZone: env.RECON_TIME_ZONE ?? DEFAULT_CONFIG.timeZone,
    cutoff: env.RECON_CUTOFF ?? DEFAULT_CONFIG.cutoff,
    fundingSlaMinutes: Number(env.RECON_FUNDING_SLA_MINUTES ?? DEFAULT_CONFIG.fundingSlaMinutes),
    payoutSlaMinutes: Number(env.RECON_PAYOUT_SLA_MINUTES ?? DEFAULT_CONFIG.payoutSlaMinutes),
    maxSpread: env.RECON_MAX_SPREAD ?? DEFAULT_CONFIG.maxSpread,
    rateDecimals: Number(env.RECON_RATE_DECIMALS ?? DEFAULT_CONFIG.rateDecimals),
    dbPath: env.RECON_DB_PATH ?? DEFAULT_CONFIG.dbPath,
  };
}
