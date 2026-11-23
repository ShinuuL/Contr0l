import { LoaderCircle } from "lucide-react";

interface LoadingStateProps {
  /** Rótulo do estado; o padrão é o mesmo "Carregando…" de todas as telas. */
  label?: string;
}

/**
 * Estado de carregamento das telas. `aria-busy` fica no parágrafo, como as
 * telas já faziam antes de compartilhar isto; o giro é decorativo e desligado
 * para quem pediu movimento reduzido.
 */
export default function LoadingState({
  label = "Carregando…",
}: LoadingStateProps) {
  return (
    <p
      className="flex items-center gap-2 text-sm text-muted-foreground"
      aria-busy="true"
    >
      <LoaderCircle
        className="size-4 animate-spin motion-reduce:animate-none"
        aria-hidden
      />
      {label}
    </p>
  );
}
