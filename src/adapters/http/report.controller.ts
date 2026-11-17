import { BadRequestException, Controller, Get, Inject, NotFoundException, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ReconciliationService } from '../../application/reconciliation-service';
import { AppConfig, APP_CONFIG } from '../../config/app-config';
import { PAYOUT_STATES } from '../../domain/payouts/payout-state';
import { balancesJson, breaksJson, ledgerJson, renderJsonReport } from '../report/json-report';
import { depositViewJson, payoutViewJson } from '../report/operations-json';
import { renderTextReport } from '../report/text-report';
import { CutoffPipe } from './cutoff.pipe';

/** Read side. Every endpoint takes an optional `?cutoff=` (ISO-8601 with offset); the default is the configured one. */
const PAYOUT_STATE_FILTERS: readonly string[] = [...PAYOUT_STATES, 'UNKNOWN'];

@Controller()
export class ReportController {
  constructor(
    private readonly service: ReconciliationService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Runs the reconciliation as of the requested cutoff (or the configured one) and says which instant that was. */
  private async asOf(cutoff?: string) {
    const instant = cutoff ?? this.config.cutoff;
    return { instant, result: await this.service.report(instant) };
  }

  @Get('balances')
  async balances(@Query('cutoff', CutoffPipe) cutoff?: string) {
    const { instant, result } = await this.asOf(cutoff);
    return { asOf: instant, version: result.version, status: result.status, balances: balancesJson(result.balances) };
  }

  @Get('breaks')
  async breaks(@Query('cutoff', CutoffPipe) cutoff?: string) {
    const { instant, result } = await this.asOf(cutoff);
    const { timeZone } = this.config;
    return { asOf: instant, version: result.version, status: result.status, breakCounts: result.breakCounts, timeZone, breaks: breaksJson(result.breaks, timeZone) };
  }

  @Get('ledger')
  async ledger(@Query('cutoff', CutoffPipe) cutoff?: string) {
    const { instant, result } = await this.asOf(cutoff);
    return { asOf: instant, version: result.version, ledger: ledgerJson(result.ledger) };
  }

  /** One pay-out: state, every event received (applied or not, and why), missing steps, money moved, its breaks. */
  @Get('payouts/:payoutId')
  async payout(@Param('payoutId') payoutId: string, @Query('cutoff', CutoffPipe) cutoff?: string) {
    const { instant, result } = await this.asOf(cutoff);
    const view = result.operations.payouts.find((p) => p.payoutId === payoutId);
    if (!view) throw new NotFoundException(`No events for pay-out ${payoutId} as of ${instant}`);
    return { asOf: instant, version: result.version, timeZone: this.config.timeZone, payout: payoutViewJson(view, this.config.timeZone) };
  }

  /** Every pay-out, optionally only those in one state (`?state=CONFIRMED` finds what is still in flight). */
  @Get('payouts')
  async payouts(@Query('state') state?: string, @Query('cutoff', CutoffPipe) cutoff?: string) {
    if (state !== undefined && !PAYOUT_STATE_FILTERS.includes(state)) {
      throw new BadRequestException(`Invalid state ${JSON.stringify(state)}: use one of ${PAYOUT_STATE_FILTERS.join(', ')}`);
    }
    const { instant, result } = await this.asOf(cutoff);
    const views = result.operations.payouts.filter((p) => state === undefined || p.state === state);
    return { asOf: instant, version: result.version, timeZone: this.config.timeZone, payouts: views.map((p) => payoutViewJson(p, this.config.timeZone)) };
  }

  /** One deposit: what came in, every webhook that converted it and what they credited, its breaks. */
  @Get('deposits/:txHash')
  async deposit(@Param('txHash') txHash: string, @Query('cutoff', CutoffPipe) cutoff?: string) {
    const { instant, result } = await this.asOf(cutoff);
    const view = result.operations.deposits.find((d) => d.txHash === txHash);
    if (!view) throw new NotFoundException(`Nothing known about deposit ${txHash} as of ${instant}`);
    return { asOf: instant, version: result.version, timeZone: this.config.timeZone, deposit: depositViewJson(view, this.config.timeZone) };
  }

  /** The whole report: JSON by default, plain text with `Accept: text/plain`. */
  @Get('report')
  async report(@Res() res: Response, @Query('cutoff', CutoffPipe) cutoff?: string): Promise<void> {
    const { instant, result } = await this.asOf(cutoff);
    const options = { cutoff: instant, timeZone: this.config.timeZone };
    const json = (): void => void res.type('application/json').send(renderJsonReport(result, options));
    res.format({
      'application/json': json,
      'text/plain': () => void res.send(renderTextReport(result, options)),
      default: json,
    });
  }
}
