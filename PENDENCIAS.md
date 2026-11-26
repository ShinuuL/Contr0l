# Pendências

Estado atual registrado após validação local em 2026-11-23, com rodada de importação/OFX em 2026-11-26.

## Validado nesta rodada

- [x] Frontend: `npm run lint`, `npm run typecheck`, `npm test` (42 arquivos, 296 testes), `npm run build` — OK.
- [x] Rust/Tauri: `cargo test` em `src-tauri` (91 passed, 0 failed, 2 ignored), `cargo check` — OK.
- [x] Segurança de dependências: `npm audit --omit=dev --audit-level=high` — 0 vulnerabilidades.
- [x] MCP Fase 1 (HTTP local, `127.0.0.1`, token por execução, descoberta em `mcp-discovery.json`, tools `list_categories` e `create_transaction`) — compilação e testes unitários Rust OK.
- [x] Fase 2 Gemini no app (implementada, sem E2E com chave real): chave API cifrada localmente em `app_config_dir` (`gemini-master.key` + `gemini-api.enc`, envelope XChaCha20-Poly1305); Rust chama Gemini via `reqwest` (`gemini-2.0-flash`); comandos Tauri `gemini_configurar_chave`, `gemini_remover_chave`, `gemini_tem_chave`, `gemini_analisar_cupom`; UI “Foto de cupom” em Movimentações com prévia editável obrigatória antes de salvar; sem migração de esquema; testes unitários Rust para parsing/validação do cupom.

## Validado em 2026-11-26 (importação / OFX)

- [x] Contagem do extrato Itaú questionada pelo usuário: `pdfjs-dist` e `pdfplumber` concordam em 59 movimentações. As 70 linhas com data completa são 59 lançamentos + 11 linhas `SALDO...`; nenhuma linha de lançamento está sem valor.
- [x] OFX do mesmo extrato: 59 `<STMTTRN>`. O parser em `src/features/imports/ofx.ts` leu os 59 registros reais com 0 problemas (11 entradas, 48 saídas).
- [x] Suporte a `.ofx` no fluxo de importação: detecção do tipo, parser com data/valor/descrição/`FITID`, `accept` do seletor de arquivo e mensagens de erro atualizadas.
- [x] Prévia de importação restilizada: resumo compacto, uma linha por decisão/categoria/natureza, seletor de categoria pesquisável ancorado na linha (substitui o `<select>` nativo), filtro por descrição/data/linha e totais de entradas, saídas e saldo no rodapé.
- [x] Prévia conferida no navegador com dados sintéticos, em 929×861 e 390×844: 4 cartões de resumo, 0 `<select>` nativos, busca filtrando linhas, rodapé visível, sem overflow horizontal. O seletor de categoria abriu ancorado, focou a busca, mostrou 8 opções e cabia na viewport; `Escape` fechou só o seletor e devolveu o foco ao botão, sem fechar a prévia.
- [x] Prévia agora pré-seleciona categoria por nome normalizado **ou** slug derivado (sem acento/pontuação), usando também a descrição do lançamento quando o extrato não traz coluna "Categoria". Categorias personalizadas do usuário participam do casamento e vencem empate de slug com predefinidas. Nenhum slug é gravado no banco, então não houve migração.
- [x] Gates após as mudanças: `npm run lint`, `npm run typecheck`, `npm test` (43 arquivos, 307 testes), `npm run build` — OK.

## Validado em 2026-11-26 (release 0.5.7)

- [x] O gateway já servia a 0.5.6 (publicada às 14:04Z), mas o código foi alterado depois daquele build. Sobrescrever a 0.5.6 não entregaria a atualização a quem já a instalou; por isso a nova release é 0.5.7.
- [x] Checklist de release após o bump de versão: `npm test` (43 arquivos, 307 testes), `npm run lint`, `npm run build` (inclui typecheck), `npm audit --omit=dev --audit-level=high` (0 vulnerabilidades), `cargo check` e `git diff --check` — OK.
- [x] Artefatos 0.5.7 gerados com `npm run windows:release` e `npm run android:release`; `tauri.properties` registra `versionName=0.5.7` e `versionCode=5007`.
- [x] Publicação conferida: tag `contr0l-v0.5.7` aberta com APK e EXE; `/v1/apps/contr0l/latest` serve `0.5.7` com assinatura válida (2 artefatos) e sha256 dos arquivos locais igual ao do gateway. `deploybase verify` recebeu 403 com o User-Agent padrão do Python; a verificação foi refeita com User-Agent `curl/8` e `signing.verify_envelope`.

## Pendente

### Importação / reconciliação

