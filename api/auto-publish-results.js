// api/auto-publish-results.js
// Vercel Cron Job target — runs server-side on a schedule (see vercel.json
// "crons") and does NOT depend on any admin/user having a browser tab open.
//
// WHY THIS FILE EXISTS:
//   The "Schedule Publish" feature in AdminResults.tsx sets `publish_at` on
//   `results` rows, but the ONLY code that ever checked whether that time had
//   passed was `ResultCountdownTimer`, a React component that runs its check
//   inside a `useEffect` in the admin's own browser. If the admin (or anyone)
//   didn't have that exact panel open in a tab when the countdown hit zero,
//   `is_published` never flipped to `true` — so the Home page kept showing
//   the BISE Peshawar fallback forever, even though the countdown said 0s.
//
//   This endpoint fixes that by doing the actual publish flip on the server,
//   on a schedule, independent of any browser being open.
//
// SECURITY:
//   Protected by CRON_SECRET so randoms can't hit this URL and mass-publish
//   results early. Vercel automatically sends this header for Cron-triggered
//   invocations when CRON_SECRET is set as an env var (see vercel.json).
//
// SETUP REQUIRED (one-time):
//   1. In Vercel project settings → Environment Variables, add:
//        CRON_SECRET = <any long random string>
//   2. vercel.json now has a "crons" entry hitting this route every minute.
//   3. Redeploy.

export default async function handler(req, res) {
  // ── Auth: only Vercel Cron (or someone with the secret) may call this ──
  const authHeader = req.headers.authorization || "";
  const expected = process.env.CRON_SECRET;
  if (expected && authHeader !== `Bearer ${expected}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || // preferred if available
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    res.status(500).json({ error: "Supabase env vars not configured" });
    return;
  }

  try {
    const nowIso = new Date().toISOString();

    // Flip is_published -> true for every row whose scheduled time has
    // passed and that isn't published yet. PostgREST PATCH with `select`
    // returns the updated rows so we can report how many were published.
    const url =
      `${supabaseUrl}/rest/v1/results?is_published=eq.false&publish_at=not.is.null&publish_at=lte.${encodeURIComponent(nowIso)}`;

    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ is_published: true }),
    });

    if (!response.ok) {
      const text = await response.text();
      res.status(502).json({ error: "Supabase update failed", detail: text });
      return;
    }

    const updated = await response.json();
    res.status(200).json({
      ok: true,
      published_count: Array.isArray(updated) ? updated.length : 0,
      checked_at: nowIso,
    });
  } catch (err) {
    res.status(500).json({ error: "Auto-publish failed", detail: String(err) });
  }
}
