# Plano — Telas, Relatórios, Contas Fixas, MCP/IA e higiene do repositório

> **Status:** planejado, aguardando aprovação de execução por fase.
> **Data:** 2026-10-13.
> **Requisitante:** desenvolvedor, via pedido direto: *"melhorar as telas, corrigir
> as importações e adicionar MCP e relatórios dentro do sistema, com opções de
> cadastrar contas fixas com veículos ou outras contas mensais. Ajudar com
> ferramentas de IA."*
> **Escopo aprovado nas perguntas de 2026-10-13:** importações = *todas* as
> frentes; MCP = *servidor + cliente + assistente interno*; contas fixas =
> *recorrente + despesas de veículo*; relatórios = *mensal por categoria +
> evolução no tempo*; ordem de início = *telas + plano escrito + limpeza*.

Este documento é o plano escrito de que o `AGENTS.md` exige antes de qualquer
código. **Nada aqui foi implementado ainda.** Cada fase abaixo precisa do "vai"
do desenvolvedor para o escopo exato antes de virar código.

---

## 1. Estado atual (levantamento de 2026-10-13, somente leitura)

| Fato | Evidência |
|---|---|
| Árvore limpa, nada pendente | `git status --short` vazio |
| Typecheck limpo | `npm run typecheck` sem saída de erro |
| 3 abas: Resumo, Movimentações, Categorias | `src/components/layout/tabs.ts` (`TabId`) |
| Importação de extrato existe e é madura | `src/features/imports/` (CSV Itaú/Nubank, PDF genérico, conciliação) + `src/lib/repositories/imports.ts` |
| Orçamento por categoria existe | `budget_monthly` em `categories`, `listCategoryBudgetProgress` |
| **Não existe** recorrência/contas fixas | `AGENTS.md`: *"Não há parcelas ou recorrência."* |
| **Não existe** relatórios como tela | não há rota/tela; só o Resumo |
| **Não existe** MCP | nenhuma referência a `mcp` no código |
| Sem código morto em `src/` (por referência de import) | varredura de imports: todo módulo em `src/` tem ≥1 importador, exceto entry (`main.tsx`) e ambient (`vite-env.d.ts`) |

> **Nota sobre numeração:** as fases abaixo **não** entram na fila numérica do
> `ROADMAP.md` (que está em 11/17, 21, 22). Elas são o recorte **feature** pedido
> agora. Numeração interna sugerida: **F23–F27**, registradas no roadmap quando
> fecharem.

---

## F23 — Melhorias de telas + higiene do repositório

**Sem migração. Sem dependência nova.** É a fase mais segura e a primeira aprovada.

### F23.1 — Melhorias de telas

Objetivo: dar hierarquia e consistência às três telas atuais antes de somar
telas novas (Relatórios, Contas fixas), para o app não virar uma pilha de
paddings diferentes.

Itens:
- **`tabs.ts` / `Sidebar.tsx` / `BottomNav.tsx`:** preparar a navegação para mais
  abas (hoje `TabId` é uma união fechada de 3). Definir se Relatórios e Contas
  fixas entram como abas de topo ou sub-seções. O `BottomNav` mobile não
  comporta 5 abas com rótulo — decidir antes.
- **Cabeçalho de tela padronizado:** Resumo, Movimentações e Categorias repetem
  `h2` + ação à direita com paddings levemente diferentes. Extrair um
  `ScreenHeader` (título + `slot` de ação) em `src/components/layout/`.
- **Estados vazios/carregando/erro uniformes:** hoje cada tela escreve o seu
  (`DashboardScreen` tem `<p aria-busy>`, `role="alert"`; outras variam).
  Extrair `EmptyState`, `LoadingState`, `ErrorBanner`.
- **Revisão visual assistida pelo subagente `designer`** (opcional): cores,
  tipografia e contraste WCAG antes de congelar.

Arquivos prováveis: `src/components/layout/*`, `src/features/dashboard/DashboardScreen.tsx`,
`src/features/transactions/TransactionsScreen.tsx`, `src/features/categories/CategoriesScreen.tsx`.
Nenhum arquivo de repositório/banco é tocado.

### F23.2 — Higiene do repositório (aprovada: "limpeza do repositório")

**Nada será apagado sem teu "sim" item a item.** Inventário do que é candidato:

Rastreados no git (apagar = remover do versionamento):

| Caminho | Por que é candidato |
|---|---|
| `.bob/screenshots/*.png` (8 arquivos) | artefatos de sessão de agente, não fazem parte do produto |
| `.bob/plans/phase-9-legacy-migration.md` | plano de agente; já absorvido pelo `ROADMAP.md`/`MEMORY.md` |
| `.superpowers/sdd/**/*.md` (3 relatórios) | relatórios de execução de agente, já resumidos nas fases do roadmap |
| `mockups/*` (png/jpg/avif/html) | referências de design do moranguinho; a arte final já vive em `src/assets/` |
| `public/tauri.svg` | sobra do scaffold Tauri; não referenciado |
| `public/vite.svg` | usado como favicon em `index.html`, mas é o logo do Vite — trocar pelo ícone do app, não simplesmente apagar |

