import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, KeyRound, LoaderCircle, Trash2 } from "lucide-react";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import ErrorBanner from "../../components/ui/ErrorBanner";
import { formatCentsInput, parseToCents } from "../../lib/currency";
import { todayISO } from "../../lib/date";
import type { Category, CreateTransactionInput, MovementNature } from "../../lib/types";
import {
  fileToBase64,
  geminiAnalisarCupom,
  geminiConfigurarChave,
  geminiRemoverChave,
  geminiTemChave,
  sugerirCategoriaId,
  type CupomPreview,
} from "./geminiClient";

interface GeminiCupomModalProps {
  open: boolean;
  categories: Category[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onCreate: (values: CreateTransactionInput) => Promise<void>;
}

type Step = "config" | "upload" | "preview";

const inputClass =
  "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-2 focus:outline-ring";
const labelClass = "mb-1.5 block text-sm font-medium text-foreground";

export default function GeminiCupomModal({
  open,
  categories,
  onClose,
  onSaved,
  onCreate,
}: GeminiCupomModalProps) {
  const [step, setStep] = useState<Step>("upload");
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CupomPreview | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);

  // Preview form state
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [categoryId, setCategoryId] = useState("");
  const [nature, setNature] = useState<MovementNature>("saida");

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(true);
    geminiTemChave()
      .then((ok) => {
        setHasKey(ok);
        setStep(ok ? "upload" : "config");
      })
      .catch(() => {
        setHasKey(false);
        setStep("config");
      })
      .finally(() => setBusy(false));
  }, [open]);

  const resetFlow = () => {
    setPreview(null);
    setImageName(null);
    setDescription("");
    setAmount("");
    setDate(todayISO());
    setCategoryId("");
    setNature("saida");
    setError(null);
  };

  const handleClose = () => {
    setApiKey("");
    resetFlow();
    onClose();
  };

  const handleSaveKey = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setError("Informe a chave da API do Gemini.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await geminiConfigurarChave(trimmed);
      setHasKey(true);
      setApiKey("");
      setStep("upload");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveKey = async () => {
    setBusy(true);
    setError(null);
    try {
      await geminiRemoverChave();
      setHasKey(false);
      setStep("config");
      resetFlow();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const applyPreview = (p: CupomPreview) => {
    setPreview(p);
    setDescription(p.description ?? "");
    setAmount(formatCentsInput(p.amount_cents));
    setDate(p.date || todayISO());
    setNature(p.nature === "entrada" ? "entrada" : "saida");
    const suggested = sugerirCategoriaId(p.suggested_category, categories);
    setCategoryId(suggested || (categories[0]?.id ?? ""));
    setStep("preview");
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Selecione uma imagem do cupom (JPEG, PNG, WEBP ou HEIC).");
      return;
    }
    if (file.size > 4_500_000) {
      setError("Imagem muito grande. Use uma foto menor (até ~4 MB).");
      return;
    }
    setBusy(true);
    setError(null);
    setImageName(file.name);
    try {
      const base64 = await fileToBase64(file);
      const p = await geminiAnalisarCupom(base64, file.type || "image/jpeg");
      applyPreview(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const amountCents = parseToCents(amount);
    if (amountCents == null || amountCents <= 0) {
      setError("Informe um valor válido maior que zero.");
      return;
    }
    if (!date) {
      setError("Informe a data.");
      return;
    }
    if (!categoryId) {
      setError("Selecione uma categoria.");
      return;
    }

    const values: CreateTransactionInput = {
      description: description.trim(),
      amount_cents: amountCents,
      date,
      category_id: categoryId,
      nature,
      status: "realizado",
    };

    setBusy(true);
    try {
      await onCreate(values);
      await onSaved();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const title =
    step === "config"
      ? "Configurar Gemini"
      : step === "preview"
        ? "Confirmar lançamento"
        : "Lançar por foto";

  return (
    <Modal open={open} onClose={handleClose} title={title}>
      <div className="flex flex-col gap-4 p-4">
        {error && <ErrorBanner message={error} />}

        {step === "config" && (
          <form className="flex flex-col gap-4" onSubmit={handleSaveKey}>
            <p className="text-sm text-muted-foreground">
              Informe sua chave da API do Gemini (free tier). A chave fica cifrada
              localmente neste aparelho e é usada apenas para ler cupons.
            </p>
            <div>
              <label className={labelClass} htmlFor="gemini-api-key">
                Chave da API Gemini
              </label>
              <input
                id="gemini-api-key"
                type="password"
                autoComplete="off"
                className={inputClass}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIza..."
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" onClick={handleClose} disabled={busy}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Salvando…" : "Salvar chave"}
              </Button>
            </div>
          </form>
        )}

        {step === "upload" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Envie a foto de um cupom ou nota. O Gemini extrai os dados e você revisa
              antes de salvar.
            </p>

            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              className="hidden"
              aria-label="Selecionar foto do cupom"
              onChange={(e) => void handleFile(e.currentTarget.files?.[0] ?? undefined)}
            />

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="flex-1"
              >
                {busy ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Camera className="size-4" aria-hidden />
                )}
                {busy ? "Analisando cupom…" : "Selecionar foto"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep("config")}
                disabled={busy}
              >
                <KeyRound className="size-4" aria-hidden />
                Chave
              </Button>
            </div>

            {hasKey && (
              <button
                type="button"
                className="inline-flex items-center gap-1 self-start text-xs text-muted-foreground hover:text-destructive"
                onClick={() => void handleRemoveKey()}
                disabled={busy}
              >
                <Trash2 className="size-3.5" aria-hidden />
                Remover chave da API
              </button>
            )}
          </div>
        )}

        {step === "preview" && (
          <form className="flex flex-col gap-4" onSubmit={handleConfirm}>
            <p className="text-sm text-muted-foreground">
              Revise os dados extraídos {imageName ? `de ${imageName}` : ""} antes de salvar.
              {preview?.confidence ? ` Confiança: ${preview.confidence}.` : ""}
            </p>

            <div>
              <label className={labelClass} htmlFor="cupom-desc">Descrição</label>
              <input
                id="cupom-desc"
                className={inputClass}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={120}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="cupom-valor">Valor (R$)</label>
                <input
                  id="cupom-valor"
                  className={inputClass}
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="cupom-data">Data</label>
                <input
                  id="cupom-data"
                  type="date"
                  className={inputClass}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="cupom-cat">Categoria</label>
                <select
                  id="cupom-cat"
                  className={inputClass}
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">Selecione...</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="cupom-natureza">Natureza</label>
                <select
                  id="cupom-natureza"
                  className={inputClass}
                  value={nature}
                  onChange={(e) => setNature(e.target.value as MovementNature)}
                >
                  <option value="saida">Saída</option>
                  <option value="entrada">Entrada</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => { setStep("upload"); setError(null); }}
                disabled={busy}
              >
                Voltar
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Salvando…" : "Salvar lançamento"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
