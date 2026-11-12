import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Welcome } from '@/components/onboarding/welcome';
import { clearAllData } from '@/services/app-settings';

function Where() {
  const { pathname } = useLocation();
  return <div data-testid="where">{pathname}</div>;
}

describe('Welcome', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearAllData();
  });

  it('lands on Доход after the demo, even when the app was opened by a link to another page', async () => {
    render(
      <MemoryRouter initialEntries={['/goal']}>
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
        <Welcome />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Посмотреть на демо-портфеле' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/), { timeout: 2000 });
  });
});
