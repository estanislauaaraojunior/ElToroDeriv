# Arquitectura do ElToroDeriv

Este documento descreve o estado actual do sistema para orientar manutenção, auditoria e evolução do ElToroDeriv.

## Visão geral

O ElToroDeriv é uma aplicação Node.js com painel web que agenda e executa operações na Deriv a partir de sinais em texto.

Fluxo principal:

1. O utilizador conecta uma conta Deriv no painel.
2. O utilizador cola sinais ou o servidor recebe sinais via Telegram.
3. O backend parseia os sinais e agenda cada entrada.
4. No horário configurado, o scheduler solicita proposta, valida payout mínimo e compra o contrato.
5. O resultado é acompanhado por subscription WebSocket, com fallback por polling.
6. O front-end actualiza agendamentos, resultados, saldo, logs e relatórios.

## Componentes

### `server.js`

Responsável por:

- Servir os ficheiros de `public/`.
- Criar o servidor HTTP e Socket.IO.
- Manter uma sessão independente por socket conectado.
- Criar `DerivClient`, `GaleManager` e `Scheduler` por sessão.
- Validar conexão, submissão de sinais, troca de conta, cancelamentos e reagendamento.
- Integrar o Telegram com as sessões Deriv conectadas.

Eventos recebidos do front-end:

- `config:connect`
- `account:switch`
- `signals:submit`
- `trades:cancel`
- `signal:cancel`
- `signals:reschedule`
- `config:disconnect`

Eventos emitidos para o front-end:

- `connection:status`
- `api:health`
- `api:precheck:ok`
- `api:precheck:fail`
- `api:reconnecting`
- `api:reconnected`
- `api:reconnect:fail`
- `signals:parsed`
- `trade:scheduled`
- `trade:executing`
- `trade:payout`
- `trade:skipped`
- `trade:bought`
- `trade:update`
- `trade:result`
- `trade:gale_limit`
- `trade:error`
- `trade:sl_hit`
- `trade:tp_hit`
- `balance:update`
- `trades:cancelled`
- `signal:cancelled`

### `src/derivClient.js`

Cliente de integração com a Deriv.

Suporta:

- API nova: token `pat_`, App ID alfanumérico, listagem de contas por REST e WebSocket via OTP.
- API legada: token `a1-`, App ID numérico e autorização por WebSocket.
- Troca de conta.
- Reconexão automática.
- Ping.
- Consulta de saldo.
- Proposta, compra e acompanhamento de contrato.

Ponto sensível:

- Não registar tokens ou OTPs em logs. O código já mascara OTP na URL de conexão.

### `src/signalParser.js`

Parser de sinais.

Formato aceite:

```txt
M5;USDJPY;15:05;CALL
63. M15;AUDJPY;15:00;PUT
```

Regras:

- `CALL` e `PUT` são as únicas direções aceites.
- Duração usa unidade `S`, `M`, `H` ou `D`.
- Forex conhecido recebe prefixo `frx`.
- Linhas vazias, comentários e linhas inválidas são ignoradas.
- Os sinais são ordenados por horário.

### `src/scheduler.js`

Agenda e executa operações.

Responsável por:

- Evitar sinais duplicados por `rawSymbol + scheduledAt + direction`.
- Emitir sinal expirado quando a hora já passou.
- Fazer pré-check de API um minuto antes da entrada.
- Tentar reconectar antes de operar quando necessário.
- Serializar proposta e compra por `_proposalLock`.
- Validar payout mínimo antes da compra.
- Acompanhar resultado do contrato.
- Aplicar Stop Loss e Take Profit.
- Recuperar resultado depois de queda de WebSocket.

Ponto sensível:

- Uma operação comprada pode continuar activa na Deriv mesmo que a UI ou o WebSocket falhem. Por isso, mudanças nesta camada devem preservar a lógica de recuperação de resultado.

### `src/galeManager.js`

Mantém o estado de Gale por sinal.

Regras actuais:

- Cada sinal começa com o stake base.
- Em perda, o stake dobra enquanto houver gales disponíveis.
- Em vitória, o sinal volta ao stake base.
- Ao atingir o limite, emite fim de Gale e encerra o ciclo desse sinal.

### `src/telegramSignalSource.js`

Fonte opcional de sinais via Telegram Bot API.

Comportamento:

- Usa `getUpdates` com long polling.
- Ignora updates antigos no arranque.
- Filtra por `TELEGRAM_CHAT_ID` quando definido.
- Extrai texto de `message` ou `channel_post`.
- Entrega texto bruto ao mesmo fluxo de parser/agendamento usado pelo painel.

### `public/app.js`

Front-end sem framework.

Responsável por:

- Conexão Socket.IO.
- Estado da UI.
- Persistência em `localStorage`.
- Auto-reconexão quando há credenciais salvas.
- Reagendamento de sinais pendentes após refresh.
- Tabelas de agendamento e resultados.
- Filtros, ordenação, paginação e exportação CSV.
- Sons de win/loss.

## Estado persistido no navegador

Chaves de `localStorage`:

- `eltoro_form`
- `eltoro_stats`
- `eltoro_results`
- `eltoro_schedule`
- `eltoro_log`

Observação: o token Deriv é guardado no navegador para auto-reconexão. Isto é prático, mas não deve ser tratado como armazenamento seguro.

## Variáveis de ambiente

- `PORT`: porta HTTP. Padrão: `3000`.
- `TELEGRAM_BOT_TOKEN`: activa a fonte Telegram.
- `TELEGRAM_CHAT_ID`: restringe mensagens a um chat específico.
- `DERIV_DEBUG=1`: imprime mensagens recebidas da Deriv. Usar com cuidado.

## Regras de alteração

Antes de alterar código de execução financeira:

1. Identifique se a mudança afecta conexão, parser, agendamento, compra, resultado, Gale, SL/TP ou UI.
2. Preserve compatibilidade entre API nova e legada.
3. Não exponha tokens, OTPs ou dados sensíveis em logs.
4. Mantenha eventos Socket.IO compatíveis com `public/app.js`.
5. Teste com conta demo antes de usar conta real.
6. Documente qualquer alteração de formato de sinal, evento, variável de ambiente ou regra de risco.

## Riscos técnicos conhecidos

- Não há suite automatizada de testes.
- O front-end persiste tokens em `localStorage`.
- O servidor não implementa autenticação própria para acesso ao painel.
- A integração Telegram por long polling depende da disponibilidade da Bot API.
- O fluxo financeiro depende de tempos, WebSocket e disponibilidade externa da Deriv.

