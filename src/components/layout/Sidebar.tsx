import { motion } from "motion/react";
import { Settings, UserRound } from "lucide-react";
import { TAB_DEFS, type TabDef, type TabId } from "./tabs";
import appIcon from "../../assets/app-icon.png";

interface SidebarProps {
  active: TabId;
  onSelect: (id: TabId) => void;
  conta: string;
  onConta: () => void;
  onSettings: () => void;
}

export default function Sidebar({ active, onSelect, conta, onConta, onSettings }: SidebarProps) {
  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-16 items-center gap-2 px-6">
        <img src={appIcon} alt="Contr0l" className="size-8 rounded-lg" />
        <span className="wordmark text-lg">Contr0l</span>
      </div>
      <nav
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3"
        aria-label="Navegação principal"
      >
        {TAB_DEFS.map((tab) => (
          <SidebarItem
            key={tab.id}
            tab={tab}
            active={active === tab.id}
            onSelect={onSelect}
          />
        ))}
      </nav>
      <div className="flex flex-col gap-2 border-t border-border p-3">
        <button
          type="button"
          onClick={onSettings}
          className="flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Settings className="size-5 shrink-0" aria-hidden />
          <span>Configurações</span>
        </button>
        <button
          type="button"
          onClick={onConta}
          className="flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <UserRound className="size-5 shrink-0" aria-hidden />
          <span className="truncate">{conta}</span>
        </button>
      </div>
    </aside>
  );
}

function SidebarItem({
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
      className={`relative flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
        active
          ? "text-primary-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {active && (
        <motion.span
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-lg bg-primary"
          transition={{ type: "spring", stiffness: 500, damping: 35 }}
        />
      )}
      <Icon className="relative z-10 size-5" aria-hidden />
      <span className="relative z-10">{tab.label}</span>
    </button>
  );
}
