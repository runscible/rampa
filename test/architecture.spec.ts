import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', 'src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith('.ts') ? [path] : [];
  });
}

/** Local layer imports that a file's source pulls in. */
function importsOf(file: string, layer: string): string[] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]).filter((spec) => new RegExp(`(^|/)${layer}(/|$)`).test(spec));
}

describe('dependency rule: adapters -> application -> domain', () => {
  it('domain depends on nothing outside domain (no application, adapters, Nest)', () => {
    for (const file of files(join(SRC, 'domain'))) {
      expect([file, importsOf(file, 'application')]).toEqual([file, []]);
      expect([file, importsOf(file, 'adapters')]).toEqual([file, []]);
      expect(readFileSync(file, 'utf8')).not.toMatch(/from '@nestjs/);
    }
  });

  it('application does not depend on adapters or Nest', () => {
    for (const file of files(join(SRC, 'application'))) {
      expect([file, importsOf(file, 'adapters')]).toEqual([file, []]);
      expect(readFileSync(file, 'utf8')).not.toMatch(/from '@nestjs/);
    }
  });
});

describe('Nest is only the delivery mechanism', () => {
  const NEST_ALLOWED = [join(SRC, 'adapters', 'http'), join(SRC, 'app.module.ts'), join(SRC, 'main.ts')];

  it('is imported only by the HTTP adapter and the composition root', () => {
    const offenders = files(SRC).filter(
      (file) => /from '@nestjs\//.test(readFileSync(file, 'utf8')) && !NEST_ALLOWED.some((allowed) => file.startsWith(allowed)),
    );
    expect(offenders).toEqual([]);
  });
});

