import test from 'node:test';
import assert from 'node:assert/strict';
import { BadgeConnection, BadgeRenderer, connectionURL } from '../badge.js';
import { ClipStack, COLORS } from '../game.js';

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

// A canvas boundary double preserves pixels for the simulated display. The
// browser check also decodes the actual PNGs produced by a real canvas.
class PixelCanvas {
  constructor() {
    this.context = {
      fillStyle: '',
      fillRect: (x, y, w, h) => {
        this.pixels ??= Array(this.width * this.height).fill(COLORS.red);
        for (let row=y;row<y+h;row++) for (let col=x;col<x+w;col++) this.pixels[row*this.width+col]=this.context.fillStyle;
      },
    };
  }
  getContext() { return this.context; }
  toDataURL() { return `data:image/png;base64,${Buffer.from(JSON.stringify({width:this.width,height:this.height,pixels:this.pixels})).toString('base64')}`; }
}

test('moving bricks stay visible between acknowledged display commands in both directions', async () => {
  const commands=[], screen=Array(320*240).fill(COLORS.red);
  let moving=false;
  const renderer=new BadgeRenderer({command:async cmd=>{
    commands.push(cmd);
    if (cmd.cmd==='rect') {
      for (let y=cmd.y;y<cmd.y+cmd.h;y++) for (let x=cmd.x;x<cmd.x+cmd.w;x++) screen[y*320+x]=cmd.color;
    } else if (cmd.cmd==='image') {
      const image=JSON.parse(Buffer.from(cmd.image,'base64'));
      for (let y=0;y<image.height;y++) for (let x=0;x<image.width;x++) screen[(cmd.y+y)*320+cmd.x+x]=image.pixels[y*image.width+x];
    }
    if (moving) assert.equal(screen.filter(c=>c===COLORS.white).length,152*12,'the brick must remain visible while waiting for the next command');
  }}, {canvas:new PixelCanvas()});
  const game=new ClipStack({badge:true}); game.start(0);
  await renderer.sync(game.snapshot()); moving=true;
  for (const position of [20,136,120,8]) {
    commands.length=0; game.x=position; await renderer.sync(game.snapshot());
    assert.equal(commands.length,1);
    assert.equal(commands[0].cmd,'image');
    assert.equal(commands[0].fit,'none');
    assert.equal(renderer.displayX,position);
    for (let x=20;x<300;x++) assert.equal(screen[180*320+x],x>=12+position && x<12+position+152 ? COLORS.white : COLORS.red);
    assert.equal(screen[194*320+84],COLORS.yellow,'the stack below must be untouched');
  }
});

test('disconnect cancels a redraw before later commands can retake the screen', async () => {
  const commands=[];
  let renderer;
  renderer=new BadgeRenderer({command:async cmd=>{commands.push(cmd);renderer.cancel();}});
  const game=new ClipStack(); game.phase='ready';
  await assert.rejects(renderer.sync(game.snapshot()),/stopped/);
  assert.equal(commands.length,1);
});
