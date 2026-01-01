// ======== Обновляем sendOrEdit для кнопок ========
async function sendOrEdit(chatId, messageId, server) {
  try {
    const state = await getServerInfo(server);
    const opts = {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          SERVERS.map(s => ({ text: s.name, callback_data: `server_${s.host}_${s.port}` })),
          [
            { text: '🔄 Обновить', callback_data: `refresh_${server.host}_${server.port}` },
            { text: '🤝 Поделиться ботом', url: `https://t.me/${bot.username}` } // кнопка поделиться
          ]
        ]
      }
    };

    const text = formatMessage(state);

    if (messageId) {
      await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts });
    } else {
      const sent = await bot.sendMessage(chatId, text, opts);
      return sent.message_id;
    }
  } catch (err) {
    if (!messageId) {
      await bot.sendMessage(chatId, `❌ ${err}`);
    } else {
      await bot.editMessageText(`❌ ${err}`, { chat_id: chatId, message_id: messageId });
    }
  }
}
