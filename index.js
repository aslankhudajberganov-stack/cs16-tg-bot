const TelegramBot = require('node-telegram-bot-api');
const Gamedig = require('gamedig');
const fs = require('fs');
const path = require('path');
const config = require('./config');

if (!config.token) throw new Error('BOT_TOKEN не задан');

const bot = new TelegramBot(config.token, { polling: true });
console.log('🤖 Бот запущен');

const servers = config.servers;
const admins = config.admins;

// ===== Пользователи =====
const usersFile = path.join(__dirname, 'users.json');
let users = [];
if (fs.existsSync(usersFile)) users = JSON.parse(fs.readFileSync(usersFile, 'utf-8'));
function saveUsers() {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

// ===== Пользовательские серверы =====
const userServersFile = path.join(__dirname, 'user_servers.json');
let userServers = [];
if (fs.existsSync(userServersFile)) userServers = JSON.parse(fs.readFileSync(userServersFile, 'utf-8'));
function saveUserServers() {
  fs.writeFileSync(userServersFile, JSON.stringify(userServers, null, 2));
}

// ===== Bans =====
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
  const chatId = msg.chat.id;
  if (!users.includes(chatId)) {
    users.push(chatId);
    saveUsers();
  }
  bot.sendMessage(chatId, 'Главное меню:', { reply_markup: mainKeyboard(admins.includes(msg.from.id)) });
});

// ===== MESSAGE HANDLER =====
bot.on('message', async msg => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const isAdmin = admins.includes(msg.from.id);

  if (!users.includes(chatId)) {
    users.push(chatId);
    saveUsers();
  }

  if (text === '▶️ Старт') {
    return bot.sendMessage(chatId, 'Главное меню:', { reply_markup: mainKeyboard(isAdmin) });
  }

  if (text === '🎮 Сервера') {
    const allServers = [...servers, ...userServers.filter(s => s.userId === chatId)];
    const inline = allServers.map((s, i) => [{ text: s.name, callback_data: `srv_${i}` }]);
    return bot.sendMessage(chatId, 'Выберите сервер:', { reply_markup: { inline_keyboard: inline } });
  }

  if (text === 'ℹ️ О боте') {
    return bot.sendPhoto(chatId, 'https://i.postimg.cc/ZRj839L0/images.jpg', {
      caption: '🤖 CS 1.6 Bot\n\nРазработчик: [Leva](https://t.me/leva_sdd)\n\nПоказывает имя сервера, карту, онлайн и список игроков.',
      parse_mode: 'Markdown',
      reply_markup: mainKeyboard(isAdmin)
    });
  }

  if (text === '📤 Поделиться ботом') {
    return bot.sendPhoto(chatId, 'https://i.postimg.cc/ZRj839L0/images.jpg', {
      caption: '📎 Поделись ботом: @spiritOnline_BOT\nОнлайн мониторинг серверов КС 1.6',
      reply_markup: mainKeyboard(isAdmin)
    });
  }

  if (text === '🛠 Админ' && isAdmin) {
    const inline = [
      [{ text: '📊 Статистика бота', callback_data: 'admin_stats' }],
      [{ text: '👤 Пользователи (ссылки + удалить)', callback_data: 'admin_users_links' }],
      [{ text: '🗑️ Пользовательские серверы', callback_data: 'admin_user_servers' }],
      [{ text: '➕ Добавить сервер глобально', callback_data: 'admin_add_server' }],
      [{ text: '🗑️ Очистить все пользовательские серверы', callback_data: 'admin_clear_user_servers' }],
      [{ text: '📢 Рассылка пользователям', callback_data: 'admin_broadcast' }]
    ];
    return bot.sendMessage(chatId, '🛠 Админ-панель:', { reply_markup: { inline_keyboard: inline } });
  }
});

// ===== CALLBACK QUERY =====
bot.on('callback_query', async q => {
  const chatId = q.message.chat.id;
  const data = q.data;
  const isAdmin = admins.includes(q.from.id);

  // Серверы
  if (data.startsWith('srv_')) {
    const id = Number(data.split('_')[1]);
    const allServers = [...servers, ...userServers.filter(s => s.userId === chatId)];
    const server = allServers[id];
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

  if (data === 'back_servers') {
    const allServers = [...servers, ...userServers.filter(s => s.userId === chatId)];
    const inline = allServers.map((s, i) => [{ text: s.name, callback_data: `srv_${i}` }]);
    return bot.editMessageText('Выберите сервер:', { chat_id, message_id: q.message.message_id, reply_markup: { inline_keyboard: inline } });
  }

  if (!isAdmin) return;

  // ===== АДМИН =====
  if (data === 'admin_stats') {
    let text = `📊 Статистика бота:\n\n• Пользователей: ${users.length}\n• Серверов: ${servers.length + userServers.length}`;
    return bot.editMessageText(text, { chat_id, message_id: q.message.message_id });
  }

  if (data === 'admin_users_links') {
    if (!users.length) return bot.sendMessage(chatId, 'Нет пользователей');
    const inline = users.map(u => [{ text: `ID: ${u}`, url: `tg://user?id=${u}` }]);
    return bot.sendMessage(chatId, 'Список пользователей:', { reply_markup: { inline_keyboard: inline } });
  }

  if (data === 'admin_user_servers') {
    if (!userServers.length) return bot.sendMessage(chatId, 'Нет пользовательских серверов');
    const inline = userServers.map((s, i) => [{ text: `${s.name} (ID:${s.userId})`, callback_data: `del_user_srv_${i}` }]);
    return bot.sendMessage(chatId, 'Пользовательские серверы:', { reply_markup: { inline_keyboard: inline } });
  }

  if (data.startsWith('del_user_srv_')) {
    const idx = Number(data.split('_')[3]);
    const removed = userServers.splice(idx, 1);
    saveUserServers();
    return bot.editMessageText('✅ Пользовательский сервер удалён', { chat_id, message_id: q.message.message_id });
  }

  if (data === 'admin_clear_user_servers') {
    userServers = [];
    saveUserServers();
    return bot.editMessageText('✅ Все пользовательские серверы удалены', { chat_id, message_id: q.message.message_id });
  }

  if (data === 'admin_broadcast') {
    bot.sendMessage(chatId, 'Введите сообщение для всех пользователей:');
    bot.once('message', async msg => {
      const textToSend = msg.text;
      let sent = 0;
      for (const uid of users) {
        try {
          await bot.sendMessage(uid, `📢 Сообщение от администратора:\n\n${textToSend}`);
          sent++;
        } catch (e) {
          console.warn(`Не удалось отправить пользователю ${uid}: ${e.message}`);
        }
      }
      bot.sendMessage(chatId, `✅ Сообщение отправлено ${sent}/${users.length} пользователям`);
    });
  }
});
