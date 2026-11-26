## Contr0l 0.5.7

Esta versão amplia a importação de extratos e reorganiza os ajustes de aparência
em uma tela de Configurações.

### Importação de extratos OFX

- O seletor de arquivos aceita `.ofx` além de PDF e CSV.
- O parser lê data, valor, descrição e `FITID` de cada lançamento; o `FITID` é
  usado como identificador externo na importação.
- A prévia foi redesenhada: resumo compacto, uma linha por decisão, seletor de
  categoria pesquisável ancorado na linha, filtro por descrição/data/linha e
  totais de entradas, saídas e saldo no rodapé.
- A categoria é pré-selecionada pelo nome normalizado ou por slug derivado,
  inclusive a partir da descrição do lançamento. Categorias personalizadas
  participam do casamento. Nenhum slug é gravado no banco; não houve migração.

### Configurações e aparência

- Nova tela **Configurações** com escolha de tema e cor de destaque do tema
  Noturno. A preferência fica no `localStorage` deste aparelho.
- O cabeçalho no celular passa a mostrar o ícone do app e o atalho para
  Configurações.
- Ajustes de layout no dashboard e em botões.

### Observações

- Testes automatizados, lint, typecheck, build, auditoria de dependências e
  `cargo check` passaram antes da publicação.
- A importação OFX ainda precisa de validação ponta a ponta no app real com o
  extrato do usuário; a conferência até aqui foi com dados reais no parser e
  com dados sintéticos na prévia.
- Questões conhecidas e em aberto estão registradas em `PENDENCIAS.md`.
