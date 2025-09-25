const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";

export async function aiRefine(input: {
  name?: string; brand?: string; weight_kg?: number | null;
  width_cm?: number | null; height_cm?: number | null; length_cm?: number | null;
  ean13: string;
}) {
  if (!OPENAI_API_KEY) return { short_description: "", brand: input.brand || "" };

  const prompt = `
Você é um normalizador de dados de produto para marketplaces.
Dados:
- Nome: ${input.name ?? ""}
- Marca: ${input.brand ?? ""}
- EAN13: ${input.ean13}
- Peso (kg): ${input.weight_kg ?? ""}
- Largura (cm): ${input.width_cm ?? ""}
- Altura (cm): ${input.height_cm ?? ""}
- Comprimento (cm): ${input.length_cm ?? ""}

Tarefas:
1) Marque "Marca" com capitalização correta e sem palavras extras.
2) Gere uma "Descrição Curta" (máx. 180 caracteres, sem emojis), destacando o essencial e dimensões se disponíveis.
Responda ONLY em JSON com {"brand":"...", "short_description":"..."}.
  `.trim();

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "authorization": `Bearer ${OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2
    })
  });
  if (!res.ok) return { short_description: "", brand: input.brand || "" };
  const data = await res.json();
  const txt = data?.choices?.[0]?.message?.content ?? "{}";
  try { return JSON.parse(txt); } catch { return { short_description: "", brand: input.brand || "" }; }
}
