const TelegramBot = require('node-telegram-bot-api');
const Gamedig = require('gamedig');
const fs = require('fs');
const path = require('path');
const config = require('./config');

if (!config.token) throw new Error('BOT_TOKEN не задан');

const bot = new TelegramBot(config.token, { polling: true });
console.log('🤖 Бот запущен');

const servers = config.servers; // три сервера по умолчанию
const admins = config.admins;

// ===== БАНЫ =====
const bansFile = path.join(__dirname, 'bans.json');
let bans = [];
if (fs.existsSync(bansFile)) bans = JSON.parse(fs.readFileSync(bansFile, 'utf-8'));
function saveBans() {
  fs.writeFileSync(bansFile, JSON.stringify(bans, null, 2));
}

// ===== Utils =====
const esc = t =>
  t ? t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '';

async function queryServer(server) {
  try {
    const s = await Gamedig.query({ type: 'cs16', host: server.host, port: server.port });
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

// ===== Keyboards =====
const startKeyboard = { keyboard: [[{ text: '▶️ Старт' }]], resize_keyboard: true, one_time_keyboard: true };

function mainKeyboard(isAdmin) {
  const rows = [
    ['🎮 Сервера'],
    ['ℹ️ О боте', '📤 Поделиться ботом']
  ];
  if (isAdmin) rows.push(['🛠 Админ']);
  return { keyboard: rows, resize_keyboard: true };
}

// ===== /start =====
bot.onText(/\/start/, msg => {
  bot.sendMessage(msg.chat.id, 'Добро пожаловать 👋', { reply_markup: startKeyboard });
});

// ===== MESSAGE HANDLER =====
bot.on('message', async msg => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const isAdmin = admins.includes(msg.from.id);

  // Стартовое меню
  if (text === '▶️ Старт') {
    return bot.sendMessage(chatId, 'Главное меню:', { reply_markup: mainKeyboard(isAdmin) });
  }

  // 🎮 Сервера
  if (text === '🎮 Сервера') {
    const inline = servers.map((s, i) => [{ text: s.name, callback_data: `srv_${i}` }]);
    return bot.sendMessage(chatId, 'Выберите сервер:', { reply_markup: { inline_keyboard: inline } });
  }

  // ℹ️ О боте
  if (text === 'ℹ️ О боте') {
    return bot.sendMessage(chatId,
      '🤖 CS 1.6 Bot\n\nПоказывает:\n• имя сервера\n• карту\n• онлайн\n• список игроков\n\nРаботает 24/7 бесплатно',
      { reply_markup: mainKeyboard(isAdmin) }
    );
  }

  // 📤 Поделиться ботом
  if (text === '📤 Поделиться ботом') {
    return bot.sendMessage(chatId, '📎 Поделись ботом с друзьями: t.me/ТВОЙ_БОТ_ЮЗЕРНЕЙМ', { reply_markup: mainKeyboard(isAdmin) });
  }

  // 🛠 Админ
  if (text === '🛠 Админ' && isAdmin) {
    const inline = [
      [{ text: '📊 Статистика серверов', callback_data: 'admin_stats' }],
      [{ text: '🚫 Бан игрока', callback_data: 'admin_ban' }],
      [{ text: '✅ Разбан игрока', callback_data: 'admin_unban' }]
    ];
    return bot.sendMessage(chatId, '🛠 Админ-панель:', { reply_markup: { inline_keyboard: inline } });
  }
});

// ===== INLINE CALLBACKS =====
bot.on('callback_query', async q => {
  const chatId = q.message.chat.id;
  const data = q.data;
  const isAdmin = admins.includes(q.from.id);

  // --- Серверы ---
  if (data.startsWith('srv_')) {
    const id = Number(data.split('_')[1]);
    const server = servers[id];
    const info = await queryServer(server);

    if (!info.online) {
      return bot.editMessageText('❌ Сервер OFFLINE', {
        chat_id: chatId,
        message_id: q.message.message_id,
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'back_servers' }]] }
      });
    }

    let text = `🎮 <b>${esc(server.name)}</b>\n🗺 Карта: ${esc(info.map)}\n👥 Онлайн: ${info.players.length}/${info.max}\n\n<b>Игроки:</b>\n`;
    if (!info.players.length) text += '— пусто —';
    else {
      info.players.forEach((p, i) => {
        const banned = bans.includes(p.name) ? ' 🚫' : '';
        text += `${i + 1}. ${esc(p.name)} | ${p.score} | ${p.time} мин${banned}\n`;
      });
    }

    return bot.editMessageText(text, {
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
  }

  // --- Назад к списку серверов ---
  if (data === 'back_servers') {
    const inline = servers.map((s, i) => [{ text: s.name, callback_data: `srv_${i}` }]);
    return bot.editMessageText('Выберите сервер:', { chat_id: chatId, message_id: q.message.message_id, reply_markup: { inline_keyboard: inline } });
  }

  // --- Админ ---
  if (!isAdmin) return;

  // Статистика серверов
  if (data === 'admin_stats') {
    let text = '📊 Статистика серверов:\n\n';
    for (let s of servers) {
      const info = await queryServer(s);
      const online = info.online ? '✅ Online' : '❌ Offline';
      const players = info.players ? info.players.length : 0;
      text += `${s.name}: ${online} | Игроков: ${players}\n`;
    }
    return bot.editMessageText(text, { chat_id: chatId, message_id: q.message.message_id });
  }

  // Бан игрока
  if (data === 'admin_ban') {
    bot.sendMessage(chatId, 'Введите ник игрока для бана:');
    bot.once('message', msg => {
      const name = msg.text.trim();
      if (!bans.includes(name)) {
        bans.push(name);
        saveBans();
        bot.sendMessage(chatId, `✅ Игрок "${name}" забанен`);
      } else bot.sendMessage(chatId, `❌ Игрок "${name}" уже в бане`);
    });
  }

  // Разбан игрока
  if (data === 'admin_unban') {
    bot.sendMessage(chatId, 'Введите ник игрока для разбана:');
    bot.once('message', msg => {
      const name = msg.text.trim();
      if (bans.includes(name)) {
        bans = bans.filter(n => n !== name);
        saveBans();
        bot.sendMessage(chatId, `✅ Игрок "${name}" разбанен`);
      } else bot.sendMessage(chatId, `❌ Игрок "${name}" не в бане`);
    });
  }
});
