const dgram = require('dgram');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// Берем токен из переменной окружения
const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) throw new Error('Установите BOT_TOKEN в переменных окружения!');

const bot = new TelegramBot(TOKEN, { polling: true });
console.log('🤖 Бот запущен и ждёт команд...');

// Файл для хранения серверов
const SERVERS_FILE = path.join(__dirname, 'servers.json');

// Загружаем или создаем массив серверов
let SERVERS = [];
if (fs.existsSync(SERVERS_FILE)) {
  SERVERS = JSON.parse(fs.readFileSync(SERVERS_FILE, 'utf8'));
} else {
  fs.writeFileSync(SERVERS_FILE, JSON.stringify([]));
}

// ======== Утилиты ========

// HTML экранирование
function escapeHTML(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// Отправка UDP-запроса
function sendUDP(host, port, buffer) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    let finished = false;
    function cleanUp() { if (!finished) { finished = true; socket.close(); } }
    socket.send(buffer, 0, buffer.length, port, host, (err) => { if (err) { cleanUp(); reject(err); } });
    socket.on('message', (msg) => { cleanUp(); resolve(msg); });
    socket.on('error', (err) => { cleanUp(); reject(err); });
    setTimeout(() => { cleanUp(); reject('Timeout: сервер не отвечает'); }, 3000);
  });
}

// Получаем информацию о сервере (пример)
async function getServerInfo(host, port) {
  const A2S_INFO = Buffer.from([0xFF,0xFF,0xFF,0xFF,0x54,0x53,0x6F,0x75,0x72,0x63,0x65,0x20,0x45,0x6E,0x67,0x69,0x6E,0x65,0x20,0x51,0x75,0x65,0x72,0x79,0x00]);
  try {
    const msg = await sendUDP(host, port, A2S_INFO);
    let offset = 6;
    let nameEnd = msg.indexOf(0, offset);
    const name = msg.toString('utf8', offset, nameEnd);
    let mapStart = nameEnd + 1;
    let mapEnd = msg.indexOf(0, mapStart);
    const map = msg.toString('utf8', mapStart, mapEnd);
    const players = msg[nameEnd + map.length + 2] || 0;
    return { name, map, players };
  } catch (err) {
    return { name: 'Не удалось получить', map: '-', players: 0 };
  }
}

// Список игроков (пример)
async function getPlayers(host, port) {
  // Здесь можно добавить реальный запрос через Gamedig или UDP
  return [
    { name: 'Игрок1', score: 5, time: 12 },
    { name: 'Игрок2', score: 10, time: 20 },
  ];
}

// Форматируем сообщение
function formatMessage(info, players) {
  let text = `🎮 <b>${escapeHTML(info.name)}</b>\n🗺 <b>Карта:</b> ${escapeHTML(info.map)}\n📊 Игроки: ${players.length}\n\n`;
  text += '<b>Список игроков:</b>\n';
  players.forEach((p, i) => {
    text += `${i+1}. <b>${escapeHTML(p.name)}</b> | <i>${p.score}</i> очк. | <code>${p.time} мин.</code>\n`;
  });
  return text;
}

// ======== Работа с ботом ========

// /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, `Привет! Я бот CS 1.6. Используй кнопки ниже:`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '➕ Добавить сервер', callback_data: 'add_server' }],
        [{ text: '🤝 Поделиться ботом', url: `https://t.me/${bot.username}` }]
      ]
    }
  });
});

// Кнопки inline
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;

  if (query.data === 'add_server') {
    bot.sendMessage(chatId, 'Отправьте IP и порт сервера через пробел, например: `46.174.55.32 27015`', { parse_mode: 'Markdown' });
  } else if (query.data.startsWith('server_')) {
    const parts = query.data.split('_');
    const host = parts[1], port = Number(parts[2]);
    const info = await getServerInfo(host, port);
    const players = await getPlayers(host, port);
    await bot.sendMessage(chatId, formatMessage(info, players), {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Обновить', callback_data: `server_${host}_${port}` }],
          [{ text: '🤝 Поделиться ботом', url: `https://t.me/${bot.username}` }]
        ]
      }
    });
  }
});

// Добавляем новый сервер
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text) return;

  const parts = text.split(' ');
  if (parts.length === 2 && /^\d{1,3}(\.\d{1,3}){3}$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
    const host = parts[0], port = Number(parts[1]);
    if (!SERVERS.find(s => s.host === host && s.port === port)) {
      SERVERS.push({ host, port, name: `Сервер ${SERVERS.length+1}` });
      fs.writeFileSync(SERVERS_FILE, JSON.stringify(SERVERS, null, 2));
      await bot.sendMessage(chatId, `✅ Сервер ${host}:${port} добавлен!`);
    } else {
      await bot.sendMessage(chatId, `⚠️ Этот сервер уже добавлен`);
    }
  }
});
