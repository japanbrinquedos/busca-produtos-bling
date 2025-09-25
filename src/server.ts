// src/server.ts
import "dotenv/config";
import express from "express";
import cors from "cors";
import { AutofillInput, AutofillOutput } from "./types.js";
import { fromUpcItemDb, serpSearch, scrapeGeneric } from "./providers.js";
import { aiRefine } from "./ai.js";

const app = express();
app.use(cors());
app.use(express.json());

// LOG de requisição simples
app.use((req, _res, next) => {
  console.log(`[req] ${req.method} ${req.url}`);
  next();
});

// Guards globais p/ erros não tratados
process.on("unhandledRejection", (r) => console.error("[unhandledRejection]", r));
process.on("uncaughtException", (e) => console.error("[uncaughtException]", e));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/autofill", async (req, res) => {
  const started = Date.now();
  try {
    const parsed = AutofillInput.safeParse({
      ean13: req.query.ean || req.query.ean13,
      name: req.query.name || ""
    });
    if (!parsed.success) {
      console.warn("[autofill] invalid input", parsed.error.flatten());
      return res.status(400).json({ error: "Parâmetros inválidos" });
    }

    const { ean13, name } = parsed.data;
    const sources: string[] = [];
    let bestName = name;
    let brand = "";
    let image_url = "";
    let width_cm: number | null = null, height_cm: number | null = null, length_cm: number | null = null;
    let weight_kg: number | null = null;
    let confidence = 0.2;

    const NO_EXTERNAL = process.env.DISABLE_EXTERNAL_FETCH === "1";

    // 1) UPCItemDB
    if (!NO_EXTERNAL) {
      const upc = await fromUpcItemDb(ean13);
      if (upc) {
        sources.push(upc.source);
        bestName = bestName || upc.name || "";
        brand = brand || upc.brand || "";
        image_url = image_url || upc.image || "";
        confidence += 0.2;
      }
    }

    // 2) Buscar páginas
    let links: string[] = [];
    if (!NO_EXTERNAL) {
      const queries = [
        `${ean13}`,
        `${ean13} ${bestName}`.trim(),
        `${bestName}`.trim()
      ].filter(Boolean);

      for (const q of queries) {
        const l = await serpSearch(q);
        links.push(...l);
      }
      links = Array.from(new Set(links)).slice(0, 4);
    }

    // 3) Scrape
    if (!NO_EXTERNAL) {
      for (const url of links) {
        const s = await scrapeGeneric(url);
        if (!s) continue;
        sources.push(url);
        if (!brand && s.brand) brand = s.brand;
        if (!image_url && s.image) image_url = s.image;
        if (!bestName && s.title) bestName = s.title;

        width_cm   = width_cm   ?? s.dims.width_cm;
        height_cm  = height_cm  ?? s.dims.height_cm;
        length_cm  = length_cm  ?? s.dims.length_cm;
        weight_kg  = weight_kg  ?? s.weight_kg;

        const hardCount = [brand, image_url, width_cm, height_cm, length_cm, weight_kg].filter(Boolean).length;
        if (hardCount >= 2) confidence = Math.min(0.85, confidence + 0.35);
      }
    }

    // 4) IA (opcional)
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

    console.log(`[autofill] ok in ${Date.now() - started}ms ean=${ean13} sources=${sources.length} noext=${NO_EXTERNAL}`);
    res.json(payload);
  } catch (err) {
    console.error("[autofill] error", err);
    res.status(500).json({ error: "Falha interna no autofill" });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => console.log(`[autofill] up on :${PORT}`));
