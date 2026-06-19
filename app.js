// ── State ──
const state = {
  photos: [],
  selected: [],
  stream: null,
  isCountingDown: false,
  drawHistory: [],
  demoMode: false,
};

// ── DOM refs ──
const screens = {
  entrance: document.getElementById('screen-entrance'),
  shoot: document.getElementById('screen-shoot'),
  select: document.getElementById('screen-select'),
  decorate: document.getElementById('screen-decorate'),
};

const camera = document.getElementById('camera');
const demoPreview = document.getElementById('demo-preview');
const demoBadge = document.getElementById('demo-badge');
const captureCanvas = document.getElementById('capture-canvas');
const drawCanvas = document.getElementById('draw-canvas');
const countdownOverlay = document.getElementById('countdown-overlay');
const countdownNumber = document.getElementById('countdown-number');
const flashOverlay = document.getElementById('flash-overlay');
const shootCount = document.getElementById('shoot-count');
const thumbStrip = document.getElementById('thumb-strip');
const photoGrid = document.getElementById('photo-grid');
const stripPreview = document.getElementById('strip-preview');
const selectCount = document.getElementById('select-count');

// ── Screen navigation ──
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// ── Beep sound (Web Audio API) ──
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch (_) {}
}

// ── Demo mode (no camera) ──
const DEMO_GRADIENTS = [
  ['#ff6b9d', '#c084fc'],
  ['#60a5fa', '#34d399'],
  ['#f97316', '#ffd700'],
  ['#a78bfa', '#f472b6'],
  ['#38bdf8', '#818cf8'],
  ['#fb7185', '#fcd34d'],
];

function drawDemoFrame(canvas, shotNum, isPreview) {
  const w = 1280;
  const h = 720;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const [c1, c2] = DEMO_GRADIENTS[(shotNum - 1) % DEMO_GRADIENTS.length];

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.38, 120, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = '100px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🙂', w / 2, h * 0.38);

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, h - 80, w, 80);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 36px "Noto Sans KR", sans-serif';
  ctx.fillText(isPreview ? '데모 카메라 미리보기' : `SHOT ${shotNum}`, w / 2, h - 40);

  if (isPreview) {
    ctx.font = '24px "Noto Sans KR", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('촬영하기를 눌러 5초 후 촬영됩니다', w / 2, 48);
  }
}

function startDemoMode() {
  state.demoMode = true;
  camera.classList.add('hidden');
  demoPreview.classList.remove('hidden');
  demoBadge.classList.remove('hidden');
  drawDemoFrame(demoPreview, state.photos.length + 1, true);
}

function generateDemoPhoto() {
  const canvas = document.createElement('canvas');
  drawDemoFrame(canvas, state.photos.length + 1, false);
  return canvas.toDataURL('image/jpeg', 0.92);
}

// ── Camera ──
async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    startDemoMode();
    return false;
  }
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    });
    camera.srcObject = state.stream;
    camera.classList.remove('hidden');
    demoPreview.classList.add('hidden');
    demoBadge.classList.add('hidden');
    return true;
  } catch (_) {
    return false;
  }
}

async function enterShoot(useDemo) {
  state.demoMode = false;
  state.photos = [];
  updateShootUI();
  showScreen('shoot');

  if (useDemo) {
    startDemoMode();
    return;
  }

  const ok = await startCamera();
  if (!ok) {
    const tryDemo = confirm(
      '카메라를 사용할 수 없습니다.\n\n데모 모드로 전체 흐름을 테스트할까요?\n(가짜 사진 6장 → 4컷 선택 → 꾸미기)'
    );
    if (tryDemo) startDemoMode();
    else showScreen('entrance');
  }
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }
}

function capturePhoto() {
  if (state.demoMode) return generateDemoPhoto();

  const w = camera.videoWidth;
  const h = camera.videoHeight;
  captureCanvas.width = w;
  captureCanvas.height = h;
  const ctx = captureCanvas.getContext('2d');
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(camera, 0, 0, w, h);
  return captureCanvas.toDataURL('image/jpeg', 0.92);
}

function flashEffect() {
  flashOverlay.classList.add('flash');
  setTimeout(() => flashOverlay.classList.remove('flash'), 150);
}