Não rastreados (lixo local, já no `.gitignore`; apagar do disco é opcional):

| Caminho | Observação |
|---|---|
| `bugreport-*.zip` (~? MB) | bug report do Android; dado de diagnóstico, ignorado por regra explícita |
| `dist/`, `dist-windows/`, `dist-android/` | saídas de build |
| `.worktrees/`, `.wrangler/`, `.idea/`, `.opencode/` | scratch de ferramentas |

**Não mexer:** `extrato/` (dados reais), `src/assets/WhatsApp Image*.jpeg`,
`.release-signing/`, `src-tauri/gen/android/**` — são deliberados ou pessoais.

Decisão pendente: **apagar do git** os rastreados acima exige o teu aval (histórico
permanece recuperável, mas o `git rm` é escrita no repo).

---

## F24 — Relatórios (tela nova)

**Sem migração.** Reusa `monthlyTotalsByCategory` e `listTransactionsByMonth`.

Itens:
- Nova tela `src/features/reports/ReportsScreen.tsx` + entrada em `tabs.ts`.
- **Relatório mensal por categoria:** tabela com total, % do total, orçamento
  (`budget_monthly`) e estouro — `listCategoryBudgetProgress` já dá `spent_cents`.
- **Evolução no tempo:** série mês a mês (12 meses) de entradas, saídas e saldo.
  Novo repositório `src/lib/repositories/reports.ts` com SQL agregado **parametrizado**
  (`GROUP BY strftime('%Y-%m', date)`), respeitando `METRIC_OPERATIONS` em
  `src/lib/observability/telemetry.ts` (adicionar a operação ao allowlist).
- **Exportar CSV** (o pedido "exportar"): gerar no cliente e salvar via plugin
  de filesystem/dialog **— exige plugin novo + capacidade Tauri + aprovação de
  dependência.** Se não aprovar dependência, a F24 entrega só a visão em tela e
  o export fica para fase própria.
- Gráficos: `recharts` já está no projeto (usado no Resumo).

Gates: `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`.

---

## F25 — Importações (correção + expansão)

**Sem migração** (salvo se o fix exigir coluna nova).

Escopo aprovado = "todos". Ordem sugerida dentro da fase:

1. **Diagnóstico do defeito atual primeiro.** O usuário precisa dizer *qual banco
   e qual sintoma* (ex.: "Nubank CSV importa 0 linhas", "PDF do Itaú soma errado").
   O histórico (fases 19 e 22) mostra três correções seguidas — sem o sintoma
   exato, mexer no parser é chute. Entregável: reprodução com arquivo real +
   teste que falha antes e passa depois.
2. **Melhorias de prévia/revisão** (`ImportStatementModal.tsx`,
   `importController.ts`): ações em massa, destacar conflitos de conciliação,
   resumo do que vai ser gravado.
3. **Novos formatos/bancos** (`statementCsv.ts`, `statementPdf.ts`): OFX e cartão
   de crédito, se confirmado. Cada banco novo = parser + teste com arquivo real.

Gates: `npm test` (a suíte de imports é grande) + `typecheck` + `lint`.

---

## F26 — Contas fixas mensais e veículos (migração v7)

