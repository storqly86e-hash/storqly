const PROMPTS = [
  'build a clothing store',
  'build a coffee shop',
  'build a jewelry store',
  'build a hat shop',
  'build a book store',
  'build an electronics store',
  'build a pet supplies store',
  'build a furniture store',
  'build a bakery',
  'build a fitness equipment store',
  'build a plant nursery',
  'build a toy store',
  'build a wine shop',
  'build a skincare brand',
  'build a guitar shop',
  'build an art supply store',
  'build a candle company',
  'build a tea shop',
  'build a running shoes store',
  'build a home decor store',
];

import fs from 'fs';

const results = [];
let pass = 0, fail = 0;

for (let i = 0; i < PROMPTS.length; i++) {
  const p = PROMPTS[i];
  const start = Date.now();
  let status = 'ERROR';
  let detail = '';
  try {
    const res = await fetch('http://localhost:3000/api/store/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: p }),
      signal: AbortSignal.timeout(140_000),
    });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    if (res.ok) {
      const data = await res.json();
      const name = data.store?.name || '?';
      pass++;
      status = 'OK';
      detail = `${name} (${elapsed}s)`;
    } else {
      const errData = await res.json().catch(() => ({}));
      fail++;
      status = 'FAIL';
      detail = `${res.status} (${elapsed}s) ${errData.error || ''}`;
    }
  } catch (e) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    fail++;
    status = 'FAIL';
    detail = `TIMEOUT/ERROR (${elapsed}s) ${e.message}`;
  }
  results.push(`  ${status} [${i+1}/20] ${p} -> ${detail}`);
  fs.appendFileSync('/home/z/my-project/batch_progress.txt', `[${i+1}/20] ${status} | Running: ${pass} ok, ${fail} fail\n`);
  process.stderr.write(`[${i+1}/20] ${status} ${detail}\n`);
}

const report = `BATCH RESULTS: ${pass}/20 passed, ${fail}/20 failed\n${'='.repeat(50)}\n${results.join('\n')}\n`;
fs.writeFileSync('/home/z/my-project/batch_final.txt', report);
console.log(report);
