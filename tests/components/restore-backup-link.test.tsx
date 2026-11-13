import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RestoreBackupLink } from '@/components/onboarding/restore-backup-link';
import { FeedbackProvider } from '@/components/ds/feedback';
import { clearAllData } from '@/services/app-settings';
import { db } from '@/db/database';

const T = '2026-01-10T10:00:00.000Z';
const BACKUP = JSON.stringify({
  version: 4,
  accounts: [{ id: 7, name: 'Из бэкапа', createdAt: T, updatedAt: T }],
  assets: [],
  holdings: [],
});

function pickBackup(container: HTMLElement) {
  const input = container.querySelector<HTMLInputElement>('input[type=file]')!;
  fireEvent.change(input, { target: { files: [new File([BACKUP], 'rantie-backup.json', { type: 'application/json' })] } });
}

describe('RestoreBackupLink', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearAllData();
  });

  it('asks before replacing accounts that are already on the device', async () => {
    await db.accounts.add({ name: 'Пустой счёт', createdAt: new Date(T), updatedAt: new Date(T) });
    const { container } = render(
      <FeedbackProvider>
        <RestoreBackupLink />
      </FeedbackProvider>,
    );
    pickBackup(container);

    expect(await screen.findByText('Восстановить из бэкапа?')).toBeInTheDocument();
    expect(screen.getByText(/В файле: 1 счёт, 0 активов/)).toBeInTheDocument();
    expect((await db.accounts.toArray()).map((a) => a.name)).toEqual(['Пустой счёт']);

    fireEvent.click(screen.getByRole('button', { name: 'Восстановить' }));
    await waitFor(async () => expect((await db.accounts.toArray()).map((a) => a.name)).toEqual(['Из бэкапа']));
    expect(await screen.findByText('Восстановлено: 1 счёт, 0 активов')).toBeInTheDocument();
  });

  it('keeps the data when the user cancels', async () => {
    await db.accounts.add({ name: 'Мой счёт', createdAt: new Date(T), updatedAt: new Date(T) });
    const { container } = render(
      <FeedbackProvider>
        <RestoreBackupLink />
      </FeedbackProvider>,
    );
    pickBackup(container);

    fireEvent.click(await screen.findByRole('button', { name: 'Отмена' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Есть бэкап? Восстановить' })).toBeEnabled());
    expect((await db.accounts.toArray()).map((a) => a.name)).toEqual(['Мой счёт']);
  });
});
