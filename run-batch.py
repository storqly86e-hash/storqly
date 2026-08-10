#!/usr/bin/env python3
"""Run a batch of tests and append to CSV"""
import subprocess, json, time, csv, sys, os

PROMPTS = json.loads(sys.argv[1])
RUN = int(sys.argv[2])
CATEGORY = sys.argv[3]
START_IDX = int(sys.argv[4])
OUTFILE = "/home/z/my-project/test-results.csv"

def run_one(prompt):
    body = json.dumps({"prompt": prompt})
    start = time.time()
    try:
        r = subprocess.run(
            ["curl", "-s", "-N", "--max-time", "200",
             "-X", "POST", "http://localhost:3000/api/store/generate",
             "-H", "Content-Type: application/json", "-d", body],
            capture_output=True, text=True, timeout=220)
        resp = r.stdout
    except subprocess.TimeoutExpired:
        return int(time.time()-start), "?", "false", "(timeout)"

    elapsed = int(time.time() - start)
    ai_ok = "true"
    name = "(none)"
    attempts = 0
    for line in resp.split('\n'):
        if line.startswith('event: progress') and '"generating"' in line:
            attempts += 1
        elif line.startswith('data: '):
            try:
                d = json.loads(line[6:])
                if 'store' in d:
                    name = d['store'].get('name','?')
                    if d.get('_isFallback'): ai_ok = "false"
            except: pass
    return elapsed, str(attempts) if attempts else "?", ai_ok, name

write_header = not os.path.exists(OUTFILE) or os.path.getsize(OUTFILE) == 0

import os

with open(OUTFILE, 'a', newline='') as f:
    w = csv.writer(f)
    if write_header:
        w.writerow(["run","idx","category","words","chars","time_s","attempt","ai_success","store_name"])
    for i, p in enumerate(PROMPTS):
        t, att, ai, name = run_one(p)
        words = len(p.split()); chars = len(p)
        print(f"  {CATEGORY.upper()} #{START_IDX+i+1} | {words}w {chars}c | {t}s | att{att} | AI:{ai} | {name}", flush=True)
        w.writerow([RUN, START_IDX+i, CATEGORY, words, chars, t, att, ai, name])
        time.sleep(2)

print(f"  Category {CATEGORY} run {RUN} done.", flush=True)
