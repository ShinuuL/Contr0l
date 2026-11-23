# Pendências

Estado atual registrado após validação local em 2026-11-23.

## Validado nesta rodada

- [x] Frontend: `npm run lint`, `npm run typecheck`, `npm test` (42 arquivos, 296 testes), `npm run build` — OK.
- [x] Rust/Tauri: `cargo test` em `src-tauri` (91 passed, 0 failed, 2 ignored), `cargo check` — OK.
- [x] Segurança de dependências: `npm audit --omit=dev --audit-level=high` — 0 vulnerabilidades.
- [x] MCP Fase 1 (HTTP local, `127.0.0.1`, token por execução, descoberta em `mcp-discovery.json`, tools `list_categories` e `create_transaction`) — compilação e testes unitários Rust OK.
- [x] Fase 2 Gemini no app (implementada, sem E2E com chave real): chave API cifrada localmente em `app_config_dir` (`gemini-master.key` + `gemini-api.enc`, envelope XChaCha20-Poly1305); Rust chama Gemini via `reqwest` (`gemini-2.0-flash`); comandos Tauri `gemini_configurar_chave`, `gemini_remover_chave`, `gemini_tem_chave`, `gemini_analisar_cupom`; UI “Foto de cupom” em Movimentações com prévia editável obrigatória antes de salvar; sem migração de esquema; testes unitários Rust para parsing/validação do cupom.

## Pendente

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
- [ ] **Checklist de release completo (SECURITY.md):** rodar/registrar no fluxo de release real quando for empacotar (`tauri build`, `npm audit`, `cargo check`, etc.).

## Como validar

Na raiz do projeto (`D:\Dev\Desenvolvimento\Projetos\Controle de gastos`):

```powershell
npm run validate
```

O script executa: lint, typecheck, test, build, `cargo test` e `cargo check` em `src-tauri`.
