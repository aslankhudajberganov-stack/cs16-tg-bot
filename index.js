const TelegramBot = require('node-telegram-bot-api');
const Gamedig = require('gamedig');
const config = require('./config');

if (!config.token) {
  throw new Error('BOT_TOKEN не задан');
}

const bot = new TelegramBot(config.token, { polling: true });
console.log('🤖 Бот запущен');

let servers = config.servers;

// ===== utils =====
const esc = t => t ? t.replace(/&/g,'&amp;').replace(/</g,'&lt;') : '';

async function getServer(server) {
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

// ===== MENUS =====
function startMenu() {
  return {
    inline_keyboard: [[{ text: '▶️ СТАРТ', callback_data: 'start_menu' }]]
  };
}

function mainMenu() {
  return {
    inline_keyboard: [
      [{ text: '🎮 Сервера', callback_data: 'servers' }],
      [{ text: '➕ Добавить сервер', callback_data: 'add_server' }],
      [{ text: 'ℹ️ О боте', callback_data: 'about' }]
    ]
  };
}

// ===== /start =====
bot.onText(/\/start/, msg => {
  bot.sendMessage(msg.chat.id, 'Добро пожаловать 👋', {
    reply_markup: startMenu()
  });
});

// ===== CALLBACKS =====
bot.on('callback_query', async q => {
  const chatId = q.message.chat.id;
  const data = q.data;

  // START
  if (data === 'start_menu') {
    return bot.editMessageText('Главное меню:', {
      chat_id: chatId,
      message_id: q.message.message_id,
      reply_markup: mainMenu()
    });
  }

  // ABOUT
  if (data === 'about') {
    return bot.editMessageText(
      '🤖 CS 1.6 Bot\n\n' +
      'Показывает информацию о серверах:\n' +
      '• онлайн\n• карта\n• игроки\n\n' +
      'Работает 24/7 бесплатно',
      {
        chat_id: chatId,
        message_id: q.message.message_id,
        reply_markup: mainMenu()
      }
    );
  }

  // SERVERS LIST
  if (data === 'servers') {
    if (!servers.length) {
      return bot.editMessageText('Серверов нет.', {
        chat_id: chatId,
        message_id: q.message.message_id,
        reply_markup: mainMenu()
      });
    }

    const kb = servers.map((s, i) => [
      { text: `${s.host}:${s.port}`, callback_data: `srv_${i}` }
    ]);
    kb.push([{ text: '⬅️ Назад', callback_data: 'start_menu' }]);

    return bot.editMessageText('Выберите сервер:', {
      chat_id: chatId,
      message_id: q.message.message_id,
      reply_markup: { inline_keyboard: kb }
    });
  }

  // SERVER INFO
  if (data.startsWith('srv_')) {
    const id = Number(data.split('_')[1]);
    const server = servers[id];
    const info = await getServer(server);

    if (!info.online) {
      return bot.editMessageText('❌ Сервер OFFLINE', {
        chat_id: chatId,
        message_id: q.message.message_id,
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Назад', callback_data: 'servers' }]
          ]
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
          [{ text: '⬅️ Назад', callback_data: 'servers' }]
        ]
      }
    });
  }

  // ADD SERVER
  if (data === 'add_server') {
    bot.sendMessage(chatId, 'Введите IP:PORT');
    bot.once('message', msg => {
      const [host, port] = msg.text.split(':');
      if (!host || !port) return bot.sendMessage(chatId, 'Неверный формат');
      servers.push({ host, port: Number(port) });
      bot.sendMessage(chatId, '✅ Сервер добавлен', {
        reply_markup: mainMenu()
      });
    });
  }
});
