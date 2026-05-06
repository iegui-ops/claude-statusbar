#!/usr/bin/env python3
import json, sys, os, time, datetime, subprocess, platform

# TTL countdown requires the background daemon (systemd on Linux, launchd on macOS)
TTL_SUPPORTED = platform.system() in ("Linux", "Darwin")

# ANSI
RESET  = "\033[0m"
BOLD   = "\033[1m"
DIM    = "\033[2m"
GREEN  = "\033[32m"
YELLOW = "\033[33m"
RED    = "\033[31m"
CYAN   = "\033[36m"
WHITE  = "\033[37m"

CACHE_DIR = os.path.expanduser("~/.claude/statusline-cache")
CACHE_TTL = 5       # seconds — statusline performance cache
API_CACHE_TTL = 300  # seconds — Anthropic prompt cache TTL (5 min)


def _color(pct):
    if pct >= 85: return RED
    if pct >= 60: return YELLOW
    return GREEN


def _bar(pct, width=20):
    filled = max(0, min(width, round(pct / 100 * width)))
    c = _color(pct)
    return f"{c}{'█' * filled}{'░' * (width - filled)}{RESET}"


def _fmt(n):
    if n is None: return "?"
    if n >= 1_000_000: return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:     return f"{n / 1_000:.1f}k"
    return str(n)


def _git_branch(cwd):
    try:
        return subprocess.check_output(
            ["git", "-C", cwd, "symbolic-ref", "--short", "HEAD"],
            stderr=subprocess.DEVNULL, text=True
        ).strip()
    except Exception:
        return ""


def _load_cache(cache_key):
    if not cache_key:
        return None
    try:
        path = os.path.join(CACHE_DIR, f"{cache_key}.json")
        with open(path) as f:
            entry = json.load(f)
        if time.time() - entry.get("ts", 0) < CACHE_TTL:
            return entry.get("out")
    except Exception:
        pass
    return None


def _save_cache(cache_key, out):
    if not cache_key:
        return
    try:
        os.makedirs(CACHE_DIR, exist_ok=True)
        path = os.path.join(CACHE_DIR, f"{cache_key}.json")
        with open(path, "w") as f:
            json.dump({"ts": time.time(), "out": out}, f)
    except Exception:
        pass


def _save_api_cache_ts(session_id):
    if not session_id:
        return
    try:
        os.makedirs(CACHE_DIR, exist_ok=True)
        path = os.path.join(CACHE_DIR, f"apicache_{session_id}.json")
        with open(path, "w") as f:
            json.dump({"ts": time.time()}, f)
    except Exception:
        pass


TTL_FILE = os.path.expanduser("~/.claude/statusline-ttl")

def _api_cache_remaining(session_id):
    try:
        with open(TTL_FILE) as f:
            val = f.read().strip()
        if not val:
            return None
        m, s = val.split(":")
        return int(m) * 60 + int(s)
    except Exception:
        return None


def build(data, sid="", branch=""):
    # ── Line 1 ────────────────────────────────────────────────────────────────
    cwd    = data.get("cwd") or os.getcwd()
    dname  = os.path.basename(cwd.rstrip("/")) or cwd
    model  = (data.get("model") or {})
    mname  = model.get("display_name") or (model if isinstance(model, str) else "") or ""

    parts = [f"{BOLD}{CYAN}{dname}{RESET}"]
    if branch:
        parts.append(f"{DIM}⎇ {branch}{RESET}")
    if mname:
        parts.append(f"{DIM}{mname}{RESET}")

    rl = data.get("rate_limits")
    if rl:
        five  = rl.get("five_hour") or {}
        seven = rl.get("seven_day") or {}

        pct5 = five.get("used_percentage")
        rst5 = five.get("resets_at")
        pct7 = seven.get("used_percentage")
        rst7 = seven.get("resets_at")

        if pct5 is not None:
            pct5 = max(0.0, min(100.0, float(pct5)))
            c5   = _color(pct5)
            rst  = f"↺{datetime.datetime.fromtimestamp(rst5).strftime('%H:%M')}" if rst5 else ""
            parts.append(f"5h:{c5}{pct5:.0f}%{RESET} {DIM}{rst}{RESET}")

        if pct7 is not None:
            pct7 = max(0.0, min(100.0, float(pct7)))
            c7   = _color(pct7)
            rst  = f"↺{datetime.datetime.fromtimestamp(rst7).strftime('%H:%M')}" if rst7 else ""
            parts.append(f"7d:{c7}{pct7:.0f}%{RESET} {DIM}{rst}{RESET}")

    line1 = "  ".join(parts)

    # ── Line 2 ────────────────────────────────────────────────────────────────
    ctx       = data.get("context_window") or {}
    used_pct  = float(ctx.get("used_percentage") or 0)
    ctx_size  = ctx.get("context_window_size")
    current   = ctx.get("current_usage") or {}
    inp_tok   = current.get("input_tokens")
    c_read    = current.get("cache_read_input_tokens")
    c_create  = current.get("cache_creation_input_tokens")

    c = _color(used_pct)
    bar_str  = _bar(used_pct)
    pct_str  = f"{c}{used_pct:.0f}%{RESET}"

    tok_str = ""
    if ctx_size:
        total_tok = (inp_tok or 0) + (c_read or 0) + (c_create or 0)
        if total_tok > 0:
            tok_str = f" {WHITE}{_fmt(total_tok)}/{_fmt(ctx_size)}{RESET}"

    cache_str = ""
    if c_read is not None:
        cache_str += f"  {DIM}{_fmt(c_read)} cache↩{RESET}"
    if c_create is not None:
        cache_str += f"  {DIM}{_fmt(c_create)} cache↑{RESET}"

    if TTL_SUPPORTED:
        try:
            with open(TTL_FILE) as f:
                ttl_str = f.read().strip()
            if ttl_str:
                cache_str += f"  {DIM}TTL {ttl_str}{RESET}"
        except Exception:
            pass

    line2 = f"{bar_str} {pct_str}{tok_str}{cache_str}"

    return f"{line1}\n{line2}"


def main():
    try:
        data = json.loads(sys.stdin.read())
    except Exception:
        data = {}

    sid    = data.get("session_id") or ""
    cwd    = data.get("cwd") or os.getcwd()
    branch = _git_branch(cwd)

    # Save cache timestamp before any rendering — must not be inside build()
    # or it resets on every rebuild, preventing the countdown from decreasing
    c_create = ((data.get("context_window") or {}).get("current_usage") or {}).get("cache_creation_input_tokens") or 0
    if c_create and TTL_SUPPORTED:
        _save_api_cache_ts(sid)

    # Cache key includes branch so switching branches busts the cache immediately
    cache_key = f"{sid}_{branch}" if branch else sid

    # Skip performance cache when TTL is active — the countdown must update every call
    if _api_cache_remaining(sid) is None:
        cached = _load_cache(cache_key)
        if cached:
            sys.stdout.write(cached)
            return

    out = build(data, sid, branch)
    _save_cache(cache_key, out)
    sys.stdout.write(out)


if __name__ == "__main__":
    main()
