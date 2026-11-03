import { readFile } from "node:fs/promises";

export interface VisionAdapter {
  analyze(imagePath: string, prompt: string): Promise<string>;
}

export function createGeminiAdapter(
  apiKey: string,
  model: string,
  fetchImpl: typeof fetch = fetch,
): VisionAdapter {
  return {
    async analyze(imagePath, prompt) {
      const bytes = await readFile(imagePath);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model,
      )}:generateContent?key=${encodeURIComponent(apiKey)}`;

      const response = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: "image/jpeg",
                    data: bytes.toString("base64"),
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
          },
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `Gemini ${response.status}: ${detail.slice(0, 300)}`,
        );
      }

      const body = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      const text =
        body.candidates?.[0]?.content?.parts
          ?.map((part) => part.text ?? "")
          .join("") ?? "";

      if (!text.trim()) {
        throw new Error("Gemini returned an empty response");
      }
      return text;
    },
  };
}
