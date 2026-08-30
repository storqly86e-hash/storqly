import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Store, StoreProduct } from '@/lib/store-schema';

/**
 * POST /api/cross-sell
 * Body: { cartProductIds: string[], limit?: number, storeId: string }
 *
 * Returns product recommendations based on:
 * 1. Same-category products not already in cart
 * 2. Remaining products sorted by featured status
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { cartProductIds = [], limit = 4, storeId } = body as {
      cartProductIds?: string[];
      limit?: number;
      storeId?: string;
    };

    if (!storeId) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }

    // Fetch the store schema from the database
    const dbClient = getDb();
    if (!dbClient) {
      return NextResponse.json({ recommendations: [] });
    }

    const record = await dbClient.store.findUnique({
      where: { id: storeId },
      select: { schema: true },
    });

    if (!record) {
      return NextResponse.json({ recommendations: [] });
    }

    // Parse the store schema to get products
    let products: StoreProduct[] = [];
    try {
      const storeData = JSON.parse(record.schema) as Store;
      products = storeData.products || [];
    } catch {
      return NextResponse.json({ recommendations: [] });
    }

    const cartSet = new Set(cartProductIds);

    // Get categories of items already in cart
    const cartCategories = new Set<string>();
    for (const product of products) {
      if (cartSet.has(product.id) && product.category) {
        cartCategories.add(product.category);
      }
    }

    // Filter out items already in cart
    const available = products.filter(
      (p) => !cartSet.has(p.id) && p.inStock !== false
    );

    // Score products: same category = higher score, featured = bonus
    const scored = available.map((p) => {
      let score = 0;
      if (p.category && cartCategories.has(p.category)) {
        score += 10;
      }
      if (p.featured) {
        score += 3;
      }
      if (p.compareAtPrice && p.compareAtPrice > p.price) {
        score += 1;
      }
      return { product: p, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const recommendations = scored.slice(0, limit).map((s) => ({
      id: s.product.id,
      name: s.product.name,
      price: s.product.price,
      compareAtPrice: s.product.compareAtPrice,
      image: s.product.images?.[0] || '',
      category: s.product.category,
    }));

    return NextResponse.json({ recommendations });
  } catch (error) {
    console.error('Cross-sell API error:', error);
    return NextResponse.json({ recommendations: [] }, { status: 500 });
  }
}
