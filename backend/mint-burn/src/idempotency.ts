export interface QueryResult<Row = Record<string, unknown>> {
  rowCount: number;
  rows: Row[];
}

export interface Queryable {
  query: (text: string, params?: unknown[]) => Promise<QueryResult>;
}

export type IdempotencyDecision =
  | { status: 'proceed' }
  | { status: 'duplicate'; signature: string }
  | { status: 'in_progress' };

export async function reserveIdempotency(
  client: Queryable,
  action: string,
  requestId: string,
): Promise<IdempotencyDecision> {
  const inserted = await client.query(
    `INSERT INTO mint_burn_requests(action, request_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [action, requestId],
  );

  if (!inserted.rowCount) {
    const existing = await client.query(
      `SELECT status, signature FROM mint_burn_requests
       WHERE action = $1 AND request_id = $2`,
      [action, requestId],
    );
    const row = existing.rows[0] as { status?: string; signature?: string } | undefined;
    if (row?.signature) {
      return { status: 'duplicate', signature: row.signature };
    }
    if (row?.status === 'failed') {
      await client.query(
        `UPDATE mint_burn_requests
         SET status = 'pending', error = NULL
         WHERE action = $1 AND request_id = $2`,
        [action, requestId],
      );
      return { status: 'proceed' };
    }
    return { status: 'in_progress' };
  }

  return { status: 'proceed' };
}

export async function markIdempotencySuccess(
  client: Queryable,
  action: string,
  requestId: string,
  signature: string,
): Promise<void> {
  await client.query(
    `UPDATE mint_burn_requests
     SET status = 'completed', signature = $3
     WHERE action = $1 AND request_id = $2`,
    [action, requestId, signature],
  );
}

export async function markIdempotencyFailure(
  client: Queryable,
  action: string,
  requestId: string,
  error: string,
): Promise<void> {
  await client.query(
    `UPDATE mint_burn_requests
     SET status = 'failed', error = $3
     WHERE action = $1 AND request_id = $2`,
    [action, requestId, error],
  );
}
