/**
 * HMAC verification for inbound webhooks from Vayu.
 *
 * ARCHITECTURE.md §5.2. README §8 (non-negotiable). Part 2.
 *
 * Mirrors vayu-api's middleware — the two must agree exactly or every
 * cross-organisation call fails.
 *
 * WHY THE RAW BODY MATTERS: the signature covers the exact bytes the sender
 * hashed. Fastify parses JSON before handlers run, and `JSON.stringify` of the
 * parsed object is NOT guaranteed to reproduce those bytes — key order and
 * whitespace can differ, and every signature would fail. So we capture the raw
 * buffer in a content-type parser and verify against that.
 */

import {
  EVENT_ID_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verify,
} from '@medtrack/crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string;
    /** Set by `verifyHmac` once the signature checks out. */
    medtrackEventId?: string;
  }
}

/** Register once at startup, before any route that verifies a signature. */
export function registerRawBodyParser(app: FastifyInstance): void {
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (req, body: string, done) => {
      req.rawBody = body;
      if (body === '') return done(null, {});
      try {
        done(null, JSON.parse(body));
      } catch (err) {
        (err as Error & { statusCode?: number }).statusCode = 400;
        done(err as Error, undefined);
      }
    },
  );
}

function sharedSecret(): string {
  const secret = process.env.MEDTRACK_SHARED_SECRET;
  if (!secret) {
    throw new Error('MEDTRACK_SHARED_SECRET is not set — cannot verify inbound webhooks');
  }
  return secret;
}

/**
 * Fastify preHandler for every V→D webhook (§5.1).
 *
 * Returns an opaque 401 for both a bad signature and a stale timestamp — the
 * reason is logged server-side, not handed to the caller.
 */
export async function verifyHmac(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const signature = req.headers[SIGNATURE_HEADER] as string | undefined;
  const timestamp = req.headers[TIMESTAMP_HEADER] as string | undefined;
  const eventId = req.headers[EVENT_ID_HEADER] as string | undefined;

  if (!eventId) {
    reply.code(400).send({ error: 'missing_event_id' });
    return;
  }

  const result = verify(
    sharedSecret(),
    req.rawBody ?? '',
    signature ?? null,
    timestamp ?? null,
  );

  if (!result.ok) {
    req.log.warn({ reason: result.reason, eventId, url: req.url }, 'HMAC verification failed');
    reply.code(401).send({ error: 'unauthorized' });
    return;
  }

  req.medtrackEventId = eventId;
}
