"""
从 logo.png 生成 Tauri 桌面端所需的所有图标尺寸。

输出覆盖：
  - icons/32x32.png
  - icons/128x128.png
  - icons/128x128@2x.png        (256x256)
  - icons/icon.png              (源尺寸)
  - icons/icon.ico              (多尺寸：16/32/48/64/128/256)
"""
from pathlib import Path
from PIL import Image

ROOT = Path(r"D:\BigLionX\SkillHub")
SRC = ROOT / "logo.png"
ICONS = ROOT / "apps" / "helper" / "src-tauri" / "icons"

src = Image.open(SRC).convert("RGBA")
print(f"源图: {SRC.name}  尺寸: {src.size}  模式: {src.mode}")

# 高质量下采样（Lanczos）
def resize(w: int, h: int = None) -> Image.Image:
    if h is None:
        h = w
    return src.resize((w, h), Image.LANCZOS)

# 各 PNG 尺寸
sizes = {
    "32x32.png": 32,
    "128x128.png": 128,
    "128x128@2x.png": 256,
}
for name, size in sizes.items():
    out = ICONS / name
    resize(size).save(out, "PNG", optimize=True)
    print(f"  写入 {out.relative_to(ROOT)}  ({size}x{size})")

# icon.png（应用图标，沿用源尺寸）
icon_png = ICONS / "icon.png"
src.save(icon_png, "PNG", optimize=True)
print(f"  写入 {icon_png.relative_to(ROOT)}  ({src.size[0]}x{src.size[1]})")

# icon.ico（Windows 安装包；包含 16/32/48/64/128/256 多尺寸）
ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
icon_ico = ICONS / "icon.ico"
src.save(icon_ico, "ICO", sizes=ico_sizes)
print(f"  写入 {icon_ico.relative_to(ROOT)}  (ICO, sizes={ico_sizes})")

print("\n全部完成。")
