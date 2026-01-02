const TelegramBot = require('node-telegram-bot-api');
const Gamedig = require('gamedig');
const config = require('./config');

const TOKEN = process.env.BOT_TOKEN;
const RAILWAY_URL = process.env.RAILWAY_STATIC_URL || '';

if (!TOKEN) throw new Error('BOT_TOKEN не задан!');

// ===== Настройка бота: polling локально, webhook на Railway =====
let bot;

if (RAILWAY_URL) {
  bot = new TelegramBot(TOKEN, { webHook: true });
  bot.setWebHook(`${RAILWAY_URL}/bot${TOKEN}`);
  console.log('🤖 Бот запущен через Webhook на Railway!');
} else {
  bot = new TelegramBot(TOKEN, { polling: true });
  bot.deleteWebHook().then(() => console.log('🤖 Webhook удалён, бот запущен локально через polling'));
}

// ===== Переменные =====
const servers = config.servers;
const admins = config.admins;
const users = new Map();
const banned = new Set();

const esc = t => t ? t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '';

// ===== Функция запроса сервера =====
async function queryServer(server) {
  try {
    const s = await Gamedig.query({ type: 'cs16', host: server.host, port: server.port });
    return {
      online: true,
      name: server.name || s.name,
      map: s.map || '-',
      max: s.maxplayers || 0,
      players: Array.isArray(s.players) ? s.players.map(p => ({
        name: p.name || 'Unknown',
        score: p.score ?? 0,
        time: Math.floor((p.time || 0)/60)
      })) : []
    };
  } catch {
    return { online: false, name: server.name, map: '-', max: 0, players: [] };
  }
}

// ===== Клавиатуры =====
const startKeyboard = { keyboard: [[{ text: '▶️ Старт' }]], resize_keyboard: true, one_time_keyboard: true };

function mainKeyboard(isAdmin) {
  const rows = [
    ['🎮 Сервера', '➕ Добавить сервер'],
    ['ℹ️ О боте', '📤 Поделиться ботом']
  ];
  if (isAdmin) rows.push(['🛠 Админ']);
  return { keyboard: rows, resize_keyboard: true };
}

function adminKeyboard() {
  return {
    keyboard: [
      ['📊 Статистика', '👥 Пользователи'],
      ['🚫 Бан/Разбан', '⬅️ Назад']
    ],
    resize_keyboard: true
  };
}

// ===== Пользователи =====
function addUser(obj) {
  const from = obj?.from;
  if (!from) return false;

  const userId = from.id;
  if (!userId) return false;
  if (banned.has(userId)) return false;

  users.set(userId, { username: from.username, first_name: from.first_name });
  return true;
}

// ===== /start =====
bot.onText(/\/start/, msg => {
  addUser(msg);
  bot.sendMessage(msg.chat.id, 'Добро пожаловать 👋', { reply_markup: startKeyboard });
});

