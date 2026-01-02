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

// ===== Пользовательские серверы =====
const userServersFile = path.join(__dirname, 'userServers.json');
let userServers = [];
if (fs.existsSync(userServersFile)) userServers = JSON.parse(fs.readFileSync(userServersFile, 'utf-8'));
function saveUserServers() {
  fs.writeFileSync(userServersFile, JSON.stringify(userServers, null, 2));
}

// ===== Пользователи =====
const usersFile = path.join(__dirname, 'users.json');
let users = [];
if (fs.existsSync(usersFile)) users = JSON.parse(fs.readFileSync(usersFile, 'utf-8'));
function saveUsers() {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

// ===== Utils =====
const esc = t => t ? t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '';

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
function mainKeyboard(isAdmin) {
  const rows = [
    ['🎮 Сервера', '➕ Добавить сервер'],
    ['ℹ️ О боте', '📤 Поделиться ботом']
  ];
  if (isAdmin) rows.push(['🛠 Админ']);
  return { keyboard: rows, resize_keyboard: true };
}

// ===== MESSAGE HANDLER =====
bot.on('message', async msg => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from.id;
  const isAdmin = admins.includes(userId);

  // Сохраняем пользователя при первом сообщении
  if (!users.includes(userId)) {
    users.push(userId);
    saveUsers();
  }

  if (text === '/start' || text === '▶️ Старт') {
    return bot.sendMessage(chatId, 'Добро пожаловать 👋\nГлавное меню:', { reply_markup: mainKeyboard(isAdmin) });
  }

  // ===== СЕРВЕРА =====
  if (text === '🎮 Сервера') {
    const allServers = [...servers, ...userServers];
    const inline = allServers.map((s, i) => {
      const row = [{ text: s.name, callback_data: `srv_${i}` }];
      // если это пользовательский сервер — добавляем кнопку удалить
      if (userServers.includes(s)) row.push({ text: '❌ Удалить', callback_data: `deluser_srv_${i}` });
      return row;
    });
    return bot.sendMessage(chatId, 'Выберите сервер:', { reply_markup: { inline_keyboard: inline } });
  }

  // ===== ДОБАВИТЬ СЕРВЕР =====
  if (text === '➕ Добавить сервер') {
    bot.sendMessage(chatId, 'Введите адрес сервера в формате IP:PORT:');
    bot.once('message', msg => {
      const [host, port] = msg.text.split(':');
      if (!host || !port || isNaN(port)) return bot.sendMessage(chatId, '❌ Неверный формат. Используйте IP:PORT');
      const serverName = `${host}:${port}`;
      userServers.push({ host, port: Number(port), name: serverName });
      saveUserServers();
      bot.sendMessage(chatId, `✅ Сервер "${serverName}" добавлен!`);
    });
  }

  // ===== О БОТЕ =====
  if (text === 'ℹ️ О боте') {
    return bot.sendMessage(chatId,
      '🤖 CS 1.6 Bot\n\nПоказывает:\n• имя сервера\n• карту\n• онлайн\n• список игроков\n\nРаботает 24/7 бесплатно',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Написать разработчику', url: 'https://t.me/leva_sdd' }]
          ]
        }
      }
    );
  }

  // ===== ПОДЕЛИТЬСЯ БОТОМ =====
  if (text === '📤 Поделиться ботом') {
    return bot.sendPhoto(chatId, 'https://i.postimg.cc/ZRj839L0/images.jpg', {
      caption: '📎 Поделись ботом с друзьями: @spiritOnline_BOT'
    });
  }

  // ===== АДМИНКА =====
  if (text === '🛠 Админ' && isAdmin) {
    const inline = [
      [{ text: '📊 Статистика бота', callback_data: 'admin_stats' }],
      [{ text: '👤 Пользователи (ссылки на профили)', callback_data: 'admin_users_links' }],
      [{ text: '🗑️ Пользовательские серверы', callback_data: 'admin_user_servers' }],
      [{ text: '➕ Добавить сервер глобально', callback_data: 'admin_add_server' }],
      [{ text: '🗑️ Очистить все пользовательские серверы', callback_data: 'admin_clear_user_servers' }]
    ];
    return bot.sendMessage(chatId, '🛠 Админ-панель:', { reply_markup: { inline_keyboard: inline } });
  }
});

