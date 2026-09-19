-- Restore the embedded artwork once, then reuse the files on later launches.
local function prepare_artwork()
  local revision = @REVISION@
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

  restore("logo.bin", "@LOGO_DATA@", @LOGO_SIZE@, @LOGO_CHECKSUM@)
  restore("icon.bin", "@ICON_DATA@", @ICON_SIZE@, @ICON_CHECKSUM@)
  badge.store.set_int("art_rev", revision)
end

