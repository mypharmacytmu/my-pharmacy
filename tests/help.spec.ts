import { selectFirst3DSlot } from './shelf-interaction';
import { expect, test } from '@playwright/test';

test('首頁桌面及手機依序顯示管理和藥局入口，維持正確導覽', async ({
  page,
  browser,
}, info) => {
  await page.goto('./');
  const destinations = ['我要管理藥品', '進入我的藥局'];
  const actions = page.locator('.home-actions button');
  await expect(actions).toHaveText([destinations[0], /進入我的藥局/]);
  await expect(page.getByText('先進貨，再開始上架吧！')).toBeVisible();
  const first = (await actions.nth(0).boundingBox())!;
  const second = (await actions.nth(1).boundingBox())!;
  expect(first.x).toBeLessThan(second.x);
  expect(first.y).toBe(second.y);
  await page.screenshot({ path: info.outputPath('home-desktop.png') });
  await page.getByRole('button', { name: '遊戲說明' }).click();
  await expect(page.getByRole('dialog', { name: '遊戲說明' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: destinations[0] }).click();
  await expect(
    page.getByRole('heading', { name: '管理藥品', exact: true }),
  ).toBeVisible();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const phone = await mobile.newPage();
    await phone.goto(new URL('./', page.url()).href);
    const buttons = phone.locator('.home-actions button');
    await expect(buttons).toHaveText([destinations[0], /進入我的藥局/]);
    const top = (await buttons.nth(0).boundingBox())!;
    const bottom = (await buttons.nth(1).boundingBox())!;
    expect(top.x).toBe(bottom.x);
    expect(top.y + top.height).toBeLessThan(bottom.y);
    for (const width of [390, 320]) {
      await phone.setViewportSize({ width, height: 844 });
      const right = (await phone
        .getByRole('button', { name: '遊戲說明' })
        .boundingBox())!;
      const restart = (await phone
        .getByRole('button', { name: '重新開始遊戲' })
        .boundingBox())!;
      expect(restart.x + restart.width).toBeLessThan(right.x);
      expect(right.x + right.width).toBeLessThanOrEqual(width);
      expect(
        await phone.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);
    }
    await phone.setViewportSize({ width: 390, height: 844 });
    await phone.screenshot({
      path: info.outputPath('home-mobile.png'),
      fullPage: true,
    });
    await phone.getByRole('button', { name: destinations[1] }).tap();
    await expect(
      phone.getByRole('heading', { name: '我的 3D 藥局' }),
    ).toBeVisible();
    await phone.getByRole('button', { name: '遊戲說明' }).tap();
    await expect(
      phone.getByRole('dialog', { name: '3D 藥局操作說明' }),
    ).toBeVisible();
    await phone.screenshot({ path: info.outputPath('help-mobile.png') });
    await phone.setViewportSize({ width: 768, height: 600 });
    await expect(
      phone.getByRole('button', { name: '關閉說明' }),
    ).toBeInViewport();
    await phone.setViewportSize({ width: 390, height: 320 });
    await expect
      .poll(() =>
        phone
          .locator('.game-help[open] .game-help-body')
          .evaluate((element) => element.scrollHeight > element.clientHeight),
      )
      .toBe(true);
    await expect(
      phone.getByRole('button', { name: '關閉說明' }),
    ).toBeInViewport();
    await phone.touchscreen.tap(5, 5);
    await expect(phone.getByRole('dialog')).toBeHidden();
  } finally {
    await mobile.close();
  }
});

