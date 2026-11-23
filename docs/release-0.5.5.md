## Contr0l 0.5.5

Esta versão traz duas formas novas de lançar dados no app e pequenos ajustes de
interface.

### Lançar por foto de cupom (Gemini)

Agora dá para enviar a foto de um cupom ou nota na tela de **Movimentações**,
pelo botão **Foto de cupom**.

- Você informa sua própria chave da API do Gemini (free tier). A chave fica
  guardada **cifrada localmente** neste aparelho e não aparece na interface.
- A leitura da imagem é feita pelo app (lado Tauri/Rust), enviando a imagem
  para a API do Gemini com a sua chave.
- Antes de salvar, o app mostra uma **prévia editável** com descrição, valor,
  data, categoria e natureza. Nada é lançado sem você confirmar.

### MCP local (Fase 1)

O app agora pode expor um servidor MCP HTTP local em `127.0.0.1`, com token por
execução e arquivo de descoberta `mcp-discovery.json` na pasta de configuração
do app. As ferramentas disponíveis nesta fase são `list_categories` e
`create_transaction`, úteis para integrações locais e fluxos de automação.

### Ajustes de interface

- Dashboard: gráfico e detalhamento lado a lado em telas maiores.
- Textos da interface padronizados para “movimentação”.
- Navegação: aba Relatórios removida até a funcionalidade ficar pronta (evita
  entrada sem tela).

### Observações

- O lançamento por cupom depende da sua chave Gemini e de conexão com a API do
  Google; erros de chave/rede/imagem são informados na tela.
- MCP e Gemini foram validados por testes automatizados; a validação E2E em
  runtime com chave real/cliente externo deve ser feita no ambiente de uso.