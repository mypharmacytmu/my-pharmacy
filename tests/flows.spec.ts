import { selectFirst3DSlot } from './shelf-interaction';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomFillSync } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { pathToFileURL } from 'node:url';

async function openOfflineDocument(page: Page, path: string) {
  if (process.env.PHARMACY_INLINE_OFFLINE) {
    await page.setContent(await readFile(path, 'utf8'));
  } else {
    await page.goto(pathToFileURL(path).href);
  }
}

async function fillMedicine(page: Page, name: string, strength = '500 mg') {
  await page.getByLabel('英文學名').fill(name);
  await page.getByLabel('劑量').fill(strength);
  await page.getByLabel(/^劑型/).selectOption('tablet');
}

test('首頁、個人藥品、七架、格位、離線成果與重置', async ({
  page,
  browser,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await expect(page.locator('.cover img')).toHaveJSProperty('complete', true);
  expect(
    await page
      .locator('.cover img')
      .evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath('01-home.png') });
  await page.getByRole('button', { name: '我要管理藥品' }).click();
  await page.getByRole('button', { name: /我要進貨/ }).click();
  await fillMedicine(page, 'Sample </script> A');
  await page.getByLabel('OTC／RX 分類').selectOption('RX');
  await page.getByRole('button', { name: '新增藥品' }).click();
  await expect(page.getByText('Sample </script> A')).toBeVisible();
  await page.screenshot({ path: info.outputPath('02-catalog.png') });
  await page.getByRole('button', { name: '返回首頁', exact: true }).click();
  await page.getByRole('button', { name: '進入我的藥局' }).click();
  await expect(page.locator('.scene canvas')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'OTC-01', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('03-pharmacy.png') });
  for (const id of ['OTC-03', 'OTC-04', 'OTC-05', 'RX-01', 'RX-02'])
    await page.getByRole('button', { name: `＋ ${id}`, exact: true }).click();
  await expect(page.locator('.position-list button')).toHaveCount(7);
  await page.screenshot({ path: info.outputPath('04-seven-racks.png') });
  await page.getByRole('button', { name: 'OTC-01', exact: true }).click();
  await page.getByRole('button', { name: '開啟 OTC-01 藥架' }).click();
  await page.getByLabel('藥架名稱').fill('教學架');
  await page.getByRole('button', { name: '儲存名稱' }).click();
  await page.getByRole('button', { name: '選擇', exact: true }).click();
  await selectFirst3DSlot(page);
  await expect(page.getByRole('status')).toContainText('處方藥');
  await expect(
    page.getByRole('heading', { name: 'Sample </script> A' }),
  ).toHaveCount(0);
  await selectFirst3DSlot(page);
  await expect(
    page.getByRole('heading', { name: 'Sample </script> A' }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('05-shelf.png') });
  await page.getByRole('button', { name: '返回總覽' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '下載 HTML 成果' }).click();
  const path = info.outputPath('share.html');
  await (await download).saveAs(path);
  expect(await readFile(path, 'utf8')).toContain(
    'Sample \\u003c/script\\u003e A',
  );
  await expect(page.getByRole('button', { name: '重新開始遊戲' })).toHaveCount(
    0,
  );
  const goHome = () =>
    page.getByRole('button', { name: '返回首頁', exact: true }).click();
  const goScene = () =>
    page.getByRole('button', { name: '進入我的藥局' }).click();
  await goHome();
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: '重新開始遊戲' }).click();
  await goScene();
  await expect(
    page.getByRole('button', { name: 'RX-02', exact: true }),
  ).toBeVisible();
  await goHome();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '重新開始遊戲' }).click();
  await goScene();
  await expect(
    page.getByRole('button', { name: '＋ RX-02', exact: true }),
  ).toBeVisible();
  const offline = await browser.newContext({
    offline: true,
    viewport: { width: 430, height: 850 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    const viewer = await offline.newPage();
    viewer.on('pageerror', (e) => errors.push(e.message));
    await openOfflineDocument(viewer, path);
    await expect(viewer.locator('canvas')).toBeVisible();
    await viewer
      .getByRole('button', { name: 'OTC-01 · 教學架', exact: true })
      .tap();
    await expect(
      viewer.getByRole('list', { name: '格位資訊' }).getByText('1 · Sample </script> A'),
    ).toBeVisible();
    await selectFirst3DSlot(viewer, true);
    await expect(
      viewer.getByRole('heading', { name: 'Sample </script> A' }),
    ).toBeVisible();
    await expect(viewer.getByRole('button', { name: '替換' })).toHaveCount(0);
    await viewer.screenshot({ path: info.outputPath('06-offline-share.png') });
  } finally {
    await offline.close();
  }
  expect(errors).toEqual([]);
});

