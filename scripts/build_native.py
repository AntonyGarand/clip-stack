"""Build small LVGL v9 images and the original-firmware download (Pillow required)."""

from pathlib import Path
import argparse
import io
import struct
import zipfile

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
    for name, data in bundle.items():
        print(f"{name}: {len(data):,} bytes")
    print(f"Share payload: {total:,} bytes ({100 * (1 - total / 47328):.1f}% smaller than 1.0)")
    print(f"ZIP download: {len(archive.getvalue()):,} bytes")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify committed assets without writing")
    build(parser.parse_args().check)
