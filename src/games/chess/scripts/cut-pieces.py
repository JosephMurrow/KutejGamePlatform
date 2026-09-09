"""
Нарезка листа фигур на двенадцать файлов с прозрачным фоном.

Запускается руками и в сборку не входит: нужен Pillow и numpy, которых в
зависимостях проекта нет. Лежит здесь, чтобы фигуры можно было перерезать —
например, если хозяин пришлёт новый лист.

    python3 src/games/chess/scripts/cut-pieces.py

Лист снят на тёмном фоне со свечением, и порогами он не режется: подсветка
вокруг фигур такая же яркая, как кость, и такая же нейтральная, как графит.
Зато у фигуры есть резкий контур, а у свечения — плавный градиент. Поэтому
граница ищется по краям: контур замыкается, фон заливается снаружи, а всё, что
осталось внутри, и есть фигура.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter
import numpy as np

SRC = Path(__file__).with_name("pieces-side.png")
DEST = Path(__file__).parents[4] / "public/games/chess/pieces"
KINDS = ["p", "r", "n", "b", "q", "k"]
# Ряд листа, порог края и радиус замыкания. У кости контур ярче, но и разрывов
# в нём больше — блики на боках рвут границу, и смыкать её приходится сильнее.
BANDS = {"w": (20, 445, 11, 11), "b": (465, 845, 12, 7)}
SIZE = 224
PAD = 6

def edges(lum: np.ndarray) -> np.ndarray:
    """Модуль градиента: резкая граница фигуры против плавного свечения."""
    smooth = np.asarray(
        Image.fromarray(lum.astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    ).astype(np.float32)

    gx, gy = np.zeros_like(smooth), np.zeros_like(smooth)
    gx[:, 1:-1] = smooth[:, 2:] - smooth[:, :-2]
    gy[1:-1, :] = smooth[2:, :] - smooth[:-2, :]

    return np.hypot(gx, gy)

def columns(mask: np.ndarray, min_width: int = 50) -> list[tuple[int, int]]:
    """Колонки фигур: непрерывные полосы, где край не пуст."""
    filled = mask.sum(axis=0) > 3
    found, start = [], None

    for x, on in enumerate(filled):
        if on and start is None:
            start = x
        elif not on and start is not None:
            if x - start >= min_width:
                found.append((start, x))
            start = None
    if start is not None and len(filled) - start >= min_width:
        found.append((start, len(filled)))

    return found

def solid(outline: Image.Image, closing: int) -> Image.Image:
    """Замкнуть контур и залить внутренность."""
    closed = outline.filter(ImageFilter.MaxFilter(closing))

    # Заливаем фон снаружи: что осталось чёрным — внутренность фигуры.
    outside = closed.copy()
    for corner in ((0, 0), (outside.width - 1, 0), (0, outside.height - 1),
                   (outside.width - 1, outside.height - 1)):
        ImageDraw.floodfill(outside, corner, 128)

    inside = outside.point(lambda v: 255 if v == 0 else 0)
    filled = Image.fromarray(np.maximum(np.asarray(closed), np.asarray(inside)))

    # Снять утолщение, оставленное замыканием, и растушевать край.
    return filled.filter(ImageFilter.MinFilter(closing)).filter(
        ImageFilter.GaussianBlur(0.8)
    )

def extract() -> dict[str, Image.Image]:
    sheet = Image.open(SRC).convert("RGB")
    lum = np.asarray(sheet).astype(np.int16).max(axis=2)
    grad = edges(lum)
    pieces: dict[str, Image.Image] = {}

    for color, (top, bottom, threshold, closing) in BANDS.items():
        band = grad[top:bottom] > threshold
        found = columns(band)
        if len(found) != len(KINDS):
            raise SystemExit(f"{color}: найдено {len(found)} фигур вместо {len(KINDS)}")

        for kind, (x0, x1) in zip(KINDS, found):
            pad = 10
            box = (max(0, x0 - pad), top, min(sheet.width, x1 + pad), bottom)
            outline = Image.fromarray(
                ((grad[box[1]:box[3], box[0]:box[2]] > threshold) * 255).astype(np.uint8)
            )
            mask = solid(outline, closing)

            piece = sheet.crop(box).convert("RGBA")
            piece.putalpha(mask)

            crop = mask.point(lambda v: 255 if v > 70 else 0).getbbox()
            if crop:
                piece = piece.crop(crop)

            pieces[f"{color}{kind}"] = piece

    return pieces

def save(pieces: dict[str, Image.Image]) -> list[tuple[str, tuple[int, int]]]:
    """Один масштаб на весь набор: пешка обязана быть ниже короля."""
    room = SIZE - PAD * 2
    scale = min(
        room / max(p.height for p in pieces.values()),
        room / max(p.width for p in pieces.values()),
    )

    made = []
    for name, piece in pieces.items():
        sized = piece.resize(
            (max(1, round(piece.width * scale)), max(1, round(piece.height * scale))),
            Image.LANCZOS,
        )
        canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        # Фигура стоит на поле, а не висит по центру: опора на нижний край.
        canvas.paste(
            sized, ((SIZE - sized.width) // 2, SIZE - PAD - sized.height), sized
        )
        DEST.mkdir(parents=True, exist_ok=True)
        canvas.save(DEST / f"{name}.png", optimize=True)
        made.append((f"{name}.png", sized.size))

    return made

if __name__ == "__main__":
    for name, size in save(extract()):
        print(name, size)
