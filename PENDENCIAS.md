# Pendências

Estado atual registrado após validação local em 2026-11-23.

## Validado nesta rodada

- Frontend: `npm run lint`, `npm run typecheck`, `npm test` (42 arquivos, 296 testes), `npm run build` — OK.
- Rust/Tauri: `cargo test` em `src-tauri` (83 passed, 0 failed, 2 ignored), `cargo check` — OK.
- Segurança de dependências: `npm audit --omit=dev --audit-level=high` — 0 vulnerabilidades após `npm audit fix`.
- MCP Fase 1 (HTTP local, `127.0.0.1`, token por execução, descoberta em `mcp-discovery.json`, tools `list_categories` e `create_transaction`) — compilação e testes unitários Rust OK.

## Pendente

### MCP / IA

- **Fase 2 (aprovada como direção, escopo ainda não implementado):** modo Gemini no app com API key free tier para lançar por foto. Requer aprovação de escopo/fase antes de implementar (UI, armazenamento seguro da chave, chamada à API, prévia, testes).
- **Validação E2E do MCP em runtime:** subir o app Tauri, ler `mcp-discovery.json`, chamar `list_categories` e `create_transaction` via HTTP com `Authorization: Bearer <token>` e confirmar persistência na UI/banco.
- **Revisar exposição do MCP:** confirmar se o discovery file/token têm permissões adequadas no SO; avaliar rotação/expiração do token e comportamento quando a porta já está ocupada.
- **Observabilidade MCP:** decidir se falhas de startup do MCP devem aparecer na UI (hoje só `eprintln!`).

### Produto / UI

- **Relatórios:** existem arquivos `src/features/reports/*` e `src/lib/repositories/reports.ts`, e `TabId` inclui `"reports"`, mas `TAB_DEFS` não expõe a aba. Decidir se a tela entra completa nesta fase ou se os arquivos devem ser retirados/adiados.
- **Componentes UI não integrados:** `src/components/ui/EmptyState.tsx`, `ErrorBanner.tsx`, `LoadingState.tsx`, `ScreenHeader.tsx` estão no working tree; confirmar onde devem ser usados ou se ficam pendentes.

### Qualidade / release

- **`git diff --check`:** sem erros; apenas warnings de LF/CRLF em arquivos Rust no Windows.
- **Cargo warnings de linker no Windows:** mensagens `Criando biblioteca ... .dll.lib/.exp` aparecem durante testes/build; não bloqueiam, mas vale acompanhar.
- **Checklist de release completo (SECURITY.md):** ainda falta rodar/registrar conforme o fluxo de release real quando for empacotar (`tauri build`, `npm audit`, `cargo check`, etc.).

## Como validar

Na raiz do projeto (`D:\Dev\Desenvolvimento\Projetos\Controle de gastos`):

```powershell
npm run validate
```

O script executa: lint, typecheck, test, build, `cargo test` e `cargo check` em `src-tauri`.
