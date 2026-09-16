// src/components/ReportCard/bulkFetch.ts
// Fetches BISE Peshawar results for a list of roll numbers via the existing
// /api/bisep-proxy endpoint, with bounded concurrency + per-roll retries.
//
// Design choices:
//   • Concurrency = 6  — keeps BISE load reasonable (the proxy already
//     shells out to curl, each call takes ~300-700ms). 6 parallel keeps
//     total time for 30 rolls under ~5s.
//   • Retries = 2 per roll  — recovers from transient Vercel cold-start
//     502s and BISE origin hiccups without hammering.
//   • Per-roll progress callback  — the UI shows "12/30: fetching 703988".
//   • No caching here  — caching is the proxy's job (s-maxage). Repeated
//     lookups within the cache window are essentially free.

import type { BisepResult, NormalizedResult, ProgressCallback } from "./types";
import { normalizeResult } from "./normalize";

const PROXY_URL = "/api/bisep-proxy";
const CONCURRENCY = 6;
const MAX_RETRIES = 4;
const RETRY_DELAY_MS = 800;

/** Sleep helper. */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Fetch a single roll number with retries. Returns the raw proxy response. */
async function fetchOne(roll: string): Promise<BisepResult> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const r = await fetch(`${PROXY_URL}?roll=${encodeURIComponent(roll)}`, {
        headers: { Accept: "application/json" },
      });
      // Vercel may return an HTML error page if the function crashes —
      // guard the JSON parse.
      let body: unknown = null;
      try {
        body = await r.json();
      } catch {
        body = null;
      }
      if (!body || typeof body !== "object") {
        throw new Error(`Invalid response (HTTP ${r.status})`);
      }
      return body as BisepResult;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Only retry on network errors / 5xx — not on "not found".
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }
  return {
    found: false,
    error: lastError?.message ?? "Network error",
  };
}

/** Run an array of items through an async worker with bounded concurrency. */
async function pool<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function run(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  }
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => run());
  await Promise.all(runners);
  return results;
}

/** Fetch results for a list of roll numbers, with progress reporting.
 *  Returns a list of NormalizedResult in the SAME ORDER as the input.
 *  `className` is required now — it's what percentage is computed against
 *  (600 total for 9th, 1200 for 10th; see classMaxMarks.ts).
 *
 *  Internally this runs TWO passes: the first pass fetches every roll at
 *  the configured concurrency (with MAX_RETRIES retries each). Any roll
 *  that still came back not-found after that — which in practice happens
 *  under load (Vercel cold starts, BISE origin hiccups, or the proxy's
 *  own concurrency limits queuing requests) — gets one more dedicated,
 *  lower-concurrency retry pass before being reported as missing. This
 *  is what closes the gap where a first attempt would silently return
 *  e.g. 43/54 saved rolls instead of all 54: those 11 weren't actually
 *  missing results, they just didn't get a clean response in time. */
export async function bulkFetchResults(
  rolls: string[],
  className: "9th" | "10th",
  onProgress?: ProgressCallback
): Promise<NormalizedResult[]> {
  const total = rolls.length;
  let done = 0;

  const raw = await pool(
    rolls,
    async (roll) => {
      const r = await fetchOne(roll);
      done += 1;
      onProgress?.(done, total, roll);
      return r;
    },
    CONCURRENCY
  );

  // ── Second sweep: retry any roll that still isn't found ──────────────
  // A "not found" from fetchOne after its own retries can still be a
  // transient failure rather than a genuine invalid roll number, so we
  // give the whole missing batch one more pass at lower concurrency
  // (gentler on the proxy) before accepting the result as final.
  const missingIdx = raw
    .map((r, i) => (!r.found ? i : -1))
    .filter((i) => i !== -1);

  if (missingIdx.length > 0) {
    const retryRolls = missingIdx.map((i) => rolls[i]);
    const retried = await pool(
      retryRolls,
      (roll) => fetchOne(roll),
      Math.min(3, CONCURRENCY)
    );
    missingIdx.forEach((idx, j) => {
      if (retried[j].found) raw[idx] = retried[j];
    });
  }

  return raw.map((r, i) => normalizeResult(r, rolls[i], className));
}
