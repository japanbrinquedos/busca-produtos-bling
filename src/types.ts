import { z } from "zod";

export const AutofillInput = z.object({
  ean13: z.string().min(8),
  name: z.string().optional().default(""),
});

export type AutofillInput = z.infer<typeof AutofillInput>;

export const AutofillOutput = z.object({
  name: z.string(),
  ean13: z.string(),
  brand: z.string().optional().default(""),
  weight_kg: z.number().nullable(),
  width_cm: z.number().nullable(),
  height_cm: z.number().nullable(),
  length_cm: z.number().nullable(),
  short_description: z.string().optional().default(""),
  image_url: z.string().url().optional().default(""),
  sources: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0)
});

export type AutofillOutput = z.infer<typeof AutofillOutput>;
