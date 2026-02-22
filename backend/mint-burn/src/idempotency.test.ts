import { describe, expect, it } from 'vitest';
import {
  markIdempotencyFailure,
  markIdempotencySuccess,
  reserveIdempotency,
  type QueryResult,
} from './idempotency.js';

type Row = { status?: string; signature?: string; error?: string };

class FakeClient {
  private store = new Map<string, Row>();

  async query(text: string, params: unknown[] = []): Promise<QueryResult> {
    const action = params[0] as string | undefined;
    const requestId = params[1] as string | undefined;
    const key = `${action}:${requestId}`;

    if (text.startsWith('INSERT INTO mint_burn_requests')) {
      if (this.store.has(key)) {
        return { rowCount: 0, rows: [] };
      }
      this.store.set(key, { status: 'pending' });
      return { rowCount: 1, rows: [{ id: 1 }] };
    }

    if (text.startsWith('SELECT status, signature FROM mint_burn_requests')) {
      const row = this.store.get(key);
      return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
    }

    if (text.startsWith('UPDATE mint_burn_requests') && text.includes("status = 'pending'")) {
      const row = this.store.get(key) ?? {};
      this.store.set(key, { ...row, status: 'pending', error: undefined });
      return { rowCount: 1, rows: [] };
    }

    if (text.startsWith('UPDATE mint_burn_requests') && text.includes("status = 'completed'")) {
      const signature = params[2] as string | undefined;
      const row = this.store.get(key) ?? {};
      this.store.set(key, { ...row, status: 'completed', signature });
      return { rowCount: 1, rows: [] };
    }

    if (text.startsWith('UPDATE mint_burn_requests') && text.includes("status = 'failed'")) {
      const error = params[2] as string | undefined;
      const row = this.store.get(key) ?? {};
      this.store.set(key, { ...row, status: 'failed', error });
      return { rowCount: 1, rows: [] };
    }

    throw new Error(`Unexpected query: ${text}`);
  }
}

describe('idempotency helpers', () => {
  it('returns in-progress for duplicate pending request', async () => {
    const client = new FakeClient();

    await reserveIdempotency(client, 'mint_requested', 'req-1');
    const decision = await reserveIdempotency(client, 'mint_requested', 'req-1');

    expect(decision.status).toBe('in_progress');
  });

  it('returns duplicate after completion', async () => {
    const client = new FakeClient();

    await reserveIdempotency(client, 'mint_requested', 'req-2');
    await markIdempotencySuccess(client, 'mint_requested', 'req-2', 'sig-123');

    const decision = await reserveIdempotency(client, 'mint_requested', 'req-2');
    expect(decision.status).toBe('duplicate');
    if (decision.status === 'duplicate') {
      expect(decision.signature).toBe('sig-123');
    }
  });

  it('allows retry after failure', async () => {
    const client = new FakeClient();

    await reserveIdempotency(client, 'mint_requested', 'req-3');
    await markIdempotencyFailure(client, 'mint_requested', 'req-3', 'boom');

    const decision = await reserveIdempotency(client, 'mint_requested', 'req-3');
    expect(decision.status).toBe('proceed');
  });
});
