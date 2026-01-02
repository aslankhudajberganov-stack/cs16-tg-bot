const TelegramBot = require('node-telegram-bot-api');
const Gamedig = require('gamedig');
const config = require('./config');

if (!config.token) throw new Error('BOT_TOKEN не задан');

const bot = new TelegramBot(config.token, { polling: true });
console.log('🤖 Бот запущен');

const servers = config.servers;
const admins = config.admins;

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
      name: s.name,
      map: s.map,
      max: s.maxplayers,
      players: s.players.map(p => ({
        name: p.name || 'Unknown',
        score: p.score ?? 0,
        time: Math.floor((p.time || 0) / 60)
      }))
    };
  } catch {
    return { online: false };
  }
}

// ===== REPLY KEYBOARDS =====
const startKeyboard = {
  keyboard: [[{ text: '▶️ Старт' }]],
  resize_keyboard: true,
  one_time_keyboard: true
};

function mainKeyboard(isAdmin) {
  const rows = [
    ['🎮 Сервера', '➕ Добавить сервер'],
    ['ℹ️ О боте']
  ];
  if (isAdmin) rows.push(['🛠 Админ']);
  return { keyboard: rows, resize_keyboard: true };
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

  if (text === '▶️ Старт') {
    return bot.sendMessage(chatId, 'Главное меню:', {
      reply_markup: mainKeyboard(isAdmin)
    });
  }

  if (text === 'ℹ️ О боте') {
    return bot.sendMessage(
      chatId,
      '🤖 CS 1.6 Bot\n\n' +
      'Показывает:\n' +
      '• имя сервера\n• карту\n• онлайн\n• список игроков\n\n' +
      'Работает 24/7 бесплатно',
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
      { text: `${s.host}:${s.port}`, callback_data: `srv_${i}` }
    ]));

    return bot.sendMessage(chatId, 'Выберите сервер:', {
      reply_markup: { inline_keyboard: inline }
    });
  }

  if (text === '➕ Добавить сервер') {
    bot.sendMessage(chatId, 'Введите IP:PORT');
    bot.once('message', msg2 => {
      const [host, port] = msg2.text.split(':');
      if (!host || !port) {
        return bot.sendMessage(chatId, '❌ Неверный формат', {
          reply_markup: mainKeyboard(isAdmin)
        });
      }
      servers.push({ host, port: Number(port) });
      bot.sendMessage(chatId, '✅ Сервер добавлен', {
        reply_markup: mainKeyboard(isAdmin)
      });
    });
  }

  if (text === '🛠 Админ' && isAdmin) {
    return bot.sendMessage(
      chatId,
      `🛠 Админ панель\n\nСерверов: ${servers.length}`,
      { reply_markup: mainKeyboard(true) }
    );
  }
});

// ===== INLINE CALLBACKS =====
bot.on('callback_query', async q => {
  const chatId = q.message.chat.id;
  const data = q.data;

  if (!data.startsWith('srv_')) return;

  const id = Number(data.split('_')[1]);
  const server = servers[id];
  const info = await queryServer(server);

  if (!info.online) {
    return bot.editMessageText('❌ Сервер OFFLINE', {
      chat_id: chatId,
      message_id: q.message.message_id,
      reply_markup: {
        inline_keyboard: [
          [{ text: '⬅️ Назад', callback_data: 'back_servers' }]
        ]
      }
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

// back to server list
bot.on('callback_query', q => {
  if (q.data !== 'back_servers') return;
  const chatId = q.message.chat.id;

  const inline = servers.map((s, i) => ([
    { text: `${s.host}:${s.port}`, callback_data: `srv_${i}` }
  ]));

  bot.editMessageText('Выберите сервер:', {
    chat_id: chatId,
    message_id: q.message.message_id,
    reply_markup: { inline_keyboard: inline }
  });
});
