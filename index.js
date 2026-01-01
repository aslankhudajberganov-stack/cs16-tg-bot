const functions = require('firebase-functions');
const TelegramBot = require('node-telegram-bot-api');
const dgram = require('dgram');

const TOKEN = 'ТВОЙ_ТОКЕН'; // <-- вставь токен своего бота
const bot = new TelegramBot(TOKEN, { polling: false });

const SERVER_HOST = '46.174.55.32';
const SERVER_PORT = 27015;

// Экранирование HTML
function escapeHTML(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Простейший пример получения информации и игроков
async function getServerInfo(host, port) {
  // Здесь можно расширить запрос UDP
  return `Название сервера: SPIRIT [CLASSIC]\nКарта: SPIRIT`;
}

async function getPlayers(host, port) {
  // Пример списка игроков
  return [
    { name: 'WZ l FranK', score: 5, time: '8 мин.' },
    { name: 'DREDD 08 18', score: 19, time: '19 мин.' },
    { name: 'gg 2', score: 5, time: '5 мин.' },
    { name: 'PETROS 040', score: 0, time: '3 мин.' },
  ];
}

// Форматирование сообщения с цветами
function formatMessage(info, players) {
  let text = `<b>Сервер CS 1.6</b>\n`;
  text += `${escapeHTML(info)}\n\n`;
  text += `<b>Игроки:</b>\n`;
  players.forEach(p => {
    text += `🎮 <b>${escapeHTML(p.name)}</b> — <i>${p.score}</i> очк., <code>${p.time}</code>\n`;
  });
  return text;
}

// Webhook для Firebase
exports.telegramBot = functions.https.onRequest(async (req, res) => {
  try {
    await bot.processUpdate(req.body);
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// Команда /server
bot.onText(/\/server/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const info = await getServerInfo(SERVER_HOST, SERVER_PORT);
    const players = await getPlayers(SERVER_HOST, SERVER_PORT);
    await bot.sendMessage(chatId, formatMessage(info, players), {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '🔄 Обновить сервер', callback_data: 'refresh' }]]
      }
    });
  } catch (err) {
    await bot.sendMessage(chatId, `❌ Сервер недоступен\n${err}`);
  }
});

// Кнопка обновления
bot.on('callback_query', async (query) => {
  if (query.data === 'refresh') {
    const chatId = query.message.chat.id;
    const info = await getServerInfo(SERVER_HOST, SERVER_PORT);
    const players = await getPlayers(SERVER_HOST, SERVER_PORT);
    await bot.sendMessage(chatId, formatMessage(info, players), { parse_mode: 'HTML' });
  }
});
