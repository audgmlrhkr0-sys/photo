// ── State ──
const state = {
  photos: [],
  selected: [],
  stream: null,
  isShooting: false,
  demoMode: false,
  stickers: [],
  selectedStickerId: null,
  history: [],
  stickerIdCounter: 0,
  filterType: 'original',
};

const FILTER_STYLES = {
  original: 'none',
  bright: 'brightness(1.2) contrast(1.05)',
  bw: 'grayscale(1)',
};

const COUNTDOWN_SEC = 3;
const TOTAL_SHOTS = 6;

// ── DOM refs ──
const screens = {
  entrance: document.getElementById('screen-entrance'),
  shoot: document.getElementById('screen-shoot'),
  select: document.getElementById('screen-select'),
  filter: document.getElementById('screen-filter'),
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

const penCanvas = document.createElement('canvas');
let baseStripCanvas = null;

// ── Screen navigation ──
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Beep ──
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

// ── Demo mode ──
const DEMO_GRADIENTS = [
  ['#1a1a1a', '#333'],
  ['#0d0d0d', '#222'],
  ['#111', '#2a2a2a'],
  ['#0a0a0a', '#1c1c1c'],
  ['#141414', '#2c2c2c'],
  ['#0f0f0f', '#252525'],
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

  if (isPreview) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, h - 80, w, 80);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 36px "Noto Sans KR", sans-serif';
    ctx.fillText('체험 촬영', w / 2, h - 40);

    ctx.font = '24px "Noto Sans KR", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('촬영하기를 눌러 시작하세요', w / 2, 48);
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
  if (!navigator.mediaDevices?.getUserMedia) return false;
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
  state.demoMode = useDemo;
  state.photos = [];
  state.selected = [];
  resetShootUI();
  showScreen('shoot');

  if (useDemo) {
    startDemoMode();
    return;
  }

  const ok = await startCamera();
  if (!ok) {
    startDemoMode();
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

function resetShootUI() {
  document.getElementById('btn-shoot').classList.remove('hidden');
  document.getElementById('btn-shoot').disabled = false;
  document.getElementById('btn-shoot').textContent = '📷 촬영하기';
  document.getElementById('btn-to-select').classList.add('hidden');
  thumbStrip.innerHTML = '';
  shootCount.textContent = '0 / 6';
}

// ── Auto shoot 6 photos ──
async function runCountdown() {
  countdownOverlay.classList.remove('hidden');
  for (let i = COUNTDOWN_SEC; i >= 1; i--) {
    countdownNumber.textContent = i;
    countdownNumber.style.animation = 'none';
    void countdownNumber.offsetWidth;
    countdownNumber.style.animation = 'pulse 1s ease-in-out';
    await sleep(1000);
  }
  countdownOverlay.classList.add('hidden');
}

async function startAutoShoot() {
  if (state.isShooting || state.photos.length >= TOTAL_SHOTS) return;

  state.isShooting = true;
  const btnShoot = document.getElementById('btn-shoot');
  btnShoot.disabled = true;
  btnShoot.textContent = '촬영 중...';

  while (state.photos.length < TOTAL_SHOTS) {
    await runCountdown();
    playBeep();
    flashEffect();

    state.photos.push(capturePhoto());
    updateShootUI();

    if (state.demoMode && state.photos.length < TOTAL_SHOTS) {
      drawDemoFrame(demoPreview, state.photos.length + 1, true);
    }

    if (state.photos.length < TOTAL_SHOTS) {
      await sleep(400);
    }
  }

  state.isShooting = false;
  btnShoot.classList.add('hidden');
  document.getElementById('btn-to-select').classList.remove('hidden');
}

function updateShootUI() {
  shootCount.textContent = `${state.photos.length} / ${TOTAL_SHOTS}`;
  thumbStrip.innerHTML = state.photos
    .map((src, i) => `<img src="${src}" alt="촬영 ${i + 1}">`)
    .join('');
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
  } else if (state.selected.length < 4) {
    state.selected.push(idx);
  }
  updateSelectUI();
}

function updateSelectUI() {
  document.querySelectorAll('.photo-item').forEach(el => {
    const idx = parseInt(el.dataset.idx, 10);
    const order = state.selected.indexOf(idx);
    el.classList.toggle('selected', order !== -1);
    el.querySelector('.select-badge').textContent = order !== -1 ? order + 1 : '';
  });

  selectCount.textContent = `${state.selected.length} / 4 선택됨`;

  stripPreview.querySelectorAll('.strip-slot').forEach((slot, i) => {
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

  document.getElementById('btn-to-filter').disabled = state.selected.length !== 4;
}

// ── Frame loading & detection ──
let cachedFrameData = null;

function detectFrameHoles(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, w, h).data;

  const sampleXs = [Math.floor(w * 0.25), Math.floor(w * 0.5), Math.floor(w * 0.75)];
  const whiteY = new Array(h).fill(false);
  for (let y = 0; y < h; y++) {
    let count = 0;
    for (const x of sampleXs) {
      const idx = (y * w + x) * 4;
      if (data[idx] > 240 && data[idx + 1] > 240 && data[idx + 2] > 240) count++;
    }
    whiteY[y] = count >= 2;
  }

  const bands = [];
  let start = -1;
  for (let y = 0; y < h; y++) {
    if (whiteY[y] && start === -1) start = y;
    if (!whiteY[y] && start !== -1) {
      if (y - start > h * 0.04) bands.push({ y1: start, y2: y - 1 });
      start = -1;
    }
  }
  if (start !== -1 && h - start > h * 0.04) bands.push({ y1: start, y2: h - 1 });

  if (bands.length === 0) {
    return Array.from({ length: 4 }, (_, i) => ({
      x: 0, y: Math.floor(h * i / 4), w, h: Math.floor(h / 4),
    }));
  }

  const fourBands = bands
    .sort((a, b) => (b.y2 - b.y1) - (a.y2 - a.y1))
    .slice(0, 4)
    .sort((a, b) => a.y1 - b.y1);

  return fourBands.map(band => {
    const midY = Math.floor((band.y1 + band.y2) / 2);
    let x1 = 0, x2 = w - 1;
    for (let x = 0; x < w; x++) {
      const idx = (midY * w + x) * 4;
      if (data[idx] > 240 && data[idx + 1] > 240 && data[idx + 2] > 240) { x1 = x; break; }
    }
    for (let x = w - 1; x >= 0; x--) {
      const idx = (midY * w + x) * 4;
      if (data[idx] > 240 && data[idx + 1] > 240 && data[idx + 2] > 240) { x2 = x; break; }
    }
    return { x: x1, y: band.y1, w: x2 - x1 + 1, h: band.y2 - band.y1 + 1 };
  });
}

async function loadFrameCanvas() {
  if (cachedFrameData) return cachedFrameData;
  try {
    const img = await loadImage('F.jpg');
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const holes = detectFrameHoles(canvas);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240) d[i + 3] = 0;
    }
    ctx.putImageData(imageData, 0, 0);

    cachedFrameData = { canvas, holes };
    return cachedFrameData;
  } catch (_) {
    return null;
  }
}