- [ ] **E2E da importação OFX no app real:** rodar `npm run tauri dev`, importar o `.ofx` recebido e confirmar no banco os 59 lançamentos, a deduplicação por `FITID` e os totais exibidos. A conferência visual já feita usou um preview isolado (sem backend Tauri), não o fluxo completo.
- [ ] **Conferência com o print original:** o diagnóstico do `<select>` nativo veio de OCR (este modelo não abriu a imagem). Comparar o novo modal com a captura do usuário em sessão com visão, se disponível.
- [ ] **Formulário de Nova categoria (em aberto):** o usuário perguntou se foi estilizado; não foi. Continua com nome, orçamento e `ColorPicker` em `CategoriesScreen.tsx`. Estilizar somente se ele confirmar.
- [ ] **Slug persistido/editável pelo usuário (em aberto):** hoje o slug é derivado do nome. Se o usuário quiser um código estável que sobreviva à renomeação da categoria, é preciso nova migração versionada em `src-tauri/src/migrations.rs` (com os três pontos extras que o AGENTS.md lista) e atualizar os três lugares antes de declarar pronto.

### MCP / IA

- [ ] **Validar MCP em runtime E2E:** subir o app Tauri, ler `mcp-discovery.json`, chamar `list_categories` e `create_transaction` via HTTP com `Authorization: Bearer <token>` e confirmar persistência na UI/banco.
- [ ] **Validar Gemini Fase 2 em runtime E2E:** configurar chave real do Gemini, fotografar/enviar cupom, confirmar prévia extraída, editar se necessário, salvar e verificar movimentação criada na UI/banco; validar erros (chave inválida, sem rede, imagem ruim, resposta inválida).
- [ ] **Revisar exposição do MCP:** confirmar permissões do discovery file/token no SO; avaliar rotação/expiração do token e comportamento quando a porta já está ocupada.
- [ ] **Observabilidade MCP:** decidir se falhas de startup do MCP devem aparecer na UI (hoje só `eprintln!`).

### Produto / UI

- [ ] **Relatórios (adiado, decisão A em 2026-11-23):** construir a tela de Relatórios depois. Existem arquivos base em `src/features/reports/*` e `src/lib/repositories/reports.ts`; `reports` foi removido de `TabId`/navegação até a feature ficar pronta. Ao construir: adicionar `reports` em `TabId` e `TAB_DEFS`, ícone, rota em `AppShell`, estados loading/erro/vazio e validação visual/funcional.
- [ ] **Componentes UI não integrados:** confirmar uso/integração de `src/components/ui/EmptyState.tsx`, `ErrorBanner.tsx`, `LoadingState.tsx`, `ScreenHeader.tsx` ou remover/adiar explicitamente.
- [ ] **Harden pós-ação (critique P2):** melhorar feedback/recuperação após salvar/excluir/importar (confirmações não intrusivas, erros acionáveis, undo onde seguro).
- [ ] **Polish/craft (critique P3):** elevar consistência e personalidade dos componentes além do tema, mantendo sobriedade Operate.

### Qualidade / release

- [ ] **Acompanhar warnings LF/CRLF no Windows:** `git diff --check` sem erros; apenas warnings de LF/CRLF em arquivos Rust.
- [ ] **Acompanhar warnings de linker Cargo no Windows:** mensagens `Criando biblioteca ... .dll.lib/.exp` aparecem durante testes/build; não bloqueiam.
- [x] **Checklist de release completo (SECURITY.md):** rodado e registrado na seção “Validado em 2026-11-26 (release 0.5.7)”.
- [x] **Push do commit de release:** `f9eead1` confirmado em `origin/main` via `git ls-remote`; sem isso a tag da release apontaria para o commit antigo.
- [x] **Publicação da 0.5.7 no gateway:** release aberta e manifesto assinado conferido na seção “Validado em 2026-11-26 (release 0.5.7)”.
- [ ] **Fallback da landing page desatualizado:** `landing/index.html` ainda aponta para a 0.5.5; alinhar com a versão publicada.

## Melhorias encontradas na varredura (2026-11-26)

Achados verificados no código por três varreduras (UX/produto, bugs/testes e acessibilidade/performance). Só estão listados itens com evidência em arquivo:linha. Prioridade: P1 = corrigir antes de seguir; P2 = planejar; P3 = polish.

### P1

- [ ] **Modal genérico sem gestão de foco** — `src/components/ui/Modal.tsx:20-36,48-58` declara `role="dialog" aria-modal="true"`, mas não foca nada ao abrir, não prende o `Tab` e não devolve o foco ao fechar. O modal de importação já faz isso em `src/features/imports/ImportStatementModal.tsx:559-569`; extrair esse padrão para `Modal` também resolve a perda de foco entre etapas em `src/features/gemini/GeminiCupomModal.tsx:242-297`.
- [ ] **Contraste insuficiente em valores e status** — `src/index.css:18-22,39-43` define `--success: #10b981` e `--accent: #059669` com texto branco; o pill "Realizada" em `src/features/transactions/status.ts:11` e os valores em `src/features/transactions/TransactionList.tsx:35-39` usam esses tokens (≈2,5:1 e ≈3,8:1 no tema claro, abaixo de 4,5:1). Escurecer as variantes de texto ou separar token de texto do token de fundo.
- [ ] **Restaurar backup sem confirmação** — `src/features/auth/AccountModal.tsx:140-148` baixa e substitui o banco num clique, sem avisar que o estado local será trocado; `src/lib/cloud/sync.ts:37-45` deixa claro que a troca só acontece no próximo boot. Pedir confirmação com texto explícito ("substitui o banco atual; feche e abra o app").

