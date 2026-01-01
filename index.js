// index.js
const TelegramBot = require('node-telegram-bot-api');
const Gamedig = require('gamedig');
const config = require('./config'); // { token, serverList }

const ADMIN_ID = 123456789; // <- Замените на свой Telegram ID

const bot = new TelegramBot(config.token, { polling: true });
console.log('🤖 Бот запущен...');

// Состояние каждого чата
const chatState = new Map();

// Кэширование серверов
const serverCache = new Map();

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

// Формат сообщения сервера + список игроков
function formatServerMessage(server) {
  const occupancy = server.maxPlayers ? Math.round((server.players.length / server.maxPlayers)*100) : 0;
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
    text += `⚠️ Игроки не доступны (UDP может быть заблокирован на бесплатной платформе)`;
  }

  return text;
}

// Кнопки для сервера
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

// Отправка информации о сервере
async function sendServerInfo(chatId, serverIndex) {
  const state = chatState.get(chatId);
  if (!state || !state.servers[serverIndex]) return;

  const server = state.servers[serverIndex];
  await fetchServerData(server);

  serverCache.set(`${chatId}_${serverIndex}`, server);

  bot.sendMessage(chatId, formatServerMessage(server), {
    parse_mode: 'HTML',
    reply_markup: getServerButtons(serverIndex)
  });
}

// /start
bot.onText(/\/start/, msg => {
  const chatId = msg.chat.id;
  chatState.set(chatId, { servers: [...config.serverList] });

  let buttons = [['🎮 Сервера', '➕ Добавить сервер'], ['ℹ️ О боте']];
  // Админ-кнопка только для ADMIN
  if (msg.from.id === ADMIN_ID) buttons.push(['🛠 Админ']);

  bot.sendMessage(chatId,
    '🎮 CS 1.6 Bot\nВыберите действие:',
    { reply_markup: { keyboard: buttons, resize_keyboard: true } }
  );
});

// Обработка текстовых кнопок
bot.on('message', msg => {
  const chatId = msg.chat.id;
  if (!chatState.has(chatId)) chatState.set(chatId, { servers: [...config.serverList] });
  const state = chatState.get(chatId);

  if (msg.text === '🎮 Сервера') {
    if (!state.servers.length) return bot.sendMessage(chatId, 'Список серверов пуст. Добавьте сервер.');
    const buttons = state.servers.map((s,i) => [{ text: `${s.host}:${s.port}`, callback_data: `show_${i}` }]);
    bot.sendMessage(chatId, 'Выберите сервер:', { reply_markup: { inline_keyboard: buttons } });
  }

  if (msg.text === '➕ Добавить сервер') {
    bot.sendMessage(chatId, 'Отправьте IP:PORT нового сервера (пример: 46.174.55.32:27015)');
    bot.once('message', m => {
      const [host, port] = m.text.split(':');
      if (!host || !port) return bot.sendMessage(chatId, '❌ Неверный формат');
      state.servers.push({ host: host.trim(), port: Number(port) });
      bot.sendMessage(chatId, `✅ Сервер ${host}:${port} добавлен!`);
    });
  }

  if (msg.text === 'ℹ️ О боте') {
    bot.sendMessage(chatId,
      `CS 1.6 Telegram Bot\nВерсия: 1.0.0\nФункции: просмотр серверов, онлайн, карта, список игроков (если UDP доступен)`);
  }

  if (msg.text === '🛠 Админ') {
    if (msg.from.id !== ADMIN_ID) return;
    const totalChats = chatState.size;
    let totalServers = 0;
    chatState.forEach(c => totalServers += c.servers.length);
    bot.sendMessage(chatId,
      `👮‍ Админ панель\nЧатов: ${totalChats}\nВсего серверов: ${totalServers}`);
  }
});

// Кнопки под сообщением
bot.on('callback_query', async query => {
  const chatId = query.message.chat.id;
  const state = chatState.get(chatId);

  if (query.data.startsWith('show_')) {
    const idx = Number(query.data.split('_')[1]);
    await sendServerInfo(chatId, idx);
    return bot.answerCallbackQuery(query.id);
  }

  if (query.data.startsWith('refresh_')) {
    const idx = Number(query.data.split('_')[1]);
    await sendServerInfo(chatId, idx);
    return bot.answerCallbackQuery(query.id, { text: 'Обновлено' });
  }
});
