#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
岩语 LithoWord · 离线词典构建器（零依赖）

做三件事：
1. 从国内镜像下载 ECDICT 英汉词典数据（66 MB CSV，76 万词条，含音标/中文释义/词频/词形变化）；
2. 流式解析并写入 data/dict.sqlite（带索引，查一个词 ~1ms）；
3. 把进度写进 data/cache/dict-progress.json，网页端设置页可以实时看到。

用法：
    python tools/dict_build.py            # 下载 + 构建（已就绪则跳过）
    python tools/dict_build.py --check    # 只打印当前状态
    python tools/dict_build.py --force    # 强制重建

数据来源：ECDICT（MIT，skywind3000/ECDICT），通过 npm 包 ecdict 的镜像分发，不经过 GitHub。
"""

import argparse
import csv
import gzip
import io
import json
import os
import sqlite3
import sys
import tarfile
import time
import urllib.error
import urllib.request
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = APP_DIR / "data"
CACHE_DIR = DATA_DIR / "cache"
TARGET = DATA_DIR / "dict.sqlite"
PROGRESS = CACHE_DIR / "dict-progress.json"
CSV_PATH = CACHE_DIR / "ecdict.csv"
TGZ_PATH = CACHE_DIR / "ecdict.tgz"

VERSION = "1.0.0"
MIN_ROWS = 200000          # 少于这个数说明数据不完整，判定失败

# (名字, 地址, 类型)  优先国内镜像；都能断点续传
SOURCES = [
    ("npmmirror", "https://registry.npmmirror.com/ecdict/-/ecdict-0.0.4.tgz", "tgz"),
    ("npmjs", "https://registry.npmjs.org/ecdict/-/ecdict-0.0.4.tgz", "tgz"),
    ("jsdelivr-csv", "https://cdn.jsdelivr.net/gh/skywind3000/ECDICT@master/ecdict.csv", "csv"),
    ("ghproxy-csv", "https://ghproxy.net/https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv", "csv"),
]

UA = {"User-Agent": "LithoWord/1.0 dict-builder", "Accept": "*/*"}


# ------------------------------------------------------------------ 进度
_state = {"stage": "idle", "done": 0, "total": 0, "text": "", "ok": False,
          "rows": 0, "source": "", "updated": 0, "error": ""}


def write_progress(**kw):
    _state.update(kw)
    _state["updated"] = time.time()
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        PROGRESS.write_text(json.dumps(_state, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass


def say(msg):
    try:
        print(msg, flush=True)
    except Exception:
        pass


def human(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return ("%.1f%s" % (n, unit)) if unit != "B" else ("%dB" % n)
        n /= 1024.0


# ------------------------------------------------------------------ 下载
def download(url, dest, label):
    """带断点续传的下载；每 2% 更新一次进度。"""
    dest.parent.mkdir(parents=True, exist_ok=True)
    have = dest.stat().st_size if dest.exists() else 0
    headers = dict(UA)
    if have:
        headers["Range"] = "bytes=%d-" % have
    req = urllib.request.Request(url, headers=headers)
    try:
        resp = urllib.request.urlopen(req, timeout=25)
    except urllib.error.HTTPError as exc:
        if exc.code in (416, 200) and have:
            # 416：已经下完了；200：服务器不认 Range，从头来
            if exc.code == 416:
                say("  已完整下载，跳过")
                return dest
            have = 0
            req = urllib.request.Request(url, headers=dict(UA))
            resp = urllib.request.urlopen(req, timeout=25)
        else:
            raise
    total = int(resp.headers.get("Content-Length") or 0) + have
    write_progress(stage="download", done=have, total=total, text="正在下载词典数据 · " + label,
                   source=label)
    mode = "ab" if have else "wb"
    t0 = time.time()
    last_pct = -1
    with dest.open(mode) as fh:
        while True:
            chunk = resp.read(262144)
            if not chunk:
                break
            fh.write(chunk)
            have += len(chunk)
            pct = int(have * 100 / total) if total else 0
            if pct != last_pct and pct % 2 == 0:
                last_pct = pct
                write_progress(stage="download", done=have, total=total,
                               text="正在下载词典数据 · %s%%（%s / %s）"
                                    % (pct, human(have), human(total) if total else "?"))
                say("  %3d%%  %s / %s  %.1f MB/s" % (pct, human(have),
                                                     human(total) if total else "?",
                                                     (have / max(0.001, time.time() - t0)) / 1048576))
    resp.close()
    return dest


def ensure_csv():
    """拿到 ecdict.csv；返回路径。"""
    if CSV_PATH.exists() and CSV_PATH.stat().st_size > 20 * 1024 * 1024:
        say("已有 ecdict.csv（%s），跳过下载" % human(CSV_PATH.stat().st_size))
        return CSV_PATH

    errors = []
    for label, url, kind in SOURCES:
        try:
            say("尝试数据源：%s" % label)
            if kind == "csv":
                download(url, CSV_PATH, label)
                if CSV_PATH.stat().st_size > 20 * 1024 * 1024:
                    return CSV_PATH
                CSV_PATH.unlink(missing_ok=True)
                raise RuntimeError("文件太小")
            download(url, TGZ_PATH, label)
            write_progress(stage="extract", done=0, total=1, text="正在解压词典数据…")
            with tarfile.open(TGZ_PATH, "r:gz") as tar:
                member = None
                for m in tar.getmembers():
                    if m.name.endswith("ecdict.csv"):
                        member = m
                        break
                if member is None:
                    raise RuntimeError("包里没有 ecdict.csv")
                src = tar.extractfile(member)
                with CSV_PATH.open("wb") as out:
                    while True:
                        buf = src.read(1048576)
                        if not buf:
                            break
                        out.write(buf)
            say("已解压：%s" % human(CSV_PATH.stat().st_size))
            try:
                TGZ_PATH.unlink()
            except Exception:
                pass
            return CSV_PATH
        except Exception as exc:
            errors.append("%s: %s" % (label, exc))
            say("  × %s 失败：%s" % (label, exc))
    raise RuntimeError("所有数据源都失败：\n  " + "\n  ".join(errors))


# ------------------------------------------------------------------ 构建
def build(csv_file, force=False):
    if TARGET.exists() and not force:
        try:
            con = sqlite3.connect(str(TARGET))
            rows = con.execute("SELECT value FROM meta WHERE key='rows'").fetchone()
            con.close()
            if rows and int(rows[0]) >= MIN_ROWS:
                say("词典已就绪：%s 条（%s）" % (rows[0], human(TARGET.stat().st_size)))
                return True
        except Exception:
            pass

    write_progress(stage="build", done=0, total=1, text="正在构建词典索引…")
    tmp = TARGET.with_suffix(".building")
    if tmp.exists():
        tmp.unlink()

    con = sqlite3.connect(str(tmp))
    con.execute("PRAGMA journal_mode=OFF")
    con.execute("PRAGMA synchronous=OFF")
    con.execute("PRAGMA cache_size=-64000")
    con.execute("""CREATE TABLE dict (
        w TEXT PRIMARY KEY,       -- 小写查询键
        word TEXT,                -- 原始拼写
        phonetic TEXT,
        trans TEXT,               -- 中文释义，多义以换行分段
        definition TEXT,          -- 英文释义
        pos TEXT,                 -- 词性
        tag TEXT,                 -- cet4/cet6/ky/toefl/gre/zk/gk
        exchange TEXT,            -- 词形变化，如 0:原形 p:过去式
        bnc INTEGER,
        frq INTEGER
    )""")
    con.execute("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)")

    total_bytes = csv_file.stat().st_size
    read_bytes = 0
    batch = []
    n = 0
    t0 = time.time()
    last_pct = -1
    with csv_file.open("r", encoding="utf-8", newline="", errors="replace") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            read_bytes = fh.buffer.tell() if hasattr(fh, "buffer") else read_bytes
            w = (row.get("word") or "").strip()
            if not w:
                continue
            trans = (row.get("translation") or "").strip()
            defi = (row.get("definition") or "").strip()
            if not trans and not defi:
                continue
            key = w.lower()
            try:
                bnc = int(row.get("bnc") or 0)
            except ValueError:
                bnc = 0
            try:
                frq = int(row.get("frq") or 0)
            except ValueError:
                frq = 0
            batch.append((key, w, (row.get("phonetic") or "").strip(), trans, defi,
                          (row.get("pos") or "").strip(), (row.get("tag") or "").strip(),
                          (row.get("exchange") or "").strip(), bnc, frq))
            n += 1
            if len(batch) >= 4000:
                con.executemany("INSERT OR IGNORE INTO dict VALUES (?,?,?,?,?,?,?,?,?,?)", batch)
                con.commit()
                batch.clear()
                pct = int(read_bytes * 100 / total_bytes) if total_bytes else 0
                if pct != last_pct and pct % 3 == 0:
                    last_pct = pct
                    write_progress(stage="build", done=pct, total=100,
                                   text="正在构建词典索引 · %d%%（已写入 %s 条）" % (pct, format(n, ",")),
                                   rows=n)
                    say("  %3d%%  %s 条  %.1fs" % (pct, format(n, ","), time.time() - t0))
    if batch:
        con.executemany("INSERT OR IGNORE INTO dict VALUES (?,?,?,?,?,?,?,?,?,?)", batch)
        con.commit()
    con.executemany("INSERT OR REPLACE INTO meta VALUES (?,?)", [
        ("rows", str(n)),
        ("source", _state.get("source") or "ECDICT"),
        ("built", time.strftime("%Y-%m-%d %H:%M:%S")),
        ("version", VERSION),
    ])
    con.commit()
    con.execute("ANALYZE")
    con.close()

    if TARGET.exists():
        TARGET.unlink()
    tmp.replace(TARGET)
    say("构建完成：%s 条 → %s（%.1fs）" % (format(n, ","), human(TARGET.stat().st_size), time.time() - t0))
    if n < MIN_ROWS:
        write_progress(stage="error", ok=False, error="词条数不足（%d）" % n)
        return False
    return True


# ------------------------------------------------------------------ 状态
def status():
    info = {"ready": False, "rows": 0, "size": 0, "built": "", "db": str(TARGET)}
    try:
        if TARGET.exists():
            con = sqlite3.connect(str(TARGET))
            meta = dict(con.execute("SELECT key, value FROM meta").fetchall())
            con.close()
            info.update(rows=int(meta.get("rows") or 0), built=meta.get("built") or "",
                        size=TARGET.stat().st_size, ready=int(meta.get("rows") or 0) >= MIN_ROWS)
    except Exception as exc:
        info["error"] = str(exc)
    return info


def main(argv=None):
    ap = argparse.ArgumentParser(description="构建岩语离线词典")
    ap.add_argument("--check", action="store_true", help="只打印状态")
    ap.add_argument("--force", action="store_true", help="强制重建")
    args = ap.parse_args(argv)

    if args.check:
        info = status()
        say(json.dumps(info, ensure_ascii=False, indent=2))
        return 0 if info["ready"] else 1

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    say("岩语 LithoWord · 离线词典构建 v%s" % VERSION)
    say("数据目录：%s" % DATA_DIR)
    write_progress(stage="start", ok=False, text="准备中…")
    try:
        csv_file = ensure_csv()
        ok = build(csv_file, force=args.force)
        if not ok:
            write_progress(stage="error", ok=False, error="构建失败：词条数不足")
            return 2
        info = status()
        write_progress(stage="done", ok=True, done=1, total=1, rows=info["rows"],
                       text="词典已就绪：%s 条" % format(info["rows"], ","))
        say("✅ 词典已就绪：%s 条，%s" % (format(info["rows"], ","), human(info["size"])))
        try:
            if CSV_PATH.exists():
                CSV_PATH.unlink()     # 只为构建用，构建完就删，省 66 MB
        except Exception:
            pass
        return 0
    except Exception as exc:
        write_progress(stage="error", ok=False, error=str(exc))
        say("❌ 失败：%s" % exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
