// src/providers.ts
import * as cheerio from "cheerio";

const SERPAPI_KEY = process.env.SERPAPI_KEY ?? "";
const UPCITEMDB_KEY = process.env.UPCITEMDB_KEY ?? "";

function withTimeout(ms: number) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, clear: () => clearTimeout(t) };
}

export async function fromUpcItemDb(ean: string) {
  if (!UPCITEMDB_KEY) return null;
  try {
    const url = `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(ean)}`;
    const { signal, clear } = withTimeout(6000);
    const res = await fetch(url, { signal });
    clear();
    if (!res.ok) return null;
    const data = await res.json();
    const item = data?.items?.[0];
    if (!item) return null;
    return {
      name: item.title || "",
      brand: item.brand || "",
      image: (item.images && item.images[0]) || "",
      source: item.offers?.[0]?.link || item.elid || url
    };
  } catch (e) {
    console.warn("[upcitemdb] fail", String(e));
    return null;
  }
}

export async function serpSearch(query: string): Promise<string[]> {
  if (!SERPAPI_KEY) return [];
  try {
    const url = `https://serpapi.com/search.json?engine=google&google_domain=google.com.br&q=${encodeURIComponent(query)}&api_key=${SERPAPI_KEY}`;
    const { signal, clear } = withTimeout(7000);
    const res = await fetch(url, { signal });
    clear();
    if (!res.ok) return [];
    const data = await res.json();
    const links: string[] = (data.organic_results || [])
      .map((r: any) => r.link)
      .filter((u: string) => typeof u === "string");
    const prioritized = links.sort((a, b) => {
      const score = (u: string) =>
        /(fabricante|oficial|amazon\.com\.br|mercadolivre\.com\.br|magazineluiza\.com\.br|rihappy|casasbahia|submarino|extra)/i.test(u) ? -1 : 0;
      return score(a) - score(b);
    });
    return prioritized.slice(0, 4);
  } catch (e) {
    console.warn("[serpapi] fail", String(e));
    return [];
  }
}

export async function scrapeGeneric(url: string) {
  try {
    const { signal, clear } = withTimeout(8000);
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" }, signal });
    clear();
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);

    const meta = (n: string) => $(`meta[property="${n}"]`).attr("content") || $(`meta[name="${n}"]`).attr("content") || "";
    const title = $("title").first().text().trim() || meta("og:title");
    const image = meta("og:image");
    const brand = meta("product:brand") || meta("brand") || guessBrandFromTitle(title);

    const text = $("body").text().replace(/\s+/g, " ").toLowerCase();

    let weight_kg: number | null = null;
    const mKg = text.match(/(\d+(?:[.,]\d+)?)\s*(kg|quilo)/);
    const mG  = text.match(/(\d+(?:[.,]\d+)?)\s*(g|grama)/);
    if (mKg) weight_kg = parseNumber(mKg[1]);
    else if (mG) weight_kg = +(parseNumber(mG[1]) / 1000).toFixed(3);

    let width_cm: number | null = null,
        height_cm: number | null = null,
        length_cm: number | null = null;

    const mDims = text.match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(cm|cent[ií]metro)/);
    if (mDims) {
      const a = parseNumber(mDims[1]);
      const b = parseNumber(mDims[2]);
      const c = parseNumber(mDims[3]);
      const arr = [a, b, c].sort((x, y) => x - y);
      height_cm = arr[0]; width_cm = arr[1]; length_cm = arr[2];
    } else {
      const h = text.match(/altura[^0-9]{0,10}(\d+(?:[.,]\d+)?)/);
      const w = text.match(/largura[^0-9]{0,10}(\d+(?:[.,]\d+)?)/);
      const l = text.match(/comprimento[^0-9]{0,10}(\d+(?:[.,]\d+)?)/);
      height_cm = h ? parseNumber(h[1]) : null;
      width_cm  = w ? parseNumber(w[1]) : null;
      length_cm = l ? parseNumber(l[1]) : null;
    }

    return { title, brand, image, dims: { width_cm, height_cm, length_cm }, weight_kg };
  } catch (e) {
    console.warn("[scrape] fail", String(e));
    return null;
  }
}

function parseNumber(s: string): number {
  const norm = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(norm);
  return isFinite(n) ? n : NaN;
}

function guessBrandFromTitle(t: string) {
  if (!t) return "";
  const brands = ["hasbro","mattel","nig","junges","toymix","pais & filhos","ciranda cultural","grow","multikids","hot wheels","lego","qman"];
  const lower = t.toLowerCase();
  const hit = brands.find(b => lower.includes(b));
  return hit ? hit.replace(/\b\w/g, c => c.toUpperCase()) : "";
}
