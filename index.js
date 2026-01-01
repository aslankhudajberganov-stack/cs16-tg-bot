// index.js
const TelegramBot = require('node-telegram-bot-api');
const Gamedig = require('gamedig');
const config = require('./config');

const ADMIN_ID = 123456789; // <- Замените на свой Telegram ID

const bot = new TelegramBot(config.token, { polling: true });
console.log('🤖 Бот запущен...');

// Состояние каждого чата
const chatState = new Map();

// HTML escape
function escapeHTML(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;')
             .replace(/</g, '&lt;')
             .replace(/>/g, '&gt;')
             .replace(/"/g, '&quot;')
             .replace(/'/g, '&#039;');
}

// Получение данных сервера
async function fetchServerData(server) {
  try {
    const state = await Gamedig.query({
      type: 'cs16',
      host: server.host,
      port: server.port
    });

    server.name = state.name;
    server.map = state.map;
    server.maxPlayers = state.maxplayers;
    server.players = state.players.map(p => ({
      name: p.name || 'Unknown',
      score: p.score || 0,
      time: Math.floor((p.time || 0)/60)
    }));

    server.status = 'Online';
  } catch (err) {
    server.name = 'Сервер недоступен';
    server.map = '-';
    server.maxPlayers = 0;
    server.players = [];
    server.status = 'Offline';
  }
}

// Формат сообщения сервера
function formatServerMessage(server) {
  const occupancy = server.maxPlayers ? Math.round((server.players.length / server.maxPlayers) * 100) : 0;
  let text = `<b>${escapeHTML(server.name)}</b>\n`;
  text += `🗺 <b>Карта:</b> ${escapeHTML(server.map)}\n`;
  text += `📊 <b>Игроки:</b> ${server.players.length} (~${occupancy}% загрузка)\n`;
  text += `⭐ <b>Макс. игроков:</b> ${server.maxPlayers}\n`;
  text += `⚡ <b>Статус:</b> ${server.status}\n\n`;

  if (server.players.length > 0) {
    text += `<b>Список игроков:</b>\n`;
    server.players.forEach((p,i) => {
      text += `${i+1}. <b>${escapeHTML(p.name)}</b> | <u>${p.score}</u> | <i>${p.time} мин.</i>\n`;
    });
  } else {
    text += `⚠️ Игроки недоступны`;
  }
  return text;
}

// Inline кнопки под сервером
function getServerButtons(serverIndex) {
  return {
    inline_keyboard: [
      [
        { text: '🔄 Обновить', callback_data: `refresh_${serverIndex}` },
        { text: '📤 Поделиться', switch_inline_query: '' }
      ]
    ]
  };
}

// Главное inline меню
function getMainMenu(userId) {
  const buttons = [
    [{ text: 'Старт', callback_data: 'main_start' }, { text: '🎮 Сервера', callback_data: 'main_servers' }],
    [{ text: '➕ Добавить сервер', callback_data: 'main_add' }, { text: 'ℹ️ О боте', callback_data: 'main_info' }]
  ];
  if (userId === ADMIN_ID) buttons.push([{ text: '🛠 Админ', callback_data: 'main_admin' }]);
  return { inline_keyboard: buttons };
}

// /start
bot.onText(/\/start/, msg => {
  chatState.set(msg.chat.id, { servers: [...config.serverList] });
  bot.sendMessage(msg.chat.id, '🎮 CS 1.6 Bot\nВыберите действие:', {
    reply_markup: getMainMenu(msg.from.id)
  });
});

// Обработка callback_query
bot.on('callback_query', async query => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;

  if (!chatState.has(chatId)) chatState.set(chatId, { servers: [...config.serverList] });
  const state = chatState.get(chatId);

  // Главное меню
  if (query.data === 'main_start') {
    return bot.editMessageText('🎮 Главное меню:', {
      chat_id: chatId,
      message_id: query.message.message_id,
      reply_markup: getMainMenu(userId)
    });
  }

  if (query.data === 'main_servers') {
    if (!state.servers.length) return bot.answerCallbackQuery(query.id, { text: 'Список серверов пуст.' });
    const serverButtons = state.servers.map((s,i) => [{ text: `${s.host}:${s.port}`, callback_data: `show_${i}` }]);
    return bot.editMessageText('Выберите сервер:', {
      chat_id: chatId,
      message_id: query.message.message_id,
      reply_markup: { inline_keyboard: serverButtons }
    });
  }

  if (query.data === 'main_add') {
    bot.sendMessage(chatId, 'Отправьте IP:PORT нового сервера (пример: 46.174.55.32:27015)');
    bot.once('message', m => {
      const [host, port] = m.text.split(':');
      if (!host || !port) return bot.sendMessage(chatId, '❌ Неверный формат');
      state.servers.push({ host: host.trim(), port: Number(port) });
      bot.sendMessage(chatId, `✅ Сервер ${host}:${port} добавлен!`);
    });
    return bot.answerCallbackQuery(query.id);
  }

  if (query.data === 'main_info') {
    bot.sendMessage(chatId, `CS 1.6 Telegram Bot\nВерсия: 1.0.0\nФункции: просмотр серверов, онлайн, карта, список игроков`);
    return bot.answerCallbackQuery(query.id);
  }

  if (query.data === 'main_admin') {
    if (userId !== ADMIN_ID) return bot.answerCallbackQuery(query.id, { text: 'Нет доступа' });
    let totalServers = 0;
    chatState.forEach(c => totalServers += c.servers.length);
    bot.sendMessage(chatId, `👮‍ Админ панель\nЧатов: ${chatState.size}\nВсего серверов: ${totalServers}`);
    return bot.answerCallbackQuery(query.id);
  }

  // Выбор конкретного сервера
  if (query.data.startsWith('show_')) {
    const idx = Number(query.data.split('_')[1]);
    await sendServerInfo(chatId, idx);
    return bot.answerCallbackQuery(query.id);
  }

  // Обновление сервера
  if (query.data.startsWith('refresh_')) {
    const idx = Number(query.data.split('_')[1]);
    await sendServerInfo(chatId, idx);
    return bot.answerCallbackQuery(query.id, { text: 'Обновлено' });
  }
});
