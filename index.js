const TelegramBot = require('node-telegram-bot-api');
const Gamedig = require('gamedig');
const config = require('./config');

if (!config.token) throw new Error('BOT_TOKEN не задан');

const bot = new TelegramBot(config.token, { polling: true });
console.log('🤖 Бот запущен');

let servers = config.servers;

// ===== UTILS =====
const esc = t => t ? t.replace(/&/g,'&amp;').replace(/</g,'&lt;') : '';

// ===== KEYBOARDS =====
const startKeyboard = {
  keyboard: [[{ text: '▶️ СТАРТ' }]],
  resize_keyboard: true,
  one_time_keyboard: true
};

const mainKeyboard = {
  keyboard: [
    ['🎮 Сервера', '➕ Добавить сервер'],
    ['ℹ️ О боте']
  ],
  resize_keyboard: true
};

// ===== SERVER QUERY =====
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

// ===== START =====
bot.onText(/\/start/, msg => {
  bot.sendMessage(msg.chat.id, 'Добро пожаловать 👋', {
    reply_markup: startKeyboard
  });
});

// ===== TEXT BUTTONS =====
bot.on('message', async msg => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === '▶️ СТАРТ') {
    return bot.sendMessage(chatId, 'Главное меню:', {
      reply_markup: mainKeyboard
    });
  }

  if (text === 'ℹ️ О боте') {
    return bot.sendMessage(
      chatId,
      '🤖 CS 1.6 Bot\n\nПоказывает:\n• онлайн\n• карту\n• игроков\n\nРаботает 24/7 бесплатно',
      { reply_markup: mainKeyboard }
    );
  }

  if (text === '🎮 Сервера') {
    if (!servers.length) {
      return bot.sendMessage(chatId, 'Серверов пока нет', {
        reply_markup: mainKeyboard
      });
    }

    const kb = servers.map((s, i) => [
      { text: `${s.host}:${s.port}`, callback_data: `srv_${i}` }
    ]);

    return bot.sendMessage(chatId, 'Выберите сервер:', {
      reply_markup: { inline_keyboard: kb }
    });
  }

  if (text === '➕ Добавить сервер') {
    bot.sendMessage(chatId, 'Введите IP:PORT');
    bot.once('message', msg => {
      const [host, port] = msg.text.split(':');
      if (!host || !port) {
        return bot.sendMessage(chatId, '❌ Неверный формат', {
          reply_markup: mainKeyboard
        });
      }
      servers.push({ host, port: Number(port) });
      bot.sendMessage(chatId, '✅ Сервер добавлен', {
        reply_markup: mainKeyboard
      });
    });
  }
});

// ===== INLINE =====
bot.on('callback_query', async q => {
  const chatId = q.message.chat.id;
  const data = q.data;

  if (data.startsWith('srv_')) {
    const id = Number(data.split('_')[1]);
    const server = servers[id];
    const info = await queryServer(server);

    if (!info.online) {
      return bot.editMessageText('❌ Сервер OFFLINE', {
        chat_id: chatId,
        message_id: q.message.message_id,
        reply_markup: {
          inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'back' }]]
        }
      });
    }

    let text =
      `🎮 <b>${esc(info.name)}</b>\n` +
      `🗺 Карта: ${esc(info.map)}\n` +
      `👥 Онлайн: ${info.players.length}/${info.max}\n\n` +
      `<b>Игроки:</b>\n`;

    info.players.forEach((p, i) => {
      text += `${i+1}. ${esc(p.name)} | ${p.score} | ${p.time} мин\n`;
    });

    return bot.editMessageText(text, {
      chat_id: chatId,
      message_id: q.message.message_id,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Обновить', callback_data: `srv_${id}` }],
          [{ text: '⬅️ Назад', callback_data: 'back' }]
        ]
      }
    });
  }

  if (data === 'back') {
    bot.deleteMessage(chatId, q.message.message_id);
  }
});