### P2

- [ ] **Resumo ignora o filtro de categoria** — `src/features/transactions/TransactionsScreen.tsx:219-226` calcula `summary` com `transactions`, mas a lista usa `filtered` (`:312-343`). Filtrar não muda os cartões. Usar `filtered` no cálculo ou rotular "Todas as categorias".
- [ ] **Erro de exclusão fica atrás do `ConfirmDialog`** — `src/features/categories/CategoriesScreen.tsx:95-105` e `src/features/transactions/TransactionsScreen.tsx:139-149` mostram `ErrorBanner` na tela, mas mantêm o diálogo aberto. Fechar o diálogo no `catch` ou exibir a mensagem dentro dele.
- [ ] **Categoria não pode ser renomeada** — `src/features/categories/CategoriesScreen.tsx:221-228,370-472`: "Editar" altera só cor e orçamento. Erro de digitação no nome vira permanente. Incluir nome no formulário e criar `updateCategoryName` no repositório com validação em pt-BR.
- [ ] **Percentuais do detalhamento divergem da pizza** — `src/features/dashboard/CategoryBreakdown.tsx:15-18,49-52` usa `Math.abs` de entradas + saídas no denominador; `src/features/dashboard/DashboardScreen.tsx:80-88,133,143` monta a pizza só com saídas. Alinhar o denominador ou nomear a coluna.
- [ ] **Clique no overlay descarta formulário preenchido** — `src/components/ui/Modal.tsx:41-57` fecha em qualquer clique fora. Desativar o backdrop-close nos modais de formulário (ou pedir confirmação de descarte).
- [ ] **Categoria do cupom cai na primeira da lista** — `src/features/gemini/GeminiCupomModal.tsx:133` aplica `categories[0]` quando a sugestão da IA não casa. Manter "Selecione…" e exigir escolha explícita antes de salvar.
- [ ] **Notas da versão nunca aparecem** — `src/features/update/updateClient.ts:16` traz `notas`, mas `src/features/update/UpdateBanner.tsx:137-143` não renderiza o campo. Mostrar as notas na oferta, com expansor.
- [ ] **`aria-label` repetidos na lista** — `src/features/transactions/TransactionList.tsx:73-88`: vários botões "Editar/Excluir movimentação de 01/11/2026" são indistinguíveis no leitor de tela. Incluir descrição e valor no rótulo.
- [ ] **Sem categorias, fluxos ficam sem saída** — `src/features/transactions/TransactionForm.tsx:143-159,232` desabilita o submit; `src/features/imports/ImportStatementModal.tsx:221-232,478-485` bloqueia a confirmação. Ambos só orientam a ir em Categorias. Oferecer "Criar categoria" dentro do próprio fluxo.
- [ ] **`sair()` falha em silêncio** — `src/features/auth/AccountModal.tsx:190-198` só roda o `finally` se `sair()` rejeitar; o `erro` da área de exclusão também não é exibido na área logada (`:309,395`). Adicionar `catch` com `mensagemDoErro`.
- [ ] **Seletor de categoria sem anúncio da opção ativa** — `src/features/imports/CategoryPicker.tsx:115-157,223-267` tem `role="listbox"`/`option`, mas o foco fica na busca e `ArrowDown` só muda `activeIndex`. Dar `id` às opções e usar `aria-activedescendant` no input.
- [ ] **Menu de aparência não move o foco ao abrir** — `src/features/theme/AppearanceSelector.tsx:50-69,85-123,135-149`: `role="menu"` abre sem foco no primeiro item, a seta do trigger não abre e fechar por clique não restaura o foco. Ajustar teclado, `tabIndex={-1}` no overlay e todas as saídas.
- [ ] **Alvos de toque abaixo de 44px** — `src/features/transactions/TransactionForm.tsx:25`, `src/features/imports/ImportStatementModal.tsx:365,374,455,467,500`, `src/features/imports/CategoryPicker.tsx:180,233,252`, `src/features/update/UpdateBanner.tsx:152`, `src/features/auth/AccountModal.tsx:383`, `src/features/gemini/GeminiCupomModal.tsx:286`. Usar `min-h-11`/`size-11` ou ampliar a área clicável sem mudar o visual.
- [ ] **Carga sem cancelamento em troca rápida de mês** — `src/features/transactions/TransactionsScreen.tsx:113-119` e `src/features/categories/CategoriesScreen.tsx:63-65` não usam flag de cancelamento, ao contrário de `src/features/dashboard/DashboardScreen.tsx:38-68`. Resposta antiga pode sobrescrever a nova e `setState` pode rodar após unmount.
- [ ] **`recharts` entra no bundle inicial** — `src/features/dashboard/ExpensePieChart.tsx:1` é importado estaticamente por `DashboardScreen.tsx:3`; `vite.config.ts:9-33` não define `manualChunks`. O build já avisa chunks > 500 kB. Usar `React.lazy` + `Suspense` (o `pdfjs-dist` já faz isso em `pdfText.ts:77`).
- [ ] **Movimento reduzido só no CSS** — `src/index.css:170-178` cobre animações CSS, mas o Motion segue ativo em `src/components/ui/Modal.tsx:53-56`, `BottomNav.tsx:61-65`, `Sidebar.tsx:75-79` e `ExpensePieChart.tsx:112-117`. Envolver a árvore em `<MotionConfig reducedMotion="user">`.
- [ ] **Semântica de `<td>` perdida** — `src/features/dashboard/CategoryBreakdown.tsx:38` aplica `flex` direto na célula. Manter `<td>` e mover o `flex` para um `<div>` interno.
- [ ] **`aria-label` esconde o valor monetário** — `src/features/transactions/TransactionList.tsx:35-46` coloca `aria-label="Entrada"` no `<span>` que contém `+R$ 49,90`. Trocar por `<span className="sr-only">Entrada de </span>` antes do valor.

