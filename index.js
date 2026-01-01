const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config'); // { token, server: { host, port } }

// Инициализация бота
const bot = new TelegramBot(config.token, { polling: true });
console.log('🤖 Бот запущен и ждёт команд...');

const SERVERS_FILE = './servers.json';
let SERVERS = [];
if (fs.existsSync(SERVERS_FILE)) {
  SERVERS = JSON.parse(fs.readFileSync(SERVERS_FILE, 'utf8'));
}

// === Экранирование HTML ===
function escapeHTML(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;')
             .replace(/</g, '&lt;')
             .replace(/>/g, '&gt;')
             .replace(/"/g, '&quot;')
             .replace(/'/g, '&#039;');
}

// === Простейший пример получения информации и игроков ===
async function getServerInfo(host, port) {
  // Здесь можно подключить gamedig или UDP
  return { name: `Сервер ${host}`, map: 'SPIRIT', playersCount: Math.floor(Math.random() * 32) };
}

async function getPlayers(host, port) {
  // Пример списка игроков
  return [
    { name: 'Player1', score: 5, time: '8 мин.' },
    { name: 'Player2', score: 10, time: '20 мин.' },
  ];
}

// === Форматирование сообщения с инфо ===
function formatMessage(info, players) {
  const playerList = players.map((p,i)=>`${i+1}. <b>${escapeHTML(p.name)}</b> | <i>${p.score}</i> очк. | <code>${p.time}</code>`).join('\n');
  return `<b>${escapeHTML(info.name)}</b>\n🗺 Карта: ${escapeHTML(info.map)}\n👥 Игроки: ${players.length}\n\n${playerList}`;
}

// === Кнопки под сообщением ===
function serverButtons(server) {
  return [
    [
      { text: '🔄 Обновить', callback_data: `refresh_${server.host}_${server.port}` },
      { text: server.favorite ? '⭐ Убрать из избранного' : '⭐ В избранное', callback_data: `favorite_${server.host}_${server.port}` }
    ],
    [
      { text: '🗑 Удалить', callback_data: `delete_${server.host}_${server.port}` },
      { text: '🤝 Поделиться ботом', url: `https://t.me/${bot.username}` }
    ]
  ];
}

// === Отправка инфо о сервере ===
async function sendServerInfo(chatId, server) {
  try {
    const info = await getServerInfo(server.host, server.port);
    const players = await getPlayers(server.host, server.port);

    bot.sendMessage(chatId, formatMessage(info, players), {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: serverButtons(server) }
    });
  } catch (err) {
    bot.sendMessage(chatId, `❌ Сервер недоступен\n${err}`);
  }
}

// === Команды ===

// Стартовое меню
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const keyboard = [
    [{ text: '➕ Добавить сервер', callback_data: 'add_server' }],
    [{ text: '📂 Избранные серверы', callback_data: 'show_favorites' }],
  ];
  bot.sendMessage(chatId, 'Привет! Выбери действие:', { reply_markup: { inline_keyboard: keyboard } });
});

// === Кнопки и callback ===
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;

  // Обработка добавления сервера
  if (query.data === 'add_server') {
    bot.sendMessage(chatId, 'Отправь IP и порт сервера через пробел, например:\n46.174.55.32 27015');
    bot.once('message', (msg) => {
      const [host, port] = msg.text.split(' ');
      const newServer = { host, port: Number(port), favorite: false };
      SERVERS.push(newServer);
      fs.writeFileSync(SERVERS_FILE, JSON.stringify(SERVERS, null, 2));
      bot.sendMessage(chatId, `✅ Сервер ${host}:${port} добавлен!`);
    });
    return;
  }

  // Показать избранные
  if (query.data === 'show_favorites') {
    const favorites = SERVERS.filter(s => s.favorite);
    if (!favorites.length) return bot.sendMessage(chatId, '⭐ Нет избранных серверов.');
    favorites.forEach(s => sendServerInfo(chatId, s));
    return;
  }

  // Разбор остальных кнопок
  const [action, host, port] = query.data.split('_');
  const serverIndex = SERVERS.findIndex(s => s.host === host && s.port === Number(port));
  if (serverIndex === -1) return;

  switch(action){
    case 'refresh':
      sendServerInfo(chatId, SERVERS[serverIndex]);
      break;
    case 'favorite':
      SERVERS[serverIndex].favorite = !SERVERS[serverIndex].favorite;
      fs.writeFileSync(SERVERS_FILE, JSON.stringify(SERVERS, null, 2));
      bot.editMessageReplyMarkup({ inline_keyboard: serverButtons(SERVERS[serverIndex]) }, {
        chat_id: chatId,
        message_id: query.message.message_id
      });
      break;
    case 'delete':
      SERVERS.splice(serverIndex,1);
      fs.writeFileSync(SERVERS_FILE, JSON.stringify(SERVERS, null, 2));
      bot.deleteMessage(chatId, query.message.message_id);
      break;
  }
});

// === Сообщение при деплое ===
bot.onText(/\/deploy/, (msg) => {
  bot.sendMessage(msg.chat.id, '🤖 Бот запущен и готов работать!');
});
