const { GameDig } = require('gamedig');

(async () => {
  try {
    const state = await GameDig.query({
      type: 'cs',           // <-- вместо cs16
      host: '46.174.55.32',
      port: 27015
    });

    console.log('? Сервер ответил:');
    console.log(state);
  } catch (error) {
    console.log('? Сервер не отвечает:');
    console.error(error);
  }
})();