test('管理草稿、發布 ZIP、進貨與隔離', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./admin/');
  await page.getByRole('button', { name: '新增教材藥品' }).click();
  await fillMedicine(page, 'Training Sample', '10 mg');
  await page.getByLabel('正面包裝圖片').setInputFiles({
    name: 'label.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+bN1sAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.getByLabel('圖片顯示')).toBeVisible();
  await page.getByLabel('圖片顯示').selectOption('contain');
  await page.getByRole('button', { name: '新增藥品', exact: true }).click();
  await page.getByLabel('主題名稱').fill('課堂練習');
  await page.getByLabel('主題代碼').fill('oi01ab');
  await page.getByRole('checkbox', { name: /Training Sample/ }).check();
  await page.getByRole('button', { name: '儲存主題草稿' }).click();
  await expect(page.getByRole('status')).toContainText('主題草稿已儲存');
  await page.reload();
  await page.getByRole('button', { name: '課堂練習' }).click();
  await expect(page.getByLabel('主題代碼')).toHaveValue('OI01AB');
  await page.getByRole('button', { name: '編輯', exact: true }).click();
  await expect(page.getByLabel('圖片顯示')).toHaveValue('contain');
  await expect(
    page.getByRole('button', { name: '自動配色', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '灰藍色', exact: true }).click();
  await page.screenshot({
    path: info.outputPath('07-admin.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: '儲存修改', exact: true }).click();
  await expect(
    page.getByText('Training Sample', { exact: true }).first(),
  ).toBeVisible();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '驗證並匯出發布包' }).click();
  const zip = unzipSync(
    new Uint8Array(await readFile((await (await downloading).path())!)),
  );
  const index = JSON.parse(strFromU8(zip['public/teaching/index.json']));
  expect(index.codes.OI01AB.active).toBe(true);
  const published = JSON.parse(
    strFromU8(zip[`public/teaching/${index.codes.OI01AB.manifest}`]),
  );
  expect(published.medicines[0].palette).toBe('slate');
  const paths = page.getByRole('region', { name: '本次發布包的 GitHub 路徑' });
  await expect(paths.getByText('public/teaching/index.json')).toBeVisible();
  await expect(paths.getByText(`public/teaching/${index.codes.OI01AB.manifest}`)).toBeVisible();
  await page.getByText('如何在 GitHub 網頁上傳教材', { exact: true }).click();
  await expect(page.getByText('public/teaching/public/teaching/', { exact: true })).toBeVisible();
  let active = true;
  await page.route('**/teaching/**', (route) => {
    const path =
      'public/teaching/' +
      new URL(route.request().url()).pathname.split('/teaching/')[1];
    if (path.endsWith('/index.json')) {
      return route.fulfill({
        json: {
          ...index,
          codes: { OI01AB: { ...index.codes.OI01AB, active } },
        },
      });
    }
    return route.fulfill({
      body: Buffer.from(zip[path]),
      contentType: path.endsWith('.json') ? 'application/json' : 'image/webp',
    });
  });
  await page.goto('./');
  await page.getByRole('button', { name: '我要管理藥品' }).click();
  await page.getByRole('button', { name: /從已知的代碼進貨/ }).click();
  await page.getByLabel('教材代碼').fill('oi01ab');
  await page.getByRole('button', { name: '預覽進貨' }).click();
  await expect(page.getByText('新增 1 項')).toBeVisible();
  await page.getByRole('button', { name: '確認進貨' }).click();
  await expect(page.getByRole('heading', { name: '進貨完成' })).toBeVisible();
  await page.getByRole('button', { name: '預覽進貨' }).click();
  await expect(page.getByText('重複品項，不可加入 1 項')).toBeVisible();
  active = false;
  await page.getByRole('button', { name: '預覽進貨' }).click();
  await expect(page.getByRole('alert')).toContainText('已停用');
  await page.reload();
  await page.getByRole('button', { name: '我要管理藥品' }).click();
  await expect(page.getByText('目前有 0 種藥品')).toBeVisible();
  await page.goto('./admin/');
  await expect(
    page.getByText('Training Sample', { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('離線手冊章節、搜尋、核取與複製備援', async ({ browser }) => {
  const context = await browser.newContext({ offline: true });
  try {
    const page = await context.newPage();
    await openOfflineDocument(page, process.cwd() + '/dist/ADMIN_GUIDE.html');
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: () => Promise.reject(new Error('Clipboard unavailable')),
        },
      });
    });
    await expect(page.locator('nav a')).toHaveCount(25);
    await page.getByLabel('搜尋章節').fill('原創素材');
    await expect(page.getByRole('heading', { name: /日常維護/ })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /GitHub 儲存庫/ }),
    ).toBeHidden();
    await page.locator('#c24 input').first().check();
    await expect(page.locator('#c24 input').first()).toBeChecked();
    await page
      .locator('#c24')
      .getByRole('button', { name: '複製本步 AI 求助' })
      .first()
      .click();
    await expect(page.locator('#manual')).toHaveValue(/先確認我實際看到的頁面/);
    await page.getByRole('button', { name: '關閉' }).click();
    await page.getByRole('button', { name: '複製完整開發 Prompt' }).click();
    await expect(page.locator('#manual')).toHaveValue(/正式開發執行指令/);
  } finally {
    await context.close();
  }
});

test('圖片尺寸、格式、裁切及無效內容', async ({ page }, info) => {
  const { default: sharp } = await import('sharp');
  await page.goto('./');
  await page.getByRole('button', { name: '我要管理藥品' }).click();
  await page.getByRole('button', { name: /我要進貨/ }).click();
  await fillMedicine(page, 'Image Sample');
  const field = page.getByLabel('正面包裝圖片');
  for (const [format, width, height] of [
    ['png', 2600, 1300],
    ['jpeg', 620, 1900],
    ['webp', 400, 400],
    ['png', 2048, 24],
    ['jpeg', 60, 40],
  ] as const) {
    const buffer = await sharp({
      create: { width, height, channels: 3, background: '#308960' },
    })
      .toFormat(format)
      .toBuffer();
    await field.setInputFiles({
      name: `sample.${format}`,
      mimeType: `image/${format}`,
      buffer,
    });
    await expect(page.getByLabel('圖片顯示')).toBeVisible();
    await page.getByRole('button', { name: '移除圖片' }).click();
  }
  const side = 1288;
  const nearLimit = await sharp(randomFillSync(Buffer.alloc(side * side * 3)), {
    raw: { width: side, height: side, channels: 3 },
  })
    .png()
    .toBuffer();
  expect(nearLimit.length).toBeGreaterThan(4_900_000);
  expect(nearLimit.length).toBeLessThanOrEqual(5_000_000);
  await field.setInputFiles({
    name: 'near-limit.png',
    mimeType: 'image/png',
    buffer: nearLimit,
  });
  await expect(page.getByLabel('圖片顯示')).toBeVisible();
  await page.getByRole('button', { name: '移除圖片' }).click();
  await field.setInputFiles({
    name: 'oversized.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(5_000_001),
  });
  await expect(page.getByRole('alert')).toContainText('5 MB');
  await field.setInputFiles({
    name: 'invalid.png',
    mimeType: 'image/png',
    buffer: Buffer.from('invalid'),
  });
  await expect(page.getByRole('alert')).toContainText('無法解碼');
  const buffer = await sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="2600" height="1300"><rect width="2600" height="1300" fill="#f7f5db"/><rect y="0" width="2600" height="300" fill="#356991"/><rect y="1070" width="2600" height="230" fill="#238267"/><text x="1300" y="635" text-anchor="middle" font-size="210" font-family="sans-serif" font-weight="bold" fill="#123554">Training</text><text x="1300" y="905" text-anchor="middle" font-size="140" font-family="sans-serif" fill="#238267">0.5 mg/mL</text></svg>',
    ),
  )
    .png()
    .toBuffer();
  await field.setInputFiles({
    name: 'sample.png',
    mimeType: 'image/png',
    buffer,
  });
  await expect(page.getByLabel('圖片顯示')).toBeVisible();
  await expect(page.getByLabel('圖片顯示')).toHaveValue('fill');
  const crop = page.locator('.crop-frame');
  await crop.scrollIntoViewIfNeeded();
  await expect(crop.locator('img')).toBeVisible();
  const rect = (await crop.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    rect.x + rect.width / 2 + 30,
    rect.y + rect.height / 2,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect(page.getByLabel('水平位置')).not.toHaveValue('0.5');
  await page.getByRole('button', { name: '重置裁切' }).click();
  await expect(page.getByLabel('水平位置')).toHaveValue('0.5');
  const touch = await page.context().newCDPSession(page);
  try {
    await touch.send('Emulation.setTouchEmulationEnabled', {
      enabled: true,
      maxTouchPoints: 1,
    });
    await crop.scrollIntoViewIfNeeded();
    const area = (await crop.boundingBox())!;
    const center = {
      x: Math.round(area.x + area.width / 2),
      y: Math.round(area.y + area.height / 2),
    };
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [center],
    });
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ ...center, x: center.x - 35 }],
    });
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await expect(page.getByLabel('水平位置')).not.toHaveValue('0.5');
  } finally {
    await touch.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await touch.detach();
  }
  await page.getByRole('button', { name: '重置裁切' }).click();
  await page.getByRole('button', { name: '紫色', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '紫色', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({
    path: info.outputPath('crop-box.png'),
    fullPage: true,
  });
  await page.getByLabel('3D 包裝模板').selectOption('bottle');
  await expect(crop).not.toHaveCSS('aspect-ratio', '0.6 / 1');
  await page.locator('.package-preview').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath('bottle-front.png'),
    fullPage: true,
  });
  const packageCanvas = (await page
    .locator('.package-preview canvas')
    .boundingBox())!;
  const center = {
    x: packageCanvas.x + packageCanvas.width / 2,
    y: packageCanvas.y + packageCanvas.height / 2,
  };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 38, center.y, { steps: 6 });
  await page.mouse.up();
  await page.screenshot({
    path: info.outputPath('bottle-side.png'),
    fullPage: true,
  });

  await page.getByRole('button', { name: '新增藥品', exact: true }).click();
  await page.getByRole('button', { name: '返回首頁', exact: true }).click();
  await page.getByRole('button', { name: '進入我的藥局' }).click();
  await page.getByRole('button', { name: 'OTC-01', exact: true }).click();
  await page.getByRole('button', { name: '開啟 OTC-01 藥架' }).click();
  await page.getByRole('button', { name: '選擇', exact: true }).click();
  await selectFirst3DSlot(page);
  await page.getByRole('button', { name: '返回總覽' }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '下載 HTML 成果' }).click();
  const download = await downloading;
  const html = await readFile((await download.path())!, 'utf8');
  const data = JSON.parse(html.match(/id="pharmacy-data">([^<]+)</)![1]);
  expect(data.catalog[0].crop.mode).toBe('fill');
  expect(data.catalog[0].palette).toBe('violet');
  expect(data.catalog[0].template).toBe('bottle');
  const img = await sharp(
    Buffer.from(data.catalog[0].image.split(',')[1], 'base64'),
  ).metadata();
  expect([img.width, img.height]).toEqual([2048, 1024]);
});