// ── Countdown & shoot ──
async function startCountdown() {
  if (state.isCountingDown || state.photos.length >= 6) return;
  state.isCountingDown = true;
  document.getElementById('btn-shoot').disabled = true;

  countdownOverlay.classList.remove('hidden');

  for (let i = 5; i >= 1; i--) {
    countdownNumber.textContent = i;
    countdownNumber.style.animation = 'none';
    void countdownNumber.offsetWidth;
    countdownNumber.style.animation = 'pulse 1s ease-in-out';
    await sleep(1000);
  }

  countdownOverlay.classList.add('hidden');
  playBeep();
  flashEffect();

  const dataUrl = capturePhoto();
  state.photos.push(dataUrl);
  updateShootUI();

  if (state.demoMode && state.photos.length < 6) {
    drawDemoFrame(demoPreview, state.photos.length + 1, true);
  }

  state.isCountingDown = false;
  document.getElementById('btn-shoot').disabled = false;

  if (state.photos.length >= 6) {
    document.getElementById('btn-shoot').classList.add('hidden');
    document.getElementById('btn-to-select').classList.remove('hidden');
  }
}

function updateShootUI() {
  shootCount.textContent = `${state.photos.length} / 6`;
  thumbStrip.innerHTML = state.photos
    .map(src => `<img src="${src}" alt="촬영 ${state.photos.length}">`)
    .join('');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Selection ──
function renderPhotoGrid() {
  photoGrid.innerHTML = '';
  state.photos.forEach((src, idx) => {
    const div = document.createElement('div');
    div.className = 'photo-item';
    div.dataset.idx = idx;
    div.innerHTML = `<img src="${src}" alt="사진 ${idx + 1}"><div class="select-badge"></div>`;
    div.addEventListener('click', () => toggleSelect(idx));
    photoGrid.appendChild(div);
  });
  updateSelectUI();
}

function toggleSelect(idx) {
  const pos = state.selected.indexOf(idx);
  if (pos !== -1) {
    state.selected.splice(pos, 1);
  } else {
    if (state.selected.length >= 4) return;
    state.selected.push(idx);
  }
  updateSelectUI();
}

function updateSelectUI() {
  document.querySelectorAll('.photo-item').forEach(el => {
    const idx = parseInt(el.dataset.idx);
    const order = state.selected.indexOf(idx);
    el.classList.toggle('selected', order !== -1);
    const badge = el.querySelector('.select-badge');
    badge.textContent = order !== -1 ? order + 1 : '';
  });

  selectCount.textContent = `${state.selected.length} / 4 선택됨`;

  const slots = stripPreview.querySelectorAll('.strip-slot');
  slots.forEach((slot, i) => {
    slot.classList.remove('empty');
    slot.innerHTML = '';
    if (state.selected[i] !== undefined) {
      const img = document.createElement('img');
      img.src = state.photos[state.selected[i]];
      slot.appendChild(img);
    } else {
      slot.classList.add('empty');
    }
  });

  document.getElementById('btn-to-decorate').disabled = state.selected.length !== 4;
}

// ── Build strip canvas for decoration ──
function loadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = src;
  });
}

async function buildStripCanvas() {
  const stripW = 560;
  const photoH = Math.round(stripW * (3 / 4));
  const stripH = photoH * 4;

  const offscreen = document.createElement('canvas');
  offscreen.width = stripW;
  offscreen.height = stripH;
  const ctx = offscreen.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, stripW, stripH);

  for (let i = 0; i < state.selected.length; i++) {
    const img = await loadImage(state.photos[state.selected[i]]);
    ctx.drawImage(img, 0, i * photoH, stripW, photoH);
  }

  return offscreen;
}

async function initDecorateScreen() {
  const strip = await buildStripCanvas();
  drawCanvas.width = strip.width;
  drawCanvas.height = strip.height;

  const ctx = drawCanvas.getContext('2d');
  ctx.drawImage(strip, 0, 0);

  state.drawHistory = [drawCanvas.toDataURL()];
}

// ── Drawing ──
let isDrawing = false;
let lastX = 0, lastY = 0;
let currentColor = '#ff6b9d';
let brushSize = 8;
let currentTool = 'pen';

const COLORS = [
  '#ff6b9d', '#ffffff', '#000000', '#ffd700',
  '#c084fc', '#60a5fa', '#34d399', '#f97316',
  '#ef4444', '#a3e635',
];

