/**
 * POST /api/assistant/query — network-scope assistant (M1–M12).
 *
 * ARCHITECTURE.md §7.1, §7.4. README §5 (Phase 9), Part 2.
 *
 * Pipeline: intent → deterministic tool dispatch → evidence JSON → narration.
 *
 * The response always carries the evidence bundle alongside the prose, so the
 * UI can render the evidence panel next to the answer. "Every answer ships with
 * the evidence panel that produced it — the user can check the model's work."
 *
 * The LLM is optional by design. Without ANTHROPIC_API_KEY, or if the call
 * fails, a template narration is generated from the same evidence. An assistant
 * that dies when an API is rate-limited is not demo-safe (§7.4).
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  classifyByKeyword,
  dispatch,
  extractEntities,
  type Evidence,
  type Intent,
} from './intents.js';

const QueryBody = z.object({
  question: z.string().trim().min(1).max(500),
});

const MODEL = 'claude-sonnet-5';

/**
 * Narrate strictly from the evidence. The prompt forbids inventing figures —
 * "It cannot invent a number, because it is never asked to produce one" (§6.3).
 */
async function narrate(question: string, evidence: Evidence): Promise<{ answer: string; source: 'llm' | 'template' }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { answer: templateNarration(evidence), source: 'template' };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        temperature: 0.2,
        system:
          'You explain supply-chain evidence to a pharmaceutical manufacturer. ' +
          'Answer using ONLY the JSON evidence provided. Cite specific figures from it. ' +
          'If the evidence is insufficient to answer, say so plainly. ' +
          'Never invent a number that is not in the evidence. Be concise — 2 to 4 sentences.',
        messages: [
          {
            role: 'user',
            content: `Question: ${question}\n\nEvidence:\n${JSON.stringify(evidence.data, null, 2)}`,
          },
        ],
      }),
    });

    if (!res.ok) return { answer: templateNarration(evidence), source: 'template' };
    const json = (await res.json()) as { content?: Array<{ text?: string }> };
    const text = json.content?.map((c) => c.text ?? '').join('').trim();
    return text
      ? { answer: text, source: 'llm' }
      : { answer: templateNarration(evidence), source: 'template' };
  } catch {
    return { answer: templateNarration(evidence), source: 'template' };
  } finally {
    clearTimeout(timer);
  }
}

/** Deterministic prose from the evidence — the demo-safe path. */
function templateNarration(evidence: Evidence): string {
  if (evidence.data == null) return evidence.summary;
  if (Array.isArray(evidence.data)) {
    if (evidence.data.length === 0) return `${evidence.summary}. Nothing matched.`;
    return `${evidence.summary}. Showing the top ${Math.min(5, evidence.data.length)} in the evidence panel.`;
  }
  return evidence.summary;
}

export async function assistantRoutes(app: FastifyInstance): Promise<void> {
  app.post('/query', async (req, reply) => {
    const parsed = QueryBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_payload', detail: parsed.error.flatten() });
    }
    const { question } = parsed.data;
    const started = Date.now();

    // Keyword classification: instant, and immune to an LLM outage (§7.4).
    const intent: Intent = classifyByKeyword(question);
    const entities = extractEntities(question);

    // Scope is enforced here, server-side, BEFORE narration: this server only
    // ever queries the `vayu` schema, so network scope is structural (§7.1).
    const evidence = await dispatch(intent, entities);
    const { answer, source } = await narrate(question, evidence);

    // Log the full tuple. "If a judge says 'prove it isn't making that up,'
    // you open the log." (§7.4)
    req.log.info(
      { question, intent, entities, evidenceSummary: evidence.summary, narration: source, ms: Date.now() - started },
      'assistant query',
    );

    return {
      question,
      intent,
      answer,
      narration: source,
      evidence, // the panel rendered beside the prose
      ms: Date.now() - started,
    };
  });
}
