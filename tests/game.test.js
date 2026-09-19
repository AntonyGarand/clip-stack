import test from 'node:test';
import assert from 'node:assert/strict';
import { ClipStack, ledColors } from '../game.js';

test('intro, pause, and resume preserve the stack and avoid catch-up jumps', () => {
  const game = new ClipStack();
  game.tick(1600); assert.equal(game.phase, 'ready');
  game.act('a', 1700); game.tick(2000);
  const x = game.x, cards = structuredClone(game.cards);
  game.act('b', 2000); game.tick(20000);
  assert.equal(game.x, x); assert.deepEqual(game.cards, cards);
  game.act('a', 20000); game.tick(20025);
  assert.ok(Math.abs(game.x - x) < 4);
});

test('partial overlap trims the card; a miss ends the round', () => {
  const game = new ClipStack(); game.start(0);
  assert.equal(game.act('a', 250, 32), 'clip');
  assert.equal(game.w, 112); assert.equal(game.cards.at(-1).x, 72);
  assert.equal(game.score, 1);
  assert.equal(game.act('a', 500, 210), 'miss');
  assert.equal(game.phase, 'over'); assert.equal(game.best, 1);
  assert.equal(game.newBest, true);
});

test('a hundred perfect placements keep a bounded stack and a saved best across retries', () => {
  const game = new ClipStack(); game.start(0);
  for (let i = 1; i <= 100; i++) {
    const target = game.cards.at(-1);
    assert.equal(game.act('a', i * 300, target.x + 2), 'perfect');
    assert.equal(game.w, 152);
    assert.ok(game.cards.length <= 7);
  }
  assert.equal(game.score, 100); assert.equal(game.streak, 6);
  for (let i = 0; i < 50; i++) { game.start(40000 + i); assert.equal(game.cards.length, 1); }
  assert.equal(game.best, 100); assert.equal(game.score, 0);
});

test('badge scoring uses the last displayed card, not the predicted position', () => {
  const game = new ClipStack({ badge: true }); game.start(0);
  game.x = 200;
  assert.equal(game.act('a', 400, 76), 'perfect');
  assert.equal(game.w, 152);
});

test('spawn cooldown prevents an accidental double placement', () => {
  const game = new ClipStack(); game.start(0);
  assert.equal(game.act('a', 100, 72), null);
  game.act('a', 250, 72);
  assert.equal(game.act('a', 300, 72), null);
  assert.equal(game.score, 1);
});

test('motion stays in bounds during long delays and brightness can be turned off', () => {
  const game = new ClipStack(); game.start(0);
  for (let now = 250; now < 100000; now += 5000) {
    game.tick(now);
    assert.ok(game.x >= 8 && game.x <= 288 - game.w);
  }
  for (let i = 0; i < 10; i++) game.act('down', 100000);
  assert.deepEqual(ledColors(game.snapshot()), Array.from({length: 6}, () => [0, 0, 0]));
});
