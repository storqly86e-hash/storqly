// Temporary diagnostic: lists available Groq models for the configured API key
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey === 'placeholder') {
      return NextResponse.json({ error: 'GROQ_API_KEY not set' }, { status: 400 });
    }
    const Groq = (await import('groq-sdk')).default;
    const client = new Groq({ apiKey });
    const response = await client.models.list();
    const models = response.data.map(m => m.id).sort();
    return NextResponse.json({ models, count: models.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}