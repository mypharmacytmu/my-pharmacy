import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { expect, it } from 'vitest';

it('發布檢查解碼圖檔、禁止歷史覆寫並允許停用及重新啟用', async () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'pharmacy-ci-'));
  try {
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: sandbox, encoding: 'utf8' });
    const path = join(sandbox, 'public', 'teaching');
    const write = (name: string, value: unknown) =>
      writeFileSync(join(path, name), JSON.stringify(value));
    const cli = (base?: string) =>
      spawnSync(
        process.execPath,
        [
          resolve('node_modules/tsx/dist/cli.mjs'),
          resolve('scripts/check-teaching.ts'),
          ...(base ? [base] : []),
        ],
        { cwd: sandbox, encoding: 'utf8' },
      );
    mkdirSync(join(path, 'versions'), { recursive: true });
    mkdirSync(join(path, 'images'), { recursive: true });
    const original = {
      schemaVersion: 1,
      title: 'Fixture',
      version: 'fixture',
      medicines: [
        {
          genericName: 'Sample',
          strength: '10 mg',
          dosageFormId: 'tablet',
          image: 'images/fixture.png',
        },
      ],
    };
    const writeIndex = (active: boolean) =>
      write('index.json', {
        schemaVersion: 1,
        codes: {
          OI01AB: { active, manifest: 'versions/fixture.json' },
        },
      });
    writeIndex(true);
    write('versions/fixture.json', original);
    const picture = await sharp({
      create: { width: 3, height: 3, channels: 3, background: '#499a70' },
    })
      .png()
      .toBuffer();
    writeFileSync(join(path, 'images/fixture.png'), picture);
    git('init', '-q');
    const first = cli();
    expect(first.status, first.stderr).toBe(0);
    git('add', '.');
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-qm',
      'Fixture',
    );
    const base = git('rev-parse', 'HEAD').trim();
    writeIndex(false);
    const disabled = cli(base);
    expect(disabled.status, disabled.stderr).toBe(0);
    writeIndex(true);
    expect(cli(base).status).toBe(0);
    write('versions/fixture.json', { ...original, title: 'Overwrite' });
    expect(cli(base).stderr).toContain('已發布的資源不得改寫');
    write('versions/fixture.json', original);
    writeFileSync(join(path, 'images/fixture.png'), 'invalid');
    expect(cli().status).not.toBe(0);
    expect(cli(base).stderr).toContain('已發布的資源不得改寫');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}, 30000);
