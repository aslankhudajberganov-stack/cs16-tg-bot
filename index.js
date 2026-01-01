const TelegramBot = require('node-telegram-bot-api');
const Gamedig = require('gamedig');
const config = require('./config');

if (!config.token) {
  throw new Error('Установите BOT_TOKEN в переменных окружения!');
}

const bot = new TelegramBot(config.token, { polling: true });
console.log('🤖 Бот запущен');

// ================= СОСТОЯНИЕ ЧАТОВ =================
const chats = {}; 
// chats[chatId] = { servers: [], mode: null }

// ================= HELPERS =================
function getChat(chatId) {
  if (!chats[chatId]) {
    chats[chatId] = {
      servers: [...config.serverList],
      mode: null
    };
  }
  return chats[chatId];
}

// ❗ КРИТИЧЕСКИ ВАЖНО для CS 1.6
function escapeHTML(text = '') {
  return text
    .toString()
    .replace(/[^\x20-\x7Eа-яА-ЯёЁ]/g, '') // удаляем мусор
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ================= SERVER QUERY =================
async function fetchServerData(server) {
  try {
    const state = await Gamedig.query({
      type: 'cs16',
      host: server.host,
      port: server.port
    });

    server.name = state.name || `${server.host}:${server.port}`;
    server.map = state.map || '-';
    server.maxPlayers = state.maxplayers || 0;
    server.players = (state.players || []).map(p => ({
      name: p.name || 'Unknown',
      score: p.score || 0,
      time: Math.floor((p.time || 0) / 60)
    }));
  } catch {
    server.name = '❌ Сервер недоступен';
    server.map = '-';
    server.maxPlayers = 0;
    server.players = [];
  }
}

// ================= FORMAT =================
function formatServer(server) {
  let text = `<b>${escapeHTML(server.name)}</b>\n`;
  text += `🗺 Карта: ${escapeHTML(server.map)}\n`;
  text += `👥 Игроки: ${server.players.length}/${server.maxPlayers}\n\n`;

  if (server.players.length) {
    server.players.slice(0, 20).forEach((p, i) => {
      text += `${i + 1}. ${escapeHTML(p.name)} | ${p.score} | ${p.time} мин\n`;
    });
  } else {
    text += 'Нет игроков';
  }

  return text;
}

// ================= MENUS =================
function mainMenu() {
  return {
    inline_keyboard: [
      [{ text: '🎮 Сервера', callback_data: 'menu_servers' }],
      [{ text: '➕ Добавить сервер', callback_data: 'add_server' }]
    ]
  };
}

function serverButtons(index) {
  return {
    inline_keyboard: [
      [{ text: '🔄 Обновить', callback_data: `refresh_${index}` }],
      [{ text: '⬅️ Назад', callback_data: 'back' }]
    ]
  };
}

// ================= COMMANDS =================
bot.onText(/\/start/, (msg) => {
  getChat(msg.chat.id);
  bot.sendMessage(msg.chat.id, 'Главное меню:', {
    reply_markup: mainMenu()
  });
});

// ================= CALLBACKS =================
bot.on('callback_query', async (q) => {
  const chatId = q.message.chat.id;
  const chat = getChat(chatId);
  const data = q.data;

  // Назад
  if (data === 'back') {
    bot.editMessageText('Главное меню:', {
      chat_id: chatId,
      message_id: q.message.message_id,
      reply_markup: mainMenu()
    });
    return;
  }

  // Список серверов
  if (data === 'menu_servers') {
    if (!chat.servers.length) {
      bot.answerCallbackQuery(q.id, { text: 'Серверов нет' });
      return;
    }

    const buttons = chat.servers.map((s, i) => ([
      { text: `${s.host}:${s.port}`, callback_data: `show_${i}` }
    ]));
    buttons.push([{ text: '⬅️ Назад', callback_data: 'back' }]);

    bot.editMessageText('Сервера:', {
      chat_id: chatId,
      message_id: q.message.message_id,
      reply_markup: { inline_keyboard: buttons }
    });
    return;
  }

  // Показ сервера
  if (data.startsWith('show_')) {
    const i = Number(data.split('_')[1]);
    await fetchServerData(chat.servers[i]);

    bot.editMessageText(formatServer(chat.servers[i]), {
      chat_id: chatId,
      message_id: q.message.message_id,
      parse_mode: 'HTML',
      reply_markup: serverButtons(i)
    });
    return;
  }

  // Обновить сервер
  if (data.startsWith('refresh_')) {
    const i = Number(data.split('_')[1]);
    await fetchServerData(chat.servers[i]);

    bot.editMessageText(formatServer(chat.servers[i]), {
      chat_id: chatId,
      message_id: q.message.message_id,
      parse_mode: 'HTML',
      reply_markup: serverButtons(i)
    });
    return;
  }

  // Добавить сервер
  if (data === 'add_server') {
    chat.mode = 'add_server';
    bot.sendMessage(chatId, 'Введи IP:PORT сервера\nПример: 46.174.55.32:27015');
    return;
  }
});

// ================= MESSAGE INPUT =================
bot.on('message', async (msg) => {
  const chat = getChat(msg.chat.id);
  if (chat.mode !== 'add_server') return;

  chat.mode = null;

  const [host, port] = msg.text.split(':');
  if (!host || !port || isNaN(port)) {
    bot.sendMessage(msg.chat.id, '❌ Неверный формат. Пример: 46.174.55.32:27015');
    return;
  }

  const server = { host: host.trim(), port: Number(port) };
  chat.servers.push(server);

  await fetchServerData(server);

  bot.sendMessage(msg.chat.id, formatServer(server), {
    parse_mode: 'HTML',
    reply_markup: serverButtons(chat.servers.length - 1)
  });
});
