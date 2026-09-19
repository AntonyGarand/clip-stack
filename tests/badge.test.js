import test from 'node:test';
import assert from 'node:assert/strict';
import { BadgeConnection, BadgeRenderer, connectionURL } from '../badge.js';
import { ClipStack } from '../game.js';

class FakeSocket {
  static last;
  constructor(url) {
    this.url = url; this.readyState = 0; this.sent = []; this.times = [];
    FakeSocket.last = this;
    queueMicrotask(() => { this.readyState = 1; this.onopen(); });
  }
  send(raw) {
    const command = JSON.parse(raw); this.sent.push(command); this.times.push(Date.now());
    queueMicrotask(() => this.onmessage({data: JSON.stringify({type:'reply',id:command.id,data:{ok:true,fw:'test',mode:'canvas'}})}));
  }
  close() { this.readyState=3; queueMicrotask(() => this.onclose({code:1000})); }
}

test('only valid HTN IDs and printable keys enter an encoded production WebSocket URL', () => {
  assert.equal(connectionURL(' ABC23 ', 'test &? key'), 'wss://badge.solana-htn.com/v1/badges/abc23/ws?key=test%20%26%3F%20key');
  assert.throws(() => connectionURL('bad/id', 'fake-key'));
  assert.throws(() => connectionURL('abc23', 'bad\nkey'));
  assert.throws(() => connectionURL('abc23', '123'));
});

test('commands correlate replies and are serialized below the public rate limit', async () => {
  const connection = new BadgeConnection({WebSocketClass:FakeSocket, interval:65});
  await connection.connect('abc23', 'test-only-key');
  await Promise.all(Array.from({length:5}, (_,i) => connection.command({cmd:'rect',x:i,y:0,w:1,h:1,color:'#fff'})));
  const socket = FakeSocket.last;
  assert.equal(new Set(socket.sent.map(s=>s.id)).size, 6);
  for (let i=1;i<socket.times.length;i++) assert.ok(socket.times[i]-socket.times[i-1]>=60);
  connection.receive('not json'); connection.receive('null');
  connection.close();
});

test('a device error rejects a command with a useful message', async () => {
  const connection = new BadgeConnection({WebSocketClass:FakeSocket, interval:0});
  await connection.connect('abc23', 'test-only-key');
  FakeSocket.last.send = function(raw) {
    const {id} = JSON.parse(raw);
    queueMicrotask(() => this.onmessage({data:JSON.stringify({type:'error',id,error:'badge_offline'})}));
  };
  await assert.rejects(connection.command({cmd:'clear'}), /offline/);
  connection.close();
});

test('rendering one movement only erases and draws its row', async () => {
  const commands=[];
  const renderer=new BadgeRenderer({command:async cmd=>commands.push(cmd)});
  const game=new ClipStack({badge:true}); game.start(0);
  await renderer.sync(game.snapshot()); commands.length=0;
  game.x=20; await renderer.sync(game.snapshot());
  assert.equal(commands.length,2); assert.ok(commands.every(c=>c.cmd==='rect'));
  assert.equal(renderer.displayX,20);
  assert.equal(commands.at(-1).x,32);
});

test('disconnect cancels a redraw before later commands can retake the screen', async () => {
  const commands=[];
  let renderer;
  renderer=new BadgeRenderer({command:async cmd=>{commands.push(cmd);renderer.cancel();}});
  const game=new ClipStack(); game.phase='ready';
  await assert.rejects(renderer.sync(game.snapshot()),/stopped/);
  assert.equal(commands.length,1);
});