**A mais estrutural.** Contraria regra escrita no `AGENTS.md` (*"não há
recorrência"*) — por isso precisa de decisão explícita e de atualizar o próprio
`AGENTS.md`/`MEMORY.md` junto.

### Modelo de dados proposto (migração `v7`)

```
CREATE TABLE recurring_accounts (
    id             TEXT PRIMARY KEY NOT NULL,
    description    TEXT NOT NULL,
    amount_cents   INTEGER NOT NULL CHECK (typeof(amount_cents) = 'integer' AND amount_cents > 0),
    category_id    TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    day_of_month   INTEGER NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
    nature         TEXT NOT NULL DEFAULT 'saida' CHECK (nature IN ('entrada','saida')),
    kind           TEXT NOT NULL DEFAULT 'generico' CHECK (kind IN ('generico','veiculo')),
    starts_on      TEXT NOT NULL,        -- ISO YYYY-MM-DD
    ends_on        TEXT,                 -- ISO ou NULL = sem fim
    active         INTEGER NOT NULL DEFAULT 1,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
);

CREATE TABLE recurring_vehicle_details (
    account_id     TEXT PRIMARY KEY NOT NULL REFERENCES recurring_accounts(id) ON DELETE CASCADE,
    plate          TEXT,
    kind           TEXT CHECK (kind IN ('carro','moto','outro')),
    insurance_cents INTEGER,
    ipva_cents      INTEGER,
    notes          TEXT
);

CREATE TABLE recurring_generated (
    account_id     TEXT NOT NULL REFERENCES recurring_accounts(id) ON DELETE CASCADE,
    expense_id     TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    period         TEXT NOT NULL,        -- 'YYYY-MM'
    PRIMARY KEY (account_id, period)
);
```

Semântica: a conta fixa **gera lançamentos `previsto`** do mês corrente (e
opcionalmente retroativos só do mês atual — nunca meses futuros em lote, para
não poluir). `recurring_generated` garante idempotência (gerar duas vezes não
duplica). O usuário pode editar/apagar o lançamento gerado sem desfazer o
cadastro — o `recurring_generated` só impede **re-geração** do mesmo período.

### Três lugares que a migração obriga a mexer (armadilha do `AGENTS.md`)

1. `src-tauri/src/migrations.rs` — adicionar a v7 **e** subir o `assert_eq!(migrations.len(), 6)` → `7`.
2. `src-tauri/src/recovery.rs` — `checksums_esperados()` precisa cobrir a v7.
3. `src-tauri/src/recovery.rs` — `efeito_presente()` precisa reconhecer a v7
   (senão o reparo carimba migração que nunca rodou).

### Camada JS

- Tipos novos em `src/lib/types.ts` (`RecurringAccount`, `RecurringVehicleDetails`, ...).
- Repositório `src/lib/repositories/recurring.ts` (CRUD + geração idempotente),
  usando `getDb()` e `traceOperation`; nomes no allowlist `METRIC_OPERATIONS`.
- Tela `src/features/recurring/RecurringScreen.tsx` + formulário (com bloco de
  veículo condicional ao `kind`).
- Integração com o Resumo: mostrar o "comprometido do mês" (soma das contas fixas).

Gates: `cd src-tauri && cargo test` (migração incremental + reparo) **e**
`npm test` + `typecheck` + `lint` + build. **Sem migração, nada de F26.**

---

## F27 — MCP e ferramentas de IA

**Não iniciar sem decisão de produto.** O pedido "adicionar MCP" + "ajudar com
ferramentas de IA" conflita diretamente com duas coisas travadas no repo:

- A promessa de produto: *"ninguém tem acesso aos dados financeiros"* / zero
  requisição de rede em claro (fases 13, 20, 21).
- A política de segurança do `AGENTS.md`: sem telemetria remota, CSP
  `script-src 'self'`, sem dependência nova sem aprovação.

Por isso, F27 **começa por uma decisão escrita**, não por código:

| Opção | O que significa | Custo/risco |
|---|---|---|
| **Servidor MCP local (stdio)** | O app (ou um binário lado a lado) expõe lançamentos/categorias como *tools* MCP para um cliente de IA **na mesma máquina**. Nada sai para a internet por conta do app. | Médio. Novo processo + protocolo. Se o cliente for a nuvem, o dado passa a sair — a promessa muda. |
| **Cliente MCP no app** | O app chama servidores MCP externos (ex.: cotações). | Médio. Traz rede para dentro do app local-first. |
| **Assistente interno (insights locais)** | Categorização sugerida, busca em linguagem natural, resumo do mês — **sem LLM remoto**, com regras/heurísticas locais. | Baixo. Não fere a promessa. |
| **LLM remoto** | Mandar dado financeiro para uma API. | **Alto.** Muda a promessa central do produto; exige consentimento explícito e revisão de privacidade. |

Recomendação: começar pelo **assistente interno local** (não fere nada) e pelo
**servidor MCP local via stdio** (o dado só sai se o usuário apontar um cliente
para ele). LLM remoto fica fora até decisão consciente e atualização da landing.

Entregável da F27, antes de código: um `docs/superpowers/specs/…-mcp-design.md`
com a decisão, o protocolo, os comandos Rust tipados e o que muda na promessa.

---

## Sequenciamento recomendado

1. **F23** (telas + higiene) — seguro, sem migração, destrava as telas novas.
2. **F24** (relatórios) — sem migração, alto valor percebido.
3. **F25** (importações) — depende de você dizer o sintoma exato.
4. **F26** (contas fixas, migração v7) — estrutural; fazer com calma e teste Rust.
5. **F27** (MCP/IA) — bloqueada por decisão de produto.

## Definição de pronto (por fase)

Toda fase só fecha com **os gates do `AGENTS.md`** rodando da raiz, na ordem:
`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`; e, onde houver
Rust, `cd src-tauri && cargo check` + `cargo test`. Migração só entra com os três
pontos do Rust atualizados. Nada de dependência nova sem aprovação.

## O que este plano NÃO autoriza

Escrever código de produção, criar migração, adicionar dependência, apagar
arquivo rastreado, ou mexer na promessa de produto — cada um desses passos
precisa do teu "sim" na fase correspondente.
