# ElToroDeriv

Painel web para agendar e executar entradas automáticas na Deriv a partir de sinais manuais ou recebidos pelo Telegram.

O sistema usa Node.js, Express, Socket.IO e WebSocket para conectar uma sessão do navegador à API da Deriv, processar sinais no formato `M5;USDJPY;15:05;CALL`, abrir contratos, acompanhar resultados, aplicar Gale quando configurado e manter relatórios locais no navegador.

> Aviso: este projecto automatiza operações financeiras. Use primeiro em conta demo, valide os sinais, configure limites de risco e nunca partilhe tokens da Deriv.

## Documentação

- [Arquitectura do sistema](docs/ARCHITECTURE.md)
- [Prompt operacional para IA/Codex](docs/AI_PROMPT.md)

## Funcionalidades

- Conexão com a Deriv por API nova (`pat_` + App ID alfanumérico) ou API legada (`a1-` + App ID numérico).
- Painel web com estado da conta, saldo, saúde da API, agendamentos, resultados e relatórios.
- Agendamento de sinais manuais por data e hora.
- Leitura automática de sinais via Telegram Bot API com long polling.
- Gestão de Gale por sinal.
- Stop Loss, Take Profit e filtro de payout mínimo.
- Pré-check antes da entrada e tentativa de reconexão automática.
- Recuperação de resultado quando o WebSocket cai depois da compra.
- Persistência local de formulário, agendamentos, resultados e logs no `localStorage`.
- Exportação de resultados para CSV.

## Requisitos

- Node.js 18 ou superior, por causa do uso nativo de `fetch` e `AbortSignal.timeout`.
- Conta Deriv demo ou real.
- Token Deriv com permissão de trade.
- App ID Deriv compatível com o tipo de token usado.

## Instalação

```bash
npm install
```

## Execução

```bash
npm start
```

Depois abra:

```txt
http://localhost:3000
```

Para desenvolvimento com reload do Node:

```bash
npm run dev
```

## Configuração Deriv

No painel, abra a aba **Configurações** e informe:

- `Token da API Deriv`
- `App ID`
- `ID da Conta`, apenas para a API nova, opcional
- `Stake inicial`
- `Máx. de Gales`
- `Stop Loss`
- `Take Profit`
- `Payout mínimo`

### API nova

Use token iniciado por `pat_` e App ID alfanumérico criado em `developers.deriv.com`.

Se o ID da conta ficar vazio, o sistema tenta usar a primeira conta demo disponível. Se não houver demo, usa a primeira conta disponível.

### API legada

Use token iniciado por `a1-` e App ID numérico criado em `legacy-api.deriv.com`.

## Telegram

O Telegram é opcional. Quando configurado, o servidor recebe mensagens e agenda os sinais em todas as sessões Deriv conectadas.

Há dois modos:

- **Conta de usuário**, recomendado quando você já está no grupo e não pode adicionar bot como admin.
- **Bot**, quando você pode adicionar um bot ao grupo ou canal.

### Modo conta de usuário

Este modo lê o grupo usando sua própria conta Telegram. Ele não precisa adicionar bot no grupo.

1. Acesse `https://my.telegram.org`.
2. Entre com seu telefone.
3. Abra **API development tools**.
4. Crie um app e copie:
   - `api_id`
   - `api_hash`

Gere a sessão local:

```bash
export TELEGRAM_API_ID="123456"
export TELEGRAM_API_HASH="abcdef123456abcdef123456abcdef12"
npm run telegram:login
```

O script vai pedir seu telefone, código do Telegram e senha 2FA se sua conta tiver. No final ele imprime:

```bash
export TELEGRAM_SESSION="..."
```

Depois rode o servidor:

```bash
export TELEGRAM_API_ID="123456"
export TELEGRAM_API_HASH="abcdef123456abcdef123456abcdef12"
export TELEGRAM_SESSION="..."
export TELEGRAM_CHAT_ID="@usuario_ou_id_do_grupo"
npm start
```

`TELEGRAM_CHAT_ID` pode ser o username público do grupo, como `@meugrupo`, ou o ID numérico. Se ficar vazio, a conta escuta todos os chats acessíveis e processa apenas mensagens que tenham sinais válidos.

> Segurança: a `TELEGRAM_SESSION` representa acesso à sua conta Telegram. Não compartilhe e não faça commit desse valor.

### Modo bot

Use este modo somente se você puder adicionar um bot ao grupo/canal.

#### Criar bot

1. Crie um bot com o `@BotFather`.
2. Copie o token do bot.
3. Adicione o bot ao grupo ou canal onde os sinais chegam.
4. Em grupos, desative a privacidade do bot no `@BotFather` ou mencione o bot nas mensagens. Em canais, promova o bot como administrador para que ele receba os posts.

#### Descobrir chat ID

Envie uma mensagem no grupo ou canal e consulte:

```bash
curl "https://api.telegram.org/botSEU_TOKEN/getUpdates"
```

Use o campo `chat.id` retornado. Em grupos e canais costuma começar por `-100`.

#### Variáveis de ambiente

```bash
export TELEGRAM_BOT_TOKEN="SEU_TOKEN_DO_BOT"
export TELEGRAM_CHAT_ID="-1001234567890"
npm start
```

`TELEGRAM_CHAT_ID` é opcional, mas recomendado. Quando definido, mensagens de outros chats são ignoradas.

As mensagens do Telegram podem trazer cabeçalho e data. Se o texto contiver uma data no formato `DD/MM/AAAA`, ela será usada automaticamente para agendar os horários dos sinais.

## Formato dos sinais

Cada linha deve seguir:

```txt
DURACAO;ATIVO;HORARIO;DIRECAO
```

Exemplos:

```txt
M5;USDJPY;15:05;CALL
M15;AUDJPY;15:30;PUT
63. M15;EURUSD;16:00;CALL
1 - M15;EURUSD;02:15;CALL
```

Regras:

- Duração aceita: `S`, `M`, `H` ou `D`, como `M1`, `M5`, `M15`, `H1`.
- Forex conhecido recebe prefixo Deriv automaticamente, por exemplo `USDJPY` vira `frxUSDJPY`.
- Símbolos que já estão no formato da Deriv, como sintéticos `R_100`, são mantidos.
- Direção aceita: `CALL` ou `PUT`.
- Linhas vazias, comentários iniciados por `#` ou `//`, e linhas inválidas são ignoradas.

## Scripts

```bash
npm start
npm run dev
node test-connection.js <TOKEN> [APP_ID]
```

`test-connection.js` testa ping e autorização na API legada da Deriv.

## Estrutura

```txt
server.js                    Servidor Express, Socket.IO e integração das sessões
src/derivClient.js           Cliente WebSocket/REST da Deriv
src/scheduler.js             Agendamento, execução, reconexão e resultado dos trades
src/galeManager.js           Estado e regras de Gale por sinal
src/signalParser.js          Parser do texto de sinais
src/telegramSignalSource.js  Fonte de sinais via Telegram
public/index.html            Interface web
public/app.js                Estado, eventos Socket.IO, tabelas e persistência local
public/style.css             Estilos do painel
docs/ARCHITECTURE.md         Documentação técnica do sistema
docs/AI_PROMPT.md            Prompt mestre para trabalhar neste projecto com IA
```

## Segurança operacional

- Não faça commit de tokens, IDs sensíveis ou dados pessoais.
- Não exponha este servidor publicamente sem autenticação, HTTPS e controlo de acesso.
- Use conta demo para validar alterações.
- Trate `localStorage` como armazenamento local não encriptado.
- Antes de alterar execução de trades, valide parser, agendamento, limites e recuperação de erro.
