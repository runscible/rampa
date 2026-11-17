import { Controller, Get, Inject, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ReconciliationService } from '../../application/reconciliation-service';
import { AppConfig, APP_CONFIG } from '../../config/app-config';
import { balancesJson, breaksJson, ledgerJson, renderJsonReport } from '../report/json-report';
import { renderTextReport } from '../report/text-report';
import { CutoffPipe } from './cutoff.pipe';

/** Read side. Every endpoint takes an optional `?cutoff=` (ISO-8601 with offset); the default is the configured one. */
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
    return { asOf: instant, balances: balancesJson(result.balances) };
  }

  @Get('breaks')
  async breaks(@Query('cutoff', CutoffPipe) cutoff?: string) {
    const { instant, result } = await this.asOf(cutoff);
    const { timeZone } = this.config;
    return { asOf: instant, timeZone, breaks: breaksJson(result.breaks, timeZone) };
  }

  @Get('ledger')
  async ledger(@Query('cutoff', CutoffPipe) cutoff?: string) {
    const { instant, result } = await this.asOf(cutoff);
    return { asOf: instant, ledger: ledgerJson(result.ledger) };
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
