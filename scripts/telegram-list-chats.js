'use strict';

require('../src/loadEnv')();

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

async function main() {
  const apiId = parseInt(process.env.TELEGRAM_API_ID, 10);
  const apiHash = process.env.TELEGRAM_API_HASH?.trim();
  const session = process.env.TELEGRAM_SESSION?.trim();

  if (!Number.isInteger(apiId) || apiId <= 0 || !apiHash || !session) {
    console.error('Defina TELEGRAM_API_ID, TELEGRAM_API_HASH e TELEGRAM_SESSION antes de rodar este script.');
    console.error('Exemplo: TELEGRAM_API_ID=123 TELEGRAM_API_HASH=abc TELEGRAM_SESSION=xyz npm run telegram:chats');
    process.exit(1);
  }

  const client = new TelegramClient(new StringSession(session), apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.connect();
  try {
    if (!(await client.isUserAuthorized())) {
      throw new Error('TELEGRAM_SESSION não está autorizada. Rode npm run telegram:login novamente.');
    }

    const dialogs = await client.getDialogs({ limit: 200 });
    for (const dialog of dialogs) {
      const entity = dialog.entity;
      const title = entity?.title || [entity?.firstName, entity?.lastName].filter(Boolean).join(' ') || entity?.username || 'Sem nome';
      const username = entity?.username ? `@${entity.username}` : '-';
      const kind = entity?.className || entity?.constructor?.name || 'Chat';
      const id = entity?.id != null ? String(entity.id) : '';

      console.log(`${id}\t${kind}\t${username}\t${title}`);
    }
  } finally {
    await client.disconnect();
  }
}

main().catch((err) => {
  console.error(`Erro ao listar chats: ${err.message}`);
  process.exit(1);
});
