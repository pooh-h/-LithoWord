#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
岩语 LithoWord · 桌面取词助手（零依赖）

做三件事：
1. 在本机 8737 端口托管网页版，双击启动即用；
2. 全局监听键盘，连按两次 Tab（可配置）时读取剪贴板；
3. 把词或原句送进网页，并把浏览器窗口带到前台。

不读取 Zotero 数据库，不联网上传任何内容。只用 Python 标准库。
"""

import atexit
import ctypes
import ctypes.wintypes as wt
import json
import mimetypes
import os
import re
import socket
import sqlite3
import subprocess
import sys
import threading
import time
import traceback
import webbrowser
from collections import deque
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs, quote
import urllib.request

APP_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = Path(__file__).resolve().parent / "agent_config.json"
PID_PATH = Path(__file__).resolve().parent / "agent.pid"
LOG_PATH = Path(__file__).resolve().parent / "agent.log"
VERSION = "1.4.0"

# 离线词典（ECDICT，由 tools/dict_build.py 生成）
DICT_DB = APP_DIR / "data" / "dict.sqlite"
DICT_PROGRESS = APP_DIR / "data" / "cache" / "dict-progress.json"
DICT_BUILDER = Path(__file__).resolve().parent / "dict_build.py"
DICT_MIN_ROWS = 200000
_build_proc = None

DEFAULTS = {
    "port": 8737,
    # 取词快捷键：doubleTab / tripleTab / ctrlTab / singleTab，
    # 或任意组合键，写法如 "ctrl+alt+w"、"ctrl+shift+space"、"alt+`"
    "hotkey": "doubleTab",
    "doubleTabMs": 420,
    "maxInbox": 30,
    "openBrowser": True,
    # 网页关掉后助手自动退出（免得打游戏时误触弹出收录窗口）
    "exitWhenPageCloses": True,
    "pageIdleSeconds": 90,
    "appTitleMatch": ["LithoWord", "岩语"],
}

HOTKEY_PRESETS = [
    {"value": "doubleTab", "label": "连按两次 Tab", "note": "默认。单次 Tab 仍正常切换焦点"},
    {"value": "ctrlTab", "label": "Ctrl + Tab", "note": "不冲突单 Tab，但会和浏览器切标签同拍"},
    {"value": "ctrl+alt+w", "label": "Ctrl + Alt + W", "note": "组合键不占单键，打游戏不会误触"},
    {"value": "ctrl+alt+q", "label": "Ctrl + Alt + Q", "note": "组合键"},
    {"value": "ctrl+alt+z", "label": "Ctrl + Alt + Z", "note": "组合键"},
    {"value": "ctrl+alt+x", "label": "Ctrl + Alt + X", "note": "组合键"},
    {"value": "ctrl+shift+space", "label": "Ctrl + Shift + Space", "note": "组合键"},
    {"value": "ctrl+`", "label": "Ctrl + `", "note": "左上角反引号"},
    {"value": "alt+`", "label": "Alt + `", "note": "左上角反引号"},
    {"value": "ctrl+alt+e", "label": "Ctrl + Alt + E", "note": "组合键"},
]

# 键名 → 虚拟键码
VK_TABLE = {
    "tab": 0x09, "enter": 0x0D, "return": 0x0D, "space": 0x20, "esc": 0x1B, "escape": 0x1B,
    "backspace": 0x08, "delete": 0x2E, "del": 0x2E, "insert": 0x2D, "ins": 0x2D,
    "home": 0x24, "end": 0x23, "pgup": 0x21, "pageup": 0x21, "pgdn": 0x22, "pagedown": 0x22,
    "left": 0x25, "up": 0x26, "right": 0x27, "down": 0x28,
    "`": 0xC0, "grave": 0xC0, "-": 0xBD, "=": 0xBB, "[": 0xDB, "]": 0xDD, "\\": 0xDC,
    ";": 0xBA, "'": 0xDE, ",": 0xBC, ".": 0xBE, "/": 0xBF,
}
for _i in range(10):
    VK_TABLE[str(_i)] = 0x30 + _i
for _c in "abcdefghijklmnopqrstuvwxyz":
    VK_TABLE[_c] = ord(_c.upper())
for _n in range(1, 13):
    VK_TABLE["f%d" % _n] = 0x6F + _n

MOD_ALIAS = {
    "ctrl": "ctrl", "control": "ctrl", "alt": "alt", "menu": "alt",
    "shift": "shift", "win": "win", "meta": "win", "super": "win", "cmd": "win",
}


def parse_combo(spec):
    """把 "ctrl+alt+w" / "doubleTab" 解析成 {mods, vk, double, triple}；不认识返回 None。"""
    raw = str(spec or "").strip()
    if not raw:
        return None
    key = raw.lower().replace(" ", "")
    if key in ("doubletab", "tabx2"):
        return {"mods": frozenset(), "vk": VK_TABLE["tab"], "double": True, "triple": False, "label": "连按两次 Tab"}
    if key in ("tripletab", "tabx3"):
        return {"mods": frozenset(), "vk": VK_TABLE["tab"], "double": False, "triple": True, "label": "连按三次 Tab"}
    if key == "singletab":
        return {"mods": frozenset(), "vk": VK_TABLE["tab"], "double": False, "triple": False, "label": "单次 Tab"}
    if key in ("ctrltab", "alt+tab"):
        return {"mods": frozenset(["ctrl"]), "vk": VK_TABLE["tab"], "double": False, "triple": False, "label": "Ctrl + Tab"}
    parts = [p for p in key.split("+") if p]
    if not parts:
        return None
    mods = set()
    main = None
    for p in parts:
        if p in MOD_ALIAS:
            mods.add(MOD_ALIAS[p])
        else:
            main = p
    if main is None or main not in VK_TABLE:
        return None
    if main == "tab" and not mods:
        # 裸 Tab 必须明确选 singleTab，避免这里被误解成"轻点一次就弹窗"
        return None
    label = " + ".join([m.capitalize() for m in ("ctrl", "alt", "shift", "win") if m in mods] + [main.upper() if len(main) == 1 else main.capitalize()])
    return {"mods": frozenset(mods), "vk": VK_TABLE[main], "double": False, "triple": False, "label": label}



def load_config():
    cfg = dict(DEFAULTS)
    try:
        if CONFIG_PATH.exists():
            cfg.update(json.loads(CONFIG_PATH.read_text(encoding="utf-8")))
    except Exception:
        log("配置文件读取失败，使用默认值", traceback.format_exc())
    return cfg


def write_config():
    """把当前可改项写回 agent_config.json（保留其余键）。"""
    data = dict(CFG)
    data["hotkey"] = HOTKEY_RAW
    data["exitWhenPageCloses"] = EXIT_ON_PAGE_CLOSE
    data["pageIdleSeconds"] = PAGE_IDLE
    data.pop("_说明", None)
    data["_说明"] = ("hotkey 可写 doubleTab / tripleTab / ctrlTab / singleTab，"
                 "也可以写任意组合键如 ctrl+alt+w、ctrl+shift+space、alt+`。"
                 "exitWhenPageCloses=true 时，网页关掉 pageIdleSeconds 秒后助手自动退出。"
                 "改这两项可以直接在网页「设置」里点，会立刻生效并写回本文件。")
    try:
        CONFIG_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return True
    except Exception:
        log("配置写入失败", traceback.format_exc())
        return False


def apply_config(patch):
    """热更新 hotkey / exitWhenPageCloses / pageIdleSeconds。返回 (ok, message)。"""
    global HOTKEY_RAW, COMBO, COMBO_LABEL, HOTKEY, EXIT_ON_PAGE_CLOSE, PAGE_IDLE
    changed = []
    if "hotkey" in patch:
        spec = str(patch.get("hotkey") or "").strip()
        combo = parse_combo(spec)
        if not combo:
            return False, "认不出这个快捷键：%s（试试 ctrl+alt+w、ctrl+shift+space、doubleTab）" % spec
        HOTKEY_RAW = spec
        HOTKEY = spec
        COMBO = combo
        COMBO_LABEL = combo["label"]
        CFG["hotkey"] = spec
        changed.append("快捷键 → %s" % COMBO_LABEL)
    if "exitWhenPageCloses" in patch:
        EXIT_ON_PAGE_CLOSE = bool(patch.get("exitWhenPageCloses"))
        CFG["exitWhenPageCloses"] = EXIT_ON_PAGE_CLOSE
        changed.append("关网页退出 → %s" % ("开" if EXIT_ON_PAGE_CLOSE else "关"))
    if "pageIdleSeconds" in patch:
        try:
            PAGE_IDLE = max(15, min(600, int(patch.get("pageIdleSeconds"))))
            CFG["pageIdleSeconds"] = PAGE_IDLE
            changed.append("空闲上限 → %s 秒" % PAGE_IDLE)
        except Exception:
            pass
    if not changed:
        return False, "没有可更新的字段"
    write_config()
    log("配置已更新：" + "；".join(changed))
    return True, "；".join(changed)


def log(msg, detail=""):
    line = "[%s] %s%s" % (time.strftime("%Y-%m-%d %H:%M:%S"), msg, (" " + detail) if detail else "")
    try:
        if LOG_PATH.exists() and LOG_PATH.stat().st_size > 1_000_000:
            LOG_PATH.write_text("", encoding="utf-8")
        with LOG_PATH.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except Exception:
        pass
    try:
        print(line, flush=True)
    except Exception:
        pass


CFG = load_config()
PORT = int(CFG.get("port") or 8737)
HOTKEY = str(CFG.get("hotkey") or "doubleTab")
DOUBLE_MS = int(CFG.get("doubleTabMs") or 420)
MAX_INBOX = int(CFG.get("maxInbox") or 30)
TITLE_MATCH = [t for t in (CFG.get("appTitleMatch") or DEFAULTS["appTitleMatch"]) if t]

# 快捷键与「关网页就退出」
HOTKEY_RAW = HOTKEY
COMBO = parse_combo(HOTKEY) or parse_combo("doubleTab")
COMBO_LABEL = COMBO["label"]
EXIT_ON_PAGE_CLOSE = bool(CFG.get("exitWhenPageCloses", True))
PAGE_IDLE = max(15, int(CFG.get("pageIdleSeconds") or 90))
PAGE_LAST = 0.0          # 网页最后一次心跳
PAGE_SEEN = False        # 是否见过网页（见过之后才开始看门狗）
BYE_PENDING = False      # 是否收到过「网页正在关闭」
BYE_GRACE = 25           # 收到 pagehide 后留多久（够别的标签页发下一次心跳，也不至于等太久）


INBOX = deque(maxlen=MAX_INBOX)
INBOX_LOCK = threading.Lock()
LAST_HEARTBEAT = 0.0
STARTED_AT = time.time()

# ---------------------------------------------------------------------------
# Win32 基础
# ---------------------------------------------------------------------------
user32 = ctypes.windll.user32 if os.name == "nt" else None
kernel32 = ctypes.windll.kernel32 if os.name == "nt" else None

ULONG_PTR = ctypes.c_size_t
LRESULT = ctypes.c_ssize_t
WPARAM = ctypes.c_size_t
LPARAM = ctypes.c_ssize_t

WH_KEYBOARD_LL = 13
WM_KEYDOWN = 0x0100
WM_SYSKEYDOWN = 0x0104
WM_QUIT = 0x0012
VK_TAB = 0x09
VK_CONTROL = 0x11
VK_MENU = 0x12
LLKHF_INJECTED = 0x10
SW_RESTORE = 9


class KBDLLHOOKSTRUCT(ctypes.Structure):
    _fields_ = [
        ("vkCode", wt.DWORD),
        ("scanCode", wt.DWORD),
        ("flags", wt.DWORD),
        ("time", wt.DWORD),
        ("dwExtraInfo", ULONG_PTR),
    ]


class MSG(ctypes.Structure):
    _fields_ = [
        ("hwnd", wt.HWND),
        ("message", wt.UINT),
        ("wParam", WPARAM),
        ("lParam", LPARAM),
        ("time", wt.DWORD),
        ("pt", wt.POINT),
    ]


def window_title(hwnd):
    n = user32.GetWindowTextLengthW(hwnd)
    if n <= 0:
        return ""
    buf = ctypes.create_unicode_buffer(n + 1)
    user32.GetWindowTextW(hwnd, buf, n + 1)
    return buf.value


def foreground_title():
    if not user32:
        return ""
    return window_title(user32.GetForegroundWindow())


def find_window(needles):
    """返回第一个标题包含任一关键字的可见窗口。"""
    found = []
    EnumProc = ctypes.WINFUNCTYPE(wt.BOOL, wt.HWND, LPARAM)

    def _cb(hwnd, _lparam):
        if not user32.IsWindowVisible(hwnd):
            return True
        title = window_title(hwnd)
        if title and any(n.lower() in title.lower() for n in needles):
            found.append(hwnd)
            return False
        return True

    try:
        user32.EnumWindows(EnumProc(_cb), 0)
    except Exception:
        pass
    return found[0] if found else 0


def bring_to_front(hwnd):
    if not hwnd:
        return False
    try:
        if user32.IsIconic(hwnd):
            user32.ShowWindow(hwnd, SW_RESTORE)
        user32.SetForegroundWindow(hwnd)
        user32.FlashWindow(hwnd, True)
        return user32.GetForegroundWindow() == hwnd
    except Exception:
        return False


def focus_app():
    """优先激活已经打开的岩语窗口，否则激活任意浏览器窗口。"""
    hwnd = find_window(TITLE_MATCH)
    if hwnd:
        return bring_to_front(hwnd)
    for name in ("Microsoft Edge", "Chrome", "Firefox", "Brave"):
        hwnd = find_window([name])
        if hwnd:
            return bring_to_front(hwnd)
    return False


def app_is_foreground():
    title = foreground_title().lower()
    return any(n.lower() in title for n in TITLE_MATCH)


# ---------------------------------------------------------------------------
# 剪贴板
# ---------------------------------------------------------------------------
CF_UNICODETEXT = 13
GMEM_MOVEABLE = 0x0002


def read_clipboard():
    if not user32:
        return ""
    for _ in range(3):
        if user32.OpenClipboard(None):
            try:
                handle = user32.GetClipboardData(CF_UNICODETEXT)
                if not handle:
                    return ""
                ptr = kernel32.GlobalLock(handle)
                if not ptr:
                    return ""
                try:
                    return ctypes.wstring_at(ptr)
                finally:
                    kernel32.GlobalUnlock(handle)
            finally:
                user32.CloseClipboard()
        time.sleep(0.05)
    return ""


def split_clip(raw):
    """短词直接当词；长句当语境，留空让用户填词。"""
    text = " ".join((raw or "").split())
    if not text:
        return "", ""
    if len(text) <= 48 and len(text.split()) <= 4:
        return text, ""
    return "", text[:500]


# ---------------------------------------------------------------------------
# 离线词典（ECDICT 英汉 · 77 万词条）
# ---------------------------------------------------------------------------
def dict_status():
    info = {"ready": False, "rows": 0, "size": 0, "built": "", "stage": "none",
            "text": "", "progress": 0, "error": ""}
    try:
        if DICT_DB.exists():
            con = sqlite3.connect(str(DICT_DB), timeout=3)
            try:
                meta = dict(con.execute("SELECT key, value FROM meta").fetchall())
            finally:
                con.close()
            rows = int(meta.get("rows") or 0)
            info.update(rows=rows, built=meta.get("built") or "",
                        size=DICT_DB.stat().st_size, ready=rows >= DICT_MIN_ROWS)
    except Exception as exc:
        info["error"] = str(exc)
    try:
        if DICT_PROGRESS.exists():
            p = json.loads(DICT_PROGRESS.read_text(encoding="utf-8"))
            done, total = p.get("done") or 0, p.get("total") or 0
            info["stage"] = p.get("stage") or "idle"
            info["text"] = p.get("text") or ""
            info["progress"] = int(done * 100 / total) if total else (100 if p.get("ok") else 0)
            if p.get("error"):
                info["error"] = p["error"]
    except Exception:
        pass
    return info


def clean_word(raw):
    w = " ".join(str(raw or "").split())
    return w.strip(" \t\r\n.,;:!?\"'()[]{}<>*·—–")


def norm_field(text):
    """ECDICT 的多义用字面量 \\n 分隔，转成真正的换行。"""
    return (text or "").replace("\\r", "").replace("\\n", "\n").strip()


def dict_candidates(word):
    """同一词的多种查询键：小写原形、去掉 's、简单复数 / 时态还原。"""
    low = clean_word(word).lower()
    out = [low]
    if low.endswith("'s"):
        out.append(low[:-2])
    for suf, repl in (("ies", "y"), ("ves", "f"), ("es", ""), ("s", ""),
                      ("ied", "y"), ("ed", ""), ("ing", "")):
        if low.endswith(suf) and len(low) > len(suf) + 2:
            out.append(low[: -len(suf)] + repl)
    return [x for x in dict.fromkeys(out) if x]


