"""Remove white plate from DomiClick round mark for header/UI use."""
from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(
    r"C:\Users\empre\.cursor\projects\c-Users-empre-Desktop-domiclik-main\assets"
    r"\DomiClick_Redondo_PNG_-af1377c7-e8b1-4d56-9472-8773adae772d.png"
)


def remove_white_bg(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    pix = img.load()
    assert pix is not None
    w, h = img.size

    for y in range(h):
        for x in range(w):
            r, g, b, a = pix[x, y]
            if r > 245 and g > 245 and b > 245:
                pix[x, y] = (r, g, b, 0)
                continue
            if r > 230 and g > 230 and b > 230 and abs(r - g) < 8 and abs(g - b) < 8:
                brightness = (r + g + b) / 3
                alpha = int(max(0, min(255, (255 - brightness) * 8)))
                pix[x, y] = (r, g, b, 0) if alpha < 20 else (r, g, b, alpha)

    visited = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()
    for x, y in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        q.append((x, y))
        visited[y][x] = True
    while q:
        x, y = q.popleft()
        r, g, b, a = pix[x, y]
        if a == 0 or (r > 235 and g > 235 and b > 235 and abs(r - g) < 12 and abs(g - b) < 12):
            pix[x, y] = (r, g, b, 0)
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx]:
                    nr, ng, nb, na = pix[nx, ny]
                    if na == 0 or (
                        nr > 235 and ng > 235 and nb > 235 and abs(nr - ng) < 12 and abs(ng - nb) < 12
                    ):
                        visited[ny][nx] = True
                        q.append((nx, ny))

    bbox = img.getbbox()
    if not bbox:
        return img
    cropped = img.crop(bbox)
    pad = 24
    canvas = Image.new("RGBA", (cropped.width + pad * 2, cropped.height + pad * 2), (0, 0, 0, 0))
    canvas.paste(cropped, (pad, pad), cropped)
    return canvas


def save_contain(mark: Image.Image, size: int, path: Path) -> None:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    fitted = mark.copy()
    fitted.thumbnail((int(size * 0.92), int(size * 0.92)), Image.Resampling.LANCZOS)
    x = (size - fitted.width) // 2
    y = (size - fitted.height) // 2
    canvas.paste(fitted, (x, y), fitted)
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path, "PNG", optimize=True)
    print("wrote", path)


def main() -> None:
    mark = remove_white_bg(Image.open(SRC))
    brand = ROOT / "client-web" / "public" / "brand"
    save_contain(mark, 512, brand / "logo-optimized-transparent.png")
    save_contain(mark, 512, brand / "logo-header.png")
    save_contain(mark, 256, brand / "logo-mark.png")
    # UI logo without white plate (favicon/app icons keep opaque variants elsewhere)
    save_contain(mark, 1024, brand / "logo-domiclick.png")
    corner = Image.open(brand / "logo-optimized-transparent.png").getpixel((0, 0))
    print("corner", corner)


if __name__ == "__main__":
    main()
