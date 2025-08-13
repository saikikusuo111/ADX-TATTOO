/* Pixi + GSAP Scroll
   Предзагрузка с прогрессом для прелоадера, плавный fade-out и привычная сцена
*/
(() => {
  PIXI.utils.skipHello();
  gsap.registerPlugin(ScrollTrigger);

  const sections = [...document.querySelectorAll('.panel')];
  if (!sections.length) return;

  // источники + кэш-брейкер
  const sources = sections
    .map(s => s.dataset.src)
    .filter(Boolean)
    .map(url => url.includes('?') ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`);

  // WebGL фолбэк
  const test = document.createElement('canvas');
  const hasGL = !!(test.getContext('webgl2') || test.getContext('webgl') || test.getContext('experimental-webgl'));
  if (!hasGL) {
    sections.forEach((sec,i)=> sec.style.cssText += `;background:url("${sources[i]}") center/cover no-repeat`);
    window.dispatchEvent(new CustomEvent('assets:progress', { detail:{ p:1 }}));
    window.dispatchEvent(new CustomEvent('assets:ready'));
    return;
  }

  // ---- helpers
  const OVERSCAN = 1.20;
  function coverFit(sprite, w, h){
    const tw = sprite.texture.width, th = sprite.texture.height;
    if (!tw || !th) return;
    const k = Math.max(w / tw, h / th) * OVERSCAN;
    sprite.scale.set(k);
    sprite.position.set(w * 0.5, h * 0.5);
  }

  // ---- прогресс прелоада (displace + images + video)
  const heroVideo = document.querySelector('.hero-video');
  const weights = {
    displace: 1,
    image: 1,
    video: 2
  };
  const totalUnits = weights.displace + weights.video + sources.length * weights.image;
  let loadedUnits = 0;

  function pushProgress(units){
    loadedUnits += units;
    const p = Math.min(1, loadedUnits / totalUnits);
    window.dispatchEvent(new CustomEvent('assets:progress', { detail:{ p } }));
  }

  function loadTexture(src){
    return new Promise(resolve => {
      const tex = PIXI.Texture.from(src);
      if (tex.baseTexture.valid) resolve(tex);
      else tex.baseTexture.once('loaded', () => resolve(tex));
    });
  }

  function waitVideoReady(video){
    return new Promise(resolve => {
      let done = false;
      const finish = () => { if (!done){ done=true; resolve(); } };
      const t = setTimeout(finish, 4500); // фолбэк
      video?.addEventListener('canplaythrough', () => { clearTimeout(t); finish(); }, { once:true });
      video?.addEventListener('loadeddata',      () => { clearTimeout(t); finish(); }, { once:true });
    });
  }

  async function preloadAll(){
    // displace
    let dispTex;
    try {
      dispTex = await loadTexture('assets/displace.png');
    } catch {
      // шумовая карта, если что
      const c = document.createElement('canvas');
      c.width = c.height = 384;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(384,384);
      for (let i=0;i<img.data.length;i+=4){
        const v = (Math.random()*255)|0;
        img.data[i]=img.data[i+1]=img.data[i+2]=v; img.data[i+3]=255;
      }
      ctx.putImageData(img,0,0);
      dispTex = PIXI.Texture.from(c);
    }
    pushProgress(weights.displace);

    // картинки — параллельно
    const texPromises = sources.map(src => loadTexture(src).then(tex => {
      pushProgress(weights.image);
      return tex;
    }));
    const imageTextures = await Promise.all(texPromises);

    // видео
    await waitVideoReady(heroVideo);
    pushProgress(weights.video);

    // всё готово
    window.dispatchEvent(new CustomEvent('assets:progress', { detail:{ p:1 }}));
    window.dispatchEvent(new CustomEvent('assets:ready'));

    return { dispTex, imageTextures };
  }

  preloadAll()
    .then(start)
    .catch(err => {
      console.error('Preload error:', err);
      sections.forEach((sec,i)=> sec.style.cssText += `;background:url("${sources[i]}") center/cover no-repeat`);
      window.dispatchEvent(new CustomEvent('assets:ready'));
    });

  // ---- сцена
  function start({ dispTex, imageTextures }){
    const app = new PIXI.Application({
      resizeTo: window,
      backgroundAlpha: 0,
      antialias: true,
      powerPreference: 'high-performance'
    });
    app.view.id = 'reveal-stage';
    app.view.style.zIndex = 2;
    document.body.prepend(app.view);

    // ручной рендер (экономим)
    app.stop();
    let rafQueued = false;
    const requestRender = () => {
      if (rafQueued) return;
      rafQueued = true;
      requestAnimationFrame(() => { rafQueued = false; app.render(); });
    };

    // чёрная прослойка на время смен
    const safety = new PIXI.Graphics();
    app.stage.addChild(safety);
    const drawSafety = (w,h,visible) => {
      safety.clear();
      if (visible){
        safety.beginFill(0x000000).drawRect(0,0,w,h).endFill();
        safety.alpha = 1;
      } else safety.alpha = 0;
      requestRender();
    };

    // карта смещений
    const disp = new PIXI.Sprite(dispTex);
    disp.anchor.set(0.5);
    disp.texture.baseTexture.wrapMode = PIXI.WRAP_MODES.REPEAT;
    app.stage.addChild(disp);

    // holder картинок
    const holder = new PIXI.Container();
    app.stage.addChild(holder);

    // картинки
    const sprites = imageTextures.map(tex => {
      const sp = new PIXI.Sprite(tex);
      sp.anchor.set(0.5);
      sp.alpha = 0;
      sp.renderable = false;
      holder.addChild(sp);
      return sp;
    });

    // фильтр «распад»
    const df = new PIXI.filters.DisplacementFilter(disp);
    df.padding = 256;
    holder.filters = [df];

    // лёгкое «дыхание»
    const dispTween = gsap.to(disp, {
      x: () => window.innerWidth * 0.5 + 28,
      y: () => window.innerHeight * 0.5 + 14,
      repeat: -1, yoyo: true, duration: 7, ease: 'sine.inOut',
      onUpdate: requestRender
    });

    // сила распада
    const START = 240;
    const CURVE = 1.15;
    const computeDisplacementFor = (i) => {
      const title = sections[i].querySelector('h2') || sections[i];
      const r = title.getBoundingClientRect();
      const titleCenter = (r.top + r.bottom) * 0.5;
      const vpCenter    = window.innerHeight * 0.5;
      const norm = Math.min(1, Math.abs(titleCenter - vpCenter) / (window.innerHeight * 0.5));
      return START * Math.pow(norm, CURVE);
    };
    const applyDisplacementFor = (i) => {
      df.scale.x = df.scale.y = computeDisplacementFor(i);
      requestRender();
    };

    // ресайз
    const layout = () => {
      const w = window.innerWidth, h = window.innerHeight;
      drawSafety(w,h,false);
      disp.position.set(w*0.5, h*0.5);
      const active = sprites.find(s => s.renderable) || sprites[0];
      if (active) coverFit(active, w, h);
      requestRender();
    };
    layout();
    new ResizeObserver(layout).observe(document.body);
    window.addEventListener('resize', () => { layout(); applyFirstPanelClip(); }, { passive:true });

    // кроссфейд
    let current = -1;
    const FADE_IN = .55, FADE_OUT = .55;
    function crossfadeTo(i){
      if (i === current || !sprites[i]) return;
      const next = sprites[i];
      coverFit(next, window.innerWidth, window.innerHeight);

      safety.alpha = 1;
      next.renderable = true;
      gsap.set(next, { alpha: 0 });

      const tl = gsap.timeline({ onUpdate: requestRender });
      tl.to(next, { alpha: 1, duration: FADE_IN, ease: 'power2.out' }, 0);

      if (current >= 0){
        const prev = sprites[current];
        tl.to(prev, {
          alpha: 0, duration: FADE_OUT, ease: 'power2.out',
          onComplete(){ prev.renderable = false; requestRender(); }
        }, 0.15);
      }

      tl.to(safety, { alpha: 0, duration: .25, ease: 'power2.out', delay: .12 });
      current = i;
    }

    // какую секцию показывать
    function getMostOverlappedSection(){
      const vh = window.innerHeight;
      let best = -1, area = 0;
      for (let i=0;i<sections.length;i++){
        const r = sections[i].getBoundingClientRect();
        const overlap = Math.max(0, Math.min(vh, r.bottom) - Math.max(0, r.top));
        if (overlap > area){ area = overlap; best = i; }
      }
      return best;
    }
    function anySectionVisible(){
      const vh = window.innerHeight;
      return sections.some(sec => {
        const r = sec.getBoundingClientRect();
        return r.bottom > 0 && r.top < vh;
      });
    }

    // шторка для первой секции
    function applyFirstPanelClip(){
      const vh = window.innerHeight;
      const r = sections[0].getBoundingClientRect();

      if (r.top >= vh) {
        app.view.style.clipPath = 'inset(100% 0 0 0)';
      } else if (r.bottom <= 0) {
        app.view.style.clipPath = 'inset(0 0 0 0)';
      } else {
        const top = Math.max(0, r.top);
        app.view.style.clipPath = `inset(${Math.round(top)}px 0 0 0)`;
      }
    }

    // главный наблюдатель
    ScrollTrigger.create({
      trigger: document.body,
      start: 0,
      end: () => ScrollTrigger.maxScroll(window),
      onUpdate(){
        applyFirstPanelClip();

        if (anySectionVisible()){
          const idx = getMostOverlappedSection();
          if (idx >= 0){
            crossfadeTo(idx);
            applyDisplacementFor(idx);
          }
        }
      },
      onRefresh: () => {
        applyFirstPanelClip();
        layout();
      }
    });

    // старт сцены
    window.addEventListener('load', () => {
      const idx = getMostOverlappedSection();
      if (idx >= 0){
        crossfadeTo(idx);
        applyDisplacementFor(idx);
      }
      applyFirstPanelClip();
      ScrollTrigger.refresh();
    });
  }
})();
