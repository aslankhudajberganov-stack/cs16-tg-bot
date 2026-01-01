const TelegramBot = require('node-telegram-bot-api');

// Берём токен из Environment
const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error("❌ BOT_TOKEN не найден! Добавь в Environment переменные.");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// Настройки сервера CS 1.6
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

// Пример получения информации о сервере
async function getServerInfo(host, port) {
  try {
    // Здесь можно подключить Gamedig или UDP-запрос
    return `Название сервера: SPIRIT [CLASSIC]\nКарта: SPIRIT`;
  } catch(err) {
    console.error(err);
    return "❌ Сервер недоступен";
  }
}

// Пример списка игроков
async function getPlayers(host, port) {
  try {
    return [
      { name: 'WZ l FranK', score: 5, time: '8 мин.' },
      { name: 'DREDD 08 18', score: 19, time: '19 мин.' },
      { name: 'gg 2', score: 5, time: '5 мин.' },
      { name: 'PETROS 040', score: 0, time: '3 мин.' },
    ];
  } catch(err) {
    console.error(err);
    return [];
  }
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

// Кнопка "Обновить сервер"
bot.on('callback_query', async (query) => {
  if (query.data === 'refresh') {
    const chatId = query.message.chat.id;
    try {
      const info = await getServerInfo(SERVER_HOST, SERVER_PORT);
      const players = await getPlayers(SERVER_HOST, SERVER_PORT);
      await bot.sendMessage(chatId, formatMessage(info, players), { parse_mode: 'HTML' });
    } catch(err) {
      await bot.sendMessage(chatId, `❌ Сервер недоступен\n${err}`);
    }
  }
});