// ── Decorate: build strip ──
function loadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = src;
  });
}

async function buildBaseStripCanvas() {
  const frame = await loadFrameCanvas();

  if (!frame) {
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

  const { canvas: frameCvs, holes } = frame;
  const offscreen = document.createElement('canvas');
  offscreen.width = frameCvs.width;
  offscreen.height = frameCvs.height;
  const ctx = offscreen.getContext('2d');

  for (let i = 0; i < Math.min(4, holes.length, state.selected.length); i++) {
    const hole = holes[i];
    const img = await loadImage(state.photos[state.selected[i]]);
    const holeAspect = hole.w / hole.h;
    const imgAspect = img.width / img.height;
    let sx, sy, sw, sh;
    if (imgAspect > holeAspect) {
      sh = img.height; sw = sh * holeAspect;
      sx = (img.width - sw) / 2; sy = 0;
    } else {
      sw = img.width; sh = sw / holeAspect;
      sx = 0; sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, hole.x, hole.y, hole.w, hole.h);
  }

  ctx.drawImage(frameCvs, 0, 0);
  return offscreen;
}

async function buildStripCanvas() {
  const base = await buildBaseStripCanvas();
  if (!state.filterType || state.filterType === 'original') return base;

  const offscreen = document.createElement('canvas');
  offscreen.width = base.width;
  offscreen.height = base.height;
  const ctx = offscreen.getContext('2d');
  ctx.filter = FILTER_STYLES[state.filterType] || 'none';
  ctx.drawImage(base, 0, 0);
  ctx.filter = 'none';
  return offscreen;
}

async function initDecorateScreen() {
  baseStripCanvas = await buildStripCanvas();
  drawCanvas.width = baseStripCanvas.width;
  drawCanvas.height = baseStripCanvas.height;
  penCanvas.width = baseStripCanvas.width;
  penCanvas.height = baseStripCanvas.height;

  const pctx = penCanvas.getContext('2d');
  pctx.clearRect(0, 0, penCanvas.width, penCanvas.height);

  state.stickers = [];
  state.selectedStickerId = null;
  state.stickerIdCounter = 0;
  state.history = [snapshotState()];
  currentTool = 'pen';
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.tool-btn[data-tool="pen"]').classList.add('active');
  updateStickerEditPanel();
  updateEmailQuotaUI();
  renderDecorateCanvas();
}

function getMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getEmailUsage() {
  return parseInt(localStorage.getItem(`insamnetcut_email_${getMonthKey()}`) || '0', 10);
}

function getEmailLimit() {
  return window.EMAIL_CONFIG?.monthlyEmailLimit ?? 200;
}

function getEmailRemaining() {
  return Math.max(0, getEmailLimit() - getEmailUsage());
}

function canSendEmail() {
  return getEmailUsage() < getEmailLimit();
}

function incrementEmailUsage() {
  localStorage.setItem(`insamnetcut_email_${getMonthKey()}`, String(getEmailUsage() + 1));
}

function updateEmailQuotaUI() {
  const quotaEl = document.getElementById('email-quota');
  const btn = document.getElementById('btn-email');
  if (!quotaEl || !btn) return;

  const remaining = getEmailRemaining();
  const limit = getEmailLimit();
  quotaEl.textContent = `이번 달 전송 가능: ${remaining} / ${limit}통`;

  if (remaining <= 0) {
    quotaEl.style.color = '#f87171';
    btn.disabled = true;
    btn.title = '이번 달 무료 한도를 모두 사용했습니다';
  } else {
    quotaEl.style.color = '';
    btn.disabled = false;
    btn.title = '';
  }
}

function snapshotState() {
  return {
    pen: penCanvas.toDataURL(),
    stickers: JSON.parse(JSON.stringify(state.stickers)),
  };
}

function saveHistory() {
  state.history.push(snapshotState());
}

// ── Drawing & stickers ──
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let currentColor = '#39FF14';
let brushSize = 8;
let currentTool = 'pen';
let selectedEmoji = '😊';
let defaultStickerSize = 48;

let dragMode = null;
let dragStickerId = null;
let dragStart = { x: 0, y: 0 };
let dragOrig = { x: 0, y: 0, size: 0 };

const COLORS = [
  '#39FF14', '#FFE600', '#ffffff', '#000000',
  '#ff4444', '#ff8800', '#00ccff', '#cc44ff',
  '#ff69b4', '#aaaaaa',
];

const STICKERS = [
  '😊', '😍', '🥳', '😘', '🤭', '😎', '🥰', '😂', '😭',
  '❤️', '💖', '💕', '✨', '⭐', '💫', '🌸', '🎀', '🦋',
  '🌈', '☁️', '🎉', '🎈', '👑', '✌️', '💯', '🐱', '🐶',
  '🐰', '🍀', '🌙',
];

function syncStickerIdCounter() {
  state.stickerIdCounter = state.stickers.reduce((max, s) => Math.max(max, s.id), 0);
}

function getStickerById(id) {
  return state.stickers.find(s => s.id === id);
}

function findStickerAt(x, y) {
  for (let i = state.stickers.length - 1; i >= 0; i--) {
    const s = state.stickers[i];
    if (Math.hypot(x - s.x, y - s.y) <= s.size / 2) return s;
  }
  return null;
}

function getResizeHandlePos(s) {
  const rad = ((s.rotation || 0) * Math.PI) / 180;
  const half = s.size / 2;
  return {
    x: s.x + half * (Math.cos(rad) - Math.sin(rad)),
    y: s.y + half * (Math.sin(rad) + Math.cos(rad)),
  };
}

function getRotateHandlePos(s) {
  const rad = ((s.rotation || 0) * Math.PI) / 180;
  const dist = s.size / 2 + 22;
  return {
    x: s.x + dist * Math.sin(rad),
    y: s.y - dist * Math.cos(rad),
  };
}

function isOnResizeHandle(s, x, y) {
  const h = getResizeHandlePos(s);
  return Math.hypot(x - h.x, y - h.y) <= 14;
}

function isOnRotateHandle(s, x, y) {
  const h = getRotateHandlePos(s);
  return Math.hypot(x - h.x, y - h.y) <= 14;
}

function addSticker(x, y) {
  const id = ++state.stickerIdCounter;
  state.stickers.push({
    id,
    emoji: selectedEmoji,
    x,
    y,
    size: defaultStickerSize,
    rotation: 0,
  });
  state.selectedStickerId = id;
  updateStickerEditPanel();
  saveHistory();
  renderDecorateCanvas();
}

function updateStickerEditPanel() {
  const panel = document.getElementById('sticker-edit');
  const s = getStickerById(state.selectedStickerId);
  if (!s) {
    panel.classList.add('hidden');
    return;
  }
  panel.classList.remove('hidden');
}

function renderDecorateCanvas(showHandles = true) {
  const ctx = drawCanvas.getContext('2d');
  ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  ctx.drawImage(baseStripCanvas, 0, 0);
  ctx.drawImage(penCanvas, 0, 0);

  state.stickers.forEach(s => {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(((s.rotation || 0) * Math.PI) / 180);
    ctx.font = `${s.size}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.emoji, 0, 0);
    ctx.restore();
  });

  if (showHandles && state.selectedStickerId) {
    const s = getStickerById(state.selectedStickerId);
    if (s) {
      const half = s.size / 2;
      const rad = ((s.rotation || 0) * Math.PI) / 180;

      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(rad);
      ctx.strokeStyle = '#39FF14';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(-half, -half, s.size, s.size);
      ctx.setLineDash([]);
      ctx.restore();

      const rh = getResizeHandlePos(s);
      ctx.fillStyle = '#39FF14';
      ctx.beginPath();
      ctx.arc(rh.x, rh.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      const rot = getRotateHandlePos(s);
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(57, 255, 20, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(rot.x, rot.y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#FFE600';
      ctx.beginPath();
      ctx.arc(rot.x, rot.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
}

function getExportDataUrl(mime = 'image/png', quality) {
  const prev = state.selectedStickerId;
  state.selectedStickerId = null;
  renderDecorateCanvas(false);
  const url = quality !== undefined
    ? drawCanvas.toDataURL(mime, quality)
    : drawCanvas.toDataURL(mime);
  state.selectedStickerId = prev;
  renderDecorateCanvas(true);
  return url;
}

function getEmailJsError(err) {
  if (typeof err?.text === 'string') return err.text;
  if (typeof err?.message === 'string') return err.message;
  return '알 수 없는 오류';
}

async function uploadPhotoToImgbb(dataUrl) {
  const key = window.EMAIL_CONFIG?.imgbbKey?.trim();
  if (!key) {
    throw new Error('IMGbb_KEY_MISSING');
  }

  const base64 = dataUrl.split(',')[1];
  const formData = new FormData();
  formData.append('image', base64);

  const res = await fetch(
    `https://api.imgbb.com/1/upload?key=${encodeURIComponent(key)}&expiration=604800`,
    { method: 'POST', body: formData }
  );
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error?.message || 'ImgBB 업로드 실패');
  }
  return json.data.url;
}