def dict_lookup(raw):
    word = clean_word(raw)
    if not word:
        return {"ok": True, "found": False, "reason": "空词"}
    if not DICT_DB.exists():
        return {"ok": True, "found": False, "word": word, "reason": "离线词典未安装"}
    t0 = time.time()
    try:
        con = sqlite3.connect(str(DICT_DB), timeout=3)
    except Exception as exc:
        return {"ok": False, "found": False, "word": word, "error": str(exc)}
    try:
        cols = ("w", "word", "phonetic", "trans", "definition", "pos", "tag", "exchange", "bnc", "frq")
        hit = matched = None
        for key in dict_candidates(word):
            row = con.execute(
                "SELECT " + ",".join(cols) + " FROM dict WHERE w = ? LIMIT 1", (key,)).fetchone()
            if row:
                hit, matched = dict(zip(cols, row)), key
                break
    except Exception as exc:
        return {"ok": False, "found": False, "word": word, "error": str(exc)}
    finally:
        con.close()

    if not hit:
        return {"ok": True, "found": False, "word": word,
                "ms": round((time.time() - t0) * 1000, 2)}
    trans = [x.strip() for x in norm_field(hit["trans"]).split("\n") if x.strip()]
    return {
        "ok": True, "found": True, "query": word, "word": hit["word"], "matched": matched,
        "phonetic": (hit["phonetic"] or "").strip(),
        "trans": trans,
        "definition": norm_field(hit["definition"]),
        "pos": (hit["pos"] or "").strip(),
        "tag": hit["tag"] or "",
        "exchange": hit["exchange"] or "",
        "bnc": hit["bnc"] or 0, "frq": hit["frq"] or 0,
        "source": "ECDICT 离线词典",
        "ms": round((time.time() - t0) * 1000, 2),
    }


