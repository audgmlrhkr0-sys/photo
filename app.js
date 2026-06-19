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
};

const COUNTDOWN_SEC = 3;
const TOTAL_SHOTS = 6;

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

  if (isPreview) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, h - 80, w, 80);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 36px "Noto Sans KR", sans-serif';
    ctx.fillText('데모 카메라 미리보기', w / 2, h - 40);

    ctx.font = '24px "Noto Sans KR", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('촬영하기를 누르면 3초 간격으로 6장 촬영됩니다', w / 2, 48);
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
    const tryDemo = confirm(
      '카메라를 사용할 수 없습니다.\n\n데모 모드로 전체 흐름을 테스트할까요?'
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

  document.getElementById('btn-to-decorate').disabled = state.selected.length !== 4;
}

// ── Decorate: build strip ──
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
  renderDecorateCanvas();
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
let currentColor = '#ff6b9d';
let brushSize = 8;
let currentTool = 'pen';
let selectedEmoji = '😊';
let defaultStickerSize = 48;

let dragMode = null;
let dragStickerId = null;
let dragStart = { x: 0, y: 0 };
let dragOrig = { x: 0, y: 0, size: 0 };

const COLORS = [
  '#ff6b9d', '#ffffff', '#000000', '#ffd700',
  '#c084fc', '#60a5fa', '#34d399', '#f97316',
  '#ef4444', '#a3e635',
];

const STICKERS = [
  '😊', '😍', '🥳', '😘', '🤭', '😎', '🥰', '😂',
  '❤️', '💖', '💕', '✨', '⭐', '💫', '🌸', '🎀',
  '🦋', '🌈', '☁️', '🎉', '🎈', '👑', '✌️', '💯',
  '🐱', '🐶', '🐰', '🍀', '🌙', '🔥', '💗', '🫶',
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
  return { x: s.x + s.size / 2, y: s.y + s.size / 2 };
}

function isOnResizeHandle(s, x, y) {
  const h = getResizeHandlePos(s);
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
  const slider = document.getElementById('selected-sticker-size');
  slider.value = s.size;
  document.getElementById('selected-sticker-size-label').textContent = `${s.size}px`;
}

function renderDecorateCanvas(showHandles = true) {
  const ctx = drawCanvas.getContext('2d');
  ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  ctx.drawImage(baseStripCanvas, 0, 0);
  ctx.drawImage(penCanvas, 0, 0);

  state.stickers.forEach(s => {
    ctx.font = `${s.size}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.emoji, s.x, s.y);
  });

  if (showHandles && state.selectedStickerId) {
    const s = getStickerById(state.selectedStickerId);
    if (s) {
      const half = s.size / 2;
      ctx.strokeStyle = '#ff6b9d';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(s.x - half, s.y - half, s.size, s.size);
      ctx.setLineDash([]);

      const h = getResizeHandlePos(s);
      ctx.fillStyle = '#ff6b9d';
      ctx.beginPath();
      ctx.arc(h.x, h.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

function getExportDataUrl() {
  const prev = state.selectedStickerId;
  state.selectedStickerId = null;
  renderDecorateCanvas(false);
  const url = drawCanvas.toDataURL('image/png');
  state.selectedStickerId = prev;
  renderDecorateCanvas(true);
  return url;
}

function updateDrawCursor() {
  if (currentTool === 'eraser') drawCanvas.style.cursor = 'cell';
  else if (currentTool === 'sticker') drawCanvas.style.cursor = 'copy';
  else drawCanvas.style.cursor = 'crosshair';
}

function initColorPalette() {
  const palette = document.getElementById('color-palette');
  COLORS.forEach((color, i) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'color-swatch' + (i === 0 ? ' active' : '');
    swatch.style.background = color;
    swatch.addEventListener('click', () => {
      currentColor = color;
      currentTool = 'pen';
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('.tool-btn[data-tool="pen"]').classList.add('active');
      updateDrawCursor();
    });
    palette.appendChild(swatch);
  });

  document.getElementById('custom-color').addEventListener('input', e => {
    currentColor = e.target.value;
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
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

  document.getElementById('selected-sticker-size').addEventListener('input', e => {
    const s = getStickerById(state.selectedStickerId);
    if (!s) return;
    s.size = parseInt(e.target.value, 10);
    document.getElementById('selected-sticker-size-label').textContent = `${s.size}px`;
    renderDecorateCanvas();
  });

  document.getElementById('selected-sticker-size').addEventListener('change', () => {
    saveHistory();
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
    if (selected && isOnResizeHandle(selected, pos.x, pos.y)) {
      dragMode = 'resize';
      dragStickerId = selected.id;
      dragStart = { x: pos.x, y: pos.y };
      dragOrig = { x: selected.x, y: selected.y, size: selected.size };
      return;
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
    document.getElementById('selected-sticker-size').value = s.size;
    document.getElementById('selected-sticker-size-label').textContent = `${s.size}px`;
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
  return c?.enabled && c.publicKey && c.serviceId && c.templateId
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
    alert(
      '이메일 자동 전송 설정이 필요합니다.\n\n' +
      'email-config.js 파일을 열어 EmailJS 정보를 입력해 주세요.\n' +
      '(부스 운영자가 1번만 설정하면, 방문객은 인증 없이 바로 받습니다)'
    );
    return;
  }

  const btn = document.getElementById('btn-email');
  const prevText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '전송 중...';

  try {
    const cfg = window.EMAIL_CONFIG;
    emailjs.init(cfg.publicKey);

    const dataUrl = getExportDataUrl();
    const base64 = dataUrl.split(',')[1];
    const filename = `인생네컷_${Date.now()}.png`;

    await emailjs.send(
      cfg.serviceId,
      cfg.templateId,
      {
        to_email: email,
        subject: '인생네컷 4컷 사진 📸',
        message: '인생네컷 포토부스에서 만든 4컷 사진입니다!',
      },
      {
        publicKey: cfg.publicKey,
        attachments: [{ name: filename, data: base64 }],
      }
    );

    alert(`${email} 으로 사진을 보냈습니다!\n메일함(스팸함 포함)을 확인해 주세요.`);
  } catch (err) {
    console.error(err);
    const retry = confirm(
      '자동 전송에 실패했습니다.\n\n' +
      '· 인터넷 연결 확인\n' +
      '· email-config.js 설정 확인\n' +
      '· EmailJS 템플릿 To Email이 {{to_email}} 인지 확인\n\n' +
      '사진을 저장하고 메일 앱으로 보낼까요?'
    );
    if (retry) {
      downloadResult();
      const subject = encodeURIComponent('인생네컷 4컷 사진');
      const body = encodeURIComponent('인생네컷 4컷 사진을 첨부합니다.');
      window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
    }
  } finally {
    btn.disabled = false;
    btn.textContent = prevText;
  }
}

// ── Retake ──
async function retake() {
  stopCamera();
  state.selected = [];
  state.isShooting = false;
  const wasDemo = state.demoMode;
  await enterShoot(wasDemo);
}

// ── Event bindings ──
document.getElementById('btn-enter').addEventListener('click', () => enterShoot(false));
document.getElementById('btn-demo').addEventListener('click', () => enterShoot(true));
document.getElementById('btn-shoot').addEventListener('click', startAutoShoot);

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
document.getElementById('btn-email').addEventListener('click', sendEmail);
document.getElementById('btn-retake').addEventListener('click', retake);

initColorPalette();
initStickerPalette();
initDrawing();
