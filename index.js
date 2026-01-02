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
  } catch { return { online: false }; }
}

// ===== Start menu =====
bot.onText(/\/start/, msg => {
  bot.sendMessage(msg.chat.id, 'Добро пожаловать 👋', {
    reply_markup: { keyboard: [[{ text: '▶️ Старт' }]], resize_keyboard: true, one_time_keyboard: true }
  });
});

// ===== Message handler =====
bot.on('message', async msg => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const isAdmin = admins.includes(msg.from.id);

  if (text === '▶️ Старт') {
    // Главное меню с inline-кнопками
    const inline = [
      [{ text: '🎮 Сервера', callback_data: 'menu_servers' }],
      [{ text: '➕ Добавить сервер', callback_data: 'menu_add' }],
      [{ text: 'ℹ️ О боте / Написать разработчику', callback_data: 'menu_info' }],
      [{ text: '📤 Поделиться ботом', callback_data: 'menu_share' }]
    ];
    return bot.sendMessage(chatId, 'Главное меню:', { reply_markup: { inline_keyboard: inline } });
  }
});

// ===== CALLBACK QUERY =====
bot.on('callback_query', async q => {
  const chatId = q.message.chat.id;
  const data = q.data;
  const isAdmin = admins.includes(q.from.id);

  // ===== Сервера =====
  if (data === 'menu_servers') {
    const inline = servers.map((s,i) => [{ text: s.name, callback_data: `srv_${i}` }]);
    return bot.sendMessage(chatId, 'Выберите сервер:', { reply_markup: { inline_keyboard: inline } });
  }

  if (data.startsWith('srv_')) {
    const id = Number(data.split('_')[1]);
    const server = servers[id];
    const info = await queryServer(server);

    if (!info.online) {
      return bot.editMessageText('❌ Сервер OFFLINE', {
        chat_id, message_id: q.message.message_id,
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'menu_servers' }]] }
      });
    }

    let text = `🎮 <b>${esc(server.name)}</b>\n🗺 Карта: ${esc(info.map)}\n👥 Онлайн: ${info.players.length}/${info.max}\n\n<b>Игроки:</b>\n`;
    if (!info.players.length) text += '— пусто —';
    else {
      info.players.forEach((p,i) => { text += `${i+1}. ${esc(p.name)} | ${p.score} | ${p.time} мин${bans.includes(p.name) ? ' 🚫' : ''}\n`; });
    }

    return bot.editMessageText(text, {
      chat_id, message_id: q.message.message_id, parse_mode:'HTML',
      reply_markup: { inline_keyboard: [
        [{ text:'🔄 Обновить', callback_data:`srv_${id}` }],
        [{ text:'⬅️ Назад к серверам', callback_data:'menu_servers' }]
      ]}
    });
  }

  // ===== Добавить сервер =====
  if (data === 'menu_add') {
    bot.sendMessage(chatId, 'Введите IP:PORT для добавления сервера:');
    bot.once('message', msg => {
      const [host, port] = msg.text.split(':');
      if (!host || !port) return bot.sendMessage(chatId, '❌ Неверный формат');
      servers.push({ host, port: Number(port), name: `${host}:${port}` });
      bot.sendMessage(chatId, '✅ Сервер добавлен');
    });
  }

  // ===== О боте / Написать разработчику =====
  if (data === 'menu_info') {
    return bot.sendMessage(chatId,
      '🤖 CS 1.6 Bot\n\n' +
      'Показывает:\n• имя сервера\n• карту\n• онлайн\n• список игроков\n\n' +
      'Разработчик: [Написать](https://t.me/ТВОЙ_TG_ID)',
      { parse_mode:'Markdown', disable_web_page_preview:true }
    );
  }

  // ===== Поделиться ботом с фото =====
  if (data === 'menu_share') {
    return bot.sendPhoto(chatId, 'https://i.postimg.cc/Hcc81kRC', {
      caption: '📤 Поделись ботом с друзьями!',
      reply_markup: { inline_keyboard: [[{ text: 'Переслать', switch_inline_query:'' }]] }
    });
  }

  // ===== Админ-панель =====
  if (isAdmin) {
    if (data === 'menu_admin') {
      const inline = [
        [{ text:'📊 Статистика серверов', callback_data:'admin_stats' }],
        [{ text:'🚫 Бан игрока', callback_data:'admin_ban' }],
        [{ text:'✅ Разбан игрока', callback_data:'admin_unban' }]
      ];
      return bot.sendMessage(chatId,'🛠 Админ-панель:', { reply_markup:{ inline_keyboard:inline } });
    }

    // Статистика серверов
    if (data === 'admin_stats') {
      let text = '📊 Статистика серверов:\n\n';
      for (let s of servers) {
        const info = await queryServer(s);
        text += `${s.name}: ${info.online ? '✅ Online' : '❌ Offline'} | Игроков: ${info.players?.length || 0}\n`;
      }
      return bot.editMessageText(text,{ chat_id, message_id:q.message.message_id });
    }

    // Бан игрока
    if (data === 'admin_ban') {
      bot.sendMessage(chatId,'Введите ник игрока для бана:');
      bot.once('message', msg => {
        const name = msg.text.trim();
        if (!bans.includes(name)) { bans.push(name); saveBans(); bot.sendMessage(chatId,`✅ Игрок "${name}" забанен`); }
        else bot.sendMessage(chatId,`❌ Игрок "${name}" уже в бане`);
      });
    }

    // Разбан игрока
    if (data === 'admin_unban') {
      bot.sendMessage(chatId,'Введите ник игрока для разбана:');
      bot.once('message', msg => {
        const name = msg.text.trim();
        if (bans.includes(name)) { bans = bans.filter(n=>n!==name); saveBans(); bot.sendMessage(chatId,`✅ Игрок "${name}" разбанен`); }
        else bot.sendMessage(chatId,`❌ Игрок "${name}" не в бане`);
      });
    }
  }
});
