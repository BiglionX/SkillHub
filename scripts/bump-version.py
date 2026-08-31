"""
SkillHub 版号管理脚本（bump-version.py）

规则：
  - 三段式：<X>.<Y>.<Z>，X/Y 任意整数，Z 是百进制（00-99）
  - 每次只 Z + 1
  - Z 满百（99 → 100）时：Z 归 0，Y + 1
  - Y 满百时：Y 归 0，X + 1
  - 起始版号：0.1.00
  - 格式约定：Z 永远两位（00-99）；Y 在 < 10 时不补零，便于阅读（0.1.00、0.10.00、1.0.00）

支持的文件类型：
  - package.json       JSON，"version" 字段
  - Cargo.toml         TOML，[package].version 字段
  - tauri.conf.json    JSON，"version" 字段

用法：
  python scripts/bump-version.py --file PATH [--type auto|package|cargo|tauri] [--dry-run] [--start] [--set VERSION]
  python scripts/bump-version.py --file PATH --start            # 重置为 0.1.00（仅新包首次发版时用）
  python scripts/bump-version.py --file PATH --set 0.3.05       # 显式设置版本
  python scripts/bump-version.py --file PATH --dry-run          # 预览
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

START_VERSION = (0, 1, 0)  # 0.1.00
MAX_ZZ = 99


def parse_version(v: str) -> tuple[int, int, int]:
    """解析版本字符串为 (X, Y, Z)，允许 Z 写成 0 / 00 / 99。"""
    m = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)", v.strip())
    if not m:
        raise ValueError(f"非法版本号: {v!r}（应为 X.Y.Z）")
    x, y, z = (int(m.group(1)), int(m.group(2)), int(m.group(3)))
    if z > MAX_ZZ:
        raise ValueError(f"尾数 Z={z} 超过 {MAX_ZZ}（满百进位规则不允许）")
    return (x, y, z)


def format_version(ver: tuple[int, int, int]) -> str:
    """格式化为字符串：Z 永远两位，Y < 10 不补零。"""
    x, y, z = ver
    return f"{x}.{y}.{z:02d}"


def bump(ver: tuple[int, int, int]) -> tuple[int, int, int]:
    """按规则 +1：Z+1，Z 满百则进位到 Y，Y 满百则进位到 X。"""
    x, y, z = ver
    z += 1
    if z > MAX_ZZ:
        z = 0
        y += 1
        if y > MAX_ZZ:
            y = 0
            x += 1
    return (x, y, z)


# ---------- 文件读写 ----------

def detect_type(path: Path) -> str:
    """根据文件名猜测文件类型。"""
    name = path.name.lower()
    if name == "package.json":
        return "package"
    if name == "cargo.toml":
        return "cargo"
    if name == "tauri.conf.json":
        return "tauri"
    raise ValueError(f"无法识别文件类型: {path.name}（请用 --type 显式指定）")


def read_version(path: Path, ftype: str) -> str:
    if ftype in ("package", "tauri"):
        data = json.loads(path.read_text(encoding="utf-8"))
        if "version" not in data:
            raise ValueError(f"{path} 中找不到 'version' 字段")
        return str(data["version"])
    if ftype == "cargo":
        text = path.read_text(encoding="utf-8")
        m = re.search(r'^version\s*=\s*"([^"]+)"', text, re.MULTILINE)
        if not m:
            raise ValueError(f"{path} 中找不到 'version = \"...\"' 字段")
        return m.group(1)
    raise ValueError(f"未知文件类型: {ftype}")


def write_version(path: Path, ftype: str, new_v: str) -> None:
    if ftype in ("package", "tauri"):
        data = json.loads(path.read_text(encoding="utf-8"))
        data["version"] = new_v
        # 保持原文件末尾是否有换行
        raw = path.read_text(encoding="utf-8")
        trailing = "\n" if raw.endswith("\n") else ""
        path.write_text(
            json.dumps(data, indent=2, ensure_ascii=False) + trailing,
            encoding="utf-8",
        )
        return
    if ftype == "cargo":
        text = path.read_text(encoding="utf-8")
        new_text, count = re.subn(
            r'^(version\s*=\s*)"[^"]+"',
            rf'\1"{new_v}"',
            text,
            count=1,
            flags=re.MULTILINE,
        )
        if count != 1:
            raise ValueError(f"{path} 中未能替换 version 字段")
        path.write_text(new_text, encoding="utf-8")
        return
    raise ValueError(f"未知文件类型: {ftype}")


# ---------- CLI ----------

def main() -> int:
    ap = argparse.ArgumentParser(description="SkillHub 版号 bump 工具（百进制 ZZ，满百进位）")
    ap.add_argument("--file", "-f", required=True, type=Path, help="目标文件路径")
    ap.add_argument(
        "--type",
        choices=["auto", "package", "cargo", "tauri"],
        default="auto",
        help="文件类型（默认 auto 按文件名猜测）",
    )
    ap.add_argument("--dry-run", action="store_true", help="只打印结果，不写文件")
    ap.add_argument("--start", action="store_true", help=f"重置为起始版号 {format_version(START_VERSION)}")
    ap.add_argument("--set", dest="set_version", help="显式设置为指定版本（如 0.3.05）")
    args = ap.parse_args()

    ftype = detect_type(args.file) if args.type == "auto" else args.type

    if args.set_version:
        new_ver = parse_version(args.set_version)
    elif args.start:
        new_ver = START_VERSION
    else:
        cur_str = read_version(args.file, ftype)
        cur_ver = parse_version(cur_str)
        new_ver = bump(cur_ver)

    new_str = format_version(new_ver)

    if args.dry_run:
        try:
            cur_str = read_version(args.file, ftype)
            print(f"[dry-run] {args.file} ({ftype}): {cur_str}  →  {new_str}")
        except Exception:
            print(f"[dry-run] {args.file} ({ftype}): <无当前版本>  →  {new_str}")
        return 0

    try:
        cur_str = read_version(args.file, ftype)
        action = "重置" if args.start else ("设置" if args.set_version else "bump")
        print(f"{args.file} ({ftype}): {cur_str}  →  {new_str}  [{action}]")
    except Exception:
        print(f"{args.file} ({ftype}): <新建>  →  {new_str}")

    write_version(args.file, ftype, new_str)
    return 0


if __name__ == "__main__":
    sys.exit(main())
