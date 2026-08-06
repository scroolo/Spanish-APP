import 'dotenv/config';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildApp } from '../src/app.js';

let app: Awaited<ReturnType<typeof buildApp>> | undefined;

async function getApp() {
  if (!app) {
    app = buildApp();
    await app.ready();
  }
  return app;
}

/**
 * Vercel serverless function handler.
 *
 * Fastify is not started with `listen()` here; instead every incoming request
 * is pushed through `app.inject()`, which exercises the exact same route stack
 * as the local server without binding a socket. The Fastify instance is kept
 * in the module scope so it survives warm invocations.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const fastify = await getApp();
    const response = await fastify.inject({
      method: req.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      url: req.url ?? '/',
      headers: (req.headers as Record<string, string>) ?? {},
      payload: req.body,
    });

    res.statusCode = response.statusCode;
    for (const [name, value] of Object.entries(response.headers)) {
      if (value !== undefined) {
        res.setHeader(name, value);
      }
    }
    const type = response.headers['content-type'] as string | undefined;
    if (type && type.includes('application/json')) {
      res.setHeader('Content-Type', type);
      res.send(response.payload);
    } else {
      res.send(Buffer.from(response.rawPayload));
    }
  } catch (err) {
    console.error('FUNCTION_ERROR', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.send(
      JSON.stringify({
        error: {
          code: 'INTERNAL',
          message: process.env.NODE_ENV === 'production' ? 'Internal server error' : String(err instanceof Error ? err.stack : err),
        },
      }),
    );
  }
}