function initColorPalette() {
  const palette = document.getElementById('color-palette');
  COLORS.forEach((color, i) => {
    const swatch = document.createElement('button');
    swatch.className = 'color-swatch' + (i === 0 ? ' active' : '');
    swatch.style.background = color;
    swatch.addEventListener('click', () => {
      currentColor = color;
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
    });
    palette.appendChild(swatch);
  });

  document.getElementById('custom-color').addEventListener('input', e => {
    currentColor = e.target.value;
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
  });
}

function getCanvasPos(e) {
  const rect = drawCanvas.getBoundingClientRect();
  const scaleX = drawCanvas.width / rect.width;
  const scaleY = drawCanvas.height / rect.height;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

function startDraw(e) {
  e.preventDefault();
  isDrawing = true;
  const pos = getCanvasPos(e);
  lastX = pos.x;
  lastY = pos.y;
}

function draw(e) {
  if (!isDrawing) return;
  e.preventDefault();
  const pos = getCanvasPos(e);
  const ctx = drawCanvas.getContext('2d');
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = brushSize;

  if (currentTool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = currentColor;
  }

  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();

  lastX = pos.x;
  lastY = pos.y;
}

function endDraw() {
  if (!isDrawing) return;
  isDrawing = false;
  state.drawHistory.push(drawCanvas.toDataURL());
}

function initDrawing() {
  drawCanvas.addEventListener('mousedown', startDraw);
  drawCanvas.addEventListener('mousemove', draw);
  drawCanvas.addEventListener('mouseup', endDraw);
  drawCanvas.addEventListener('mouseleave', endDraw);

  drawCanvas.addEventListener('touchstart', startDraw, { passive: false });
  drawCanvas.addEventListener('touchmove', draw, { passive: false });
  drawCanvas.addEventListener('touchend', endDraw);

  document.getElementById('brush-size').addEventListener('input', e => {
    brushSize = parseInt(e.target.value);
    document.getElementById('brush-size-label').textContent = `${brushSize}px`;
  });

  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTool = btn.dataset.tool;
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      drawCanvas.style.cursor = currentTool === 'eraser' ? 'cell' : 'crosshair';
    });
  });

  document.getElementById('btn-undo').addEventListener('click', () => {
    if (state.drawHistory.length <= 1) return;
    state.drawHistory.pop();
    const prev = state.drawHistory[state.drawHistory.length - 1];
    const img = new Image();
    img.onload = () => {
      const ctx = drawCanvas.getContext('2d');
      ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = prev;
  });

  document.getElementById('btn-clear-draw').addEventListener('click', () => {
    initDecorateScreen();
  });
}

// ── Download ──
function downloadResult() {
  const link = document.createElement('a');
  link.download = `인생네컷_${Date.now()}.png`;
  link.href = drawCanvas.toDataURL('image/png');
  link.click();
}

// ── Restart ──
function restart() {
  stopCamera();
  state.photos = [];
  state.selected = [];
  state.drawHistory = [];
  state.isCountingDown = false;
  state.demoMode = false;

  camera.classList.remove('hidden');
  demoPreview.classList.add('hidden');
  demoBadge.classList.add('hidden');

  document.getElementById('btn-shoot').classList.remove('hidden');
  document.getElementById('btn-shoot').disabled = false;
  document.getElementById('btn-to-select').classList.add('hidden');
  thumbStrip.innerHTML = '';
  shootCount.textContent = '0 / 6';

  showScreen('entrance');
}

// ── Event bindings ──
document.getElementById('btn-enter').addEventListener('click', () => enterShoot(false));
document.getElementById('btn-demo').addEventListener('click', () => enterShoot(true));

document.getElementById('btn-shoot').addEventListener('click', startCountdown);

document.getElementById('btn-to-select').addEventListener('click', () => {
  stopCamera();
  renderPhotoGrid();
  showScreen('select');
});

document.getElementById('btn-to-decorate').addEventListener('click', async () => {
  await initDecorateScreen();
  showScreen('decorate');
});

document.getElementById('btn-download').addEventListener('click', downloadResult);
document.getElementById('btn-restart').addEventListener('click', restart);

// ── Init ──
initColorPalette();
initDrawing();
