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

// ===== УТИЛИТЫ =====
const esc = t => t ? t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '';

const serverCache = {}; // { "ip:port": { data, timestamp } }
const CACHE_UPDATE_INTERVAL = 15000; // 15 секунд

// ===== ФУНКЦИИ ДЛЯ СЕРВЕРОВ =====
function getAllServers() {
  return [...config.servers, ...userServers];
}

// Фоновое обновление кэша всех серверов
async function updateServerCache() {
  const servers = getAllServers();
  for (const server of servers) {
    const key = `${server.host}:${server.port}`;
    try {
      const data = await Gamedig.query({
        type: 'cs16',
        host: server.host,
        port: server.port,
        maxAttempts: 2,
        socketTimeout: 2000
      });
      serverCache[key] = { data, timestamp: Date.now() };
    } catch {
      serverCache[key] = { data: { online: false }, timestamp: Date.now() };
    }
  }
}
setInterval(updateServerCache, CACHE_UPDATE_INTERVAL);
updateServerCache(); // стартовое обновление

// ===== КЛАВИАТУРЫ =====
function mainKeyboard(isAdmin) {
  const rows = [
    ['🎮 Сервера', '➕ Добавить сервер'],
    ['ℹ️ О боте', '📤 Поделиться ботом']
  ];
  if (isAdmin) rows.push(['🛠 Админ']);
  return { keyboard: rows, resize_keyboard: true };
}

// ===== ЗАПУСК БОТА С ПЕРЕЗАПУСКОМ =====
function startBot() {
  bot = new TelegramBot(config.token, { polling: true });

  bot.on('polling_error', err => {
    console.error('Polling error:', err?.code, err?.message);
    bot.stopPolling();
    setTimeout(startBot, 3000);
  });

  console.log('🤖 Бот запущен');
  initBot();
}

startBot();

// ===== ФУНКЦИИ БОТА =====
function showServers(chatId, userId) {
  const hidden = hiddenServers[userId] || [];
  const allServers = getAllServers().filter((s, i) => !hidden.includes(i));
  const inline = allServers.map((s, i) => [{ text: s.name, callback_data: `srv_${i}` }]);
  bot.sendMessage(chatId, 'Выберите сервер:', { reply_markup: { inline_keyboard: inline } });
}

function showAdminPanel(chatId) {
  const inline = [
    [{ text: '📊 Статистика бота', callback_data: 'admin_stats' }],
    [{ text: '👤 Пользователи (ссылки + удалить)', callback_data: 'admin_users_links' }],
    [{ text: '🗑️ Пользовательские серверы', callback_data: 'admin_user_servers' }],
    [{ text: '➕ Добавить сервер глобально', callback_data: 'admin_add_server' }],
    [{ text: '🗑️ Очистить все пользовательские серверы', callback_data: 'admin_clear_user_servers' }]
  ];
  bot.sendMessage(chatId, '🛠 Админ-панель:', { reply_markup: { inline_keyboard: inline } });
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

    if (text === '🎮 Сервера') showServers(chatId, userId);

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

    if (text === 'ℹ️ О боте') {
      return bot.sendMessage(chatId,
        '🤖 CS 1.6 Bot\n\nПоказывает:\n• имя сервера\n• карту\n• онлайн\n• список игроков\n\nРаботает 24/7 бесплатно',
        { reply_markup: { inline_keyboard: [[{ text: 'Написать разработчику', url: 'https://t.me/leva_sdd' }]] } }
      );
    }

    if (text === '📤 Поделиться ботом') {
      return bot.sendPhoto(chatId, 'https://i.postimg.cc/ZRj839L0/images.jpg', {
        caption: 'Онлайн мониторинг серверов КС 1.6\n📎 Поделись ботом с друзьями: @spiritOnline_BOT'
      });
    }

    if (text === '🛠 Админ' && isAdmin) showAdminPanel(chatId);
  });

  bot.on('callback_query', async q => {
    const chatId = q.message.chat.id;
    const messageId = q.message.message_id;
    const data = q.data;
    const userId = q.from.id;
    const isAdmin = config.admins.includes(userId);

    const allServers = getAllServers();

    // ===== CALLBACK СЕРВЕРА =====
    if (data.startsWith('srv_')) {
      const id = Number(data.split('_')[1]);
      const server = allServers[id];
      const key = `${server.host}:${server.port}`;

      const info = serverCache[key]?.data || { online: false, error: 'Нет данных' };

      if (!info.online) {
        return bot.editMessageText(`❌ Сервер OFFLINE\nПричина: ${info.error || 'неизвестно'}`, {
          chat_id, message_id,
          reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'back_servers' }]] }
        });
      }

      let text = `🎮 <b>${esc(server.name)}</b>\n🗺 Карта: ${esc(info.map)}\n👥 Онлайн: ${info.players.length}/${info.max}\n\n<b>Игроки:</b>\n`;
      if (!info.players.length) text += '— пусто —';
      else info.players.forEach((p,i)=> text += `${i+1}. ${esc(p.name)} | ${p.score} | ${p.time} мин\n`);

      return bot.editMessageText(text, {
        chat_id, message_id, parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Обновить', callback_data: `srv_${id}` }],
            [{ text: '⬅️ Назад к серверам', callback_data: 'back_servers' }]
          ]
        }
      });
    }

    if (data === 'back_servers') showServers(chatId, userId);

    // ===== АДМИНКА =====
    if (!isAdmin) return;

    handleAdminCallback(q);
  });
}

// ===== АДМИН CALLBACKS =====
function handleAdminCallback(q) {
  const chatId = q.message.chat.id;
  const messageId = q.message.message_id;
  const data = q.data;

  if (data === 'admin_clear_user_servers') {
    userServers = [];
    saveUserServers();
    return bot.editMessageText('✅ Все пользовательские серверы удалены', { chat_id, message_id });
  }

  if (data === 'admin_stats') {
    const text = `📊 Статистика бота:\n\n👥 Пользователей: ${users.length}\n🎮 Всего серверов: ${config.servers.length + userServers.length}`;
    return bot.editMessageText(text, { chat_id, message_id });
  }

  // Тут можно добавить остальные админ команды, если нужно
}
