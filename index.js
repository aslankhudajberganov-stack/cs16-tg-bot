const TelegramBot = require('node-telegram-bot-api');
const Gamedig = require('gamedig');

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('❌ Ошибка: BOT_TOKEN не задан в переменных окружения!');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// Список серверов
const SERVERS = [
  { name: 'SPIRIT [CLASSIC]', host: '46.174.55.32', port: 27015 },
  { name: 'Другой сервер', host: '62.122.213.153', port: 27015 }
];

// Экранирование HTML
function escapeHTML(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
             .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
             .replace(/'/g, '&#039;');
}

// Получение информации с сервера
async function getServerInfo(server) {
  try {
    const state = await Gamedig.query({
      type: 'cs16',
      host: server.host,
      port: server.port
    });
    return state;
  } catch (err) {
    throw 'Сервер недоступен';
  }
}

// Форматируем сообщение
function formatMessage(state) {
  const players = state.players.map((p,i) =>
    `<b>${i+1}. ${escapeHTML(p.name||'NoName')}</b> | <i>${p.score||0}</i> очк. | <code>${Math.floor((p.time||0)/60)} мин.</code>`
  ).join('\n');

  return `🎮 <b>${escapeHTML(state.name)}</b>
🗺 <b>Карта:</b> ${escapeHTML(state.map)}
📊 <b>Игроки:</b> ${state.players.length}/${state.maxplayers}

👥 <b>Список игроков:</b>
${players}`;
}

// Отправка инфо о сервере
async function sendServerInfo(chatId, server) {
  try {
    const state = await getServerInfo(server);
    await bot.sendMessage(chatId, formatMessage(state), {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          SERVERS.map(s => ({ text: s.name, callback_data: `server_${s.host}_${s.port}` })),
          [{ text: '🔄 Обновить', callback_data: `refresh_${server.host}_${server.port}` }]
        ]
      }
    });
  } catch (err) {
    await bot.sendMessage(chatId, `❌ ${err}`);
  }
}

// Команда /server
bot.onText(/\/server/, (msg) => {
  // По умолчанию первый сервер
  sendServerInfo(msg.chat.id, SERVERS[0]);
});

// Обработка кнопок
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data.startsWith('server_')) {
    const [, host, port] = data.split('_');
    const server = SERVERS.find(s => s.host === host && s.port.toString() === port);
    if (server) sendServerInfo(chatId, server);
  }

  if (data.startsWith('refresh_')) {
    const [, host, port] = data.split('_');
    const server = SERVERS.find(s => s.host === host && s.port.toString() === port);
    if (server) sendServerInfo(chatId, server);
  }
});
