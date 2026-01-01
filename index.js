const TelegramBot = require('node-telegram-bot-api');
const Gamedig = require('gamedig');
const config = require('./config'); // { token: process.env.BOT_TOKEN, serverList: [] }

const bot = new TelegramBot(config.token, { polling: true });

console.log('🤖 Бот запущен и ждёт команд...');

// ======== СЕРВЕРЫ ========
let servers = config.serverList || [];

// ======== Экранирование HTML ========
function escapeHTML(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;')
             .replace(/</g, '&lt;')
             .replace(/>/g, '&gt;')
             .replace(/"/g, '&quot;')
             .replace(/'/g, '&#039;');
}

// ======== Получение данных сервера через Gamedig ========
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
      time: Math.floor((p.time || 0) / 60)
    }));
  } catch (err) {
    console.log(`Ошибка получения данных с ${server.host}:${server.port}`, err);
    server.players = [];
    server.name = 'Сервер недоступен';
    server.map = '-';
    server.maxPlayers = 0;
  }
}

// ======== Формат сообщения ========
function formatServerMessage(server) {
  let occupancy = server.players.length && server.maxPlayers
                  ? Math.round((server.players.length / server.maxPlayers) * 100)
                  : 0;

  let text = `<b>${escapeHTML(server.name)}</b>\n`;
  text += `🗺 <b>Карта:</b> ${escapeHTML(server.map)}\n`;
  text += `📊 <b>Игроки:</b> ${server.players.length} (~${occupancy}% загрузка)\n`;
  text += `⭐ <b>Макс. игроков:</b> ${server.maxPlayers}\n\n`;
  text += `<b>Список игроков:</b>\n`;
  server.players.forEach((p, i) => {
    text += `${i+1}. <b>${escapeHTML(p.name)}</b> | <u>${p.score}</u> | <i>${p.time} мин.</i>\n`;
  });
  return text;
}

// ======== Кнопки под сообщением ========
function getServerButtons(serverIndex) {
  return {
    inline_keyboard: [
      [
        { text: '🔄 Обновить', callback_data: `refresh_${serverIndex}` },
        { text: '⭐ В избранное', callback_data: `favorite_${serverIndex}` }
      ],
      [
        { text: '➕ Добавить сервер', callback_data: 'add_server' },
        { text: '📤 Поделиться ботом', url: 'https://t.me/YourBotUsername' }
      ]
    ]
  };
}

// ======== Отправка инфо о сервере ========
async function sendServerInfo(chatId, serverIndex) {
  if (!servers[serverIndex]) return;

  await fetchServerData(servers[serverIndex]);
  bot.sendMessage(chatId, formatServerMessage(servers[serverIndex]), {
    parse_mode: 'HTML',
    reply_markup: getServerButtons(serverIndex)
  });
}

// ======== Команды ========

// /start
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `Привет! 🤖\nВыберите сервер из списка или добавьте новый.`,
    { reply_markup: { inline_keyboard: [
      [{ text: '➕ Добавить сервер', callback_data: 'add_server' }]
    ] } }
  );
});

// /server - показывает первый сервер
bot.onText(/\/server/, (msg) => {
  if (!servers.length) {
    bot.sendMessage(msg.chat.id, 'Список серверов пуст. Добавьте сервер через кнопку ➕ Добавить сервер.');
    return;
  }
  sendServerInfo(msg.chat.id, 0);
});

// ======== Обработка кнопок ========
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;

  // Обновление сервера
  if (query.data.startsWith('refresh_')) {
    const idx = parseInt(query.data.split('_')[1]);
    await sendServerInfo(chatId, idx);
    return;
  }

  // В избранное
  if (query.data.startsWith('favorite_')) {
    const idx = parseInt(query.data.split('_')[1]);
    bot.answerCallbackQuery(query.id, { text: `Сервер "${servers[idx].name}" добавлен в избранное!` });
    return;
  }

  // Добавить сервер
  if (query.data === 'add_server') {
    bot.sendMessage(chatId, 'Отправьте IP и порт нового сервера в формате: 46.174.55.32:27015');
    bot.once('message', (msg) => {
      const [host, port] = msg.text.split(':');
      if (!host || !port) {
        bot.sendMessage(chatId, 'Неверный формат! Попробуйте снова.');
        return;
      }
      servers.push({ host: host.trim(), port: parseInt(port) });
      bot.sendMessage(chatId, `Сервер ${host}:${port} добавлен!`);
    });
    return;
  }
});
