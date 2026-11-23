import type { ReactNode } from "react";

/**
 * Classe da <section> que envolve a tela. Um lugar só define padding e ritmo
 * vertical; a tela usa o mesmo `id` daqui no `aria-labelledby` da section.
 */
export const SCREEN_SECTION_CLASS = "space-y-6 p-4 md:p-8";

interface ScreenHeaderProps {
  /** Id do <h2>: a <section> da tela aponta para ele em aria-labelledby. */
  id: string;
  title: string;
  /** Ação principal do contexto (criar, importar), à direita do título. */
  action?: ReactNode;
  /** Controles de contexto (período, filtros), em linha abaixo do título. */
  toolbar?: ReactNode;
}

/**
 * Cabeçalho padrão das telas: título, ação principal e, quando houver,
 * controles de período/filtro. A ordem é sempre a mesma em todas as telas, e
 * por isso os controles de contexto ficam abaixo do título -- não ao lado,
 * onde competiriam com a ação principal por espaço no celular.
 */
export default function ScreenHeader({
  id,
  title,
  action,
  toolbar,
}: ScreenHeaderProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={id} className="text-xl font-semibold tracking-tight">
          {title}
        </h2>
        {action ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {action}
          </div>
        ) : null}
      </div>
      {toolbar ? (
        <div className="flex flex-wrap items-center gap-3">{toolbar}</div>
      ) : null}
    </div>
  );
}
