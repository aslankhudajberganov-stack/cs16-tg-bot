const TelegramBot = require('node-telegram-bot-api');
const Gamedig = require('gamedig');
const fs = require('fs');
const path = require('path');
const config = require('./config');

if (!config.token) throw new Error('BOT_TOKEN не задан');

let bot;

// ===== ФАЙЛЫ =====
const userServersFile = path.join(__dirname, 'userServers.json');
let userServers = fs.existsSync(userServersFile) ? JSON.parse(fs.readFileSync(userServersFile, 'utf-8')) : [];
const usersFile = path.join(__dirname, 'users.json');
let users = fs.existsSync(usersFile) ? JSON.parse(fs.readFileSync(usersFile, 'utf-8')) : [];
const hiddenServersFile = path.join(__dirname, 'hiddenServers.json');
let hiddenServers = fs.existsSync(hiddenServersFile) ? JSON.parse(fs.readFileSync(hiddenServersFile, 'utf-8')) : {};

function saveUserServers() { fs.writeFileSync(userServersFile, JSON.stringify(userServers, null, 2)); }
function saveUsers() { fs.writeFileSync(usersFile, JSON.stringify(users, null, 2)); }
function saveHiddenServers() { fs.writeFileSync(hiddenServersFile, JSON.stringify(hiddenServers, null, 2)); }

// ===== UTILS =====
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
  } catch (e) {
    return { online: false, error: e.message };
  }
}

// ===== KEYBOARDS =====
function mainKeyboard(isAdmin) {
  const rows = [
    ['🎮 Сервера', '➕ Добавить сервер'],
    ['ℹ️ О боте', '📤 Поделиться ботом']
  ];
  if (isAdmin) rows.push(['🛠 Админ']);
  return { keyboard: rows, resize_keyboard: true };
}

// ===== ЗАПУСК БОТА С ЗАЩИТОЙ 409 =====
function startBot() {
  if (bot) return; // защита от дублирующего запуска
  bot = new TelegramBot(config.token, { polling: true });

  bot.on('polling_error', err => {
    if (err.code === 'ETELEGRAM' && err.response?.error_code === 409) {
      console.warn('⚠️ Конфликт: другой экземпляр бота уже работает. Перезапуск через 1с...');
      bot.stopPolling();
      bot = null;
      setTimeout(startBot, 1000);
    } else {
      console.error('❌ Ошибка polling:', err);
    }
  });

  console.log('🤖 Бот запущен');

  initBot();
}

// ===== ИНИЦИАЛИЗАЦИЯ БОТА =====
function initBot() {
  bot.on('message', async msg => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const userId = msg.from.id;
    const isAdmin = config.admins.includes(userId);

    if (!users.includes(userId)) { users.push(userId); saveUsers(); }

    if (text === '/start' || text === '▶️ Старт') {
      return bot.sendMessage(chatId, 'Добро пожаловать 👋\nГлавное меню:', { reply_markup: mainKeyboard(isAdmin) });
    }

    // ===== СЕРВЕРА =====
    if (text === '🎮 Сервера') {
      const hidden = hiddenServers[userId] || [];
      const allServers = [...config.servers, ...userServers].filter((s, i) => !hidden.includes(i));
      const inline = allServers.map((s, i) => {
        const row = [{ text: s.name, callback_data: `srv_${i}` }];
        if (userServers.includes(s)) row.push({ text: '❌ Удалить', callback_data: `deluser_srv_${i}` });
        else row.push({ text: '❌ Скрыть', callback_data: `hide_srv_${i}` });
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
        { reply_markup: { inline_keyboard: [[{ text: 'Написать разработчику', url: 'https://t.me/leva_sdd' }]] } }
      );
    }

    // ===== ПОДЕЛИТЬСЯ БОТОМ =====
    if (text === '📤 Поделиться ботом') {
      return bot.sendPhoto(chatId, 'https://i.postimg.cc/ZRj839L0/images.jpg', {
        caption: 'Онлайн мониторинг серверов КС 1.6\n📎 Поделись ботом с друзьями: @spiritOnline_BOT'
      });
    }

    // ===== АДМИНКА =====
    if (text === '🛠 Админ' && isAdmin) {
      const inline = [
        [{ text: '📊 Статистика бота', callback_data: 'admin_stats' }],
        [{ text: '👤 Пользователи (ссылки + удалить)', callback_data: 'admin_users_links' }],
        [{ text: '🗑️ Пользовательские серверы', callback_data: 'admin_user_servers' }],
        [{ text: '➕ Добавить сервер глобально', callback_data: 'admin_add_server' }],
        [{ text: '🗑️ Очистить все пользовательские серверы', callback_data: 'admin_clear_user_servers' }],
        [{ text: '📣 Рассылка пользователям', callback_data: 'admin_broadcast' }]
      ];
      return bot.sendMessage(chatId, '🛠 Админ-панель:', { reply_markup: { inline_keyboard: inline } });
    }
  });

  // ===== INLINE CALLBACKS =====
  bot.on('callback_query', async q => {
    const chatId = q.message.chat.id;
    const messageId = q.message.message_id;
    const data = q.data;
    const userId = q.from.id;
    const isAdmin = config.admins.includes(userId);

    const allServers = [...config.servers, ...userServers];

    // ===== ПРОЧИЕ CALLBACKS =====
    if (!isAdmin) return;

    if (data === 'admin_broadcast') {
      bot.sendMessage(chatId, 'Введите сообщение для рассылки пользователям:');
      bot.once('message', msg => {
        const text = msg.text;
        users.forEach(uid => {
          bot.sendMessage(uid, `📣 Сообщение от администратора:\n\n${text}`).catch(() => {});
        });
        bot.sendMessage(chatId, '✅ Рассылка отправлена всем пользователям');
      });
    }

    // Остальные callback’и можно добавить как было...
  });
}

startBot();
