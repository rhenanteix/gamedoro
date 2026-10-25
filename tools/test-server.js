'use strict';
const { setTimeout: sleep } = require('node:timers/promises');

exports.ready = async (child, url) => {
  for (let i = 0; i < 50; i++) {
    if (child.exitCode !== null || child.signalCode !== null) throw Error('Servidor de teste encerrou antes de ficar disponível.');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch { }
    await sleep(100);
  }
  throw Error('Servidor de teste não ficou disponível.');
};

exports.stop = async child => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill();
  await exited;
};
