import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { APP_CONFIG, AppConfig, DEFAULT_CONFIG, loadConfig } from '../src/config/app-config';

describe('application wiring', () => {
  it('boots the Nest application context and exposes the config', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const config = moduleRef.get<AppConfig>(APP_CONFIG);
    expect(config.timeZone).toBe('America/La_Paz');
    expect(config.cutoff).toBe('2026-10-05T20:00:00-04:00');
  });

  it('loads config overrides from the environment', () => {
    const config = loadConfig({ RECON_TIME_ZONE: 'America/Argentina/Buenos_Aires' });
    expect(config.timeZone).toBe('America/Argentina/Buenos_Aires');
    expect(config.maxSpread).toBe(DEFAULT_CONFIG.maxSpread);
  });
});
