const TelegramBot = require('node-telegram-bot-api');
const { query } = require('gamedig');
const { token, server } = require('./config');

const bot = new TelegramBot(token, { polling: true });

// Экранирование HTML для безопасности
function escapeHTML(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Получаем информацию о сервере
async function getServerInfo(host, port) {
  try {
    const data = await query({
      type: 'cs16',
      host,
      port
    });
    return data;
  } catch (err) {
    throw new Error(err.message || 'Сервер недоступен');
  }
}

// Форматируем сообщение для Telegram
function formatMessage(data) {
  let text = `<b>Сервер CS 1.6</b>\n`;
  text += `Название: ${escapeHTML(data.name)}\n`;
  text += `Карта: ${escapeHTML(data.map)}\n`;
  text += `Игроки: ${data.players.length}/${data.maxplayers}\n\n`;

  text += `<b>Игроки:</b>\n`;
  data.players.forEach(p => {
    text += `🎮 <b>${escapeHTML(p.name || 'Неизвестно')}</b> — <i>${p.score}</i> очк., <code>${p.time || '0 мин.'}</code>\n`;
  });

  return text;
}

// Команда /server
bot.onText(/\/server/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const data = await getServerInfo(server.host, server.port);
    await bot.sendMessage(chatId, formatMessage(data), {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '🔄 Обновить сервер', callback_data: 'refresh' }]]
      }
    });
  } catch (err) {
    await bot.sendMessage(chatId, `❌ Сервер недоступен\n${err.message}`);
  }
});

// Кнопка "Обновить сервер"
bot.on('callback_query', async (query) => {
  if (query.data === 'refresh') {
    const chatId = query.message.chat.id;
    try {
      const data = await getServerInfo(server.host, server.port);
      await bot.sendMessage(chatId, formatMessage(data), { parse_mode: 'HTML' });
    } catch (err) {
      await bot.sendMessage(chatId, `❌ Сервер недоступен\n${err.message}`);
    }
  }
});
