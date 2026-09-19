--[==[badge-app
slug=clipboard_clip_stack
name=Clip Stack
icon=CB
api=2
heap_kb=96
wake_lock=1
version=1.2.0
author=Clipboard
]==]

-- Restore the embedded artwork once, then reuse the files on later launches.
local function prepare_artwork()
  local revision = 1765299641
  if badge.store.get_int("art_rev", 0) == revision and
      badge.fs.exists("logo.bin") and badge.fs.exists("icon.bin") then return end
  -- An interrupted write must be retried on the next launch.
  badge.store.set_int("art_rev", 0)

  local function restore(path, encoded, size, checksum)
    local alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    local pos, value, bits = 1, 0, 0
    local function byte()
      while bits < 8 do
        local digit = alphabet:find(encoded:sub(pos, pos), 1, true)
        assert(digit and pos <= #encoded, "Embedded artwork is damaged")
        value, bits, pos = value * 64 + digit - 1, bits + 6, pos + 1
      end
      bits = bits - 8
      local scale = 2 ^ bits
      local result = math.floor(value / scale)
      value = value % scale
      return result
    end

    local parts, buffered, written, first = {}, 0, 0, true
    local function flush()
      local chunk = table.concat(parts)
      local ok, err
      if first then ok, err = badge.fs.write(path, chunk)
      else ok, err = badge.fs.append(path, chunk) end
      if ok == false or err then error(err or ("Could not write " .. path)) end
      parts, buffered, first = {}, 0, false
    end

    while written < size do
      local control, piece = byte(), nil
      if control >= 128 then
        piece = string.rep(string.char(byte()), control - 127)
      else
        local literal = {}
        for i = 1, control + 1 do literal[i] = string.char(byte()) end
        piece = table.concat(literal)
      end
      written = written + #piece
      assert(written <= size, "Embedded artwork has the wrong size")
      parts[#parts + 1], buffered = piece, buffered + #piece
      if buffered >= 512 then flush() end
    end
    if buffered > 0 then flush() end
    local data, err = badge.fs.read(path)
    assert(data and #data == size, err or ("Could not read " .. path))
    local a, b = 1, 0
    for i = 1, #data do a = (a + data:byte(i)) % 65521; b = (b + a) % 65521 end
    assert(b * 65536 + a == checksum, "Artwork verification failed: " .. path)
  end

  restore("logo.bin", "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", 5776, 2534433934)
  restore("icon.bin", "CBkJAAAqACoAFYIAP1Ek2v9SMtz/VEHe/1VP4P9WXeP/V2vl/1l65/9aiOn/W5br/1yk7f9es+//X8Hx/2DP9P9h3fb/Y+z4/2T6+v/bAAQEm93bco4AAQO/gv8B/nCNAABOhP8A+YwAAQLvhf8AYIsAAAmG/wDRiwAILv///pev///2iwAIb///9AAH///6iwAIn///wAAA3//8iwAIr///oAAAv//9iwAIv///oAAAv//9iwAIv///oAAAz//8iwAIv///oAAB3//7iwAIv///oAAC///5iwAIv///oAAF///2iwAIv///oAAJ///ziwAIv///oAAM///AiwAIv///oAAu//+AiwAIv///oAASIiIQiwADv///oJAAA7///6CQAAO///+gkAAFv///oAAAghGLAAi///+gAAC+7uyLAAi///+gAADP//2LAAi///+gAADP//yLAAiv//+gAADf//uLAAiP///QAALv//mLAAhf///3AAr///aLAAAdgv8Ey9///+KLAAAHhv8AsIwAAM+F/wAwjAAALYT/APaNAAEBn4L/Af1QjgAEA4vd2mHbAA==", 958, 4100714781)
  badge.store.set_int("art_rev", revision)
end


-- Clip Stack. A clips/starts, B pauses, UP/DOWN change LED brightness.
-- HOME saves and exits. The supplied Clipboard logo slides into the header.
local RED, YELLOW, INK, WHITE = 0xDA2451, 0xFAFA64, 0x650D2C, 0xFFFDE9
local B = badge.input.BUTTON
local phase, score, best, saved, streak = "intro", 0, 0, 0, 0
local x, width, direction, count = 8, 152, 1, 1
local last, intro_at, move_at, frame_at, leds_at = 0, 0, 0, 0, 0
local effect, effect_until, hint_until, level = 0, 0, 0, 160
local cards, xs, ws = {}, {}, {}
local fill_order = {5, 4, 6, 3, 1, 2}
local bg, logo, field, mover, hud, score_text, best_text, hint, intro_text
local panel, title, detail, prompt

local function box(parent, w, h, px, py, color)
  return badge.ui.box{parent=parent, w=w, h=h, x=px, y=py,
    bg_color=color, border_width=0, radius=0, pad_all=0}
end

local function label(parent, text, font, color, align, dx, dy)
  local obj = badge.ui.label(parent, text)
  obj:style({text_font=font, text_color=color})
  obj:align(align, dx, dy)
  return obj
end

local function save_best()
  if best ~= saved then
    badge.store.set_int("best", best)
    saved = best
  end
end

local function controls()
  if phase == "play" then hint:set_text("A clip   B pause   HOME exit")
  elseif phase == "pause" then hint:set_text("A/B resume   HOME saves & exits")
  else hint:set_text("A play   UP/DOWN LEDs   HOME exit") end
end

local function lights(now)
  if now < leds_at then return end
  leds_at = now + 60
  badge.led.clear()
  if level > 0 then
    local dim = math.floor(level * 0.25)
    if phase == "intro" then
      local wave = (now - intro_at) % 1400 / 700
      if wave > 1 then wave = 2 - wave end
      local v = math.floor(level * (0.35 + 0.65 * wave))
      badge.led.set_all(v, v, math.floor(v * 0.4))
    elseif now < effect_until then
      if effect == 1 then badge.led.set_all(level, level, dim)
      elseif effect == 2 then badge.led.set_all(level, 0, 0)
      else
        local n = math.floor(now / 110) % 6 + 1
        badge.led.set(n, level, level, dim)
      end
    else
      for i=1,streak do badge.led.set(fill_order[i], level, level, dim) end
    end
  end
  badge.led.show()
end

local function board()
  for i=1,7 do
    cards[i]:hidden(i > count)
    if i <= count then
      cards[i]:set_size(ws[i], 12)
      cards[i]:set_pos(xs[i], 103 - (i-1)*14)
    end
  end
  mover:set_size(width, 12)
  mover:set_pos(math.floor(x), 103 - count*14)
  mover:hidden(false)
  score_text:set_text("STACK " .. score)
  best_text:set_text("BEST " .. best)
end

local function ready()
  phase = "ready"
  logo:set_pos(60, 7)
  intro_text:hidden(true)
  hud:hidden(false)
  panel:hidden(false)
  title:set_text("CLIP STACK")
  detail:set_text("Line up the sliding cards.")
  prompt:set_text("Overhang gets clipped off.")
  controls()
end

local function start(now)
  save_best()
  phase, score, streak, count = "play", 0, 0, 1
  xs[1], ws[1], width = 72, 152, 152
  x, direction, effect, effect_until = 8, 1, 0, 0
  hint_until, move_at, last = 0, now + 200, now
  intro_text:hidden(true)
  logo:set_pos(60, 7)
  hud:hidden(false)
  panel:hidden(true)
  field:hidden(false)
  board()
  controls()
end

local function clip(now)
  if now < move_at then return end
  local px = math.floor(x)
  local left = math.max(px, xs[count])
  local right = math.min(px + width, xs[count] + ws[count])
  if right - left < 5 then
    phase = "over"
    mover:hidden(true)
    panel:hidden(false)
    title:set_text("CLIPPED OUT")
    detail:set_text("You stacked " .. score .. " cards.")
    local record = best > saved
    prompt:set_text(record and "NEW BEST! A to play again" or "A to play again")
    effect, effect_until = record and 3 or 2, now + 1100
    save_best()
    controls()
    return
  end
  local perfect = math.abs(px - xs[count]) <= 4
  if perfect then
    left, right = xs[count], xs[count] + ws[count]
    streak = math.min(6, streak + 1)
    effect, effect_until = streak == 6 and 3 or 1, now + 360
    hint:set_text(streak == 6 and "FULL CLIP!   Six perfect cards!" or "PERFECT!   Keep the streak going")
  else
    streak, effect_until = 0, 0
    hint:set_text("CLIPPED!   A clip   B pause")
  end
  hint_until = now + 700
  width = right - left
  if count == 7 then
    for i=1,6 do xs[i], ws[i] = xs[i+1], ws[i+1] end
  else count = count + 1 end
  xs[count], ws[count] = left, width
  score = math.min(9999, score + 1)
  best = math.max(best, score)
  direction = score % 2 == 0 and 1 or -1
  x = direction == 1 and 8 or 288 - width
  move_at, last = now + 180, now
  board()
end

function on_enter(root)
  if prepare_artwork then prepare_artwork(); prepare_artwork = nil end
  best = math.max(0, math.min(9999, badge.store.get_int("best", 0)))
  saved = best
  bg = box(root, 320, 240, 0, 0, RED)
  logo = badge.ui.image(bg, "logo.bin")
  logo:set_pos(60, 92)
  intro_text = label(bg, "CLIP STACK", 20, YELLOW, "top_mid", 0, 166)
  hud = box(bg, 292, 20, 14, 70, RED)
  score_text = label(hud, "CLIP STACK", 14, YELLOW, "left_mid", 0, 0)
  best_text = label(hud, "BEST " .. best, 14, YELLOW, "right_mid", 0, 0)
  hud:hidden(true)
  field = box(bg, 296, 126, 12, 91, RED)
  box(field, 208, 4, 44, 118, INK)
  for i=1,7 do
    cards[i] = box(field, 152, 12, 72, 103-(i-1)*14, YELLOW)
    cards[i]:hidden(true)
  end
  mover = box(field, 152, 12, 8, 89, WHITE)
  field:hidden(true)
  panel = box(bg, 280, 96, 20, 108, INK)
  title = label(panel, "CLIP STACK", 22, YELLOW, "top_mid", 0, 8)
  detail = label(panel, "", 14, WHITE, "top_mid", 0, 40)
  prompt = label(panel, "", 14, YELLOW, "top_mid", 0, 65)
  panel:hidden(true)
  hint = label(bg, "", 14, YELLOW, "bottom_mid", 0, -4)
  intro_at = badge.sys.ms()
  last, frame_at, leds_at = intro_at, intro_at, intro_at
  badge.sys.log("Clip Stack 1.0 ready; firmware=" .. badge.sys.version())
end

function on_tick()
  local now = badge.sys.ms()
  if now < frame_at then return end
  frame_at = now + 25
  lights(now)
  if phase == "intro" then
    local elapsed = now - intro_at
    if elapsed >= 1600 then ready()
    elseif elapsed > 850 then
      local t = (elapsed - 850) / 750
      logo:set_pos(60, math.floor(92 - 85*(1-(1-t)^3)))
    end
    return
  end
  if hint_until > 0 and now >= hint_until then hint_until=0; controls() end
  if phase ~= "play" then return end
  local dt = math.min(50, math.max(0, now - last))
  last = now
  if now < move_at then return end
  local old = math.floor(x)
  x = x + direction * math.min(240, 108 + score*6) * dt / 1000
  if x < 8 then x=16-x; direction=1 end
  local limit = 288-width
  if x > limit then x=2*limit-x; direction=-1 end
  if math.floor(x) ~= old then mover:set_pos(math.floor(x), 103-count*14) end
end

function on_button(button, kind)
  if kind ~= badge.input.KIND.PRESSED then return end
  local now = badge.sys.ms()
  if button == B.UP or button == B.DOWN then
    level = math.max(0, math.min(255, level + (button == B.UP and 32 or -32)))
    hint:set_text("LED brightness: " .. level)
    hint_until, leds_at = now+900, 0
    return
  end
  if button == B.A then
    if phase == "play" then clip(now)
    elseif phase == "pause" then
      phase, last, hint_until = "play", now, 0
      panel:hidden(true); controls()
    else start(now) end
  elseif button == B.B then
    if phase == "play" then
      phase, hint_until = "pause", 0
      panel:hidden(false)
      title:set_text("PAUSED")
      detail:set_text("Your stack is waiting.")
      prompt:set_text("A or B to resume")
      controls()
    elseif phase == "pause" then
      phase, last = "play", now
      panel:hidden(true); controls()
    end
  elseif button == B.START and phase ~= "intro" then start(now) end
end

function on_exit()
  save_best()
  badge.led.clear()
  badge.led.show()
end