function updateDrawCursor() {
  if (currentTool === 'eraser') drawCanvas.style.cursor = 'cell';
  else if (currentTool === 'sticker') drawCanvas.style.cursor = 'copy';
  else drawCanvas.style.cursor = 'crosshair';
}

function initColorPalette() {
  // Palette swatches removed; handle custom color input only
  document.getElementById('custom-color').addEventListener('input', e => {
    currentColor = e.target.value;
    currentTool = 'pen';
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.tool-btn[data-tool="pen"]').classList.add('active');
    updateDrawCursor();
  });
}

function initStickerPalette() {
  const palette = document.getElementById('sticker-palette');
  STICKERS.forEach((emoji, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sticker-btn' + (i === 0 ? ' active' : '');
    btn.textContent = emoji;
    btn.title = emoji;
    btn.addEventListener('click', () => {
      selectedEmoji = emoji;
      currentTool = 'sticker';
      document.querySelectorAll('.sticker-btn').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      updateDrawCursor();
    });
    palette.appendChild(btn);
  });

  document.getElementById('btn-delete-sticker').addEventListener('click', () => {
    if (!state.selectedStickerId) return;
    state.stickers = state.stickers.filter(s => s.id !== state.selectedStickerId);
    state.selectedStickerId = null;
    updateStickerEditPanel();
    saveHistory();
    renderDecorateCanvas();
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

function onPointerDown(e) {
  e.preventDefault();
  const pos = getCanvasPos(e);

  if (currentTool === 'sticker') {
    const selected = getStickerById(state.selectedStickerId);
    if (selected) {
      if (isOnRotateHandle(selected, pos.x, pos.y)) {
        dragMode = 'rotate';
        dragStickerId = selected.id;
        return;
      }
      if (isOnResizeHandle(selected, pos.x, pos.y)) {
        dragMode = 'resize';
        dragStickerId = selected.id;
        dragStart = { x: pos.x, y: pos.y };
        dragOrig = { x: selected.x, y: selected.y, size: selected.size };
        return;
      }
    }

    const hit = findStickerAt(pos.x, pos.y);
    if (hit) {
      state.selectedStickerId = hit.id;
      dragMode = 'move';
      dragStickerId = hit.id;
      dragStart = { x: pos.x, y: pos.y };
      dragOrig = { x: hit.x, y: hit.y, size: hit.size };
      updateStickerEditPanel();
      renderDecorateCanvas();
      return;
    }

    addSticker(pos.x, pos.y);
    return;
  }

  isDrawing = true;
  lastX = pos.x;
  lastY = pos.y;

  if (currentTool === 'pen' || currentTool === 'eraser') {
    const ctx = penCanvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushSize;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(pos.x + 0.1, pos.y + 0.1);
    ctx.strokeStyle = currentTool === 'eraser' ? 'rgba(0,0,0,1)' : currentColor;
    ctx.globalCompositeOperation = currentTool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.stroke();
    renderDecorateCanvas();
  }
}

function onPointerMove(e) {
  e.preventDefault();
  const pos = getCanvasPos(e);

  if (dragMode === 'rotate') {
    const s = getStickerById(dragStickerId);
    if (!s) return;
    const dx = pos.x - s.x;
    const dy = pos.y - s.y;
    s.rotation = Math.atan2(dx, -dy) * 180 / Math.PI;
    renderDecorateCanvas();
    return;
  }

  if (dragMode === 'move') {
    const s = getStickerById(dragStickerId);
    if (!s) return;
    s.x = dragOrig.x + (pos.x - dragStart.x);
    s.y = dragOrig.y + (pos.y - dragStart.y);
    renderDecorateCanvas();
    return;
  }

  if (dragMode === 'resize') {
    const s = getStickerById(dragStickerId);
    if (!s) return;
    const delta = Math.max(pos.x - dragStart.x, pos.y - dragStart.y);
    s.size = Math.min(120, Math.max(24, dragOrig.size + delta));
    renderDecorateCanvas();
    return;
  }

  if (!isDrawing) return;

  const ctx = penCanvas.getContext('2d');
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
  renderDecorateCanvas();
}

function onPointerUp() {
  if (dragMode) {
    dragMode = null;
    dragStickerId = null;
    saveHistory();
    return;
  }
  if (!isDrawing) return;
  isDrawing = false;
  saveHistory();
}

function initDrawing() {
  drawCanvas.addEventListener('mousedown', onPointerDown);
  drawCanvas.addEventListener('mousemove', onPointerMove);
  drawCanvas.addEventListener('mouseup', onPointerUp);
  drawCanvas.addEventListener('mouseleave', onPointerUp);

  drawCanvas.addEventListener('touchstart', onPointerDown, { passive: false });
  drawCanvas.addEventListener('touchmove', onPointerMove, { passive: false });
  drawCanvas.addEventListener('touchend', onPointerUp);

  document.getElementById('brush-size').addEventListener('input', e => {
    brushSize = parseInt(e.target.value, 10);
    document.getElementById('brush-size-label').textContent = `${brushSize}px`;
  });

  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTool = btn.dataset.tool;
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (currentTool !== 'sticker') state.selectedStickerId = null;
      updateStickerEditPanel();
      updateDrawCursor();
      renderDecorateCanvas();
    });
  });

  document.getElementById('btn-undo').addEventListener('click', () => {
    if (state.history.length <= 1) return;
    state.history.pop();
    const prev = state.history[state.history.length - 1];
    const img = new Image();
    img.onload = () => {
      const pctx = penCanvas.getContext('2d');
      pctx.clearRect(0, 0, penCanvas.width, penCanvas.height);
      pctx.drawImage(img, 0, 0);
      state.stickers = JSON.parse(JSON.stringify(prev.stickers));
      state.selectedStickerId = null;
      syncStickerIdCounter();
      updateStickerEditPanel();
      renderDecorateCanvas();
    };
    img.src = prev.pen;
  });

  document.getElementById('btn-clear-draw').addEventListener('click', async () => {
    await initDecorateScreen();
  });
}

