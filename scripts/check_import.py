"""Check the generated single-file app with Lua 5.4 (pip install lupa)."""

from pathlib import Path

from lupa.lua54 import LuaRuntime, LuaError

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "assets/clip-stack.lua").read_bytes()
EXPECTED = {name.encode(): (ROOT / "native" / name).read_bytes() for name in ("logo.bin", "icon.bin")}


class Widget:
    def __init__(self, text=b""):
        self.text, self.hide, self.x, self.y = text, False, 0, 0

    def set_pos(self, x, y): self.x, self.y = x, y
    def set_size(self, w, h): self.w, self.h = w, h
    def style(self, value): pass
    def align(self, *args): pass
    def hidden(self, value): self.hide = value
    def set_text(self, value): self.text = value


def boot(files, saved, fail_after=None):
    lua = LuaRuntime(encoding=None, unpack_returned_tuples=True, max_memory=0)
    widgets, writes, clock = [], [], [0]

    def widget(*args):
        result = Widget(args[1] if len(args) > 1 else b"")
        widgets.append(result)
        return result

    def image(parent, name):
        assert files[name] == EXPECTED[name], "Artwork must exist before the first image widget"
        return widget(parent, name)

    def write(path, data, append=False):
        if fail_after is not None and len(writes) >= fail_after:
            return None, b"Simulated interrupted write"
        content = files.get(path, b"") + data if append else data
        assert len(content) <= 16 * 1024
        assert len(SOURCE) + sum(len(v) for k, v in files.items() if k != path) + len(content) <= 64 * 1024
        writes.append((path, len(data)))
        files[path] = content
        return True

    def table(value):
        return lua.table_from({k.encode(): table(v) if isinstance(v, dict) else v for k, v in value.items()})

    lua.globals().badge = table({
        "input": {"BUTTON": {"A": 1, "B": 2, "UP": 3, "DOWN": 4, "START": 5}, "KIND": {"PRESSED": 1, "RELEASED": 2}},
        "ui": {"box": widget, "label": widget, "image": image},
        "sys": {"ms": lambda: clock[0], "version": lambda: b"host-check", "log": lambda value: None},
        "store": {"get_int": lambda key, default: saved.get(key, default), "set_int": lambda key, value: saved.__setitem__(key, value)},
        "fs": {"exists": lambda name: name in files, "write": write, "append": lambda path, data: write(path, data, True), "read": lambda path: files.get(path)},
        "led": {name: lambda *args: None for name in ("clear", "show", "set", "set_all")},
    })
    lua.execute(b"os=nil; io=nil; package=nil; debug=nil; coroutine=nil; require=nil; load=nil; loadfile=nil; dofile=nil; pcall=nil; xpcall=nil; collectgarbage('collect')")
    lua.set_max_memory(96 * 1024, total=True)
    lua.execute(SOURCE)
    try:
        lua.globals().on_enter(lua.table())
    except LuaError:
        if fail_after is None:
            raise
        return None, writes, widgets, clock
    assert fail_after is None, "The simulated disk failure must stop initialization"
    assert len(widgets) == 21
    assert files == EXPECTED
    assert max((n for _, n in writes), default=0) < 640, "Write artwork in bounded chunks"
    return lua, writes, widgets, clock


files, saved = {}, {b"best": 37}
lua, writes, widgets, clock = boot(files, saved)
assert writes and files == EXPECTED and saved[b"best"] == 37
assert widgets[1].y == 92
for now in range(25, 1650, 25):
    clock[0] = now
    lua.globals().on_tick()
assert widgets[1].y == 7
lua.globals().on_button(1, 1)
assert any(w.text == b"STACK 0" for w in widgets)
clock[0] += 250
lua.globals().on_tick()
lua.globals().on_button(2, 1)
assert any(w.text == b"PAUSED" for w in widgets)
lua.globals().on_exit()
assert saved[b"best"] == 37
print("PASS: fresh import creates exact images; intro, play, pause, and best score work within the host's 96 KiB Lua limit")

_, writes, _, _ = boot(files, saved)
assert not writes
print("PASS: reopening uses cached artwork without flash writes")

del files[b"icon.bin"]
boot(files, saved)
assert files == EXPECTED
print("PASS: a missing image is recreated")

legacy = {b"logo.bin": b"x" * 34212, b"icon.bin": b"x" * 5304}
boot(legacy, {b"best": 37})
assert legacy == EXPECTED
print("PASS: upgrading replaces the original larger images within the storage quota")

files, saved = {}, {b"best": 37}
boot(files, saved, fail_after=2)
assert saved[b"art_rev"] == 0
boot(files, saved)
assert files == EXPECTED and saved[b"best"] == 37
print("PASS: an interrupted first launch recovers on reopening")
