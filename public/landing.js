'use strict';
(() => {
  const toggle = document.getElementById('nav-toggle');
  const menu = document.getElementById('nav-menu');
  const setMenu = open => {
    menu.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
  };
  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('click', event => { if (event.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { setMenu(false); toggle.focus(); }
  });
  document.addEventListener('click', event => { if (!event.target.closest('.header-inner')) setMenu(false); });
  window.matchMedia('(max-width: 700px)').addEventListener('change', () => setMenu(false));

  const durations = { focus: 25 * 60, short: 5 * 60, long: 15 * 60 };
  const captions = { focus: 'Um pequeno passo para uma grande missão.', short: 'Respire. A próxima missão pode esperar.', long: 'Você merece uma pausa para recarregar.' };
  const display = document.getElementById('demo-time');
  const start = document.getElementById('demo-start');
  const status = document.getElementById('demo-status');
  let mode = 'focus', remaining = durations.focus, deadline = 0, interval = null;
  const paint = () => { display.textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`; };
  const stop = () => { clearInterval(interval); interval = null; start.setAttribute('aria-pressed', 'false'); };
  const tick = () => {
    remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    paint();
    if (!remaining) {
      stop(); start.textContent = '↻ Experimentar novamente';
      status.textContent = mode === 'focus' ? 'Foco concluído! Faça uma pausa. Abra o app para começar sua jornada.' : 'Pausa concluída! Pronto para mais uma missão?';
    }
  };
  start.addEventListener('click', () => {
    if (interval !== null) {
      tick(); stop(); start.textContent = remaining ? '▶ Continuar' : '↻ Experimentar novamente';
      if (remaining) status.textContent = 'Timer pausado. Continue quando estiver pronto.';
      return;
    }
    if (!remaining) remaining = durations[mode];
    deadline = Date.now() + remaining * 1000;
    start.textContent = 'Ⅱ Pausar'; start.setAttribute('aria-pressed', 'true');
    status.textContent = 'Demonstração em andamento · o progresso não é salvo aqui.';
    interval = setInterval(tick, 250); paint();
  });
  const reset = () => {
    stop(); remaining = durations[mode]; paint(); start.textContent = '▶ Experimentar o timer';
    status.textContent = 'Demonstração · entre no app para salvar seu progresso.';
  };
  document.getElementById('demo-reset').addEventListener('click', reset);
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
    mode = button.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    document.getElementById('timer-caption').textContent = captions[mode]; reset();
  }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden && interval !== null) tick(); });

  // Reuse the app's pixel-art renderer; the local image remains as a fallback.
  const canvas = document.getElementById('demo-scene');
  const context = window.Scene && canvas.getContext('2d');
  if (context) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = true, frame = 0, previous = 0, elapsed = 0;
    const render = () => window.Scene.render(context, canvas.width, canvas.height, { world: 'floresta', skin: 'aventureiro', t: elapsed, scroll: elapsed * 8, pose: 'walk' });
    const animate = now => {
      frame = 0;
      if (!visible || document.hidden || reducedMotion.matches) { previous = 0; return; }
      if (now - previous >= 100) { elapsed += .1; render(); previous = now; }
      frame = requestAnimationFrame(animate);
    };
    const resume = () => { if (!frame && visible && !document.hidden && !reducedMotion.matches) frame = requestAnimationFrame(animate); };
    render(); canvas.hidden = false;
    if ('IntersectionObserver' in window) new IntersectionObserver(entries => { visible = entries[0].isIntersecting; resume(); }).observe(canvas);
    reducedMotion.addEventListener('change', resume);
    document.addEventListener('visibilitychange', resume);
    resume();
    window.addEventListener('pagehide', () => { cancelAnimationFrame(frame); frame = 0; });
    window.addEventListener('pageshow', resume);
  }
})();