// ── Save & email ──
function isEmailConfigured() {
  const c = window.EMAIL_CONFIG;
  return c?.enabled && c.publicKey && c.serviceId && c.templateId && c.imgbbKey?.trim()
    && !c.publicKey.includes('YOUR_')
    && !c.serviceId.includes('YOUR_')
    && !c.templateId.includes('YOUR_');
}

function downloadResult() {
  const link = document.createElement('a');
  link.download = `인생네컷_${Date.now()}.png`;
  link.href = getExportDataUrl();
  link.click();
}

async function sendEmail() {
  const email = document.getElementById('email-input').value.trim();
  if (!email) {
    alert('이메일 주소를 입력해 주세요.');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    alert('올바른 이메일 형식을 입력해 주세요.');
    return;
  }

  if (!isEmailConfigured()) {
    const missingImgbb = !window.EMAIL_CONFIG?.imgbbKey?.trim();
    alert(
      missingImgbb
        ? 'ImgBB API Key가 필요합니다.\n\n' +
          '1. https://api.imgbb.com/ 접속 → Get API Key (무료)\n' +
          '2. email-config.js 의 imgbbKey 에 붙여넣기\n' +
          '3. EmailJS 템플릿 Content에 {{photo_url}} 추가\n' +
          '4. 사이트 새로고침'
        : '이메일 전송 설정을 확인해 주세요.\n(email-config.js)'
    );
    return;
  }

  if (!canSendEmail()) {
    alert(
      `이번 달 무료 이메일 한도(${getEmailLimit()}통)를 모두 사용했습니다.\n\n` +
      '· 💾 저장하기로 사진을 받을 수 있습니다\n' +
      '· 다음 달 1일부터 다시 전송 가능\n' +
      '· 자동 결제·과금은 없습니다'
    );
    updateEmailQuotaUI();
    return;
  }

  const btn = document.getElementById('btn-email');
  const prevText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '전송 중...';

  try {
    const cfg = window.EMAIL_CONFIG;
    emailjs.init(cfg.publicKey);

    btn.textContent = '사진 업로드 중...';
    const jpegDataUrl = getExportDataUrl('image/jpeg', 0.85);
    const photoUrl = await uploadPhotoToImgbb(jpegDataUrl);

    btn.textContent = '메일 전송 중...';
    const messageBody =
      '인생네컷 포토부스에서 만든 4컷 사진입니다!\n' +
      '아래 링크를 눌러 다운로드하세요.\n\n' +
      `📸 사진 다운로드:\n${photoUrl}`;

    await emailjs.send(cfg.serviceId, cfg.templateId, {
      to_email: email,
      email,
      name: '인생네컷',
      subject: '인생네컷 4컷 사진 📸',
      message: messageBody,
      photo_url: photoUrl,
    });

    incrementEmailUsage();
    updateEmailQuotaUI();
    alert(`${email} 으로 사진 링크를 보냈습니다!\n메일함(스팸함 포함)을 확인해 주세요.`);
  } catch (err) {
    console.error(err);
    const detail = getEmailJsError(err);
    const isQuota = /quota|limit|exceeded|402|403/i.test(detail);
    const isImgbb = err?.message === 'IMGbb_KEY_MISSING' || detail.includes('ImgBB');
    const retry = confirm(
      (isQuota
        ? `이번 달 EmailJS 무료 한도에 도달했습니다.\n(자동 과금 없음)\n\n💾 저장하기를 이용해 주세요.`
        : isImgbb
        ? 'ImgBB API Key를 email-config.js 에 입력해 주세요.\n(https://api.imgbb.com/)'
        : `전송 실패: ${detail}\n\n` +
          '· EmailJS 템플릿 To Email: {{to_email}}\n' +
          '· Content에 {{photo_url}} 추가\n' +
          '· imgbbKey 설정 확인') +
      '\n\n사진을 저장하고 메일 앱으로 보낼까요?'
    );
    if (retry) {
      downloadResult();
      const subject = encodeURIComponent('인생네컷 4컷 사진');
      const body = encodeURIComponent('인생네컷 4컷 사진을 첨부합니다.');
      window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
    }
  } finally {
    btn.textContent = prevText;
    updateEmailQuotaUI();
  }
}

