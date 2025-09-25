import "dotenv/config";
import express from "express";
import cors from "cors";
import { AutofillInput, AutofillOutput } from "./types.js";
import { fromUpcItemDb, serpSearch, scrapeGeneric } from "./providers.js";
import { aiRefine } from "./ai.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_, res) => res.json({ ok: true }));

app.get("/autofill", async (req, res) => {
  const parsed = AutofillInput.safeParse({
    ean13: req.query.ean || req.query.ean13,
    name: req.query.name || ""
  });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { ean13, name } = parsed.data;

  const sources: string[] = [];
  let bestName = name;
  let brand = "";
  let image_url = "";
  let width_cm: number | null = null, height_cm: number | null = null, length_cm: number | null = null;
  let weight_kg: number | null = null;
  let confidence = 0.2;

  // 1) UPCItemDB
  const upc = await fromUpcItemDb(ean13);
  if (upc) {
    sources.push(upc.source);
    bestName = bestName || upc.name || "";
    brand = brand || upc.brand || "";
    image_url = image_url || upc.image || "";
    confidence += 0.2;
  }

  // 2) Buscar páginas (SerpAPI, se disponível)
  const queries = [
    `${ean13}`,
    `${ean13} ${bestName}`.trim(),
    `${bestName}`.trim()
  ].filter(Boolean);

  let links: string[] = [];
  for (const q of queries) {
    const l = await serpSearch(q);
    links.push(...l);
  }
  links = Array.from(new Set(links)).slice(0, 4);

  // 3) Scrape das páginas
  for (const url of links) {
    const s = await scrapeGeneric(url);
    if (!s) continue;
    sources.push(url);
    if (!brand && s.brand) brand = s.brand;
    if (!image_url && s.image) image_url = s.image;
    if (!bestName && s.title) bestName = s.title;

    // Preencher dimensões/peso se vazio
    width_cm   = width_cm   ?? s.dims.width_cm;
    height_cm  = height_cm  ?? s.dims.height_cm;
    length_cm  = length_cm  ?? s.dims.length_cm;
    weight_kg  = weight_kg  ?? s.weight_kg;

    // Heurística de confiança: se conseguimos 2+ campos duros
    const hardCount = [brand, image_url, width_cm, height_cm, length_cm, weight_kg].filter(Boolean).length;
    if (hardCount >= 2) confidence = Math.min(0.85, confidence + 0.35);
  }

  // 4) Refinar com IA (opcional)
  const ai = await aiRefine({ name: bestName, brand, ean13, weight_kg, width_cm, height_cm, length_cm });
  brand = ai.brand || brand;
  const short_description = ai.short_description || "";

  const payload = AutofillOutput.parse({
    name: bestName || "",
    ean13,
    brand: brand || "",
    weight_kg: weight_kg ?? null,
    width_cm: width_cm ?? null,
    height_cm: height_cm ?? null,
    length_cm: length_cm ?? null,
    short_description,
    image_url: image_url || "",
    sources,
    confidence
  });

  res.json(payload);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`[autofill] up on :${PORT}`);
});
