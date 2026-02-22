import fs from 'node:fs';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  createPool,
  createLogger,
  loadEnv,
  runMigrations,
  extractRawBody,
  verifySignature,
  type ServiceEnv,
} from '@stbr/backend-shared';
import { SolanaStablecoin } from '@stbr/sss-token';
import express from 'express';
import { z } from 'zod';
import {
  markIdempotencyFailure,
  markIdempotencySuccess,
  reserveIdempotency,
} from './idempotency.js';

interface Runtime {
  env: ServiceEnv;
  client: SolanaStablecoin;
  payer: Keypair;
}

const MintRequestSchema = z.object({
  recipient: z.string(),
  amount: z.string().regex(/^\d+$/),
  requestId: z.string().min(1).max(128).optional(),
});

const BurnRequestSchema = z.object({
  from: z.string().optional(),
  amount: z.string().regex(/^\d+$/),
  requestId: z.string().min(1).max(128).optional(),
});

function loadRuntime(env: ServiceEnv): Runtime {
  const lock = JSON.parse(fs.readFileSync(env.SSS_LOCKFILE_PATH, 'utf8')) as {
    mint: string;
    stablecoinProgramId: string;
    transferHookProgramId: string;
  };

  const keypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(env.SSS_KEYPAIR_PATH, 'utf8')) as number[]),
  );

  const connection = new Connection(env.RPC_URL, 'confirmed');
  const client = SolanaStablecoin.fromExisting({
    connection,
    payer: keypair,
    mint: new PublicKey(lock.mint),
    stablecoinProgramId: new PublicKey(lock.stablecoinProgramId),
    transferHookProgramId: new PublicKey(lock.transferHookProgramId),
  });

  return {
    env,
    client,
    payer: keypair,
  };
}

function requireSigningSecret(env: ServiceEnv): string {
  if (!env.REQUEST_SIGNING_SECRET) {
    throw new Error('REQUEST_SIGNING_SECRET is required for mint-burn service');
  }
  return env.REQUEST_SIGNING_SECRET;
}

function verifyRequest(
  req: express.Request,
  secret: string,
): { ok: boolean; reason?: string } {
  const rawBody = extractRawBody(req);
  if (!rawBody) {
    return { ok: false, reason: 'missing raw request body' };
  }

  return verifySignature(rawBody, secret, req.header('x-request-signature') ?? undefined);
}

async function main(): Promise<void> {
  const env = loadEnv({ PORT: Number(process.env.PORT ?? 8081) });
  const logger = createLogger('mint-burn');
  const signingSecret = requireSigningSecret(env);
  const runtime = loadRuntime(env);

  const pool = createPool(env.DATABASE_URL);
  await runMigrations(pool);

  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      },
    }),
  );

  app.get('/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'mint-burn' });
  });

  app.post('/mint', async (req, res) => {
    const verified = verifyRequest(req, signingSecret);
    if (!verified.ok) {
      res.status(401).json({ ok: false, error: verified.reason });
      return;
    }

    const parsed = MintRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: parsed.error.flatten() });
      return;
    }

    const client = await pool.connect();
    try {
      const requestId = parsed.data.requestId;
      if (requestId) {
        const decision = await reserveIdempotency(client, 'mint_requested', requestId);
        if (decision.status === 'duplicate') {
          res.json({ ok: true, signature: decision.signature, idempotent: true });
          return;
        }
        if (decision.status === 'in_progress') {
          res.status(409).json({ ok: false, error: 'request already in progress' });
          return;
        }
      }

      const signature = await runtime.client.mint({
        authority: runtime.payer,
        recipientTokenAccount: new PublicKey(parsed.data.recipient),
        amount: BigInt(parsed.data.amount),
      });

      await client.query(
        `INSERT INTO sss_events(signature, slot, action, payload)
         VALUES ($1, 0, $2, $3::jsonb)
         ON CONFLICT DO NOTHING`,
        [signature, 'mint_requested', JSON.stringify(parsed.data)],
      );

      if (requestId) {
        await markIdempotencySuccess(client, 'mint_requested', requestId, signature);
      }

      logger.info({ signature, request: parsed.data }, 'mint completed');
      res.json({ ok: true, signature });
    } catch (error) {
      if (parsed.success && parsed.data.requestId) {
        await markIdempotencyFailure(
          client,
          'mint_requested',
          parsed.data.requestId,
          (error as Error).message,
        );
      }
      logger.error({ error }, 'mint failed');
      res.status(500).json({ ok: false, error: (error as Error).message });
    } finally {
      client.release();
    }
  });

  app.post('/burn', async (req, res) => {
    const verified = verifyRequest(req, signingSecret);
    if (!verified.ok) {
      res.status(401).json({ ok: false, error: verified.reason });
      return;
    }

    const parsed = BurnRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: parsed.error.flatten() });
      return;
    }

    const client = await pool.connect();
    try {
      const requestId = parsed.data.requestId;
      if (requestId) {
        const decision = await reserveIdempotency(client, 'burn_requested', requestId);
        if (decision.status === 'duplicate') {
          res.json({ ok: true, signature: decision.signature, idempotent: true });
          return;
        }
        if (decision.status === 'in_progress') {
          res.status(409).json({ ok: false, error: 'request already in progress' });
          return;
        }
      }

      const from = parsed.data.from ?? runtime.payer.publicKey.toBase58();
      const signature = await runtime.client.burn({
        authority: runtime.payer,
        fromTokenAccount: new PublicKey(from),
        amount: BigInt(parsed.data.amount),
      });

      await client.query(
        `INSERT INTO sss_events(signature, slot, action, payload)
         VALUES ($1, 0, $2, $3::jsonb)
         ON CONFLICT DO NOTHING`,
        [signature, 'burn_requested', JSON.stringify(parsed.data)],
      );

      if (requestId) {
        await markIdempotencySuccess(client, 'burn_requested', requestId, signature);
      }

      logger.info({ signature, request: parsed.data }, 'burn completed');
      res.json({ ok: true, signature });
    } catch (error) {
      if (parsed.success && parsed.data.requestId) {
        await markIdempotencyFailure(
          client,
          'burn_requested',
          parsed.data.requestId,
          (error as Error).message,
        );
      }
      logger.error({ error }, 'burn failed');
      res.status(500).json({ ok: false, error: (error as Error).message });
    } finally {
      client.release();
    }
  });

  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'mint-burn service started');
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
