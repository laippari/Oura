// Käyttöliittymä: alareunan pilleri ja nouseva alapaneeli (värit, räjäytys, sensorit, tumma
// studio, näkymät) sekä teemanvaihdon verho. Ei kirjastokomponentteja.

const $ = (id) => document.getElementById(id);

export function createUI({ finishes, onFinish, onExplode, onSensors, onDark, onSequence, onSheet }) {
  const body = document.body;
  const sheet = $('sheet');
  const pill = $('pill');
  const state = { explode: false, sensors: false, dark: false, open: false };

  // --- värit ---
  const bar = $('finishes');
  finishes.forEach((f, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'finish-' + f.id;
    b.title = f.name;
    b.setAttribute('aria-label', f.name);
    b.style.setProperty('--sw-a', f.swatch[0]);
    b.style.setProperty('--sw-b', f.swatch[1]);
    b.style.setProperty('--i', i);
    b.addEventListener('click', () => onFinish(i));
    bar.appendChild(b);
  });
  // Real-material swatch images (data URLs in finish order), rendered by the viewer
  let swatchUrls = [];
  let current = 0;
  const dot = pill.querySelector('.dot');
  const setSwatchImages = (urls) => {
    swatchUrls = urls;
    bar.querySelectorAll('button').forEach((b, k) => {
      if (urls[k]) b.style.backgroundImage = `url(${urls[k]})`;
    });
    if (urls[current]) dot.style.backgroundImage = `url(${urls[current]})`;
  };
  const setFinish = (i) => {
    const f = finishes[i];
    bar.querySelectorAll('button').forEach((b, k) => b.setAttribute('aria-pressed', k === i ? 'true' : 'false'));
    $('finish-name').textContent = f.name;
    $('pill-name').textContent = f.name;
    current = i;
    dot.style.setProperty('--sw-a', f.swatch[0]);
    dot.style.setProperty('--sw-b', f.swatch[1]);
    if (swatchUrls[i]) dot.style.backgroundImage = `url(${swatchUrls[i]})`;
  };

  // --- valinnat ---
  const toggle = (id, key, cb) => {
    const el = $(id);
    el.addEventListener('click', () => {
      state[key] = !state[key];
      el.setAttribute('aria-pressed', String(state[key]));
      cb(state[key]);
    });
    return (on) => {
      state[key] = on;
      el.setAttribute('aria-pressed', String(on));
    };
  };
  const setExplode = toggle('tg-explode', 'explode', onExplode);
  const setSensors = toggle('tg-sensors', 'sensors', onSensors);
  const setDark = toggle('tg-dark', 'dark', onDark);

  // --- näkymät ---
  $('views').querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      close();
      // paneeli ehtii laskeutua ennen ajon alkua
      setTimeout(() => onSequence(b.dataset.seq), 180);
    });
  });

  // --- paneeli: avaus, sulkeminen, vetäminen ---
  // height the card takes from the bottom of the screen (card + its bottom margin)
  const sheetHeight = () => sheet.offsetHeight + 14;
  function open() {
    if (state.open) return;
    state.open = true;
    body.classList.add('sheet-open');
    sheet.setAttribute('aria-hidden', 'false');
    pill.setAttribute('aria-expanded', 'true');
    onSheet(true, sheetHeight());
  }
  function close() {
    if (!state.open) return;
    state.open = false;
    body.classList.remove('sheet-open');
    sheet.setAttribute('aria-hidden', 'true');
    pill.setAttribute('aria-expanded', 'false');
    sheet.style.transform = '';
    onSheet(false, 0);
  }
  pill.addEventListener('click', open);
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  let drag = null;
  sheet.addEventListener('pointerdown', (e) => {
    drag = { y: e.clientY, t: e.timeStamp, dy: 0, active: false, id: e.pointerId };
  });
  sheet.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y;
    if (!drag.active && dy > 6) {
      drag.active = true;
      sheet.classList.add('dragging');
      sheet.setPointerCapture(e.pointerId);
    }
    if (drag.active) {
      drag.dy = Math.max(0, dy);
      drag.v = drag.dy / Math.max(1, e.timeStamp - drag.t);
      sheet.style.transform = `translate(-50%, ${drag.dy}px)`;
    }
  });
  const endDrag = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.active) return;
    sheet.classList.remove('dragging');
    // vetämisen jälkeen ei klikkiä painikkeelle
    const block = (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    sheet.addEventListener('click', block, { capture: true, once: true });
    setTimeout(() => sheet.removeEventListener('click', block, { capture: true }), 50);
    if (d.dy > 70 || (d.v || 0) > 0.6) close();
    else sheet.style.transform = '';
  };
  sheet.addEventListener('pointerup', endDrag);
  sheet.addEventListener('pointercancel', endDrag);

  // --- ajon nimi alareunassa ---
  const seqlabel = $('seqlabel');
  let seqTimer = 0;
  const showSequence = (name) => {
    body.classList.add('seq');
    $('seqname').textContent = name;
    seqlabel.classList.add('on');
    clearTimeout(seqTimer);
    seqTimer = setTimeout(() => seqlabel.classList.remove('on'), 2600);
  };
  const hideSequence = () => {
    body.classList.remove('seq');
    seqlabel.classList.remove('on');
  };

  // --- showcase progress: thin line, null hides it ---
  const progress = $('progress');
  const fill = progress.firstElementChild;
  let progressOn = false;
  const setProgress = (p) => {
    const on = p != null;
    if (on !== progressOn) {
      progressOn = on;
      progress.classList.toggle('on', on);
    }
    if (on) fill.style.transform = `scaleX(${p.toFixed(4)})`;
  };

  return {
    setFinish,
    setSwatchImages,
    setExplode,
    setSensors,
    setDark,
    open,
    close,
    get isOpen() {
      return state.open;
    },
    sheetHeight,
    showSequence,
    setProgress,
    hideSequence,
  };
}
