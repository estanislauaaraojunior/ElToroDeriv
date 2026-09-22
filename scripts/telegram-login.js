'use strict';

require('../src/loadEnv')();

const readline = require('readline/promises');
const { stdin: input, stdout: output } = require('process');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

async function main() {
  const apiId = parseInt(process.env.TELEGRAM_API_ID, 10);
  const apiHash = process.env.TELEGRAM_API_HASH?.trim();

  if (!Number.isInteger(apiId) || apiId <= 0 || !apiHash) {
    console.error('Defina TELEGRAM_API_ID e TELEGRAM_API_HASH antes de rodar este script.');
    console.error('Exemplo: TELEGRAM_API_ID=123 TELEGRAM_API_HASH=abc npm run telegram:login');
    process.exit(1);
  }

  const rl = readline.createInterface({ input, output });
  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
    connectionRetries: 5,
  });

  try {
    await client.start({
      phoneNumber: async () => rl.question('Telefone com DDI (ex: +5511999999999): '),
      password: async () => rl.question('Senha 2FA, se pedir: '),
      phoneCode: async () => rl.question('Código recebido no Telegram/SMS: '),
      onError: (err) => console.error(err.message),
    });

    console.log('\nLogin concluído.');
    console.log('\nUse esta variável no servidor:\n');
    console.log(`export TELEGRAM_SESSION="${client.session.save()}"`);
  } finally {
    rl.close();
    await client.disconnect();
  }
}

main().catch((err) => {
  console.error(`Erro ao gerar sessão: ${err.message}`);
  process.exit(1);
});