def dict_build_async():
    """后台下载并构建离线词典，网页端轮询 /api/dict/status 看进度。"""
    global _build_proc
    st = dict_status()
    if st["ready"]:
        return {"started": False, "reason": "ready", "status": st}
    try:
        if _build_proc is not None and _build_proc.poll() is None:
            return {"started": False, "reason": "running", "pid": _build_proc.pid, "status": st}
    except Exception:
        _build_proc = None
    try:
        flags = 0
        if os.name == "nt":
            flags = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
        _build_proc = subprocess.Popen(
            [sys.executable, str(DICT_BUILDER)],
            cwd=str(APP_DIR), creationflags=flags,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        log("开始建立离线词典（pid %d）" % _build_proc.pid)
        return {"started": True, "pid": _build_proc.pid, "status": dict_status()}
    except Exception as exc:
        log("建立离线词典失败", traceback.format_exc())
        return {"started": False, "error": str(exc), "status": st}


# ---------------------------------------------------------------------------
# 联网词典（有道公开词条接口 · 结果缓存到本地，查过的词第二次不再联网）
# ---------------------------------------------------------------------------
ONLINE_DB = APP_DIR / "data" / "cache" / "online.sqlite"
ONLINE_TTL = 30 * 86400
ONLINE_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 LithoWord/1.3"


def _online_conv():
    ONLINE_DB.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(ONLINE_DB), timeout=3)
    con.execute("CREATE TABLE IF NOT EXISTS online (w TEXT PRIMARY KEY, payload TEXT NOT NULL, ts REAL NOT NULL)")
    con.commit()
    return con


