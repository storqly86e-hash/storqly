import { executeAI } from './src/lib/ai-orchestrator';

const PROMPTS = [
  'a coffee shop',
  'a vintage record store selling vinyl and turntables',
  'an artisanal soap company with lavender and honey products',
  'a minimalist watch brand for professionals',
  'a plant nursery selling indoor tropical plants',
];

const SYSTEM = `You are an e-commerce store builder. Return a SINGLE JSON object — no markdown, no explanation.
Return: {"name":"<store name>","products":[{"id":"1","name":"Product 1","price":29.99}]}
Generate exactly 3 products.`;

async function runTest(index: number, prompt: string) {
  console.log(`\n=== Test ${index + 1}/5: "${prompt}" ===`);
  console.log('Time:', new Date().toISOString());
  
  const start = Date.now();
  const result = await executeAI('store-generation', [
    { role: 'user', content: `Generate an e-commerce store: ${prompt}` },
  ], {
    systemPrompt: SYSTEM,
    temperature: 0.6,
    timeout: 40_000,
    maxRetries: 2,
    responseFormat: 'json_object',
  });
  
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  
  if (result.success) {
    try {
      const data = JSON.parse(result.content!);
      const prodCount = data.products?.length || 0;
      console.log(`RESULT: SUCCESS in ${elapsed}s (${result.attempts} attempts)`);
      console.log(`  Store: "${data.name}"`);
      console.log(`  Products: ${prodCount}`);
    } catch {
      console.log(`RESULT: SUCCESS in ${elapsed}s (${result.attempts} attempts) but JSON parse failed`);
      console.log(`  Content preview: ${result.content!.substring(0, 100)}...`);
    }
  } else {
    console.log(`RESULT: FAILED in ${elapsed}s`);
    console.log(`  Error: ${result.error}`);
  }
}

async function main() {
  console.log('===========================================');
  console.log('  Isolated Generation Test — 5 tests');
  console.log('  60s spacing between each test');
  console.log('===========================================');
  
  for (let i = 0; i < PROMPTS.length; i++) {
    await runTest(i, PROMPTS[i]);
    
    if (i < PROMPTS.length - 1) {
      console.log('\n  Waiting 60 seconds before next test...');
      await new Promise(r => setTimeout(r, 60_000));
    }
  }
  
  console.log('\n===========================================');
  console.log('  ALL 5 TESTS COMPLETE');
  console.log('===========================================');
}

main().catch(e => console.error('Fatal:', e));
