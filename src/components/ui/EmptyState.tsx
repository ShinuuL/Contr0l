import type { ReactNode } from "react";

interface EmptyStateProps {
  /** Explicação do vazio, no tom da tela. */
  children: ReactNode;
  /** Caminho de saída: no máximo uma ação. Vazio sem saída é beco. */
  action?: ReactNode;
}

/**
 * Bloco único de "não há nada aqui": mesma borda tracejada, mesmo padding e
 * mesmo centro nas três telas. Fundo transparente de propósito -- é ausência
 * de conteúdo, então não compete com os cartões sólidos que têm dados.
 */
export default function EmptyState({ children, action }: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {children}
      {action ? (
        <div className="mt-3 flex justify-center">{action}</div>
      ) : null}
    </div>
  );
}
