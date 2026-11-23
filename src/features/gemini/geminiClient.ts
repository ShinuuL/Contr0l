import { invoke } from "@tauri-apps/api/core";

export interface CupomPreview {
  description: string;
  amount_cents: number;
  date: string;
  nature: "entrada" | "saida";
  suggested_category: string | null;
  confidence: "alta" | "media" | "baixa" | null;
}

export async function geminiTemChave(): Promise<boolean> {
  return invoke<boolean>("gemini_tem_chave");
}

export async function geminiConfigurarChave(apiKey: string): Promise<boolean> {
  return invoke<boolean>("gemini_configurar_chave", { apiKey });
}

export async function geminiRemoverChave(): Promise<boolean> {
  return invoke<boolean>("gemini_remover_chave");
}

export async function geminiAnalisarCupom(
  imageBase64: string,
  mimeType: string,
): Promise<CupomPreview> {
  return invoke<CupomPreview>("gemini_analisar_cupom", {
    imageBase64,
    mimeType,
  });
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const comma = result.indexOf(",");
      if (comma === -1) {
        reject(new Error("Não foi possível ler a imagem."));
        return;
      }
      resolve(result.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });
}

export function sugerirCategoriaId(
  suggestedName: string | null | undefined,
  categories: { id: string; name: string }[],
): string {
  if (!suggestedName) return "";
  const needle = suggestedName.trim().toLowerCase();
  if (!needle) return "";
  const exact = categories.find((c) => c.name.toLowerCase() === needle);
  if (exact) return exact.id;
  const partial = categories.find(
    (c) =>
      c.name.toLowerCase().includes(needle) ||
      needle.includes(c.name.toLowerCase()),
  );
  return partial?.id ?? "";
}
