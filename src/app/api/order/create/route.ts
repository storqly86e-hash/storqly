import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { storeId, storeName, items, subtotal, shipping, total, email, name } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'No items in order' }, { status: 400 });
    }

    const dbClient = getDb();
    if (!dbClient) {
      return NextResponse.json(
        { error: 'Database is currently unavailable. Please try again later.' },
        { status: 503 }
      );
    }

    const order = await dbClient.order.create({
      data: {
        storeId: storeId || 'unknown',
        storeName: storeName || null,
        items: JSON.stringify(items),
        subtotal: Number(subtotal) || 0,
        shipping: Number(shipping) || 0,
        total: Number(total) || 0,
        email: email || null,
        name: name || null,
        status: 'demo',
      },
    });

    return NextResponse.json({
      success: true,
      orderId: order.id,
      demo: true,
      message: 'Order recorded (demo mode — no payment was processed)',
    });
  } catch (e) {
    console.error('[Order Create] Error:', e);
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}