// ===== INLINE CALLBACKS =====
bot.on('callback_query', async q => {
  const chatId = q.message.chat.id;
  const data = q.data;
  const isAdmin = admins.includes(q.from.id);

  const allServers = [...servers, ...userServers];

  // ===== СЕРВЕРЫ =====
  if (data.startsWith('srv_')) {
    const id = Number(data.split('_')[1]);
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
        text += `${i + 1}. ${esc(p.name)} | ${p.score} | ${p.time} мин\n`;
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

  // ===== УДАЛЕНИЕ СЕРВЕРОВ ПОЛЬЗОВАТЕЛЕМ =====
  if (data.startsWith('deluser_srv_')) {
    const id = Number(data.split('_')[2]);
    const server = userServers[id];
    userServers.splice(id, 1);
    saveUserServers();
    return bot.editMessageText(`✅ Ваш сервер "${server.name}" удален`, { chat_id: chatId, message_id: q.message.message_id });
  }

  if (data === 'back_servers') {
    const inline = allServers.map((s, i) => {
      const row = [{ text: s.name, callback_data: `srv_${i}` }];
      if (userServers.includes(s)) row.push({ text: '❌ Удалить', callback_data: `deluser_srv_${i}` });
      return row;
    });
    return bot.editMessageText('Выберите сервер:', { chat_id: chatId, message_id: q.message.message_id, reply_markup: { inline_keyboard: inline } });
  }

  if (!isAdmin) return;

  // ===== АДМИН: статистика =====
  if (data === 'admin_stats') {
    const text = `📊 Статистика бота:\n\n👥 Пользователей: ${users.length}\n🎮 Всего серверов: ${servers.length + userServers.length}`;
    return bot.editMessageText(text, { chat_id: chatId, message_id: q.message.message_id });
  }

  // ===== АДМИН: ссылки на пользователей =====
  if (data === 'admin_users_links') {
    if (!users.length) return bot.sendMessage(chatId, '❌ Пользователей нет');
    const inline = users.map(uid => [{ text: `Пользователь ${uid}`, url: `tg://user?id=${uid}` }]);
    return bot.sendMessage(chatId, 'Ссылки на Telegram-профили пользователей:', { reply_markup: { inline_keyboard: inline } });
  }

  // ===== АДМИН: управление пользовательскими серверами =====
  if (data === 'admin_user_servers') {
    if (!userServers.length) return bot.sendMessage(chatId, '❌ Пользовательских серверов нет');
    const inline = userServers.map((s, i) => [{ text: s.name, callback_data: `del_srv_${i}` }]);
    return bot.sendMessage(chatId, 'Выберите сервер для удаления:', { reply_markup: { inline_keyboard: inline } });
  }

  if (data.startsWith('del_srv_')) {
    const id = Number(data.split('_')[2]);
    const server = userServers[id];
    userServers.splice(id, 1);
    saveUserServers();
    return bot.editMessageText(`✅ Сервер "${server.name}" удален`, { chat_id: chatId, message_id: q.message.message_id });
  }

  // ===== АДМИН: добавить сервер глобально =====
  if (data === 'admin_add_server') {
    bot.sendMessage(chatId, 'Введите IP:PORT нового сервера для всех пользователей:');
    bot.once('message', msg => {
      const [host, port] = msg.text.split(':');
      if (!host || !port || isNaN(port)) return bot.sendMessage(chatId, '❌ Неверный формат. Используйте IP:PORT');
      const serverName = `${host}:${port}`;
      userServers.push({ host, port: Number(port), name: serverName });
      saveUserServers();
      bot.sendMessage(chatId, `✅ Сервер "${serverName}" добавлен глобально!`);
    });
  }

  // ===== АДМИН: очистить все пользовательские серверы =====
  if (data === 'admin_clear_user_servers') {
    userServers = [];
    saveUserServers();
    return bot.editMessageText('✅ Все пользовательские серверы удалены', { chat_id: chatId, message_id: q.message.message_id });
  }
});