test('離開等待中的進貨並重置，舊請求不寫回', async ({ page }) => {
  let release!: () => void;
  let started!: () => void;
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  const response = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/teaching/index.json', async (route) => {
    started();
    await response;
    await route
      .fulfill({
        json: {
          schemaVersion: 1,
          codes: { OI01AB: { active: true, manifest: 'versions/demo.json' } },
        },
      })
      .catch(() => {});
  });
  await page.goto('./');
  await page.getByRole('button', { name: '我要管理藥品' }).click();
  await page.getByRole('button', { name: /從已知的代碼進貨/ }).click();
  await page.getByLabel('教材代碼').fill('OI01AB');
  await page.getByRole('button', { name: '預覽進貨' }).click();
  await requested;
  await page.getByRole('button', { name: '返回首頁', exact: true }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '重新開始遊戲' }).click();
  release();
  await page.getByRole('button', { name: '我要管理藥品' }).click();
  await expect(page.getByText('目前有 0 種藥品')).toBeVisible();
  await page.getByRole('button', { name: /從已知的代碼進貨/ }).click();
  await expect(page.getByRole('button', { name: '確認進貨' })).toHaveCount(0);
});

test('學名與商品名搜尋、整格替換及丟棄', async ({ page }) => {
  await page.goto('./');
  const manage = () =>
    page.getByRole('button', { name: '我要管理藥品' }).click();
  const home = () =>
    page.getByRole('button', { name: '返回首頁', exact: true }).click();
  await manage();
  await page.getByRole('button', { name: /我要進貨/ }).click();
  await fillMedicine(page, 'Alpha Example');
  await page.getByLabel('商品名').fill('Learning Label');
  await page.getByRole('button', { name: '橘色', exact: true }).click();
  await page.getByRole('button', { name: '新增藥品', exact: true }).click();
  const search = page.getByLabel('搜尋學名或商品名');
  for (const key of ['ALPHA', 'earning']) {
    await search.fill(key);
    await expect(
      page.getByText('Alpha Example', { exact: true }),
    ).toBeVisible();
  }
  await search.fill('absent');
  await expect(page.getByText('找不到符合的藥品。')).toBeVisible();
  await home();
  await manage();
  await page.getByRole('button', { name: /我要進貨/ }).click();
  await fillMedicine(page, 'Beta Example');
  await page.getByLabel('OTC／RX 分類').selectOption('OTC');
  await page.getByLabel('3D 包裝模板').selectOption('pouch');
  await page.getByRole('button', { name: '新增藥品', exact: true }).click();
  await home();
  await page.getByRole('button', { name: '進入我的藥局' }).click();
  await page.getByRole('button', { name: 'OTC-01', exact: true }).click();
  await page.getByRole('button', { name: '開啟 OTC-01 藥架' }).click();
  const row = (name: string) =>
    page.getByRole('listitem').filter({ hasText: name });
  await row('Alpha Example')
    .getByRole('button', { name: '選擇', exact: true })
    .click();
  await selectFirst3DSlot(page);
  await expect(page.getByRole('status')).toHaveText('這項藥品尚未分類。');
  await selectFirst3DSlot(page);
  await page.getByRole('button', { name: '替換', exact: true }).click();
  await row('Beta Example').getByRole('button', { name: '換成此藥品' }).click();
  await expect(
    page.locator('.slot-list').getByText('1 · Alpha Example', { exact: true }),
  ).toHaveCount(0);
  await selectFirst3DSlot(page);
  await page.getByRole('button', { name: '丟棄', exact: true }).click();
  await expect(
    page.locator('.slot-list').getByText('1 · 空', { exact: true }),
  ).toBeVisible();
  await expect(row('Beta Example')).toBeVisible();
});
