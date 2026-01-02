require('dotenv').config(); // dotenv для BOT_TOKEN

const TelegramBot = require('node-telegram-bot-api');
const Gamedig = require('gamedig');
const config = require('./config');

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) throw new Error('BOT_TOKEN не задан');

const bot = new TelegramBot(TOKEN, { polling: true });
console.log('🤖 Бот запущен');

const servers = config.servers;
const admins = config.admins;

// ===== Хранилище пользователей =====
let users = new Set();

// ===== utils =====
const esc = t =>
  t ? t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '';

async function queryServer(server) {
  try {
    const s = await Gamedig.query({
      type: 'cs16',
      host: server.host,
      port: server.port
    });

    return {
      online: true,
      name: server.name || s.name,
      map: s.map,
      max: s.maxplayers,
      players: s.players.map(p => ({
        name: p.name || 'Unknown',
        score: p.score ?? 0,
        time: Math.floor((p.time || 0) / 60)
      }))
    };
  } catch {
    return { online: false, name: server.name };
  }
}

// ===== REPLY KEYBOARDS =====
const startKeyboard = { keyboard: [[{ text: '▶️ Старт' }]], resize_keyboard: true, one_time_keyboard: true };

function mainKeyboard(isAdmin) {
  const rows = [
    ['🎮 Сервера', '➕ Добавить сервер'],
    ['ℹ️ О боте']
  ];
  if (isAdmin) rows.push(['🛠 Админ']);
  return { keyboard: rows, resize_keyboard: true };
}

function adminKeyboard() {
  return {
    keyboard: [
      ['📊 Статистика', '👥 Пользователи'],
      ['⬅️ Назад']
    ],
    resize_keyboard: true
  };
}

// ===== /start =====
bot.onText(/\/start/, msg => {
  bot.sendMessage(msg.chat.id, 'Добро пожаловать 👋', {
    reply_markup: startKeyboard
  });
});

// ===== MESSAGE HANDLER (REPLY BUTTONS) =====
bot.on('message', async msg => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const isAdmin = admins.includes(msg.from.id);

  // Добавляем пользователя в хранилище
  users.add(msg.from.id);

  if (text === '▶️ Старт') {
    return bot.sendMessage(chatId, 'Главное меню:', {
      reply_markup: mainKeyboard(isAdmin)
    });
  }

  if (text === 'ℹ️ О боте') {
    return bot.sendMessage(
      chatId,
      '🤖 CS 1.6 Bot\n\nПоказывает:\n• имя сервера\n• карту\n• онлайн\n• список игроков\n\nРаботает 24/7 бесплатно',
      { reply_markup: mainKeyboard(isAdmin) }
    );
  }

  if (text === '🎮 Сервера') {
    if (!servers.length) {
      return bot.sendMessage(chatId, 'Серверов пока нет', {
        reply_markup: mainKeyboard(isAdmin)
      });
    }

    const inline = servers.map((s, i) => ([
      { text: `${s.name}`, callback_data: `srv_${i}` }
    ]));

    return bot.sendMessage(chatId, 'Выберите сервер:', {
      reply_markup: { inline_keyboard: inline }
    });
  }

  if (text === '➕ Добавить сервер') {
    bot.sendMessage(chatId, 'Введите IP:PORT:Name (например 127.0.0.1:27015:Мой сервер)');
    bot.once('message', msg2 => {
      const [host, port, name] = msg2.text.split(':');
      if (!host || !port) {
        return bot.sendMessage(chatId, '❌ Неверный формат', {
          reply_markup: mainKeyboard(isAdmin)
        });
      }
      servers.push({ host, port: Number(port), name: name || `Сервер ${servers.length+1}` });
      bot.sendMessage(chatId, '✅ Сервер добавлен', {
        reply_markup: mainKeyboard(isAdmin)
      });
    });
  }

  // Админ-панель
  if (text === '🛠 Админ' && isAdmin) {
    return bot.sendMessage(chatId, 'Админ-панель:', { reply_markup: adminKeyboard() });
  }

  if (isAdmin && text === '📊 Статистика') {
    return bot.sendMessage(chatId,
      `📊 Статистика бота:\n` +
      `• Серверов: ${servers.length}\n` +
      `• Пользователей: ${users.size}\n`,
      { reply_markup: adminKeyboard() }
    );
  }

  if (isAdmin && text === '👥 Пользователи') {
    return bot.sendMessage(chatId, `👥 Пользователи: ${users.size}`, {
      reply_markup: adminKeyboard()
    });
  }

  if (isAdmin && text === '⬅️ Назад') {
    return bot.sendMessage(chatId, 'Главное меню:', { reply_markup: mainKeyboard(true) });
  }
});

// ===== INLINE CALLBACKS =====
bot.on('callback_query', async q => {
  const chatId = q.message.chat.id;
  const data = q.data;

  if (data === 'back_servers') {
    const inline = servers.map((s, i) => ([
      { text: s.name, callback_data: `srv_${i}` }
    ]));
    return bot.editMessageText('Выберите сервер:', {
      chat_id: chatId,
      message_id: q.message.message_id,
      reply_markup: { inline_keyboard: inline }
    });
  }

  if (!data.startsWith('srv_')) return;

  const id = Number(data.split('_')[1]);
  const server = servers[id];
  const info = await queryServer(server);

  if (!info.online) {
    return bot.editMessageText(`❌ Сервер OFFLINE: ${server.name}`, {
      chat_id: chatId,
      message_id: q.message.message_id,
      reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад к серверам', callback_data: 'back_servers' }]] }
    });
  }

  let text =
    `🎮 <b>${esc(info.name)}</b>\n` +
    `🗺 Карта: ${esc(info.map)}\n` +
    `👥 Онлайн: ${info.players.length}/${info.max}\n\n` +
    `<b>Игроки:</b>\n`;

  if (!info.players.length) {
    text += '— пусто —';
  } else {
    info.players.forEach((p, i) => {
      text += `${i + 1}. ${esc(p.name)} | ${p.score} | ${p.time} мин\n`;
    });
  }

  bot.editMessageText(text, {
    chat_id: chatId,
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
