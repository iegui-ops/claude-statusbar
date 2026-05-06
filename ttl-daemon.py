#!/usr/bin/env python3
import time, json, os, glob

CACHE_DIR = os.path.expanduser("~/.claude/statusline-cache")
TTL_FILE  = os.path.expanduser("~/.claude/statusline-ttl")
API_CACHE_TTL = 300

def get_latest_ts():
    best = None
    for f in glob.glob(os.path.join(CACHE_DIR, "apicache_*.json")):
        try:
            with open(f) as fp:
                ts = json.load(fp)["ts"]
            if best is None or ts > best:
                best = ts
        except Exception:
            pass
    return best

while True:
    ts = get_latest_ts()
    if ts:
        remaining = API_CACHE_TTL - (time.time() - ts)
        if remaining > 0:
            m, s = int(remaining // 60), int(remaining % 60)
            try:
                with open(TTL_FILE, "w") as f:
                    f.write(f"{m}:{s:02d}")
            except Exception:
                pass
        else:
            try:
                os.remove(TTL_FILE)
            except Exception:
                pass
    time.sleep(1)
