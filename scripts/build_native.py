"""Build small LVGL v9 images and the original-firmware download (Pillow required)."""

from pathlib import Path
import argparse
import base64
import io
import struct
import zipfile
import zlib

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RED, YELLOW = (218, 36, 81), (250, 250, 100)
# Keep both brand colors exact, with 14 intermediate shades for smooth edges.
PALETTE = [tuple(round(a + (b - a) * i / 15) for a, b in zip(RED, YELLOW)) for i in range(16)]


def encode_i4(path, size):
    image = Image.open(path).convert("RGBA")
    assert image.size == size, (path, image.size)
    assert image.getchannel("A").getextrema() == (255, 255), "Artwork must be opaque"
    pixels = list(image.convert("RGB").get_flattened_data())
    nearest = {
        pixel: min(range(16), key=lambda i: sum((a - b) ** 2 for a, b in zip(pixel, PALETTE[i])))
        for pixel in set(pixels)
    }
    indices = [nearest[pixel] for pixel in pixels]
    w, h = size
    stride = (w + 1) // 2
    # LVGL I4: 12-byte header, 16 BGRA palette entries, high nibble first.
    # https://github.com/lvgl/lvgl/blob/v9.2.2/src/libs/bin_decoder/lv_bin_decoder.c
    header = struct.pack("<BBHHHHH", 0x19, 0x09, 0, w, h, stride, 0)
    palette = bytes(channel for r, g, b in PALETTE for channel in (b, g, r, 255))
    packed = bytes(
        (indices[y * w + x] << 4) | (indices[y * w + x + 1] if x + 1 < w else 0)
        for y in range(h) for x in range(0, w, 2)
    )
    return header + palette + packed


def pack_runs(data):
    """Pack repeated bytes and literal blocks, each at most 128 bytes long."""
    result = bytearray()
    i = 0
    while i < len(data):
        run = 1
        while i + run < len(data) and data[i + run] == data[i] and run < 128:
            run += 1
        if run >= 3:
            result.extend((127 + run, data[i]))
            i += run
        else:
            start = i
            i += run
            while i < len(data) and i - start < 128:
                run = 1
                while i + run < len(data) and data[i + run] == data[i] and run < 128:
                    run += 1
                if run >= 3:
                    break
                i += min(run, 128 - (i - start))
            result.append(i - start - 1)
            result.extend(data[start:i])
    return bytes(result)


def single_file(bundle):
    loader = (ROOT / "scripts/native_artwork.lua").read_text()
    for name in ("logo", "icon"):
        data = bundle[name + ".bin"]
        loader = loader.replace("@" + name.upper() + "_DATA@", base64.b64encode(pack_runs(data)).decode())
        loader = loader.replace("@" + name.upper() + "_SIZE@", str(len(data)))
        loader = loader.replace("@" + name.upper() + "_CHECKSUM@", str(zlib.adler32(data)))
    revision = zlib.adler32(bundle["logo.bin"] + bundle["icon.bin"]) & 0x7fffffff
    loader = loader.replace("@REVISION@", str(revision))
    game = bundle["main.lua"].decode()
    assert game.count("function on_enter(root)\n") == 1
    game = game.replace("function on_enter(root)\n", "function on_enter(root)\n  if prepare_artwork then prepare_artwork(); prepare_artwork = nil end\n")
    settings = {"version": "1.2.0", "heap_kb": "96"}
    manifest = "\n".join(key + "=" + settings.get(key, value) for key, value in
                         (line.split("=", 1) for line in bundle["manifest.cfg"].decode().splitlines())) + "\n"
    main = loader + "\n" + game
    assert len(main.encode()) <= 64 * 1024
    installed = len(manifest.encode()) + len(main.encode()) + len(bundle["logo.bin"]) + len(bundle["icon.bin"])
    assert installed < 24 * 1024, f"Single-file installation grew to {installed} bytes"
    return f"--[==[badge-app\n{manifest}]==]\n\n{main}".encode(), installed


def build(check=False):
    images = {
        "logo.bin": encode_i4(ROOT / "assets/wordmark.png", (200, 57)),
        "icon.bin": encode_i4(ROOT / "assets/icon.png", (42, 42)),
    }
    for name, data in images.items():
        path = ROOT / "native" / name
        if check:
            assert path.read_bytes() == data, f"Rebuild {path}"
        else:
            path.write_bytes(data)

    bundle = {name: (ROOT / "native" / name).read_bytes() for name in ("manifest.cfg", "main.lua", "logo.bin", "icon.bin")}
    total = sum(map(len, bundle.values()))
    assert total < 16 * 1024, f"Native bundle grew to {total} bytes"
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as output:
        for name, data in bundle.items():
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            output.writestr(info, data, compresslevel=9)
    path = ROOT / "assets/clip-stack-native.zip"
    if check:
        assert path.read_bytes() == archive.getvalue(), f"Rebuild {path}"
    else:
        path.write_bytes(archive.getvalue())
    source, installed = single_file(bundle)
    path = ROOT / "assets/clip-stack.lua"
    if check:
        assert path.read_bytes() == source, f"Rebuild {path}"
    else:
        path.write_bytes(source)
    for name, data in bundle.items():
        print(f"{name}: {len(data):,} bytes")
    print(f"Share payload: {total:,} bytes ({100 * (1 - total / 47328):.1f}% smaller than 1.0)")
    print(f"ZIP download: {len(archive.getvalue()):,} bytes")
    print(f"IDE import: {len(source):,} bytes; after creating images: {installed:,} bytes")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify committed assets without writing")
    build(parser.parse_args().check)
