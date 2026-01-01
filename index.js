const dgram = require('dgram');
const TelegramBot = require('node-telegram-bot-api');

// Берём токен из Environment Variables
const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('❌ Ошибка: не задан BOT_TOKEN в переменных окружения!');
  process.exit(1);
}

// Создаём бота
const bot = new TelegramBot(TOKEN, { polling: true });

// Настройки сервера CS 1.6
const SERVER_HOST = '46.174.55.32';
const SERVER_PORT = 27015;

// ======================
// ===== ФУНКЦИИ =======
// ======================

// Экранирование HTML для Telegram
function escapeHTML(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Отправка UDP-запроса
function sendUDP(host, port, buffer) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    let finished = false;

    function cleanUp() {
      if (!finished) {
        finished = true;
        socket.close();
      }
    }

    socket.send(buffer, 0, buffer.length, port, host, (err) => {
      if (err) { cleanUp(); reject(err); }
    });

    socket.on('message', (msg) => { cleanUp(); resolve(msg); });
    socket.on('error', (err) => { cleanUp(); reject(err); });
    setTimeout(() => { cleanUp(); reject('Timeout: сервер не отвечает'); }, 3000);
  });
}

// Получаем инфо о сервере (название, карта, количество игроков)
async function getServerInfo(host, port) {
  const A2S_INFO = Buffer.from([
    0xFF,0xFF,0xFF,0xFF,0x54,
    0x53,0x6F,0x75,0x72,0x63,
    0x65,0x20,0x45,0x6E,0x67,
    0x69,0x6E,0x65,0x20,0x51,
    0x75,0x65,0x72,0x79,0x00
  ]);

  try {
    const msg = await sendUDP(host, port, A2S_INFO);

    let offset = 6;
    let nameEnd = msg.indexOf(0, offset);
    const name = msg.toString('utf8', offset, nameEnd);

    let mapStart = nameEnd + 1;
    let mapEnd = msg.indexOf(0, mapStart);
    const map = msg.toString('utf8', mapStart, mapEnd);

    const players = msg[nameEnd + map.length + 2];

    return { name, map, players };
  } catch (err) {
    throw 'Сервер недоступен';
  }
}

// Получаем список игроков (пример)
async function getPlayers(host, port) {
  try {
    // В реальном случае здесь можно подключить gamedig или A2S
    return [
      { name: 'WZ l FranK', score: 5, time: '8 мин.' },
      { name: 'DREDD 08 18', score: 19, time: '19 мин.' },
      { name: 'gg 2', score: 5, time: '5 мин.' },
      { name: 'PETROS 040', score: 0, time: '3 мин.' },
    ];
  } catch {
    return [];
  }
}

// Форматируем сообщение для Telegram
function formatMessage(info, players) {
  const occupancy = Math.round((players.length / 32) * 100);
  const rating = Math.floor(players.length / 10) + 1;

  let playerList = players.map((p, i) =>
    `🎮 <b>${i + 1}. ${escapeHTML(p.name)}</b> | <u>${p.score}</u> | <i>${p.time}</i>`
  ).join('\n');

  return `🎮 <b>${escapeHTML(info.name)}</b>
🗺 <b>Карта:</b> ${escapeHTML(info.map)}
📊 <b>Игроки:</b> ${players.length} (~${occupancy}% загрузка)
⭐ <b>Рейтинг:</b> ${rating}

👥 <b>Список игроков:</b>
${playerList}`;
}

// Отправка инфо о сервере пользователю
async function sendServerInfo(chatId) {
  try {
    const info = await getServerInfo(SERVER_HOST, SERVER_PORT);
    const players = await getPlayers(SERVER_HOST, SERVER_PORT);

    await bot.sendMessage(chatId, formatMessage(info, players), {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 Обновить сервер', callback_data: 'refresh' },
            { text: '👥 Список игроков', callback_data: 'players' }
          ],
          [
            { text: '🏁 Старт', callback_data: 'start' }
          ]
        ]
      }
    });
  } catch (err) {
    await bot.sendMessage(chatId, `❌ Сервер недоступен\n${err}`);
  }
}

// ======================
// ===== КОМАНДЫ =======
// ======================

bot.onText(/\/server/, (msg) => {
  sendServerInfo(msg.chat.id);
});

// ======================
// ===== КНОПКИ =======
// ======================

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;

  if (query.data === 'refresh') {
    sendServerInfo(chatId);
  } else if (query.data === 'players') {
    const players = await getPlayers(SERVER_HOST, SERVER_PORT);
    const list = players.map((p, i) =>
      `🎮 <b>${i + 1}. ${escapeHTML(p.name)}</b> — <i>${p.time}</i>`
    ).join('\n');
    await bot.sendMessage(chatId, `<b>Список игроков:</b>\n${list}`, { parse_mode: 'HTML' });
  } else if (query.data === 'start') {
    await bot.sendMessage(chatId,
      `🤖 Привет! Я бот для отслеживания CS 1.6 сервера.\n
Команды:
/server — показать инфо о сервере
Кнопки для удобного обновления и просмотра игроков.`, { parse_mode: 'HTML' });
  }

  // Убираем «часики» на кнопке
  bot.answerCallbackQuery(query.id);
});

// ======================
// ===== СТАРТ =======
// ======================

console.log('🤖 Бот запущен и ждёт команд...');
