module.exports = {
  token: process.env.BOT_TOKEN, // токен бота из переменной окружения
  admins: [6387957935],         // ID админа

  // Три сервера по умолчанию
  servers: [
    { host: '46.174.55.32', port: 27015, name: 'SPIRIT [CLASSIC]' },
    { host: '62.122.213.153', port: 27015, name: 'SD' },
    { host: '37.230.228.21', port: 27015, name: '© КВАРТАЛ 32' }
  ]
};
