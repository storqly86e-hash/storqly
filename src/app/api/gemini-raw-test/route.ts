// Quick debug: test Gemini REST API directly (bypass SDK)
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'No key' });

  const results: Record<string, unknown> = {};
  results.keyPrefix = apiKey.slice(0, 10);
  results.keyLength = apiKey.length;

  const models = ['gemini-2.0-flash', 'gemini-2.5-flash-preview-05-20', 'gemini-2.5-flash', 'gemini-1.5-flash'];

  for (const model of models) {
    try {
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'say hi' }] }] }),
      });
      const body = await resp.text();
      results[model] = {
        status: resp.status,
        body: body.substring(0, 500),
      };
    } catch (e: unknown) {
      results[model] = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  return NextResponse.json(results);
}
