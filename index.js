const TelegramBot = require('node-telegram-bot-api');
const Gamedig = require('gamedig');
const config = require('./config');

if (!config.token) throw new Error('Установи BOT_TOKEN в переменных окружения');

const bot = new TelegramBot(config.token, { polling: true });
console.log('🤖 Бот запущен');

// ===== ХРАНИЛИЩЕ ДЛЯ КАЖДОГО ЧАТА =====
const chatState = new Map(); // chatId => { servers: [] }

// ===== МЕНЮ ВНИЗУ ЭКРАНА =====
function bottomMenu() {
  return {
    keyboard: [
      ['🎮 Сервера', '➕ Добавить сервер'],
      ['🔄 Обновить всё', 'ℹ️ О боте']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

// ===== ЗАЩИТА ТЕКСТА =====
function clean(text = '') {
  return text
    .toString()
    .replace(/[^\x20-\x7Eа-яА-ЯёЁ]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ===== ПОЛУЧЕНИЕ ДАННЫХ СЕРВЕРА =====
async function fetchServer(server) {
  try {
    const state = await Gamedig.query({
      type: 'cs16',
      host: server.host,
      port: server.port,
      socketTimeout: 3000
    });

    return {
      online: true,
      name: clean(state.name),
      map: clean(state.map),
      max: state.maxplayers,
      players: (state.players || []).map(p => ({
        name: clean(p.name || 'Unknown'),
        kills: p.score || 0,
        time: Math.floor((p.time || 0) / 60)
      }))
    };
  } catch {
    return { online: false };
  }
}

// ===== ФОРМАТ СООБЩЕНИЯ =====
function formatServer(info, server, top10 = false) {
  if (!info.online) {
    return `🔴 <b>${server.host}:${server.port}</b>\nСервер недоступен`;
  }

  let playersList = info.players;

  if (top10) {
    playersList = playersList.sort((a, b) => b.kills - a.kills).slice(0, 10);
  }

  let text = top10
    ? `🏆 <b>Топ ${playersList.length} игроков на ${info.name}</b>\n`
    : `🟢 <b>${info.name}</b>\n`;

  text += `🗺 Карта: <b>${info.map}</b>\n`;
  text += `👥 Игроки: <b>${info.players.length}/${info.max}</b>\n\n`;
  text += `<b>Список игроков (Имя | КД | Время)</b>\n`;

  playersList.forEach((p, i) => {
    text += `${i + 1}. ${p.name} | ${p.kills} | ${p.time}м\n`;
  });

  return text;
}

// ===== INLINE КНОПКИ ПОД СЕРВЕРОМ =====
function serverButtons(index) {
  return {
    inline_keyboard: [
      [
        { text: '🔄 Обновить', callback_data: `refresh_${index}` },
        { text: '🏆 Топ 10', callback_data: `top10_${index}` },
        { text: '🔙 Все игроки', callback_data: `all_${index}` }
      ]
    ]
  };
}

// ===== ПОКАЗ ОДНОГО СЕРВЕРА =====
async function showServer(chatId, index, top10 = false) {
  const state = chatState.get(chatId);
  const server = state.servers[index];
  if (!server) return;

  const info = await fetchServer(server);

  bot.sendMessage(
    chatId,
    formatServer(info, server, top10),
    {
      parse_mode: 'HTML',
      reply_markup: serverButtons(index)
    }
  );
}

// ===== /start =====
bot.onText(/\/start/, msg => {
  chatState.set(msg.chat.id, { servers: [...config.serverList] });

  bot.sendMessage(
    msg.chat.id,
    '🎮 CS 1.6 Server Bot\nВыбери действие:',
    { reply_markup: bottomMenu() }
  );
});

// ===== МЕНЮ КНОПКИ =====
bot.on('message', async msg => {
  const chatId = msg.chat.id;
  if (!chatState.has(chatId)) chatState.set(chatId, { servers: [] });
  const state = chatState.get(chatId);

  // ===== СЕРВЕРА =====
  if (msg.text === '🎮 Сервера') {
    if (!state.servers.length) {
      bot.sendMessage(chatId, 'Серверов нет. Добавь сервер.');
      return;
    }

    // Создаем кнопки для каждого сервера
    const buttons = state.servers.map((s, i) => [
      { text: `${s.host}:${s.port}`, callback_data: `show_${i}` }
    ]);

    bot.sendMessage(chatId, 'Выбери сервер:', {
      reply_markup: { inline_keyboard: buttons }
    });
  }

  // ===== ДОБАВИТЬ СЕРВЕР =====
  if (msg.text === '➕ Добавить сервер') {
    bot.sendMessage(chatId, 'Отправь IP:PORT (пример 46.174.55.32:27015)');
    bot.once('message', m => {
      const [host, port] = m.text.split(':');
      if (!host || !port || isNaN(port)) {
        bot.sendMessage(chatId, '❌ Неверный формат');
        return;
      }
      state.servers.push({ host: host.trim(), port: Number(port) });
      bot.sendMessage(chatId, '✅ Сервер добавлен');
    });
  }

  // ===== ОБНОВИТЬ ВСЕ =====
  if (msg.text === '🔄 Обновить всё') {
    for (let i = 0; i < state.servers.length; i++) {
      await showServer(chatId, i);
    }
  }

  // ===== О БОТЕ =====
  if (msg.text === 'ℹ️ О боте') {
    bot.sendMessage(chatId, 'CS 1.6 Bot\nОнлайн мониторинг серверов\nРаботает 24/7');
  }
});

// ===== CALLBACK =====
bot.on('callback_query', async q => {
  const chatId = q.message.chat.id;
  const state = chatState.get(chatId);

  const index = Number(q.data.split('_')[1]);
  const server = state.servers[index];
  if (!server) return;

  // ===== ПОКАЗ СЕРВЕРА =====
  if (q.data.startsWith('show_')) {
    await showServer(chatId, index, false);
  }

  // ===== ОБНОВЛЕНИЕ =====
  if (q.data.startsWith('refresh_')) {
    await showServer(chatId, index, false);
  }

  // ===== ТОП 10 =====
  if (q.data.startsWith('top10_')) {
    await showServer(chatId, index, true);
  }

  // ===== ВСЕ ИГРОКИ =====
  if (q.data.startsWith('all_')) {
    await showServer(chatId, index, false);
  }

  bot.answerCallbackQuery(q.id);
});