### P3

- [ ] **Totais da prévia sem escopo** — `src/features/imports/ImportStatementModal.tsx:847-865` soma todas as linhas escolhidas, mas busca e abas filtram a lista. Rotular "Totais das N selecionadas (todas as abas)".
- [ ] **Estado vazio do Resumo sem ação** — `src/features/dashboard/DashboardScreen.tsx:106-113` manda ir em Movimentações, mas não oferece botão; `EmptyState` já aceita `action`.
- [ ] **Mensagens de conta sem acento** — `src/features/auth/authClient.ts:43` ("Nao foi possivel") e `src/features/auth/accountForm.ts:34,44,46` ("invalido", "nao conferem", "nao pode"). Acentuar para cumprir a regra de pt-BR do AGENTS.md.
- [ ] **Tema aplicado depois do primeiro paint** — `src/features/theme/ThemeProvider.tsx:45-47` aplica o tema em `useEffect`, enquanto `src/main.tsx:45-49` já renderizou. Aplicar `document.documentElement.dataset.theme` antes de `createRoot().render`.
- [ ] **`aria-busy` não anuncia carregamento** — `src/components/ui/LoadingState.tsx:17-26` e `src/App.tsx:43` usam só `aria-busy`. Adicionar `role="status"` no parágrafo (padrão já usado em `TransactionsScreen.tsx:297-298`).
- [ ] **Hex inválido sem mensagem acessível** — `src/components/ui/ColorPicker.tsx:123-126` sinaliza só por `aria-invalid` e borda. Renderizar mensagem com `role="alert"` e ligar via `aria-describedby`.
- [ ] **Valores longos podem gerar scroll horizontal em 320px** — `src/features/dashboard/DashboardSummaryCards.tsx:32` usa `whitespace-nowrap text-2xl/3xl`. Adicionar `min-w-0` no card e `truncate` no valor.
- [ ] **`focus-visible` inconsistente** — `BottomNav.tsx:52-69`, `Sidebar.tsx:64-83`, `AppShell.tsx:72-79` e `TransactionList.tsx:73-88` não aplicam o outline usado no restante da UI.
- [ ] **Progresso do download sem rótulo** — `src/features/update/UpdateBanner.tsx:193-208`: `role="progressbar"` sem `aria-label`/`aria-valuetext`, e o texto não é live region.

### Descartados na varredura

- `console.log`/`console.error` em `src/main.tsx:9-23` estão dentro de `import.meta.env.DEV` (hook de captura visual); não vão para produção.
- Erros ignorados em `src-tauri/src/recovery.rs:274-286` são intencionais e documentados: quem decide se a migração funcionou é a evidência no schema, não o retorno do banco.
- `src-tauri/src/recovery.rs:119-133` usa `format!` para `PRAGMA table_info`, mas o nome vem de constante interna; não é entrada do usuário.

## Como validar

Na raiz do projeto (`D:\Dev\Desenvolvimento\Projetos\Controle de gastos`):

```powershell
npm run validate
```

O script executa: lint, typecheck, test, build, `cargo test` e `cargo check` em `src-tauri`.
