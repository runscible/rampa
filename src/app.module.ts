import { Module } from '@nestjs/common';
import { APP_CONFIG, loadConfig } from './config/app-config';

@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => loadConfig() }],
  exports: [APP_CONFIG],
})
export class AppModule {}
