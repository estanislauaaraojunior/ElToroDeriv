'use strict';

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const {
  extractBaseDateFromText,
  extractTelegramSignalDateFromText,
} = require('./signalParser');

class TelegramUserSignalSource {
  constructor({ apiId, apiHash, session, chatId, historyLimit = 3000, onLog = () => {} }) {
    const parsedApiId = parseInt(apiId, 10);
    if (!Number.isInteger(parsedApiId) || parsedApiId <= 0) {
      throw new Error('TELEGRAM_API_ID inválido.');
    }
    if (!apiHash || typeof apiHash !== 'string') {
      throw new Error('TELEGRAM_API_HASH inválido.');
    }
    if (!session || typeof session !== 'string') {
      throw new Error('TELEGRAM_SESSION inválida.');
    }

    this.apiId = parsedApiId;
    this.apiHash = apiHash.trim();
    this.session = session.trim();
    this.chatId = chatId != null ? String(chatId).trim() : '';
    this.historyLimit = Math.max(parseInt(historyLimit, 10) || 3000, 100);
    this.onLog = onLog;
    this._client = null;
    this._running = false;
    this._seenMessages = new Set();
    this._allowedChatIds = new Set();
  }

  async start(onSignalText) {
    if (this._running) return;
    if (typeof onSignalText !== 'function') {
      throw new Error('Callback onSignalText é obrigatório.');
    }

    this._running = true;
    this._client = new TelegramClient(
      new StringSession(this.session),
      this.apiId,
      this.apiHash,
      { connectionRetries: 5 }
    );

    await this._client.connect();
    if (!(await this._client.isUserAuthorized())) {
      throw new Error('TELEGRAM_SESSION não está autorizada. Rode npm run telegram:login novamente.');
    }

    const chatFilter = this.chatId ? await this._resolveChatFilter() : undefined;
    if (chatFilter?.length) {
      await this._loadTodaysMessages(chatFilter, onSignalText);
    } else {
      this.onLog('info', 'Busca inicial do dia ignorada porque TELEGRAM_CHAT_ID não está definido.');
    }

    this._client.addEventHandler(async (event) => {
      if (!this._running) return;
      await this._handleMessage(event.message, onSignalText);
    }, new NewMessage({}));

    this.onLog('info', this.chatId
      ? `Listener iniciado via conta de usuário no chat ${this.chatId}.`
      : 'Listener iniciado via conta de usuário em todos os chats.');
  }

  async stop() {
    this._running = false;
    if (this._client) {
      await this._client.disconnect();
      this._client = null;
    }
  }

  async _resolveChatFilter() {
    if (/^-?\d+$/.test(this.chatId)) {
      const targetId = this.chatId.replace(/^-100/, '');
      const dialogs = await this._client.getDialogs({ limit: 500 });
      const dialog = dialogs.find((item) => {
        const id = item.entity?.id != null ? String(item.entity.id) : '';
        return id === targetId || `-100${id}` === this.chatId || `-${id}` === this.chatId;
      });
      if (!dialog?.entity) {
        throw new Error(`Chat Telegram ${this.chatId} não encontrado nos diálogos da conta.`);
      }
      this._allowedChatIds.add(String(dialog.entity.id));
      return [dialog.entity];
    }
    const username = this.chatId.startsWith('@') ? this.chatId : `@${this.chatId}`;
    const entity = await this._client.getEntity(username);
    if (entity?.id != null) this._allowedChatIds.add(String(entity.id));
    return [entity];
  }

  async _loadTodaysMessages(chatFilter, onSignalText) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    let scanned = 0;
    let todayCount = 0;
    const headerDates = new Map();

    for (const chat of chatFilter) {
      const messages = await this._client.getMessages(chat, { limit: this.historyLimit });
      const todaysMessages = [];

      for (const message of messages) {
        scanned++;
        const text = (message?.message || '').trim();
        if (!text) continue;
        const textDate = extractBaseDateFromText(text);
        const signalDate = extractTelegramSignalDateFromText(text);
        if (textDate && signalDate) {
          const key = this._formatDateKey(textDate);
          const signalKey = this._formatDateKey(signalDate);
          const summaryKey = `${key}->${signalKey}`;
          headerDates.set(summaryKey, (headerDates.get(summaryKey) || 0) + 1);
        }
        if (!this._messageBelongsToToday(message, text)) continue;
        todaysMessages.push(message);
      }

      todaysMessages.sort((a, b) => (a.date || 0) - (b.date || 0) || (a.id || 0) - (b.id || 0));
      todayCount += todaysMessages.length;

      for (const message of todaysMessages) {
        await this._handleMessage(message, onSignalText);
      }
    }

    const datesSummary = [...headerDates.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 8)
      .map(([date, count]) => `${date} (${count})`)
      .join(', ');

    this.onLog('info', `Busca inicial do dia concluída: ${todayCount} mensagem(ns) de hoje em ${scanned} verificada(s).`);
    if (datesSummary) {
      this.onLog('info', `Datas recentes cabeçalho->sinais: ${datesSummary}.`);
    } else {
      this.onLog('info', 'Nenhuma data de cabeçalho encontrada nas mensagens verificadas.');
    }
  }

  _messageBelongsToToday(message, text) {
    const signalDate = extractTelegramSignalDateFromText(text);
    if (signalDate) return this._isToday(signalDate);

    if (!message?.date) return false;
    return this._isToday(new Date(message.date * 1000));
  }

  _isToday(date) {
    const today = new Date();
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  }

  _formatDateKey(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
  }

  async _handleMessage(message, onSignalText) {
    const text = (message?.message || '').trim();
    if (!text) return;

    try {
      const chat = await message.getChat();
      const chatId = this._getChatId(chat);
      if (this._allowedChatIds.size > 0 && !this._allowedChatIds.has(chatId)) return;
      const messageKey = `${chatId || 'chat'}:${message.id}`;
      if (this._seenMessages.has(messageKey)) return;
      this._seenMessages.add(messageKey);

      await onSignalText({
        updateId: message.id,
        chatId,
        messageId: message.id,
        from: this._getSenderLabel(message),
        text,
        receivedAt: message.date ? new Date(message.date * 1000) : new Date(),
      });
    } catch (err) {
      this.onLog('error', `Erro ao processar mensagem Telegram: ${err.message}`);
    }
  }

  _getChatId(chat) {
    if (!chat) return '';
    if (chat.id == null) return '';
    return String(chat.id);
  }

  _getSenderLabel(message) {
    const sender = message.sender;
    if (sender?.username) return `@${sender.username}`;
    return [sender?.firstName, sender?.lastName].filter(Boolean).join(' ') || 'desconhecido';
  }
}

module.exports = TelegramUserSignalSource;
