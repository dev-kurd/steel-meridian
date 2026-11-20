# helpers to put transparent renders on a ground colour and to recolour with the team mask (linear light)
import numpy as np
from PIL import Image
GROUND = (126, 116, 98)
def s2l(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def l2s(c): c = np.clip(c, 0, 1); return np.where(c <= 0.0031308, 12.92 * c, 1.055 * c ** (1 / 2.4) - 0.055)
def on_ground(src, dst, bg=GROUND, crop=None, scale=None, quality=90):
    im = Image.open(src).convert('RGBA')
    if crop: im = im.crop(crop)
    base = Image.new('RGBA', im.size, bg + (255,)); base.alpha_composite(im); out = base.convert('RGB')
    if scale: out = out.resize((round(out.width * scale), round(out.height * scale)), Image.LANCZOS)
    out.save(dst, quality=quality); return out
def hex2rgb(h): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
def recolor(a_path, b_path, paint_srgb, light_srgb):
    A = np.asarray(Image.open(a_path).convert('RGBA')).astype(np.float64) / 255
    B = np.asarray(Image.open(b_path).convert('RGBA')).astype(np.float64) / 255
    la, lb = s2l(A[..., :3]), s2l(B[..., :3])
    mask = np.clip(lb - la, 0, 1)
    P = s2l(np.array(paint_srgb)); Lg = s2l(np.array(light_srgb))
    out = la + mask[..., 0:1] * P + mask[..., 1:2] * Lg
    rgb = l2s(out)
    return Image.fromarray((np.dstack([rgb, A[..., 3]]) * 255 + 0.5).astype(np.uint8), 'RGBA')
