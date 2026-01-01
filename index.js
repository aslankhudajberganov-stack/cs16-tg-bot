// index.js
const TelegramBot = require('node-telegram-bot-api');
const Gamedig = require('gamedig');

// Токен берём из переменной окружения
const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('❌ Ошибка: BOT_TOKEN не задан в переменных окружения!');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// Настройки сервера
const SERVER_HOST = '46.174.55.32';
const SERVER_PORT = 27015;

// Экранирование HTML для Telegram
function escapeHTML(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Получение информации с сервера
async function getServerInfo(host, port) {
  try {
    const state = await Gamedig.query({
      type: 'cs16',
      host: host,
      port: port
    });
    return state;
  } catch (err) {
    throw 'Сервер недоступен';
  }
}

// Форматируем сообщение для Telegram
function formatMessage(state) {
  const players = state.players.map((p, i) =>
    `<b>${i + 1}. ${escapeHTML(p.name || 'NoName')}</b> | <i>${p.score || 0}</i> очк. | <code>${Math.floor((p.time||0)/60)} мин.</code>`
  ).join('\n');

  return `🎮 <b>${escapeHTML(state.name)}</b>
🗺 <b>Карта:</b> ${escapeHTML(state.map)}
📊 <b>Игроки:</b> ${state.players.length}/${state.maxplayers}

👥 <b>Список игроков:</b>
${players}`;
}

// Отправка инфо о сервере
async function sendServerInfo(chatId) {
  try {
    const state = await getServerInfo(SERVER_HOST, SERVER_PORT);
    await bot.sendMessage(chatId, formatMessage(state), {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 Обновить', callback_data: 'refresh' },
            { text: '👥 Игроки', callback_data: 'players' }
          ],
          [
            { text: '🏁 Старт', callback_data: 'start' }
          ]
        ]
      }
    });
  } catch (err) {
    await bot.sendMessage(chatId, `❌ ${err}`);
  }
}

// Команда /server
bot.onText(/\/server/, (msg) => {
  sendServerInfo(msg.chat.id);
});

// Обработка кнопок
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  if (['refresh','players','start'].includes(query.data)) {
    sendServerInfo(chatId);
  }
});
