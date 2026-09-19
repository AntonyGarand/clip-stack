export const COLORS = Object.freeze({ red: '#da2451', yellow: '#fafa64', ink: '#650d2c', white: '#fffde9' });

export class ClipStack {
  constructor({ best = 0, badge = false } = {}) {
    this.best = Math.max(0, Math.min(9999, Number(best) || 0));
    this.badge = badge;
    this.phase = 'intro';
    this.introAt = 0;
    this.last = 0;
    this.score = 0;
    this.streak = 0;
    this.brightness = 160;
    this.cards = [{ x: 72, w: 152 }];
    this.x = 8;
    this.w = 152;
    this.direction = 1;
    this.message = '';
    this.messageUntil = 0;
    this.moveAt = 0;
    this.newBest = false;
    this.bestAtStart = this.best;
  }

  start(now) {
    this.phase = 'play';
    this.score = this.streak = 0;
    this.cards = [{ x: 72, w: 152 }];
    this.x = 8; this.w = 152; this.direction = 1;
    this.last = now; this.moveAt = now + 200;
    this.message = ''; this.messageUntil = 0;
    this.newBest = false; this.bestAtStart = this.best;
  }

  tick(now, fixedDelta) {
    if (this.phase === 'intro') {
      if (now - this.introAt >= 1600) this.phase = 'ready';
      this.last = now;
      return;
    }
    if (now >= this.messageUntil) this.message = '';
    const dt = fixedDelta ?? Math.max(0, Math.min(50, now - this.last));
    this.last = now;
    if (this.phase !== 'play' || now < this.moveAt) return;
    const speed = this.badge ? Math.min(125, 65 + this.score * 3) : Math.min(240, 108 + this.score * 6);
    this.x += this.direction * speed * dt / 1000;
    if (this.x < 8) { this.x = 16 - this.x; this.direction = 1; }
    const edge = 288 - this.w;
    if (this.x > edge) { this.x = 2 * edge - this.x; this.direction = -1; }
  }

  act(action, now, displayedX) {
    if (action === 'up' || action === 'down') {
      this.brightness = Math.max(0, Math.min(255, this.brightness + (action === 'up' ? 32 : -32)));
      this.message = `LEDs ${Math.round(this.brightness / 255 * 100)}%`;
      this.messageUntil = now + 1000;
      return 'brightness';
    }
    if (action === 'start') { this.start(now); return 'start'; }
    if (action === 'b') {
      if (this.phase === 'play') this.phase = 'pause';
      else if (this.phase === 'pause') { this.phase = 'play'; this.last = now; }
      return 'pause';
    }
    if (action !== 'a') return null;
    if (this.phase === 'pause') { this.phase = 'play'; this.last = now; return 'resume'; }
    if (this.phase !== 'play') { this.start(now); return 'start'; }
    if (now < this.moveAt) return null;
    const target = this.cards.at(-1);
    const placedX = Math.floor(displayedX ?? this.x);
    let left = Math.max(placedX, target.x);
    let right = Math.min(placedX + this.w, target.x + target.w);
    if (right - left < 5) {
      this.phase = 'over';
      this.newBest = this.score > this.bestAtStart;
      return 'miss';
    }
    const perfect = Math.abs(placedX - target.x) <= (this.badge ? 6 : 4);
    if (perfect) {
      left = target.x; right = target.x + target.w;
      this.streak = Math.min(6, this.streak + 1);
      this.message = this.streak === 6 ? 'FULL CLIP! Six perfect cards.' : 'PERFECT! Keep it going.';
    } else {
      this.streak = 0; this.message = 'CLIPPED! Stay sharp.';
    }
    this.messageUntil = now + 700;
    this.w = right - left;
    this.cards.push({ x: left, w: this.w });
    if (this.cards.length > 7) this.cards.shift();
    this.score = Math.min(9999, this.score + 1);
    this.best = Math.max(this.best, this.score);
    this.direction = this.score % 2 === 0 ? 1 : -1;
    this.x = this.direction === 1 ? 8 : 288 - this.w;
    this.moveAt = now + 180; this.last = now;
    return perfect ? 'perfect' : 'clip';
  }

  snapshot() {
    return {
      phase: this.phase, score: this.score, best: this.best, streak: this.streak,
      brightness: this.brightness, cards: this.cards.map(c => ({ ...c })),
      x: Math.floor(this.x), w: this.w, message: this.message,
      newBest: this.newBest, introAt: this.introAt,
    };
  }
}

export function footer(s) {
  if (s.message) return s.message;
  if (s.phase === 'play') return 'A clip    B pause    HOME exit';
  if (s.phase === 'pause') return 'A / B to resume';
  return 'A play    UP / DOWN LEDs';
}

export function panel(s) {
  if (s.phase === 'ready') return ['CLIP STACK', 'Line up the sliding cards.', 'Overhang gets clipped off.'];
  if (s.phase === 'pause') return ['PAUSED', 'Your stack is waiting.', 'A or B to resume'];
  if (s.phase === 'over') return ['CLIPPED OUT', `${s.score} cards. One more try?`, s.newBest ? 'NEW BEST! A to play again' : 'A to play again'];
  return null;
}

export function ledColors(s) {
  const v = Math.min(160, s.brightness);
  const yellow = [v, v, Math.floor(v * .4)];
  const colors = Array.from({ length: 6 }, () => [0, 0, 0]);
  if (s.phase === 'intro' || (s.phase === 'over' && s.newBest)) return colors.map(() => yellow);
  if (s.phase === 'over') return colors.map(() => [v, 0, 0]);
  for (const index of [4, 3, 5, 2, 0, 1].slice(0, s.streak)) colors[index] = yellow;
  return colors;
}
