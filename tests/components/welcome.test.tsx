import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Welcome } from '@/components/onboarding/welcome';
import { FeedbackProvider } from '@/components/ds/feedback';
import { clearAllData } from '@/services/app-settings';
import { db } from '@/db/database';
import { getLastBackupAt } from '@/lib/backup-reminder';
import { isWelcomeDone } from '@/lib/hints';

function Where() {
  const { pathname } = useLocation();
  return <div data-testid="where">{pathname}</div>;
}

function renderWelcome(at = '/goal') {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <FeedbackProvider>
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
        <Welcome />
      </FeedbackProvider>
    </MemoryRouter>,
  );
}

const T = '2026-01-10T10:00:00.000Z';
const BACKUP = JSON.stringify({
  version: 4,
  exportedAt: T,
  accounts: [
    { id: 1, name: 'Брокер', createdAt: T, updatedAt: T },
    { id: 2, name: 'Квартира', createdAt: T, updatedAt: T },
  ],
  assets: [{ id: 1, type: 'Акции', name: 'Сбербанк', ticker: 'SBER', dataSource: 'moex', paymentPerUnitSource: 'fact', frequencyPerYear: 1, createdAt: T, updatedAt: T }],
  holdings: [{ id: 1, accountId: 1, assetId: 1, quantity: 100, quantitySource: 'manual', createdAt: T, updatedAt: T }],
  paymentHistory: [],
  importRecords: [],
  settings: [],
  exchangeRates: [],
});

async function pickFile(content: string, name = 'rantie-backup-2026-01-10.json') {
  // The welcome keeps its file input inside its own portal (#root is inert while it is open).
  await screen.findByRole('dialog');
  const input = document.querySelector<HTMLInputElement>('[role=dialog] input[type=file]');
  expect(input).not.toBeNull();
  fireEvent.change(input!, { target: { files: [new File([content], name, { type: 'application/json' })] } });
}

describe('Welcome', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearAllData();
  });

  it('lands on Доход after the demo, even when the app was opened by a link to another page', async () => {
    renderWelcome();
    fireEvent.click(await screen.findByRole('button', { name: 'Посмотреть на демо-портфеле' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/), { timeout: 2000 });
  });

  it('offers the backup quietly next to the three ways to start', async () => {
    renderWelcome();
    expect(await screen.findByRole('button', { name: 'Есть бэкап? Восстановить' })).toBeInTheDocument();
  });

  it('restores a backup at once on an empty device, closes the welcome and lands on Доход', async () => {
    renderWelcome();
    await pickFile(BACKUP);

    expect(await screen.findByText('Восстановлено: 2 счёта, 1 актив')).toBeInTheDocument();
    // Nothing to lose on an empty device: no confirm sheet in between.
    expect(screen.queryByText('Восстановить из бэкапа?')).not.toBeInTheDocument();
    expect(await db.accounts.count()).toBe(2);
    expect(await db.holdings.count()).toBe(1);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/), { timeout: 2000 });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), { timeout: 2000 });
    expect(isWelcomeDone()).toBe(true);
    // The data now is exactly the file: the backup reminder must not ask for one right away.
    expect(getLastBackupAt()).not.toBeNull();
  });

  it('stays open and says so when the file is not a backup', async () => {
    renderWelcome();
    await pickFile('{"rows": []}', 'report.json');

    expect(await screen.findByText('Это не файл бэкапа Рантье')).toBeInTheDocument();
    expect(await db.accounts.count()).toBe(0);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/goal');
    expect(isWelcomeDone()).toBe(false);
  });
});
