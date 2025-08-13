/* ADX: клик по заголовку -> «decode»-волна от буквы, импакт, фейд в чёрный, переход на artists.html */
(function(){
  const h2 = document.querySelector('.headline-artists') || document.querySelector('.panel h2');
  if (!h2) return;

  // Готовим буквы к волне
  const origText = (h2.textContent || '').replace(/\s+/g, m => m);
  h2.classList.add('headline-artists','headline');
  h2.innerHTML = '';
  const spans = [];
  for (const ch of origText) {
    const s = document.createElement('span');
    s.className = 'ch';
    s.textContent = ch;
    h2.appendChild(s);
    spans.push(s);
  }

  // Параметры волны (как в интро)
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{};:,.<>?';
  const randChar = () => CHARS[(Math.random()*CHARS.length)|0];

  const STEP_DELAY = 70;  // мс между соседними буквами
  const HOLD_MS    = 130; // мс «шума» на букве
  const LOCK_MS    = 900; // блок от дабл-кликов, пока длится эффект
  let busy = false;

  function impact(letterEl){
    h2.classList.add('headline-impact');
    const tl = gsap.timeline({ defaults:{ ease:'power2.out' } });
    tl.fromTo(h2, { scale:1, filter:'blur(0px)' }, { scale:1.035, duration:0.11 })
      .to(h2, { scale:1, duration:0.12 }, '>-0.02');

    if (letterEl){
      tl.fromTo(letterEl, { y:0 }, { y:-2, duration:0.11 })
        .to(letterEl, { y:0, duration:0.12 }, '>-0.02');
    }
    tl.add(() => h2.classList.remove('headline-impact'));
  }

  function fadeToBlackAndGo(url){
    // помечаем, что прелоадер пока не нужен
    sessionStorage.setItem('adxSkipPreloader', '1');

    let fader = document.getElementById('route-fader');
    if (!fader){
      fader = document.createElement('div');
      fader.id = 'route-fader';
      document.body.appendChild(fader);
    }
    gsap.to(fader, {
      opacity:1, duration:0.38, ease:'power2.out',
      onComplete(){ window.location.href = url; }
    });
  }

  function waveFromIndex(originIdx){
    const N = spans.length;
    const maxD = Math.max(originIdx, N - 1 - originIdx);

    function schedule(i, delay){
      const s = spans[i];
      const original = origText[i];

      setTimeout(() => {
        if (!/\s/.test(original)){
          s.classList.add('glitch');
          s.textContent = randChar();
        }
      }, delay);

      setTimeout(() => {
        s.textContent = original;
        s.classList.remove('glitch');
      }, delay + HOLD_MS);
    }

    for (let i=0;i<N;i++){
      const d = Math.abs(i - originIdx);
      schedule(i, d * STEP_DELAY);
    }
    return maxD * STEP_DELAY + HOLD_MS;
  }

  function getLetterIndexFromEvent(e){
    const target = e.target;
    if (target && target.classList && target.classList.contains('ch')){
      return spans.indexOf(target);
    }
    const x = (e.touches ? e.touches[0].clientX : e.clientX);
    let best = 0, min = Infinity;
    spans.forEach((s, i) => {
      const r = s.getBoundingClientRect();
      const cx = (r.left + r.right) * 0.5;
      const dist = Math.abs(cx - x);
      if (dist < min){ min = dist; best = i; }
    });
    return best;
  }

  h2.addEventListener('click', (e) => {
    if (busy) return;
    busy = true;

    const origin = getLetterIndexFromEvent(e);
    const letterEl = spans[origin];

    impact(letterEl);
    const waveMs = waveFromIndex(origin);

    gsap.delayedCall(Math.max(0.05, waveMs/1000 - 0.05), () => {
      fadeToBlackAndGo('artists.html');
    });

    setTimeout(() => busy = false, LOCK_MS);
  }, { passive:true });

  // На всякий случай: если вернулись по истории — очистить фейдер
  window.addEventListener('pageshow', function(){
    const f = document.getElementById('route-fader');
    if (f) f.style.opacity = '0';
  });
})();
