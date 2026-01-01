const TelegramBot = require('node-telegram-bot-api');
const Gamedig = require('gamedig');

const TOKEN = process.env.BOT_TOKEN; // получаем токен из переменной окружения
const bot = new TelegramBot(TOKEN, { polling: true });

const SERVER = {
  host: '46.174.55.32',
  port: 27015,
  type: 'cs16' // важно для Gamedig, чтобы не было ошибки "Invalid game"
};

// Функция получения информации о сервере
async function getServerInfo() {
  try {
    const state = await Gamedig.query(SERVER);
    return state;
  } catch (err) {
    console.error(err);
    return null;
  }
}

// Форматирование сообщения
function formatMessage(state) {
  if (!state) return '❌ Сервер недоступен';

  let text = `<b>${state.name}</b>\n`;
  text += `Карта: ${state.map}\n`;
  text += `Игроки: ${state.players.length}/${state.maxplayers}\n\n`;
  text += `<b>Список игроков:</b>\n`;
  state.players.forEach(p => {
    text += `🎮 <b>${p.name}</b> — <i>${p.score}</i> очк., <code>${p.time}</code>\n`;
  });
  return text;
}

// Команда /server
bot.onText(/\/server/, async (msg) => {
  const chatId = msg.chat.id;
  const state = await getServerInfo();
  bot.sendMessage(chatId, formatMessage(state), {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔄 Обновить сервер', callback_data: 'refresh' }]
      ]
    }
  });
});

// Кнопка обновления
bot.on('callback_query', async (query) => {
  if (query.data === 'refresh') {
    const chatId = query.message.chat.id;
    const state = await getServerInfo();
    bot.sendMessage(chatId, formatMessage(state), { parse_mode: 'HTML' });
  }
});