def _strip_pos(line):
    return re.sub(r"^[-*·\s]+", "", str(line or "")).strip()


def _youdao_parse(word):
    url = "https://dict.youdao.com/jsonapi?q=" + quote(word) + "&type=1"
    req = urllib.request.Request(url, headers={
        "User-Agent": ONLINE_UA,
        "Referer": "https://dict.youdao.com/result?word=" + quote(word),
    })
    raw = urllib.request.urlopen(req, timeout=7).read().decode("utf-8", "ignore")
    data = json.loads(raw)
    ec_list = ((data.get("ec") or {}).get("word") or [])
    entry = ec_list[0] if ec_list else {}
    phone = {}
    for tr in entry.get("trs") or []:
        for item in tr.get("tr") or []:
            for line in ((item.get("l") or {}).get("i") or []):
                line = _strip_pos(line)
                if line:
                    phone.setdefault("trans", []).append(line)
    trans = phone.get("trans") or []
    phonetic = (entry.get("ukphone") or entry.get("usphone") or "").strip()
    if not phonetic:
        for w in ((data.get("simple") or {}).get("word") or []):
            if (w.get("phone") or "").strip():
                phonetic = w["phone"].strip()
                break
    examples = []
    pairs = (((data.get("blng_sents_part") or {}).get("sentence-pair")) or [])
    for p in pairs[:4]:
        en = (p.get("sentence") or "").strip()
        zh = (p.get("sentence-translation") or "").strip()
        if en:
            examples.append({"en": en, "zh": zh})
    if not examples:
        for s in (data.get("sentence") or {}).get("sentences") or []:
            en = (s.get("sentence") or "").strip()
            zh = (s.get("translation") or "").strip()
            if en:
                examples.append({"en": en, "zh": zh})
            if len(examples) >= 3:
                break
    audio = "https://dict.youdao.com/dictvoice?audio=" + quote(word) + "&type=1"
    rp = entry.get("return-phrase")
    if isinstance(rp, dict):
        rp = (rp.get("l") or {}).get("i")
    if isinstance(rp, list):
        rp = rp[0] if rp else ""
    rp = str(rp or "").strip() or word
    return {
        "ok": True, "found": bool(trans or phonetic),
        "word": rp,
        "phonetic": phonetic, "trans": trans, "examples": examples,
        "audio": audio, "source": "有道词典（联网）",
    }


