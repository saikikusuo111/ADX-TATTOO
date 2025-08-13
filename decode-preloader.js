(function () {
  try { history.scrollRestoration = 'manual'; } catch (_) {}
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });

  const pre = document.getElementById('preloader');
  if (!pre) return;

  // --- Прогресс
  const percentEl = document.getElementById('pre-percent');
  const fillEl = pre.querySelector('.pre-fill');
  let lastP = 0;
  function setProgress(p) {
    const val = Math.max(0, Math.min(1, p || 0));
    const pct = Math.round(val * 100);
    if (pct !== lastP) {
      lastP = pct;
      if (percentEl) percentEl.textContent = pct + '%';
      if (fillEl) fillEl.style.width = pct + '%';
    }
  }
  window.addEventListener('assets:progress', (e) => {
    const p = (e && e.detail && typeof e.detail.p === 'number') ? e.detail.p : 0;
    setProgress(p);
  });

  function closePreloader() {
    pre.classList.add('blur');
    setTimeout(() => {
      pre.classList.add('hide');
      setTimeout(() => {
        pre.remove();
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        if (window.ScrollTrigger) ScrollTrigger.refresh(true);
      }, 850);
    }, 900);
  }
  window.addEventListener('assets:ready', () => {
    stopEncoding();
    restoreOriginal();
    closePreloader();
  });

  // Фолбэк
  window.addEventListener('load', () => {
    setTimeout(() => {
      if (document.getElementById('preloader')) {
        stopEncoding();
        restoreOriginal();
        closePreloader();
      }
    }, 10000);
  });

  // --- Лого: Wave Encode (сразу декодируем после сканирования)
  const logoEl = pre.querySelector('.logo');
  if (!logoEl) return;

  const origText = logoEl.textContent;
  logoEl.textContent = '';
  logoEl.style.whiteSpace = 'pre';

  const spans = [];
  for (const ch of origText) {
    const s = document.createElement('span');
    s.className = 'ch';
    s.textContent = ch;
    logoEl.appendChild(s);
    spans.push(s);
  }

  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{};:,.<>?';
  const randChar = () => CHARS[(Math.random() * CHARS.length) | 0];

  const STEP_DELAY = 80;   // шаг волны между буквами
  const HOLD_MS    = 140;  // сколько держим «закодированное» состояние для каждой буквы

  let intervalId;
  const timers = new Set(); // чтобы всё корректно очищать

  function waveEncode() {
    spans.forEach((s, i) => {
      const isSpace = /\s/.test(origText[i]);
      // момент «сканирования» конкретной буквы
      const t1 = setTimeout(() => {
        if (!isSpace) {
          s.classList.add('glitch');
          s.textContent = randChar();
        }
      }, i * STEP_DELAY);
      timers.add(t1);

      // локальная декодировка сразу вслед за сканированием
      const t2 = setTimeout(() => {
        s.textContent = origText[i];
        s.classList.remove('glitch');
        timers.delete(t1); timers.delete(t2);
      }, i * STEP_DELAY + HOLD_MS);
      timers.add(t2);
    });
  }

  function startEncoding() {
    waveEncode();
    intervalId = setInterval(waveEncode, 2500);
  }
  function stopEncoding() {
    clearInterval(intervalId);
    timers.forEach(clearTimeout);
    timers.clear();
  }
  function restoreOriginal() {
    spans.forEach((s, i) => {
      s.textContent = origText[i];
      s.classList.remove('glitch');
    });
  }

  startEncoding();
  window.addEventListener('beforeunload', stopEncoding);
})();
