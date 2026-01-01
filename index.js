const TelegramBot = require('node-telegram-bot-api');
const Gamedig = require('gamedig');
const config = require('./config');

if (!config.token) {
  throw new Error('Установи BOT_TOKEN в переменных окружения');
}

const bot = new TelegramBot(config.token, { polling: true });
console.log('🤖 Бот запущен');

// ===== ХРАНИЛИЩЕ ДЛЯ КАЖДОГО ЧАТА =====
const chatState = new Map();
// chatId => { servers: [] }

// ===== МЕНЮ ВНИЗУ ЭКРАНА =====
function bottomMenu() {
  return {
    keyboard: [
      ['🎮 Сервера', '➕ Добавить сервер'],
      ['🔄 Обновить всё', 'ℹ️ О боте']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

// ===== ЗАЩИТА ТЕКСТА =====
function clean(text = '') {
  return text
    .toString()
    .replace(/[^\x20-\x7Eа-яА-ЯёЁ]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ===== ПОЛУЧЕНИЕ ДАННЫХ СЕРВЕРА =====
async function fetchServer(server) {
  try {
    const state = await Gamedig.query({
      type: 'cs16',
      host: server.host,
      port: server.port,
      socketTimeout: 3000
    });

    return {
      online: true,
      name: clean(state.name),
      map: clean(state.map),
      max: state.maxplayers,
      players: state.players.map(p => ({
        name: clean(p.name || 'Unknown'),
        kills: p.score || 0,
        time: Math.floor((p.time || 0) / 60)
      }))
    };
  } catch {
    return { online: false };
  }
}

// ===== ФОРМАТ СООБЩЕНИЯ =====
function formatServer(info, server) {
  if (!info.online) {
    return `🔴 <b>${server.host}:${server.port}</b>\nСервер недоступен`;
  }

  let text = `🟢 <b>${info.name}</b>\n`;
  text += `🗺 Карта: <b>${info.map}</b>\n`;
  text += `👥 Игроки: <b>${info.players.length}/${info.max}</b>\n\n`;
  text += `<b>Игроки (киллы):</b>\n`;

  info.players.slice(0, 20).forEach((p, i) => {
    text += `${i + 1}. ${p.name} — 🔫 <b>${p.kills}</b> | ⏱ ${p.time}м\n`;
  });

  return text;
}

// ===== INLINE КНОПКИ =====
function serverButtons(index) {
  return {
    inline_keyboard: [
      [{ text: '🔄 Обновить', callback_data: `refresh_${index}` }]
    ]
  };
}

// ===== ПОКАЗ СЕРВЕРА =====
async function showServer(chatId, index) {
  const state = chatState.get(chatId);
  const server = state.servers[index];
  if (!server) return;

  const info = await fetchServer(server);

  bot.sendMessage(
    chatId,
    formatServer(info, server),
    {
      parse_mode: 'HTML',
      reply_markup: serverButtons(index)
    }
  );
}

// ===== /start =====
bot.onText(/\/start/, msg => {
  chatState.set(msg.chat.id, { servers: [...config.serverList] });

  bot.sendMessage(
    msg.chat.id,
    '🎮 CS 1.6 Server Bot\nВыбери действие:',
    { reply_markup: bottomMenu() }
  );
});

// ===== МЕНЮ КНОПКИ =====
bot.on('message', async msg => {
  const chatId = msg.chat.id;
  if (!chatState.has(chatId)) {
    chatState.set(chatId, { servers: [] });
  }

  const state = chatState.get(chatId);

  if (msg.text === '🎮 Сервера') {
    if (!state.servers.length) {
      bot.sendMessage(chatId, 'Серверов нет. Добавь сервер.');
      return;
    }
    for (let i = 0; i < state.servers.length; i++) {
      await showServer(chatId, i);
    }
  }

  if (msg.text === '➕ Добавить сервер') {
    bot.sendMessage(chatId, 'Отправь IP:PORT (пример 46.174.55.32:27015)');
    bot.once('message', m => {
      const [host, port] = m.text.split(':');
      if (!host || !port) {
        bot.sendMessage(chatId, '❌ Неверный формат');
        return;
      }
      state.servers.push({ host: host.trim(), port: Number(port) });
      bot.sendMessage(chatId, '✅ Сервер добавлен');
    });
  }

  if (msg.text === '🔄 Обновить всё') {
    for (let i = 0; i < state.servers.length; i++) {
      await showServer(chatId, i);
    }
  }

  if (msg.text === 'ℹ️ О боте') {
    bot.sendMessage(chatId, 'CS 1.6 Bot\nОнлайн мониторинг серверов\nРаботает 24/7');
  }
});

// ===== CALLBACK =====
bot.on('callback_query', async q => {
  const chatId = q.message.chat.id;
  const state = chatState.get(chatId);

  if (q.data.startsWith('refresh_')) {
    const index = Number(q.data.split('_')[1]);
    const server = state.servers[index];
    if (!server) return;

    const info = await fetchServer(server);

    bot.editMessageText(
      formatServer(info, server),
      {
        chat_id: chatId,
        message_id: q.message.message_id,
        parse_mode: 'HTML',
        reply_markup: serverButtons(index)
      }
    );
  }

  bot.answerCallbackQuery(q.id);
});
