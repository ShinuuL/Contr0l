import { useEffect, useState } from "react";
import { Settings, UserRound, X } from "lucide-react";
import { useBackGuard } from "../../lib/navigation/backGuard";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import type { TabId } from "./tabs";
import DashboardScreen from "../../features/dashboard/DashboardScreen";
import CategoriesScreen from "../../features/categories/CategoriesScreen";
import TransactionsScreen from "../../features/transactions/TransactionsScreen";
import SettingsScreen from "../../features/settings/SettingsScreen";
import AccountModal from "../../features/auth/AccountModal";
import { sessaoAtual, type Sessao } from "../../features/auth/authClient";
import { useBackupAutomatico } from "../../lib/cloud/useBackupAutomatico";
import UpdateBanner from "../../features/update/UpdateBanner";
import {
  verificarAtualizacao,
  type EstadoAtualizacao,
} from "../../features/update/updateClient";
import appIcon from "../../assets/app-icon.png";

export default function AppShell() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [contaAberta, setContaAberta] = useState(false);
  const [settingsAberto, setSettingsAberto] = useState(false);
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [checagemManual, setChecagemManual] = useState<EstadoAtualizacao | null>(null);

  useEffect(() => {
    let cancelado = false;
    sessaoAtual()
      .then((s) => {
        if (!cancelado) setSessao(s);
      })
      .catch(() => {
        // Sessao indisponivel nao pode derrubar o app: ele e local-first.
      });
    return () => {
      cancelado = true;
    };
  }, []);

  useBackGuard(activeTab !== "dashboard" || settingsAberto, () => {
    if (settingsAberto) {
      setSettingsAberto(false);
    } else {
      setActiveTab("dashboard");
    }
  });

  useBackupAutomatico(sessao !== null);

  async function verificarAgora(): Promise<EstadoAtualizacao> {
    const novo = await verificarAtualizacao(true);
    setChecagemManual(novo);
    return novo;
  }

  const screen =
    activeTab === "dashboard" ? (
      <DashboardScreen />
    ) : activeTab === "transactions" ? (
      <TransactionsScreen />
    ) : (
      <CategoriesScreen />
    );

  return (
    <div className="theme-shell flex min-h-dvh flex-col bg-background text-foreground md:flex-row">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-surface px-4 md:hidden">
        <div className="flex items-center gap-2">
          <img src={appIcon} alt="Contr0l" className="size-8 rounded-lg" />
          <span className="wordmark text-base">Contr0l</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSettingsAberto(true)}
            aria-label="Configurações"
            className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
          >
            <Settings className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setContaAberta(true)}
            aria-label={sessao ? `Conta: ${sessao.email}` : "Conta"}
            className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
          >
            <UserRound className="size-5" aria-hidden />
          </button>
        </div>
      </header>
      <Sidebar
        active={activeTab}
        onSelect={setActiveTab}
        conta={sessao ? sessao.email : "Conta"}
        onConta={() => setContaAberta(true)}
        onSettings={() => setSettingsAberto(true)}
      />
      <main className="min-w-0 flex-1 pb-20 md:pb-0">
        <UpdateBanner estadoExterno={checagemManual} />
        {screen}
      </main>
      <BottomNav active={activeTab} onSelect={setActiveTab} />
      {settingsAberto && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-surface shadow-lg">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h2 className="text-lg font-semibold">Configurações</h2>
              <button
                type="button"
                onClick={() => setSettingsAberto(false)}
                aria-label="Fechar configurações"
                className="flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="p-4">
              <SettingsScreen />
            </div>
          </div>
        </div>
      )}
      <AccountModal
        open={contaAberta}
        onClose={() => setContaAberta(false)}
        sessao={sessao}
        onSessao={setSessao}
        onVerificarAtualizacao={verificarAgora}
      />
    </div>
  );
}
