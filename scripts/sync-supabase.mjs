// Pushes stored daily stock prices into Supabase, settles pending stock orders
// and refreshes the leaderboard.
//
// Usage:
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_KEY=<secret key> node scripts/sync-supabase.mjs
//   ... node scripts/sync-supabase.mjs --rankings-only   (just refresh the leaderboard)

import { readFile } from "node:fs/promises";
import path from "node:path";

const URL_BASE = (process.env.SUPABASE_URL || "").replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
const KEY = process.env.SUPABASE_SERVICE_KEY;
const DATA_DIR = path.resolve(process.env.STOCK_OUT_DIR || "data/stocks");
const KEEP_DAYS = 40; // calendar days of prices kept in the database
const CHUNK = 1000;

if (!URL_BASE || !KEY) {
  console.log("SUPABASE_URL or SUPABASE_SERVICE_KEY is not set; skipping Supabase sync.");
  process.exit(0);
}

// Only the apikey header is sent: it works for both new secret keys (sb_secret_...)
// and legacy service_role JWTs.
async function api(method, route, body, extraHeaders = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${route}`, {
    method,
    headers: { apikey: KEY, "Content-Type": "application/json", ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${route} → HTTP ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const toIso = ymd => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;

async function pushPrices() {
  let index;
  try {
    index = JSON.parse(await readFile(path.join(DATA_DIR, "latest.json"), "utf8"));
  } catch {
    console.log("No stock data files yet.");
    return;
  }
  const latestRow = await api("GET", "stock_prices?select=bas_dt&order=bas_dt.desc&limit=1");
  const dbLatest = latestRow?.[0]?.bas_dt?.replace(/-/g, "") ?? "";

  for (const date of index.dates.filter(d => d > dbLatest)) {
    const file = JSON.parse(await readFile(path.join(DATA_DIR, `${date}.json`), "utf8"));
    const rows = file.rows.map(([code, name, market, close, changePct, tradeValue, open, high, low]) => ({
      bas_dt: toIso(date), code, name, market, close,
      open: open ?? close, high: high ?? close, low: low ?? close,
      change_pct: changePct, trade_value: tradeValue,
    }));
    for (let i = 0; i < rows.length; i += CHUNK) {
      await api("POST", "stock_prices?on_conflict=bas_dt,code", rows.slice(i, i + CHUNK),
        { Prefer: "resolution=merge-duplicates,return=minimal" });
    }
    console.log(`${date}: pushed ${rows.length} prices`);
  }

  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400_000).toISOString().slice(0, 10);
  await api("DELETE", `stock_prices?bas_dt=lt.${cutoff}`, undefined, { Prefer: "return=minimal" });
}

async function main() {
  if (!process.argv.includes("--rankings-only")) {
    await pushPrices();
    const settled = await api("POST", "rpc/settle_stock_orders", {});
    console.log(`settled ${settled} stock order(s)`);
  }
  const ranked = await api("POST", "rpc/refresh_rankings", {});
  console.log(`refreshed rankings for ${ranked} account(s)`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
