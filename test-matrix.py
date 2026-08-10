#!/usr/bin/env python3
"""Systematic test matrix: 5 short + 5 medium + 5 long, each 2x = 30 tests"""
import subprocess, json, time, csv, sys, os

SHORT = [
    "jewelry store gold rings",
    "coffee shop artisan beans",
    "vintage bookshop",
    "yoga studio downtown",
    "pet supplies store",
]

MEDIUM = [
    "Build a cozy bakery called Sugar Lane that sells artisan cakes, pastries, and fresh bread with a warm pink and cream color theme.",
    "Create an online plant nursery called Urban Jungle selling indoor plants, pots, and gardening tools with a modern green aesthetic.",
    "Design a minimalist watch brand called Tempo targeting professionals who appreciate clean Scandinavian design and quality leather straps.",
    "Build a craft beer delivery service called Hop Drop featuring seasonal IPAs, stouts, and sours with a bold orange and dark theme.",
    "Create a handmade pottery shop called Clay Works selling mugs, bowls, and vases with an earthy warm terracotta color palette.",
]

LONG = [
    "Build a modern minimalist skincare brand called Pure Elements, targeting young professionals who want clean science-backed beauty products with a soft sage green and cream color palette. Include sections for bestseller products, ingredient transparency, customer reviews, and newsletter signup for a loyalty program. Product categories include serums, moisturizers, and cleansers, all priced between 25 and 60 dollars.",
    "Create an upscale Italian leather goods brand named Artigiano with deep burgundy and gold colors targeting affluent professionals aged 30 to 50. Include handmade bags, wallets, belts, and accessories. Add a craftsmanship story section, customer testimonials, a size guide, and care instructions. Products range from 80 to 400 dollars.",
    "Design a trendy plant-based protein snack company called VedgeFit targeting fitness enthusiasts and health-conscious millennials with bold green, orange, and black colors. Include best-selling products, nutrition comparison table, customer before-and-after transformations, subscription plans, and an FAQ about ingredients and allergens. Products priced 3 to 15 dollars.",
    "Build an artisanal coffee subscription service called Roast Republic for coffee connoisseurs and remote workers with warm rustic brown, amber, and cream tones. Include origin story, blend flavor profiles, subscription tier comparison, customer reviews, and a brew guide tutorial. Monthly plans from 15 to 45 dollars.",
    "Create a sustainable children clothing brand called Little Sprout for eco-conscious parents with soft pastel mint green, peach, and lavender. Include a materials and sustainability section, size guide by age group, customer photo gallery, seasonal collections, and a loyalty rewards program. Products 20 to 55 dollars.",
]

OUTFILE = "/home/z/my-project/test-results.csv"
LOGFILE = "/home/z/my-project/test-matrix-output.log"

def run_test(run_num, category, idx, prompt):
    words = len(prompt.split())
    chars = len(prompt)
    body = json.dumps({"prompt": prompt})

    start = time.time()
    try:
        result = subprocess.run(
            ["curl", "-s", "-N", "--max-time", "200",
             "-X", "POST", "http://localhost:3000/api/store/generate",
             "-H", "Content-Type: application/json",
             "-d", body],
            capture_output=True, text=True, timeout=220
        )
        resp = result.stdout
    except subprocess.TimeoutExpired:
        elapsed = int(time.time() - start)
        return {"run": run_num, "idx": idx, "category": category,
                "words": words, "chars": chars, "time_s": elapsed,
                "attempt": "TIMEOUT", "ai_success": "false",
                "store_name": "(curl timeout)"}

    elapsed = int(time.time() - start)

    # Parse SSE response
    ai_success = "true"
    store_name = "(no store)"
    attempts = 0

    for line in resp.split('\n'):
        if line.startswith('event: progress'):
            if '"generating"' in line:
                attempts += 1
        elif line.startswith('data: '):
            data_str = line[6:]
            try:
                data = json.loads(data_str)
                if 'store' in data:
                    store_name = data.get('store', {}).get('name', '(no name)')
                    if data.get('_isFallback'):
                        ai_success = "false"
            except:
                pass

    if attempts == 0:
        attempts = "?"

    return {"run": run_num, "idx": idx, "category": category,
            "words": words, "chars": chars, "time_s": elapsed,
            "attempt": attempts, "ai_success": ai_success,
            "store_name": store_name}

def log(msg):
    print(msg, flush=True)
    with open(LOGFILE, 'a') as f:
        f.write(msg + '\n')

def main():
    # Clear files
    open(OUTFILE, 'w').close()
    open(LOGFILE, 'w').close()

    with open(OUTFILE, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=["run","idx","category","words","chars","time_s","attempt","ai_success","store_name"])
        writer.writeheader()

    all_prompts = [
        ("short", SHORT),
        ("medium", MEDIUM),
        ("long", LONG),
    ]

    for run_num in (1, 2):
        log(f"\n{'='*50}\n  RUN {run_num} OF 2\n{'='*50}")

        for category, prompts in all_prompts:
            for i, prompt in enumerate(prompts):
                log(f"{category.upper()} #{i+1}... ", end="")
                result = run_test(run_num, category, i, prompt)
                log(f"{result['time_s']}s | att{result['attempt']} | AI:{result['ai_success']} | {result['store_name']}")

                with open(OUTFILE, 'a', newline='') as f:
                    writer = csv.DictWriter(f, fieldnames=["run","idx","category","words","chars","time_s","attempt","ai_success","store_name"])
                    writer.writerow(result)

                time.sleep(2)

    log(f"\nDONE. Results in {OUTFILE}")

if __name__ == "__main__":
    main()