// ── Filter Screen ──
async function initFilterScreen() {
  const previewImg = document.getElementById('filter-preview-img');
  previewImg.src = '';
  previewImg.style.filter = 'none';

  document.querySelectorAll('.filter-opt').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === state.filterType);
  });

  const base = await buildBaseStripCanvas();
  const baseUrl = base.toDataURL('image/jpeg', 0.9);

  previewImg.src = baseUrl;
  previewImg.style.filter = FILTER_STYLES[state.filterType] || 'none';

  ['original', 'bright', 'bw'].forEach(key => {
    const thumb = document.getElementById(`filter-thumb-${key}`);
    if (thumb) thumb.src = baseUrl;
  });
}

// ── Retake ──
async function retake() {
  stopCamera();
  state.selected = [];
  state.filterType = 'original';
  state.isShooting = false;
  cachedFrameData = null; // re-detect on new session (frame file might change)
  const wasDemo = state.demoMode;
  await enterShoot(wasDemo);
}

// ── Event bindings ──
document.getElementById('btn-enter').addEventListener('click', () => enterShoot(false));
document.getElementById('btn-shoot').addEventListener('click', startAutoShoot);

document.getElementById('btn-to-select').addEventListener('click', () => {
  stopCamera();
  renderPhotoGrid();
  showScreen('select');
});

document.getElementById('btn-to-filter').addEventListener('click', () => {
  showScreen('filter');
  initFilterScreen();
});

document.querySelectorAll('.filter-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    state.filterType = btn.dataset.filter;
    document.querySelectorAll('.filter-opt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const previewImg = document.getElementById('filter-preview-img');
    previewImg.style.filter = FILTER_STYLES[state.filterType] || 'none';
  });
});

document.getElementById('btn-filter-to-decorate').addEventListener('click', async () => {
  await initDecorateScreen();
  showScreen('decorate');
});

document.getElementById('btn-download').addEventListener('click', downloadResult);
document.getElementById('btn-email').addEventListener('click', sendEmail);
document.getElementById('btn-retake').addEventListener('click', retake);

initColorPalette();
initStickerPalette();
initDrawing();
