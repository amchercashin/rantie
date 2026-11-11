import { expect, test } from '@playwright/test';

/** Mark the welcome flow and splash as seen so tests start on real screens. */
async function skipIntro(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    localStorage.setItem('rt-welcome-done', '1');
    localStorage.setItem('rt-splash-seen-v2', '1');
  });
}

/** Text with non-breaking spaces normalised. */
const nb = (s: string) => new RegExp(s.replace(/ /g, '[\\s\\u00a0]'));
/** Exact text with non-breaking spaces normalised. */
const exact = (s: string) => new RegExp(`^${s.replace(/ /g, '[\\s\\u00a0]')}$`);

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    let url: URL;
    try {
      url = new URL(route.request().url());
    } catch {
      return route.continue();
    }
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      return route.continue();
    }
    return route.abort();
  });
});

test('first launch shows the welcome flow and the demo portfolio', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('rt-splash-seen-v2', '1'));
  await page.reload();

  const welcome = page.getByRole('dialog', { name: 'Добро пожаловать в Рантье' });
  await expect(welcome).toBeVisible();
  await welcome.getByRole('button', { name: 'Пропустить' }).click();
  await welcome.getByRole('button', { name: 'Посмотреть на демо-портфеле' }).click();
  await expect(welcome).toBeHidden();

  await expect(page.getByText('Вы смотрите')).toBeVisible();
  await expect(page.getByTestId('hero-amount')).not.toHaveText('—');
  await expect(page.getByText('Динамика дохода')).toBeVisible();

  await page.getByRole('button', { name: 'Удалить', exact: true }).click();
  await page.getByRole('button', { name: 'Удалить демо' }).click();
  await expect(page.getByText('Капитал, который платит')).toBeVisible();
});

test('mobile core flow renders portfolio, asset detail, accounts, and settings', async ({ page }) => {
  await page.goto('/');
  await skipIntro(page);
  await page.evaluate(async () => {
    const { db } = await (0, eval)("import('/src/db/database.ts')");
    await db.delete();
    await db.open();

    const now = new Date();
    const accountId = await db.accounts.add({ name: 'Тестовый счёт', createdAt: now, updatedAt: now });
    const assetId = await db.assets.add({
      type: 'Акции',
      ticker: 'USDY',
      name: 'Долларовый актив',
      currency: 'USD',
      currentPrice: 100,
      dataSource: 'manual',
      paymentPerUnit: 12,
      paymentPerUnitSource: 'manual',
      frequencyPerYear: 1,
      frequencySource: 'manual',
      createdAt: now,
      updatedAt: now,
    });
    await db.holdings.add({
      accountId, assetId, quantity: 2, quantitySource: 'manual', averagePrice: 90, createdAt: now, updatedAt: now,
    });
    await db.exchangeRates.put({ currency: 'USD', rateToRub: 90, updatedAt: now, source: 'manual' });
  });

  await page.goto('/');
  await expect(page.getByText('расчётный пассивный доход')).toBeVisible();
  await expect(page.getByText(nb('18 тыс ₽'))).toBeVisible();

  await page.getByRole('link', { name: /Акции/ }).click();
  await expect(page.getByText('Долларовый актив')).toBeVisible();

  await page.getByText('Долларовый актив').click();
  await expect(page.getByText('Текущая цена')).toBeVisible();
  await expect(page.getByText(nb('100 USD'))).toBeVisible();

  await page.getByRole('button', { name: 'Счета' }).click();
  await expect(page.getByText('Тестовый счёт')).toBeVisible();

  await page.getByRole('button', { name: 'Настройки' }).click();
  await expect(page.getByText('Курсы валют')).toBeVisible();
  await expect(page.locator('input[value="90"]')).toBeVisible();
});

test('mobile manual flow supports foreign currency asset and payment', async ({ page }) => {
  await page.goto('/');
  await skipIntro(page);

  await page.goto('/data');
  await page.getByRole('button', { name: 'Добавить счёт' }).first().click();
  await page.getByPlaceholder('Сбер / Недвижимость / Вклады / Прочее').fill('Валютный счёт');
  await page.getByRole('button', { name: 'Создать пустой' }).click();

  await page.getByRole('button', { name: /Валютный счёт/ }).first().click();
  await page.getByRole('button', { name: 'Добавить актив' }).first().click();
  await page.getByRole('radio', { name: 'Прочее' }).click();
  await page.getByPlaceholder('Например, золото').fill('Валютный актив');
  await page.getByPlaceholder('1', { exact: true }).fill('2');
  await page.getByPlaceholder('25 000').fill('200');
  await page.locator('select').selectOption('USD');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(page.getByText(exact('200 USD'))).toBeVisible();

  await page.goto('/settings');
  const usdRateInput = page.getByLabel('Курс USD к рублю');
  await usdRateInput.fill('90');
  await usdRateInput.press('Enter');
  await expect(page.locator('input[value="90"]')).toBeVisible();
  await expect(page.getByText(/^свой курс ·/)).toBeVisible();

  await page.goto('/data');
  await expect(page.getByRole('button', { name: /Валютный счёт/ }).first()).toContainText(nb('18 тыс ₽'));

  await page.goto('/payments');
  await page.getByRole('radio', { name: 'История' }).click();
  await page.getByRole('button', { name: /Прочее/ }).first().click();
  await page.getByRole('button', { name: 'Добавить выплату: Валютный актив' }).click();
  await page.getByPlaceholder('До НДФЛ').fill('12');
  await page.getByRole('button', { name: 'Сохранить выплату' }).click();
  await expect(page.getByText(exact('12 USD'))).toBeVisible();

  await page.goto('/');
  await expect(page.getByText(nb('18 тыс ₽'))).toBeVisible();
  // 12 USD × 2 × 90 ₽ = 2 160 ₽ a year → 180 ₽ a month gross; the default 13% NDFL leaves 157 ₽.
  await expect(page.getByTestId('hero-amount')).toHaveText(nb('157'));
  await expect(page.getByText('после НДФЛ')).toBeVisible();
});
