const TelegramBot = require('node-telegram-bot-api');
const Gamedig = require('gamedig');
const config = require('./config');

const bot = new TelegramBot(config.token, { polling: true });

console.log('🤖 Бот запущен');

// =====================
// ВРЕМЕННОЕ ХРАНЕНИЕ
// =====================
const bannedUsers = new Set();

// =====================
// REPLY-КНОПКИ
// =====================
const startKeyboard = {
  reply_markup: {
    keyboard: [[{ text: '▶️ Старт' }]],
    resize_keyboard: true
  }
};

const mainKeyboard = {
  reply_markup: {
    keyboard: [
      ['🎮 Сервера'],
      ['➕ Добавить сервер'],
      ['ℹ️ О боте'],
      ['📤 Поделиться ботом']
    ],
    resize_keyboard: true
  }
};

// =====================
// /start
// =====================
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  if (bannedUsers.has(chatId)) return;

  bot.sendMessage(
    chatId,
    '👋 Добро пожаловать!\nНажмите «Старт»',
    startKeyboard
  );
});

// =====================
// ОБРАБОТКА СООБЩЕНИЙ
// =====================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (bannedUsers.has(chatId)) return;
  if (!text) return;

  // ▶️ Старт
  if (text === '▶️ Старт') {
    return bot.sendMessage(chatId, '📋 Главное меню', mainKeyboard);
  }

  // 🎮 Сервера
  if (text === '🎮 Сервера') {
    const inlineServers = config.servers.map((s, i) => ([
      {
        text: s.name,
        callback_data: `server_${i}`
      }
    ]));

    return bot.sendMessage(chatId, '🎮 Выберите сервер:', {
      reply_markup: { inline_keyboard: inlineServers }
    });
  }

  // ➕ Добавить сервер
  if (text === '➕ Добавить сервер') {
    return bot.sendMessage(
      chatId,
      '❌ Пока недоступно\n(будет добавлено позже)'
    );
  }

  // ℹ️ О боте
  if (text === 'ℹ️ О боте') {
    return bot.sendMessage(
      chatId,
      `🤖 <b>CS 1.6 Online Monitor</b>

📊 Онлайн мониторинг серверов
👨‍💻 Разработчик: @leva_sdd
🆔 ID: 6387957935`,
      { parse_mode: 'HTML' }
    );
  }

  // 📤 Поделиться ботом
  if (text === '📤 Поделиться ботом') {
    return bot.sendPhoto(
      chatId,
      'https://i.postimg.cc/ZRj839L0/images.jpg',
      {
        caption: '🔥 Лучший бот для мониторинга CS 1.6 серверов!',
        reply_markup: {
          inline_keyboard: [[
            {
              text: '📤 Поделиться',
              switch_inline_query: 'CS 1.6 Online Monitor'
            }
          ]]
        }
      }
    );
  }

  // 👑 Админ панель
  if (text === '/admin' && config.admins.includes(chatId)) {
    return bot.sendMessage(chatId, '👑 Админ панель', {
      reply_markup: {
        keyboard: [
          ['📊 Статистика'],
          ['🚫 Бан', '✅ Разбан'],
          ['⬅️ Назад']
        ],
        resize_keyboard: true
      }
    });
  }

  if (text === '⬅️ Назад') {
    return bot.sendMessage(chatId, '📋 Главное меню', mainKeyboard);
  }

  if (text === '📊 Статистика' && config.admins.includes(chatId)) {
    let totalPlayers = 0;

    for (const s of config.servers) {
      try {
        const state = await Gamedig.query({
          type: 'cs16',
          host: s.host,
          port: s.port
        });
        totalPlayers += state.players.length;
      } catch {}
    }

    return bot.sendMessage(
      chatId,
      `📊 Статистика:\n🎮 Серверов: ${config.servers.length}\n👥 Игроков онлайн: ${totalPlayers}`
    );
  }
});

// =====================
// INLINE ОБРАБОТКА
// =====================
bot.on('callback_query', async (q) => {
  const chatId = q.message.chat.id;
  const data = q.data;

  if (!data.startsWith('server_')) return;

  const index = parseInt(data.split('_')[1]);
  const server = config.servers[index];

  try {
    const state = await Gamedig.query({
      type: 'cs16',
      host: server.host,
      port: server.port
    });

    const text =
      `🎮 <b>${server.name}</b>\n` +
      `🌐 ${server.host}:${server.port}\n` +
      `🗺 Карта: ${state.map}\n` +
      `👥 Игроки: ${state.players.length}/${state.maxplayers}`;

    bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
  } catch {
    bot.sendMessage(chatId, `❌ Сервер ${server.name} недоступен`);
  }

  bot.answerCallbackQuery(q.id);
});
