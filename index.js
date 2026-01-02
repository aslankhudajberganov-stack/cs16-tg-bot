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

// ===== БАНЫ =====
const bansFile = path.join(__dirname, 'bans.json');
let bans = [];
if (fs.existsSync(bansFile)) bans = JSON.parse(fs.readFileSync(bansFile, 'utf-8'));
function saveBans() { fs.writeFileSync(bansFile, JSON.stringify(bans, null, 2)); }

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
  } catch { return { online: false }; }
}

// ===== /start =====
bot.onText(/\/start/, msg => {
  bot.sendMessage(msg.chat.id, 'Добро пожаловать 👋', {
    reply_markup: { keyboard: [[{ text: '▶️ Старт' }]], resize_keyboard: true, one_time_keyboard: true }
  });
});

// ===== MESSAGE HANDLER =====
bot.on('message', async msg => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const isAdmin = admins.includes(msg.from.id);

  // ===== Главное меню =====
  if (text === '▶️ Старт') {
    const keyboard = [
      ['🎮 Сервера'],
      ['➕ Добавить сервер'],
      ['ℹ️ О боте / Написать разработчику'],
      ['📤 Поделиться ботом']
    ];
    return bot.sendMessage(chatId, 'Главное меню:', { reply_markup: { keyboard, resize_keyboard: true } });
  }

  // ===== Reply: Поделиться ботом =====
  if (text === '📤 Поделиться ботом') {
    return bot.sendPhoto(chatId, 'https://i.postimg.cc/ZRj839L0/images.jpg', {
      caption: '📤 Поделись ботом с друзьями!',
      reply_markup: { inline_keyboard: [[{ text: 'Переслать', switch_inline_query: '' }]] }
    });
  }

  // ===== Reply: О боте =====
  if (text === 'ℹ️ О боте / Написать разработчику') {
    return bot.sendMessage(chatId,
      '🤖 CS 1.6 Bot\n\nПоказывает:\n• имя сервера\n• карту\n• онлайн\n• список игроков\n\n' +
      'Разработчик: [Написать](https://t.me/leva_sdd)',
      { parse_mode: 'Markdown', disable_web_page_preview: true }
    );
  }

  // ===== Reply: Добавить сервер =====
  if (text === '➕ Добавить сервер') {
    bot.sendMessage(chatId, 'Введите IP:PORT для добавления сервера:');
    bot.once('message', msg2 => {
      const [host, port] = msg2.text.split(':');
      if (!host || !port) return bot.sendMessage(chatId, '❌ Неверный формат');
      servers.push({ host, port: Number(port), name: `${host}:${port}` });
      bot.sendMessage(chatId, '✅ Сервер добавлен');
    });
  }

  // ===== Reply: Сервера =====
  if (text === '🎮 Сервера') {
    const inline = servers.map((s, i) => [{ text: s.name, callback_data: `srv_${i}` }]);
    return bot.sendMessage(chatId, 'Выберите сервер:', { reply_markup: { inline_keyboard: inline } });
  }

  // ===== Reply: Админ-панель (только для админа) =====
  if (isAdmin && text === '🛠 Админ') {
    const keyboard = [
      ['📊 Статистика серверов'],
      ['🚫 Бан игрока'],
      ['✅ Разбан игрока']
    ];
    return bot.sendMessage(chatId, '🛠 Админ-панель:', { reply_markup: { keyboard, resize_keyboard: true } });
  }

  // ===== Админ: Статистика =====
  if (isAdmin && text === '📊 Статистика серверов') {
    let textOut = '📊 Статистика серверов:\n\n';
    for (let s of servers) {
      const info = await queryServer(s);
      textOut += `${s.name}: ${info.online ? '✅ Online' : '❌ Offline'} | Игроков: ${info.players?.length || 0}\n`;
    }
    return bot.sendMessage(chatId, textOut);
  }

  // ===== Админ: Бан игрока =====
  if (isAdmin && text === '🚫 Бан игрока') {
    bot.sendMessage(chatId, 'Введите ник игрока для бана:');
    bot.once('message', msg2 => {
      const name = msg2.text.trim();
      if (!bans.includes(name)) { bans.push(name); saveBans(); bot.sendMessage(chatId, `✅ Игрок "${name}" забанен`); }
      else bot.sendMessage(chatId, `❌ Игрок "${name}" уже в бане`);
    });
  }

  // ===== Админ: Разбан игрока =====
  if (isAdmin && text === '✅ Разбан игрока') {
    bot.sendMessage(chatId, 'Введите ник игрока для разбана:');
    bot.once('message', msg2 => {
      const name = msg2.text.trim();
      if (bans.includes(name)) { bans = bans.filter(n => n !== name); saveBans(); bot.sendMessage(chatId, `✅ Игрок "${name}" разбанен`); }
      else bot.sendMessage(chatId, `❌ Игрок "${name}" не в бане`);
    });
  }
});

// ===== CALLBACK QUERY: серверы =====
bot.on('callback_query', async q => {
  const chatId = q.message.chat.id;
  const data = q.data;

  if (data.startsWith('srv_')) {
    const id = Number(data.split('_')[1]);
    const server = servers[id];
    const info = await queryServer(server);

    if (!info.online) {
      return bot.editMessageText('❌ Сервер OFFLINE', {
        chat_id, message_id: q.message.message_id,
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'back_servers' }]] }
      });
    }

    let text = `🎮 <b>${esc(server.name)}</b>\n🗺 Карта: ${esc(info.map)}\n👥 Онлайн: ${info.players.length}/${info.max}\n\n<b>Игроки:</b>\n`;
    if (!info.players.length) text += '— пусто —';
    else info.players.forEach((p, i) => { text += `${i+1}. ${esc(p.name)} | ${p.score} | ${p.time} мин${bans.includes(p.name) ? ' 🚫' : ''}\n`; });

    return bot.editMessageText(text, {
      chat_id, message_id: q.message.message_id, parse_mode:'HTML',
      reply_markup: { inline_keyboard: [
        [{ text:'🔄 Обновить', callback_data:`srv_${id}` }],
        [{ text:'⬅️ Назад к серверам', callback_data:'back_servers' }]
      ]}
    });
  }

  if (data === 'back_servers') {
    const inline = servers.map((s,i) => [{ text: s.name, callback_data: `srv_${i}` }]);
    return bot.editMessageText('Выберите сервер:', { chat_id, message_id: q.message.message_id, reply_markup: { inline_keyboard: inline } });
  }
});