// ===== Сообщения =====
bot.on('message', async msg => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const isAdmin = admins.includes(msg.from?.id);

  addUser(msg);
  if (!text) return;

  // ===== Главное меню =====
  if (text === '▶️ Старт') return bot.sendMessage(chatId, 'Главное меню:', { reply_markup: mainKeyboard(isAdmin) });

  if (text === 'ℹ️ О боте') {
    return bot.sendMessage(chatId,
      `🤖 CS 1.6 Bot\n\nРазработчик: [Написать разработчику](tg://user?id=6387957935)\n\nФункции:\n• Показывает сервера\n• Онлайн игроков\n• Карта и статус сервера\n• Список игроков`,
      { parse_mode: 'Markdown', reply_markup: mainKeyboard(isAdmin) }
    );
  }

  if (text === '📤 Поделиться ботом') {
    return bot.sendPhoto(chatId, 'https://i.postimg.cc/ZRj839L0/images.jpg', {
      caption: `🤖 *CS 1.6 Bot*\n\nПоказывает сервера CS 1.6, онлайн игроков и карты.\n\nПоделитесь ботом с друзьями или в группе!`,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: 'Переслать друзьям', switch_inline_query: '' }]] }
    });
  }

  // ===== Серверы =====
  if (text === '🎮 Сервера') {
    if (!servers.length) return bot.sendMessage(chatId, 'Серверов пока нет', { reply_markup: mainKeyboard(isAdmin) });
    const inline = servers.map((s,i) => ([{ text: s.name, callback_data: `srv_${i}` }]));
    return bot.sendMessage(chatId, 'Выберите сервер:', { reply_markup: { inline_keyboard: inline } });
  }

  if (text === '➕ Добавить сервер') {
    bot.sendMessage(chatId, 'Введите IP:PORT[:Name] (например 127.0.0.1:27015:Мой сервер)');
    bot.once('message', msg2 => {
      const [host, port, ...nameParts] = msg2.text.split(':');
      const name = nameParts.join(':').trim() || `Сервер ${servers.length+1}`;
      if (!host || !port) return bot.sendMessage(chatId, `Введите в формате: IP:PORT[:Name]`, { reply_markup: mainKeyboard(isAdmin) });
      servers.push({ host: host.trim(), port: Number(port), name });
      bot.sendMessage(chatId, `✅ Сервер добавлен: ${name}`, { reply_markup: mainKeyboard(isAdmin) });
    });
  }

  // ===== Админ-панель =====
  if (text === '🛠 Админ' && isAdmin) return bot.sendMessage(chatId, 'Админ-панель:', { reply_markup: adminKeyboard() });

  if (isAdmin && text === '📊 Статистика') return bot.sendMessage(chatId,
    `📊 Статистика бота:\n• Серверов: ${servers.length}\n• Пользователей: ${users.size}\n• Забанено: ${banned.size}`, { reply_markup: adminKeyboard() });

  if (isAdmin && text === '👥 Пользователи') {
    const list = [...users.values()].map(u => u.username ? `@${u.username}` : u.first_name).join('\n');
    return bot.sendMessage(chatId, `👥 Пользователи:\n${list || '— пока нет —'}`, { reply_markup: adminKeyboard() });
  }

  if (isAdmin && text === '⬅️ Назад') return bot.sendMessage(chatId, 'Главное меню:', { reply_markup: mainKeyboard(true) });

  if (isAdmin && text === '🚫 Бан/Разбан') {
    return bot.sendMessage(chatId,
      'Отправьте команду:\n/ban @username\n/unban @username',
      { reply_markup: adminKeyboard() }
    );
  }
});

// ===== Inline server info =====
bot.on('callback_query', async q => {
  const chatId = q.message.chat.id;
  const data = q.data;
  addUser(q);

  if (data === 'back_servers') {
    const inline = servers.map((s,i) => ([{ text: s.name, callback_data: `srv_${i}` }]));
    return bot.editMessageText('Выберите сервер:', { chat_id: chatId, message_id: q.message.message_id, reply_markup: { inline_keyboard: inline } });
  }

  if (!data.startsWith('srv_')) return;

  const id = Number(data.split('_')[1]);
  const server = servers[id];
  const info = await queryServer(server);

  let text =
    `🎮 <b>${esc(info.name)}</b>\n` +
    `🗺 Карта: ${esc(info.map)}\n` +
    `👥 Онлайн: ${info.players.length}/${info.max}\n` +
    `✅ Статус: ${info.online ? 'ONLINE' : 'OFFLINE'}\n\n` +
    `<b>Игроки:</b>\n`;

  if (!info.players.length) text += '— пусто —';
  else info.players.forEach((p,i) => { text += `${i+1}. ${esc(p.name)} | ${p.score} | ${p.time} мин\n`; });

  bot.editMessageText(text, {
    chat_id,
    message_id: q.message.message_id,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔄 Обновить', callback_data: `srv_${id}` }],
        [{ text: '⬅️ Назад к серверам', callback_data: 'back_servers' }]
      ]
    }
  });
});
