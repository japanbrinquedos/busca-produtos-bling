import * as cheerio from "cheerio";

const SERPAPI_KEY = process.env.SERPAPI_KEY ?? "";
const UPCITEMDB_KEY = process.env.UPCITEMDB_KEY ?? "";

export async function fromUpcItemDb(ean: string) {
  if (!UPCITEMDB_KEY) return null;
  try {
    const url = `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(ean)}`;
    const res = await fetch(url);
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
  } catch {
    return null;
  }
}

export async function serpSearch(query: string): Promise<string[]> {
  if (!SERPAPI_KEY) return [];
  const url = `https://serpapi.com/search.json?engine=google&google_domain=google.com.br&q=${encodeURIComponent(query)}&api_key=${SERPAPI_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const links: string[] = (data.organic_results || [])
    .map((r: any) => r.link)
    .filter((u: string) => typeof u === "string");
  // Sinaliza preferência por fabricante/marketplaces grandes
  const prioritized = links.sort((a, b) => {
    const rank = (u: string) =>
      /(fabricante|oficial|amazon\.com\.br|mercadolivre\.com\.br|magazineluiza\.com\.br|rihappy|b2w|casasbahia|submarino|extra)/i.test(u) ? -1 : 0;
    return rank(a) - rank(b);
  });
  return prioritized.slice(0, 4);
}

export async function scrapeGeneric(url: string) {
  try {
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);

    const meta = (n: string) => $(`meta[property="${n}"]`).attr("content") || $(`meta[name="${n}"]`).attr("content") || "";
    const title = $("title").first().text().trim() || meta("og:title");
    const image = meta("og:image");
    const brand = meta("product:brand") || meta("brand") || guessBrandFromTitle(title);

    // Extrair dimensões/peso por regex no texto inteiro
    const text = $("body").text().replace(/\s+/g, " ").toLowerCase();

    // Peso (kg/g)
    let weight_kg: number | null = null;
    const mKg = text.match(/(\d+(?:[.,]\d+)?)\s*(kg|quilo)/);
    const mG  = text.match(/(\d+(?:[.,]\d+)?)\s*(g|grama)/);
    if (mKg) weight_kg = parseNumber(mKg[1]);
    else if (mG) weight_kg = +(parseNumber(mG[1]) / 1000).toFixed(3);

    // Dimensões: h x w x l em cm (ordem pode variar)
    let width_cm: number | null = null,
        height_cm: number | null = null,
        length_cm: number | null = null;

    // Padrões comuns: "10 x 20 x 30 cm" ou "altura 10cm largura 20cm comprimento 30cm"
    const mDims = text.match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(cm|cent[ií]metro)/);
    if (mDims) {
      const a = parseNumber(mDims[1]);
      const b = parseNumber(mDims[2]);
      const c = parseNumber(mDims[3]);
      // heurística: maior = comprimento, médio = largura, menor = altura
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

    return {
      title,
      brand,
      image,
      dims: { width_cm, height_cm, length_cm },
      weight_kg
    };
  } catch {
    return null;
  }
}

function parseNumber(s: string): number {
  // BR: "12,5" → 12.5
  const norm = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(norm);
  return isFinite(n) ? n : NaN;
}

function guessBrandFromTitle(t: string): string {
  if (!t) return "";
  // heurística simples
  const brands = ["hasbro","mattel","nig","junges","toymix","pais & filhos","ciranda cultural","grow","multikids","hot wheels","lego","qman"];
  const lower = t.toLowerCase();
  const hit = brands.find(b => lower.includes(b));
  return hit ? titleCase(hit) : "";
}

function titleCase(x: string) {
  return x.replace(/\b\w/g, c => c.toUpperCase());
}
