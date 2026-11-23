import { motion } from "motion/react";
import { TAB_DEFS, type TabDef, type TabId } from "./tabs";

interface BottomNavProps {
  active: TabId;
  onSelect: (id: TabId) => void;
}

/**
 * Barra inferior do celular. As colunas saem da contagem de `TAB_DEFS` (não de
 * um `grid-cols-3` fixo), então acrescentar uma aba não quebra o desenho: quem
 * cresce a lista não precisa voltar aqui. Os rótulos truncam antes de estourar
 * a coluna, e o nome acessível do botão continua sendo o texto inteiro, porque
 * truncar é só visual.
 */
export default function BottomNav({ active, onSelect }: BottomNavProps) {
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${TAB_DEFS.length}, minmax(0, 1fr))`,
        }}
      >
        {TAB_DEFS.map((tab) => (
          <BottomNavItem
            key={tab.id}
            tab={tab}
            active={active === tab.id}
            onSelect={onSelect}
          />
        ))}
      </div>
    </nav>
  );
}

function BottomNavItem({
  tab,
  active,
  onSelect,
}: {
  tab: TabDef;
  active: boolean;
  onSelect: (id: TabId) => void;
}) {
  const Icon = tab.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(tab.id)}
      aria-current={active ? "page" : undefined}
      className={`relative flex h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 text-xs font-medium transition-colors ${
        active ? "text-primary" : "text-muted-foreground"
      }`}
    >
      {active && (
        <motion.span
          layoutId="bottomnav-active"
          className="absolute top-0 h-0.5 w-10 rounded-full bg-primary"
          transition={{ type: "spring", stiffness: 500, damping: 35 }}
        />
      )}
      <Icon className="size-6 shrink-0" aria-hidden />
      <span className="max-w-full truncate">{tab.label}</span>
    </button>
  );
}
