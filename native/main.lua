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