def dict_online(raw):
    word = clean_word(raw)
    if not word:
        return {"ok": True, "found": False, "reason": "空词"}
    key = word.lower()
    t0 = time.time()
    try:
        con = _online_conv()
        row = con.execute("SELECT payload, ts FROM online WHERE w = ?", (key,)).fetchone()
        if row and (time.time() - float(row[1])) < ONLINE_TTL:
            con.close()
            payload = json.loads(row[0])
            payload["cached"] = True
            payload["ms"] = round((time.time() - t0) * 1000, 2)
            return payload
        con.close()
    except Exception:
        pass
    try:
        payload = _youdao_parse(word)
    except Exception as exc:
        return {"ok": False, "found": False, "word": word, "error": str(exc)[:200]}
    if payload.get("found"):
        try:
            con = _online_conv()
            con.execute("INSERT OR REPLACE INTO online (w, payload, ts) VALUES (?,?,?)",
                        (key, json.dumps(payload, ensure_ascii=False), time.time()))
            con.commit()
            con.close()
        except Exception:
            pass
    payload["cached"] = False
    payload["ms"] = round((time.time() - t0) * 1000, 2)
    return payload


def online_cache_count():
    try:
        con = _online_conv()
        n = con.execute("SELECT COUNT(*) FROM online").fetchone()[0]
        con.close()
        return int(n)
    except Exception:
        return 0


