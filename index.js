// index.js
const TelegramBot = require('node-telegram-bot-api');
const Gamedig = require('gamedig');
const config = require('./config'); // { token, serverList }

const bot = new TelegramBot(config.token, { polling: true });

console.log('🤖 Бот запущен...');

// Хранение состояния чата
const chatState = new Map();

// Экранирование HTML
function escapeHTML(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;')
             .replace(/</g, '&lt;')
             .replace(/>/g, '&gt;')
             .replace(/"/g, '&quot;')
             .replace(/'/g, '&#039;');
}

// Получение данных сервера через Gamedig
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

  } catch (err) {
    console.log(`Ошибка с сервером ${server.host}:${server.port}`, err);
    server.name = 'Сервер недоступен';
    server.map = '-';
    server.maxPlayers = 0;
    server.players = [];
  }
}

// Формат сообщения
function formatServerMessage(server) {
  let occupancy = server.players.length && server.maxPlayers
                  ? Math.round((server.players.length / server.maxPlayers)*100)
                  : 0;

  let text = `<b>${escapeHTML(server.name)}</b>\n`;
  text += `🗺 <b>Карта:</b> ${escapeHTML(server.map)}\n`;
  text += `📊 <b>Игроки:</b> ${server.players.length} (~${occupancy}% загрузка)\n`;
  text += `⭐ <b>Макс. игроков:</b> ${server.maxPlayers}\n\n`;

  if (server.players.length > 0) {
    text += `<b>Игроки:</b>\n`;
    server.players.slice(0, 10).forEach((p, i) => {
      text += `${i+1}. <b>${escapeHTML(p.name)}</b> | <u>${p.score}</u> | <i>${p.time} мин.</i>\n`;
    });
  } else {
    text += `⚠️ Игроки не доступны (UDP может быть заблокирован)\n`;
  }

  return text;
}

// Кнопки
function getServerButtons(serverIndex) {
  return {
    inline_keyboard: [
      [
        { text: '🔄 Обновить', callback_data: `refresh_${serverIndex}` }
      ],
      [
        { text: '➕ Добавить сервер', callback_data: 'add_server' },
        { text: '📤 Поделиться ботом', url: 'https://t.me/YourBotUsername' }
      ]
    ]
  };
}

// Отправка инфо о сервере
async function sendServerInfo(chatId, serverIndex) {
  const state = chatState.get(chatId);
  if (!state || !state.servers[serverIndex]) return;

  const server = state.servers[serverIndex];
  await fetchServerData(server);

  bot.sendMessage(chatId, formatServerMessage(server), {
    parse_mode: 'HTML',
    reply_markup: getServerButtons(serverIndex)
  });
}

// /start
bot.onText(/\/start/, msg => {
  chatState.set(msg.chat.id, { servers: [...config.serverList] });

  bot.sendMessage(msg.chat.id,
    '🎮 CS 1.6 Bot\nВыберите сервер или добавьте новый:',
    { reply_markup: { keyboard: [['🎮 Сервера', '➕ Добавить сервер']], resize_keyboard: true } }
  );
});

// Текстовые кнопки
bot.on('message', msg => {
  const chatId = msg.chat.id;
  if (!chatState.has(chatId)) chatState.set(chatId, { servers: [...config.serverList] });
  const state = chatState.get(chatId);

  if (msg.text === '🎮 Сервера') {
    if (!state.servers.length) {
      return bot.sendMessage(chatId, 'Список серверов пуст. Добавьте сервер.');
    }

    const buttons = state.servers.map((s, i) => [{ text: `${s.host}:${s.port}`, callback_data: `show_${i}` }]);
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

  if (query.data === 'add_server') {
    bot.sendMessage(chatId, 'Отправьте IP:PORT нового сервера');
    return bot.answerCallbackQuery(query.id);
  }
});
