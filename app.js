import { ClipStack, COLORS, footer, panel, ledColors } from './game.js';
import { BadgeConnection, BadgeRenderer } from './badge.js';

const $ = id => document.getElementById(id);
const canvas = $('screen'), ctx = canvas.getContext('2d');
ctx.scale(2, 2);
const logo = new Image(); logo.src = './assets/wordmark-hd.png';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let mode = 'browser', connection = null, remote = null, remoteBusy = false, remoteActive = false;
let pendingAction = null, nextRemoteFrame = 0, connectionEpoch = 0, viewKey = '';
const storageKey = () => mode === 'browser' ? 'clip-stack:best:browser' : `clip-stack:best:badge:${$('badge-id').value.trim().toLowerCase()}`;
function loadBest() { try { return Number(localStorage.getItem(storageKey())) || 0; } catch { return 0; } }
function saveBest() { try { localStorage.setItem(storageKey(), String(game.best)); } catch {} }
let game = new ClipStack({ best: loadBest() });
game.introAt = performance.now();

function write(text, x, y, size = 14, color = COLORS.yellow, align = 'left') {
  ctx.fillStyle = color; ctx.font = `${size >= 20 ? 'bold ' : ''}${size}px Arial, sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'top'; ctx.fillText(text, x, y);
}
function block(x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }
function draw(now) {
  const s = game.snapshot();
  block(0, 0, 320, 240, COLORS.red);
  let logoY = 7;
  if (s.phase === 'intro') {
    const t = Math.min(1, Math.max(0, (now - s.introAt - 850) / 750));
    logoY = reducedMotion ? (t < 1 ? 92 : 7) : 92 - 85 * (1 - (1 - t) ** 3);
  }
  if (logo.complete && logo.naturalWidth) ctx.drawImage(logo, 60, logoY, 200, 57);
  else write('Clipboard', 160, logoY + 7, 32, COLORS.yellow, 'center');
  if (s.phase === 'intro') { write('CLIP STACK', 160, 166, 20, COLORS.yellow, 'center'); updateControls(s); return; }
  write(s.phase === 'ready' ? 'CLIP STACK' : `STACK ${s.score}`, 14, 72);
  write(`BEST ${s.best}`, 306, 72, 14, COLORS.yellow, 'right');
  if (s.phase !== 'ready') {
    block(56, 209, 208, 4, COLORS.ink);
    s.cards.forEach((c, i) => block(12 + c.x, 194 - i * 14, c.w, 12, COLORS.yellow));
    if (s.phase !== 'over') block(12 + s.x, 194 - s.cards.length * 14, s.w, 12, COLORS.white);
  }
  const content = panel(s);
  if (content) {
    block(20, 108, 280, 96, COLORS.ink);
    write(content[0], 160, 116, 22, COLORS.yellow, 'center');
    write(content[1], 160, 148, 14, COLORS.white, 'center');
    write(content[2], 160, 173, 14, COLORS.yellow, 'center');
  }
  write(footer(s), 160, 222, 12, COLORS.yellow, 'center');
  updateControls(s);
}

function updateControls(s) {
  const unavailable = mode === 'badge' && !remoteActive;
  const key = JSON.stringify([s.phase, s.score, s.best, s.streak, s.brightness, s.newBest, unavailable]);
  if (key === viewKey) return;
  viewKey = key;
  $('action-button').disabled = unavailable;
  $('pause-button').disabled = unavailable || !['play', 'pause'].includes(s.phase);
  $('action-label').textContent = unavailable ? 'Connect to play' : s.phase === 'play' ? 'Clip' : s.phase === 'pause' ? 'Resume' : s.phase === 'over' ? 'Again' : 'Play';
  $('pause-label').textContent = s.phase === 'pause' ? 'Resume' : 'Pause';
  $('game-status').textContent = s.phase === 'over' ? `${s.score} cards. ${s.newBest ? 'A new personal best!' : 'Ready for another try?'}` : s.phase === 'play' ? `${s.score} stacked${s.streak ? ` · ${s.streak} perfect in a row` : ''}` : s.phase === 'pause' ? 'Take your time. Your stack will wait.' : mode === 'badge' ? 'Keep this page open while your badge plays.' : 'Line it up. Make it count.';
  ledColors(s).forEach((rgb, i) => {
    const lit = rgb.some(v => v > 0), el = document.querySelector(`.led-${i}`);
    const color = `rgb(${rgb.map(v => Math.min(255, Math.round(v * 1.5))).join(',')})`;
    el.style.background = lit ? color : '#8d3a46';
    el.style.boxShadow = lit ? `0 0 10px ${color}` : 'none';
  });
}

function applyAction(action, position) {
  const result = game.act(action, performance.now(), position);
  if (result) saveBest();
  return result;
}

function action(name) {
  if (mode === 'badge') {
    if (!remoteActive) return;
    const position = remote.displayX;
    if (remoteBusy) { if (!pendingAction) pendingAction = { name, position }; return; }
    if (applyAction(name, position)) void refreshRemote();
  } else applyAction(name);
}

async function refreshRemote() {
  if (!remoteActive || remoteBusy) return;
  const epoch = connectionEpoch;
  remoteBusy = true;
  try {
    await remote.sync(game.snapshot());
    if (epoch !== connectionEpoch) return;
    nextRemoteFrame = performance.now() + 5;
  } catch (error) { if (epoch === connectionEpoch) failConnection(error); }
  finally {
    if (epoch === connectionEpoch) {
      remoteBusy = false;
      if (pendingAction && remoteActive) {
        const p = pendingAction; pendingAction = null;
        if (applyAction(p.name, p.position)) void refreshRemote();
      }
    }
  }
}

function failConnection(error) {
  ++connectionEpoch; remoteActive = false; remoteBusy = false; pendingAction = null;
  remote?.cancel();
  connection?.close(); connection = null; remote = null;
  if (game.phase === 'play') game.act('b', performance.now());
  $('connect-button').disabled = false; $('connect-button').textContent = 'Connect badge ↗';
  $('connect-form').hidden = false; $('connected-controls').hidden = true;
  $('connection-status').textContent = '';
  $('connection-error').textContent = error.message; $('connection-error').hidden = false;
}

async function disconnect({ home = true } = {}) {
  ++connectionEpoch; remoteActive = false; remoteBusy = false; pendingAction = null;
  remote?.cancel();
  const previous = connection; connection = null; remote = null;
  if (previous && !previous.closed && home) {
    try { await previous.command({ cmd: 'leds', body: { all: '#000' } }); await previous.command({ cmd: 'home' }); } catch {}
  }
  previous?.close();
  $('connect-form').hidden = false; $('connected-controls').hidden = true;
  $('connect-button').disabled = false; $('connect-button').textContent = 'Connect badge ↗';
  $('connection-status').textContent = ''; $('connection-error').hidden = true;
}

async function setMode(next) {
  if (next === mode) return;
  saveBest(); await disconnect(); mode = next;
  game = new ClipStack({ best: loadBest(), badge: mode === 'badge' }); game.phase = 'ready';
  $('browser-tab').setAttribute('aria-selected', String(mode === 'browser'));
  $('badge-tab').setAttribute('aria-selected', String(mode === 'badge'));
  $('browser-panel').hidden = mode !== 'browser'; $('badge-panel').hidden = mode !== 'badge';
  viewKey = '';
}

$('connect-form').addEventListener('submit', async event => {
  event.preventDefault();
  const id = $('badge-id').value.trim().toLowerCase(), key = $('badge-key').value;
  $('connection-error').hidden = true;
  $('connect-button').disabled = true; $('connect-button').textContent = 'Connecting…';
  $('connection-status').textContent = 'Looking for your badge…';
  const epoch = ++connectionEpoch;
  connection = new BadgeConnection({
    onEvent: ev => {
      if (epoch !== connectionEpoch || !ev) return;
      if (ev.event === 'button' && ev.pressed) {
        if (ev.button === 'home') void disconnect();
        else action(ev.button);
      }
      if (ev.event === 'offline') failConnection(new Error('Your badge went offline. Check Wi-Fi and reconnect.'));
      if (ev.event === 'mode' && ev.mode === 'menu' && remoteActive) void disconnect({ home: false });
    },
    onClose: error => { if (epoch === connectionEpoch) failConnection(error); },
  });
  try {
    await connection.connect(id, key);
    if (epoch !== connectionEpoch) return;
    $('badge-key').value = '';
    $('connection-status').textContent = 'Connected. Bringing Clip Stack to your badge…';
    remote = new BadgeRenderer(connection); remoteBusy = true;
    await logo.decode();
    const imageCanvas = document.createElement('canvas'); imageCanvas.width = 200; imageCanvas.height = 57;
    imageCanvas.getContext('2d').drawImage(logo, 0, 0, 200, 57);
    game = new ClipStack({ best: loadBest(), badge: true }); game.introAt = performance.now();
    await remote.intro(imageCanvas.toDataURL('image/png').split(',')[1]);
    if (epoch !== connectionEpoch) return;
    game.phase = 'ready'; await remote.sync(game.snapshot());
    if (epoch !== connectionEpoch) return;
    remoteBusy = false; remoteActive = true; nextRemoteFrame = performance.now();
    $('connect-form').hidden = true; $('connected-controls').hidden = false;
    $('connected-label').textContent = `Connected to ${id}`;
    $('connection-status').textContent = 'Ready. Press A on the badge or below. Keep this page open.';
  } catch (error) { if (epoch === connectionEpoch) failConnection(error); }
});

$('browser-tab').addEventListener('click', () => void setMode('browser'));
$('badge-tab').addEventListener('click', () => void setMode('badge'));
$('disconnect-button').addEventListener('click', () => void disconnect());
$('action-button').addEventListener('click', () => action('a'));
$('pause-button').addEventListener('click', () => action('b'));
document.querySelector('.mode-switch').addEventListener('keydown', event => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault(); const next = mode === 'browser' ? 'badge' : 'browser';
  void setMode(next).then(() => $(`${next}-tab`).focus());
});
document.addEventListener('keydown', event => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
  if (event.code === 'Space' && event.target.closest('button,a')) return;
  const name = { KeyA: 'a', Space: 'a', KeyB: 'b', KeyS: 'start', ArrowUp: 'up', ArrowDown: 'down' }[event.code];
  if (name) { event.preventDefault(); action(name); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && game.phase === 'play') action('b'); });
window.addEventListener('pagehide', () => {
  saveBest();
  if (connection?.socket?.readyState === 1) {
    connection.socket.send(JSON.stringify({ cmd: 'home', id: 'clip-exit' }));
    connection.close();
  }
});

function frame(now) {
  if (mode === 'browser') game.tick(now);
  else if (game.phase === 'intro') game.tick(now);
  else if (remoteActive && !remoteBusy && game.phase === 'play' && now >= nextRemoteFrame) {
    game.tick(now, 65); void refreshRemote();
  }
  draw(now); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
