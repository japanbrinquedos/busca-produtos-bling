import { z } from "zod";

export const AutofillOutput = z.object({
  name: z.string(),
  ean13: z.string(),
  brand: z.string().optional().default(""),
  weight_kg: z.number().nullable(),
  width_cm: z.number().nullable(),
  height_cm: z.number().nullable(),
  length_cm: z.number().nullable(),
  short_description: z.string().optional().default(""),
  // ⬇️ antes era z.string().url().optional().default("")
  image_url: z.string().url().or(z.literal("")).optional().default(""),
  sources: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0)
});
