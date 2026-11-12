import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/database';
import { setAccountNdflRate } from '@/hooks/use-accounts';

describe('setAccountNdflRate', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('sets an own rate and clears it back to the category rates', async () => {
    const now = new Date();
    const id = (await db.accounts.add({ name: 'ИИС', createdAt: now, updatedAt: now })) as number;

    await setAccountNdflRate(id, 0);
    expect((await db.accounts.get(id))?.ndflRate).toBe(0);

    await setAccountNdflRate(id, null);
    const account = await db.accounts.get(id);
    expect(account).not.toHaveProperty('ndflRate');
    expect(account?.name).toBe('ИИС');
  });
});