# ---------------------------------------------------------------------------
# HTTP：静态站点 + 取词接口
# ---------------------------------------------------------------------------
class Handler(SimpleHTTPRequestHandler):
    server_version = "LithoWordAgent/" + VERSION

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP_DIR), **kwargs)

    def log_message(self, fmt, *args):
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Cache-Control", "no-store")

    def _json(self, payload, code=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        try:
            body = json.loads(raw.decode("utf-8")) if raw else {}
        except Exception:
            body = {}
        if path == "/api/page/bye":
            global PAGE_LAST, BYE_PENDING
            if PAGE_SEEN and not BYE_PENDING:
                BYE_PENDING = True
                # 给刷新留出几秒：网页重新 ping 会把 PAGE_LAST 顶回去并取消
                PAGE_LAST = time.time() - PAGE_IDLE + BYE_GRACE
                log("网页正在关闭，%d 秒内没有新心跳就退出助手" % BYE_GRACE)
            self._json({"ok": True})
            return
        if path == "/api/config":
            ok, msg = apply_config(body)
            self._json({"ok": ok, "message": msg, "hotkey": HOTKEY_RAW,
                        "hotkeyLabel": COMBO_LABEL, "exitWhenPageCloses": EXIT_ON_PAGE_CLOSE,
                        "pageIdleSeconds": PAGE_IDLE, "presets": HOTKEY_PRESETS},
                       code=200 if ok else 400)
            return
        self._json({"ok": False, "error": "unknown endpoint"}, code=404)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/api/heartbeat":
            global LAST_HEARTBEAT
            LAST_HEARTBEAT = time.time()
            self._json({
                "ok": True, "app": "LithoWord desktop agent", "version": VERSION,
                "hotkey": HOTKEY_RAW, "hotkeyLabel": COMBO_LABEL, "doubleTabMs": DOUBLE_MS,
                "port": PORT, "pid": os.getpid(), "uptime": round(time.time() - STARTED_AT, 1),
                "inbox": len(INBOX), "exitWhenPageCloses": EXIT_ON_PAGE_CLOSE,
                "pageIdleSeconds": PAGE_IDLE, "presets": HOTKEY_PRESETS,
            })
            return
        if path == "/api/page/ping":
            global PAGE_LAST, PAGE_SEEN, BYE_PENDING
            PAGE_LAST = time.time()
            if BYE_PENDING:
                BYE_PENDING = False
                log("网页回来了（刷新或别的标签仍在），取消退出")
            if not PAGE_SEEN:
                PAGE_SEEN = True
                log("网页已连上，开始看守：%d 秒没有心跳就退出" % PAGE_IDLE if EXIT_ON_PAGE_CLOSE else "网页已连上")
            self._json({"ok": True, "exitWhenPageCloses": EXIT_ON_PAGE_CLOSE, "pageIdleSeconds": PAGE_IDLE})
            return
        if path == "/api/config":
            self._json({
                "ok": True, "hotkey": HOTKEY_RAW, "hotkeyLabel": COMBO_LABEL,
                "exitWhenPageCloses": EXIT_ON_PAGE_CLOSE, "pageIdleSeconds": PAGE_IDLE,
                "presets": HOTKEY_PRESETS,
            })
            return
        if path == "/api/inbox":
            with INBOX_LOCK:
                items = list(INBOX)
                INBOX.clear()
            self._json({"items": items})
            return
        if path == "/api/ping":
            self._json({"ok": True, "time": time.time()})
            return
        if path == "/api/dict":
            qs = parse_qs(parsed.query)
            self._json(dict_lookup((qs.get("w") or [""])[0]))
            return
        if path == "/api/dict/online":
            qs = parse_qs(parsed.query)
            self._json(dict_online((qs.get("w") or [""])[0]))
            return
        if path == "/api/dict/status":
            self._json(dict_status())
            return
        if path == "/api/dict/build":
            self._json(dict_build_async())
            return
        if path == "/":
            self.path = "/index.html" + (("?" + parsed.query) if parsed.query else "")
        super().do_GET()

    def end_headers(self):
        self._cors()
        super().end_headers()


def serve():
    mimetypes.add_type("application/javascript", ".js")
    mimetypes.add_type("image/svg+xml", ".svg")
    mimetypes.add_type("image/x-icon", ".ico")
    try:
        httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError as exc:
        log("端口 %d 无法监听：%s" % (PORT, exc))
        log("可能已经有一个取词助手在运行；如无窗口，请删掉 tools/agent.pid 后重试")
        return None
    httpd.daemon_threads = True
    t = threading.Thread(target=httpd.serve_forever, name="http", daemon=True)
    t.start()
    log("网页与接口已就绪：http://127.0.0.1:%d/" % PORT)
    return httpd


# ---------------------------------------------------------------------------
# 全局键盘钩子
# ---------------------------------------------------------------------------
_last_tab = 0.0
_tab_hits = []
_hook_ref = None


def _mods_down():
    """当前按住的修饰键集合。"""
    out = set()
    try:
        if user32.GetAsyncKeyState(0x11) & 0x8000:
            out.add("ctrl")
        if user32.GetAsyncKeyState(0x12) & 0x8000:
            out.add("alt")
        if user32.GetAsyncKeyState(0x10) & 0x8000:
            out.add("shift")
        if (user32.GetAsyncKeyState(0x5B) & 0x8000) or (user32.GetAsyncKeyState(0x5C) & 0x8000):
            out.add("win")
    except Exception:
        pass
    return out



def trigger_capture(reason):
    def work():
        try:
            raw = read_clipboard()
            text, quote = split_clip(raw)
            if not text and not quote:
                log("触发取词，但剪贴板是空的")
                return
            item = {
                "text": text, "quote": quote, "page": "",
                "sourceId": "", "at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "from": reason,
            }
            with INBOX_LOCK:
                INBOX.append(item)
            if time.time() - LAST_HEARTBEAT < 25:
                focus_app()
            elif CFG.get("openBrowser", True):
                webbrowser.open("http://127.0.0.1:%d/" % PORT)
                time.sleep(0.4)
                focus_app()
            log("已取词：%s" % (text or quote[:40]))
        except Exception:
            log("取词失败", traceback.format_exc())

    threading.Thread(target=work, name="capture", daemon=True).start()


def install_hook():
    """安装 WH_KEYBOARD_LL。返回 True 表示已装好（需要主线程跑消息循环）。"""
    if not user32:
        log("当前系统不是 Windows，跳过全局键盘监听")
        return False

    HookProc = ctypes.WINFUNCTYPE(LRESULT, ctypes.c_int, WPARAM, LPARAM)

    def _proc(n_code, w_param, l_param):
        global _last_tab, _tab_hits
        try:
            if n_code == 0 and w_param in (WM_KEYDOWN, WM_SYSKEYDOWN):
                ks = ctypes.cast(l_param, ctypes.POINTER(KBDLLHOOKSTRUCT)).contents
                # 忽略自己注入的按键（取词时会发 Ctrl+C），避免自触发
                if ks.flags & LLKHF_INJECTED and not os.environ.get("LITHO_ALLOW_INJECTED"):
                    return user32.CallNextHookEx(None, n_code, w_param, l_param)
                combo = COMBO
                if ks.vkCode == combo["vk"]:
                    mods = _mods_down()
                    if os.environ.get("LITHO_DEBUG_KEYS"):
                        log("按键 vk=%d mods=%s 期望=%s" % (ks.vkCode, sorted(mods), sorted(combo["mods"])))
                    if mods == set(combo["mods"]):
                        now = time.monotonic()
                        if combo["double"]:
                            if now - _last_tab <= DOUBLE_MS / 1000.0:
                                _last_tab = 0.0
                                trigger_capture("双击 Tab")
                            else:
                                _last_tab = now
                            # 不拦截 Tab：单 Tab 继续做它原本的事
                        elif combo["triple"]:
                            _tab_hits = [t for t in _tab_hits if now - t <= (DOUBLE_MS / 1000.0) * 1.6] + [now]
                            if len(_tab_hits) >= 3:
                                _tab_hits = []
                                trigger_capture("三击 Tab")
                        else:
                            trigger_capture(combo["label"])
                            return 1
        except Exception:
            pass
        try:
            return user32.CallNextHookEx(None, n_code, w_param, l_param)
        except Exception:
            return 0

    callback = HookProc(_proc)
    global _hook_ref
    _hook_ref = callback  # 防止被 GC
    hook = user32.SetWindowsHookExW(WH_KEYBOARD_LL, callback, None, 0)
    if not hook:
        log("键盘钩子安装失败（错误码 %d），仍可使用网页与接口" % ctypes.get_last_error())
        return False
    log("全局键盘监听已开启：%s" % COMBO_LABEL)
    return True


def message_loop():
    msg = MSG()
    while True:
        ret = user32.GetMessageW(ctypes.byref(msg), None, 0, 0)
        if ret in (0, -1):
            break
        user32.TranslateMessage(ctypes.byref(msg))
        user32.DispatchMessageW(ctypes.byref(msg))


def cleanup():
    try:
        if PID_PATH.exists() and PID_PATH.read_text(encoding="utf-8").strip() == str(os.getpid()):
            PID_PATH.unlink()
    except Exception:
        pass


def page_watchdog():
    """网页关掉之后自动退出，免得后台热键一直挂在那儿。"""
    while True:
        time.sleep(1.0)
        try:
            if not PAGE_SEEN or not EXIT_ON_PAGE_CLOSE:
                continue
            idle = time.time() - PAGE_LAST
            if idle > PAGE_IDLE:
                why = ("网页已关闭，助手退出" if BYE_PENDING
                       else "网页已经 %d 秒没有心跳，助手退出" % int(idle))
                log(why + "（想常驻就把 agent_config.json 里 exitWhenPageCloses 设为 false）")
                cleanup()
                os._exit(0)
        except Exception:
            pass


def main():
    if os.name == "nt":
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(1)
        except Exception:
            pass

    PID_PATH.write_text(str(os.getpid()), encoding="utf-8")
    atexit.register(cleanup)

    log("岩语 LithoWord 取词助手 v%s 启动（pid %d）" % (VERSION, os.getpid()))
    httpd = serve()
    if httpd is None:
        # 已有实例：直接把浏览器叫出来
        focus_app() or webbrowser.open("http://127.0.0.1:%d/" % PORT)
        return 0

    threading.Thread(target=page_watchdog, name="page-watch", daemon=True).start()
    hooked = install_hook()
    if hooked:
        try:
            message_loop()
        except KeyboardInterrupt:
            pass
    else:
        log("未开启全局监听，网页仍在 http://127.0.0.1:%d/ 运行。按 Ctrl+C 退出。" % PORT)
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            pass

    log("助手退出")
    return 0


if __name__ == "__main__":
    sys.exit(main())
