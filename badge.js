import { COLORS, footer, panel, ledColors } from './game.js';

const ENDPOINT = 'wss://badge.solana-htn.com';
const MESSAGES = {
  bad_key: 'That app key was not accepted. Check it on the badge.',
  key_not_set: 'Generate an app key in the badge’s settings first.',
  badge_not_found: 'No badge has that HTN-ID. Check the five characters.',
  badge_offline: 'Your badge is offline. Connect it to Wi-Fi and try again.',
  badge_timeout: 'The badge did not respond. Check its Wi-Fi connection.',
  rate_limited: 'The badge service is busy. Disconnect and try again.',
};

export function connectionURL(id, key) {
  id = id.trim().toLowerCase();
  if (!/^[23456789abcdefghjkmnpqrstuvwxyz]{5}$/.test(id)) throw new Error('Enter the five-character HTN-ID shown on your badge.');
  if (!/^[\x20-\x7e]{4,32}$/.test(key)) throw new Error('The app key must be 4–32 printable characters.');
  return `${ENDPOINT}/v1/badges/${encodeURIComponent(id)}/ws?key=${encodeURIComponent(key)}`;
}

export class BadgeConnection {
  constructor({ WebSocketClass = globalThis.WebSocket, onEvent = () => {}, onClose = () => {}, interval = 65, timeout = 6500 } = {}) {
    this.WebSocketClass = WebSocketClass;
    this.onEvent = onEvent; this.onClose = onClose;
    this.interval = interval; this.timeout = timeout;
    this.pending = new Map(); this.sequence = 0;
    this.queue = Promise.resolve(); this.lastSent = 0;
    this.socket = null; this.closed = true; this.intentional = false;
  }

  async connect(id, key) {
    const url = connectionURL(id, key);
    this.closed = false; this.intentional = false;
    const socket = this.socket = new this.WebSocketClass(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { reject(new Error('The badge service did not connect. Check Wi-Fi and try again.')); this.close(); }, this.timeout);
      socket.onopen = () => { clearTimeout(timer); resolve(); };
      socket.onerror = () => { clearTimeout(timer); reject(new Error('Could not reach the badge service. Try again, or play in this browser.')); };
      socket.onclose = e => {
        clearTimeout(timer);
        const error = new Error(e.code === 4403 ? MESSAGES.bad_key : e.code === 4404 ? MESSAGES.badge_not_found : 'The badge connection closed. Reconnect to continue.');
        this.closed = true;
        for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); }
        this.pending.clear();
        reject(error);
        if (!this.intentional) this.onClose(error);
      };
      socket.onmessage = event => this.receive(event.data);
    });
    return this.command({ cmd: 'info' });
  }

  receive(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'event') { this.onEvent(msg.data); return; }
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id); clearTimeout(pending.timer);
    if (msg.type === 'error') pending.reject(new Error(MESSAGES[msg.error] || 'The badge could not complete that command.'));
    else pending.resolve(msg.data);
  }

  command(body) {
    const run = async () => {
      if (this.closed || this.socket?.readyState !== 1) throw new Error('The badge is disconnected.');
      const delay = Math.max(0, this.interval - (Date.now() - this.lastSent));
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      if (this.closed || this.socket?.readyState !== 1) throw new Error('The badge is disconnected.');
      const id = `clip-${++this.sequence}`;
      this.lastSent = Date.now();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error('The badge stopped responding. Reconnect to continue.'));
          this.close();
        }, this.timeout);
        this.pending.set(id, { resolve, reject, timer });
        try { this.socket.send(JSON.stringify({ ...body, id })); }
        catch { clearTimeout(timer); this.pending.delete(id); reject(new Error('The badge is disconnected.')); }
      });
    };
    const promise = this.queue.then(run);
    this.queue = promise.catch(() => {});
    return promise;
  }

  close() {
    this.intentional = true; this.closed = true;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('The badge is disconnected.')); }
    this.pending.clear(); this.socket?.close();
  }
}

const rect = (x, y, w, h, color) => ({ cmd: 'rect', x, y, w, h, color });
const text = (content, x, y, size = 1, color = COLORS.yellow, background = COLORS.red) => ({ cmd: 'text', text: content, x, y, size, color, background });
const centered = (content, y, size = 1, background = COLORS.ink) => text(content, Math.round((320 - content.length * (size === 3 ? 12 : 6)) / 2), y, size, COLORS.yellow, background);

export class BadgeRenderer {
  constructor(connection) { this.connection = connection; this.previous = null; this.displayX = 8; this.cancelled = false; }
  cancel() { this.cancelled = true; }
  async commands(list) {
    for (const command of list) {
      if (this.cancelled) throw new Error('Badge rendering stopped.');
      await this.connection.command(command);
    }
  }

  async intro(image) {
    await this.commands([{ cmd: 'clear', color: COLORS.red }, { cmd: 'image', image, x: 60, y: 92, fit: 'none' }, { cmd: 'leds', body: { all: COLORS.yellow } }]);
    await new Promise(resolve => setTimeout(resolve, 650));
    let oldY = 92;
    for (const y of [53, 22, 7]) {
      await this.commands([rect(60, oldY, 200, 57, COLORS.red), { cmd: 'image', image, x: 60, y, fit: 'none' }]);
      oldY = y;
    }
  }

  async sync(s) {
    const old = this.previous;
    const commands = [];
    const play = s.phase === 'play';
    const force = !old || old.phase !== s.phase;
    if (force) commands.push(rect(0, 68, 320, 172, COLORS.red));
    if (force || old.score !== s.score || old.best !== s.best) {
      commands.push(rect(10, 68, 300, 20, COLORS.red));
      const best = `BEST ${s.best}`;
      commands.push(text(play ? `STACK ${s.score}` : 'CLIP STACK', 14, 72));
      commands.push(text(best, 306 - best.length * 6, 72));
    }
    if (play) {
      const rows = s.cards.map(c => ({ ...c, color: COLORS.yellow }));
      rows.push({ x: s.x, w: s.w, color: COLORS.white });
      const previousRows = old?.phase === 'play' ? [...old.cards.map(c => ({ ...c, color: COLORS.yellow })), { x: old.x, w: old.w, color: COLORS.white }] : [];
      for (let i = 0; i < Math.max(rows.length, previousRows.length); i++) {
        const next = rows[i], before = previousRows[i], y = 194 - i * 14;
        if (!force && JSON.stringify(next) === JSON.stringify(before)) continue;
        if (!force) commands.push(rect(20, y, 280, 12, COLORS.red));
        if (next) commands.push(rect(12 + next.x, y, next.w, 12, next.color));
      }
      if (force) commands.push(rect(56, 209, 208, 4, COLORS.ink));
    } else if (force) {
      const content = panel(s);
      if (content) commands.push(rect(20, 108, 280, 96, COLORS.ink), centered(content[0], 116, 3), centered(content[1], 151), centered(content[2], 178));
    }
    if (force || footer(s) !== footer(old)) commands.push(rect(0, 218, 320, 22, COLORS.red), centered(footer(s), 223, 1, COLORS.red));
    if (force || JSON.stringify(ledColors(s)) !== JSON.stringify(ledColors(old))) commands.push({ cmd: 'leds', body: { leds: ledColors(s) } });
    await this.commands(commands);
    this.displayX = s.x;
    this.previous = s;
  }
}
