// Fetches daily KOSPI/KOSDAQ closing prices from the 금융위원회_주식시세정보 API
// (data.go.kr) and writes them to data/stocks/ for the static page to read.
//
// Usage: DATA_GO_KR_KEY=<디코딩 인증키> node scripts/fetch-stocks.mjs
//
// The API publishes a trading day's data on the next business day (afternoon),
// so this checks every calendar day after the last stored date up to today.

import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const API_BASE = process.env.STOCK_API_BASE
  || "https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo";
const KEY = process.env.DATA_GO_KR_KEY;
const OUT_DIR = path.resolve(process.env.STOCK_OUT_DIR || "data/stocks");
const KEEP_DAYS = 30;          // trading days kept for settling pending orders
const FIRST_RUN_LOOKBACK = 10; // calendar days checked when nothing is stored yet
const MARKETS = { KOSPI: "P", KOSDAQ: "Q" };

if (!KEY) {
  console.error("DATA_GO_KR_KEY is not set.");
  process.exit(1);
}

const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, "");
const kstToday = () => new Date(Date.now() + 9 * 3600_000);

async function fetchDay(basDt) {
  const rows = [];
  for (let pageNo = 1; ; pageNo++) {
    const params = new URLSearchParams({
      serviceKey: KEY, resultType: "json", numOfRows: "1000", pageNo: String(pageNo), basDt,
    });
    const res = await fetch(`${API_BASE}?${params}`);
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${basDt}: ${text.slice(0, 200)}`);
    let json;
    try { json = JSON.parse(text); } catch {
      // Key errors come back as XML even when JSON is requested.
      throw new Error(`Unexpected response for ${basDt}: ${text.slice(0, 200)}`);
    }
    const header = json.response?.header;
    if (header && header.resultCode !== "00") throw new Error(`API error ${header.resultCode}: ${header.resultMsg}`);
    const body = json.response?.body;
    let items = body?.items?.item ?? [];
    if (!Array.isArray(items)) items = [items];
    for (const it of items) {
      const market = MARKETS[it.mrktCtg];
      const close = Number(it.clpr);
      if (!market || !(close > 0)) continue;
      rows.push([it.srtnCd, it.itmsNm, market, close, Number(it.fltRt) || 0, Number(it.trPrc) || 0]);
    }
    const total = Number(body?.totalCount) || 0;
    if (!items.length || pageNo * 1000 >= total) break;
  }
  rows.sort((a, b) => b[5] - a[5]);
  return rows;
}

async function readIndex() {
  try {
    return JSON.parse(await readFile(path.join(OUT_DIR, "latest.json"), "utf8"));
  } catch {
    return { dates: [] };
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const index = await readIndex();
  const dates = new Set(index.dates);

  const today = kstToday();
  let cursor;
  if (index.dates.length) {
    const last = index.dates[index.dates.length - 1];
    cursor = new Date(Date.UTC(+last.slice(0, 4), +last.slice(4, 6) - 1, +last.slice(6, 8) + 1));
  } else {
    cursor = new Date(today);
    cursor.setUTCDate(cursor.getUTCDate() - FIRST_RUN_LOOKBACK);
  }

  let added = 0;
  for (; ymd(cursor) <= ymd(today); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const day = cursor.getUTCDay();
    if (day === 0 || day === 6) continue;
    const basDt = ymd(cursor);
    const rows = await fetchDay(basDt);
    if (!rows.length) {
      console.log(`${basDt}: no data (holiday or not published yet)`);
      continue;
    }
    const file = { date: basDt, fields: ["code", "name", "market", "close", "changePct", "tradeValue"], rows };
    await writeFile(path.join(OUT_DIR, `${basDt}.json`), JSON.stringify(file));
    dates.add(basDt);
    added++;
    console.log(`${basDt}: ${rows.length} stocks`);
  }

  const sorted = [...dates].sort();
  const kept = sorted.slice(-KEEP_DAYS);
  for (const f of await readdir(OUT_DIR)) {
    const m = f.match(/^(\d{8})\.json$/);
    if (m && !kept.includes(m[1])) await unlink(path.join(OUT_DIR, f));
  }
  await writeFile(
    path.join(OUT_DIR, "latest.json"),
    JSON.stringify({ latest: kept[kept.length - 1] ?? null, dates: kept, updatedAt: new Date().toISOString() }, null, 2) + "\n",
  );
  console.log(`added ${added} day(s); stored: ${kept.join(", ") || "none"}`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