test('3D 總覽與藥架說明支援關閉及焦點回復，遮罩隔離格位並保留選取', async ({
  page,
}, info) => {
  await page.goto('./');
  await page.getByRole('button', { name: '進入我的藥局' }).click();
  const help = page.getByRole('button', { name: '遊戲說明' });
  const dialog = page.getByRole('dialog', { name: '3D 藥局操作說明' });
  const close = dialog.getByRole('button', { name: '關閉說明' });
  await help.click();
  await expect(dialog.getByRole('listitem')).toHaveCount(6);
  await expect(dialog.getByText(/還沒有藥品/)).toBeVisible();
  await expect(close).toBeFocused();
  await page.screenshot({ path: info.outputPath('help-overview.png') });
  await close.click();
  await expect(dialog).toBeHidden();
  await expect(help).toBeFocused();

  await page.getByRole('button', { name: '返回首頁', exact: true }).click();
  await page.getByRole('button', { name: '我要管理藥品' }).click();
  await page.getByRole('button', { name: /我要進貨/ }).click();
  await page.getByLabel('英文學名').fill('Help Test');
  await page.getByLabel('劑量').fill('10 mg');
  await page.getByLabel(/^劑型/).selectOption('tablet');
  await page.getByRole('button', { name: '新增藥品', exact: true }).click();
  await page.getByRole('button', { name: '返回首頁', exact: true }).click();
  await page.getByRole('button', { name: '進入我的藥局' }).click();
  await page.getByRole('button', { name: 'OTC-01', exact: true }).click();
  await page.getByRole('button', { name: '開啟 OTC-01 藥架' }).click();
  await page.getByRole('button', { name: '選擇', exact: true }).click();
  const canvas = page.locator('.scene canvas');
  await expect(canvas).toBeVisible();
  await canvas.evaluate((element) => {
    element.setAttribute('data-original-canvas', 'true');
    for (const type of ['pointerdown', 'click']) {
      element.addEventListener(type, () =>
        element.setAttribute('data-received-input', 'true'),
      );
    }
  });
  const emptySlot = page
    .locator('.slot-list')
    .getByText('1 · 空', { exact: true });
  await expect(emptySlot).toBeVisible();
  const box = (await canvas.boundingBox())!;
  await help.click();
  await expect(close).toBeFocused();
  await expect(dialog.getByText(/還沒有藥品/)).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('help-shelf.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(help).toBeFocused();
  await help.click();
  await page.mouse.click(box.x + 10, box.y + box.height / 2);
  await expect(dialog).toBeHidden();
  await expect(help).toBeFocused();
  await expect(canvas).toHaveAttribute('data-original-canvas', 'true');
  await expect(canvas).not.toHaveAttribute('data-received-input', 'true');
  await expect(emptySlot).toBeVisible();
  await expect(page.getByRole('button', { name: '取消選藥' })).toBeVisible();
  await emptySlot.click();
  await expect(emptySlot).toBeVisible();
  await selectFirst3DSlot(page);
  await expect(
    page.locator('.slot-list').getByText('1 · Help Test', { exact: true }),
  ).toBeVisible();
});

test('手機的大量藥品清單可獨立捲動，篩選和搜尋在上架後保留', async ({
  browser,
  baseURL,
}, info) => {
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    baseURL,
  });
  try {
    const page = await mobile.newPage();
    const classValues = ['RX', 'OTC', null];
    const medicines = Array.from({ length: 90 }, (_, i) => ({
      genericName: `測試品項 ${String(i + 1).padStart(2, '0')}`,
      brand: 'Inventory',
      strength: '10 mg',
      dosageFormId: 'tablet',
      classification: classValues[i % 3],
    }));
    await page.route('**/teaching/index.json', (route) =>
      route.fulfill({
        json: {
          schemaVersion: 1,
          codes: {
            OI01AB: { active: true, manifest: 'versions/catalog-test.json' },
          },
        },
      }),
    );
    await page.route('**/teaching/versions/catalog-test.json', (route) =>
      route.fulfill({
        json: {
          schemaVersion: 1,
          title: '清單演練',
          version: 'catalog-test',
          medicines,
        },
      }),
    );
    await page.goto('./');
    await page.getByRole('button', { name: '我要管理藥品' }).tap();
    await page.getByRole('button', { name: /從已知的代碼進貨/ }).tap();
    await page.getByLabel('教材代碼').fill('oi01ab');
    await page.getByRole('button', { name: '預覽進貨' }).tap();
    await page.getByRole('button', { name: '確認進貨' }).tap();
    await page.getByRole('button', { name: '返回首頁', exact: true }).tap();
    await page.getByRole('button', { name: '進入我的藥局' }).tap();
    await page.getByRole('button', { name: 'OTC-01', exact: true }).tap();
    await page.getByRole('button', { name: '開啟 OTC-01 藥架' }).tap();
    const filters = page.getByRole('group', { name: '藥品分類' });
    const search = page.getByRole('searchbox');
    const results = page.getByRole('region', { name: '符合條件的藥品' });
    await expect(page.getByText('符合條件：90 種藥品')).toBeVisible();
    for (const filter of ['RX', 'OTC', '未分類']) {
      await filters.getByRole('button', { name: filter, exact: true }).tap();
      await expect(page.getByText('符合條件：30 種藥品')).toBeVisible();
    }
    const rx = filters.getByRole('button', { name: 'RX', exact: true });
    await rx.tap();
    await search.fill('inventory');
    await results.scrollIntoViewIfNeeded();
    const before = (await search.boundingBox())!.y;
    const bounds = (await results.boundingBox())!;
    const x = Math.round(bounds.x + bounds.width / 2);
    const y = Math.round(bounds.y + bounds.height * 0.75);
    const session = await mobile.newCDPSession(page);
    try {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y }],
      });
      for (let step = 1; step <= 5; step++) {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y: y - step * 23 }],
        });
      }
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
    } finally {
      await session.detach();
    }
    await expect
      .poll(() => results.evaluate((node) => node.scrollTop))
      .toBeGreaterThan(0);
    expect((await search.boundingBox())!.y).toBeCloseTo(before, 0);
    await results
      .getByRole('button', { name: '選擇', exact: true })
      .first()
      .tap();
    await expect(page.getByText(/已選取 測試品項 01/)).toBeVisible();
    await selectFirst3DSlot(page, true);
    await expect(
      page.locator('.slot-list').getByText('1 · 測試品項 01'),
    ).toBeVisible();
    await expect(search).toHaveValue('inventory');
    await expect(rx).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('符合條件：30 種藥品')).toBeVisible();
    await page.screenshot({
      path: info.outputPath('shelf-mobile.png'),
      fullPage: true,
    });
  } finally {
    await mobile.close();
  }
});

for (const device of [
  { label: '桌面', width: 1280, height: 800, touch: false },
  { label: '平板', width: 768, height: 900, touch: true },
  { label: '手機', width: 360, height: 640, touch: true },
]) {
  test(`${device.label}捲動後仍可由獨立藥架返回總覽`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({
      viewport: { width: device.width, height: device.height },
      hasTouch: device.touch,
      isMobile: device.touch,
    });
    try {
      const page = await context.newPage();
      await page.goto(baseURL!);
      await page.getByRole('button', { name: '進入我的藥局' }).click();
      await page.getByRole('button', { name: 'OTC-01', exact: true }).click();
      await page.getByRole('button', { name: '開啟 OTC-01 藥架' }).click();
      const back = page.getByRole('button', { name: '返回藥局總覽', exact: true });
      await expect(back).toBeInViewport({ ratio: 1 });
      await page.getByRole('button', { name: '恢復預設視角' }).click();
      await page.evaluate(() => window.scrollTo(0, 380));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
      await expect(back).toBeInViewport({ ratio: 1 });
      if (device.touch) await back.tap();
      else await back.click();
      await expect(page.getByRole('heading', { name: '我的 3D 藥局' })).toBeFocused();
      await expect(back).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
}
