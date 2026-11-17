import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { SqliteDeliveryRepository } from './adapters/sqlite/sqlite-delivery-repository';
import { IngestController } from './adapters/http/ingest.controller';
import { ReportController } from './adapters/http/report.controller';
import { DeliveryRepository } from './application/ports';
import { ReconciliationService } from './application/reconciliation-service';
import { APP_CONFIG, AppConfig, loadConfig } from './config/app-config';

export const DELIVERY_REPOSITORY = Symbol('DELIVERY_REPOSITORY');

/** Composition root: the only place that knows which implementation backs each port. */
@Module({
  controllers: [IngestController, ReportController],
  providers: [
    { provide: APP_CONFIG, useFactory: () => loadConfig() },
    {
      provide: DELIVERY_REPOSITORY,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): DeliveryRepository => new SqliteDeliveryRepository(config.dbPath),
    },
    {
      provide: ReconciliationService,
      inject: [DELIVERY_REPOSITORY, APP_CONFIG],
      useFactory: (repository: DeliveryRepository, config: AppConfig) =>
        new ReconciliationService(repository, {
          cutoff: config.cutoff,
          fundingSlaMinutes: config.fundingSlaMinutes,
          payoutSlaMinutes: config.payoutSlaMinutes,
          maxSpread: config.maxSpread,
        }),
    },
  ],
  exports: [APP_CONFIG],
})
export class AppModule implements OnModuleDestroy {
  constructor(@Inject(DELIVERY_REPOSITORY) private readonly repository: DeliveryRepository) {}

  async onModuleDestroy(): Promise<void> {
    await this.repository.close();
  }
}
