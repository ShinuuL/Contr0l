/**
 * Navegação por estado, sem router. `TabId` é a união fechada das telas que
 * existem hoje, e `TAB_DEFS` é a única fonte da lista: Sidebar e BottomNav
 * derivam dela, ninguém redigita destino.
 *
 * Decisão para Relatórios e Contas fixas: o Sidebar do desktop cabe N itens,
 * então lá a lista completa aparece sem custo. A barra inferior do celular tem
 * teto -- cinco destinos é o máximo em que um rótulo de `text-xs` continua
 * legível em 320px. Enquanto o total couber no teto, a tela nova entra como
 * aba e o BottomNav deriva as colunas da contagem de `TAB_DEFS` (sem
 * `grid-cols-3` fixo); se passar de cinco, o excedente vira um item "Mais" que
 * abre a lista, em vez de espremer os rótulos. `TabId` só cresce quando a tela
 * nasce: nenhuma aba aponta para tela inexistente.
 */

import {
  ArrowLeftRight,
  LayoutDashboard,
  Tags,
  type LucideIcon,
} from "lucide-react";

export type TabId = "dashboard" | "transactions" | "categories";

export interface TabDef {
  id: TabId;
  label: string;
  icon: LucideIcon;
}

export const TAB_DEFS: TabDef[] = [
  { id: "dashboard", label: "Resumo", icon: LayoutDashboard },
  { id: "transactions", label: "Movimentações", icon: ArrowLeftRight },
  { id: "categories", label: "Categorias", icon: Tags },
];
