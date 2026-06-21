import json
import threading
from datetime import datetime
from typing import List, Optional

from config import BACKEND_DIR

LOG_DIR = BACKEND_DIR / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

_lock = threading.Lock()
_store: dict[str, List[dict]] = {}
MAX_LINES = 200000


def _log_file(step: str):
    safe = "".join(c for c in step if c.isalnum() or c in ("_", "-")) or "unknown"
    return LOG_DIR / f"{safe}.log"


def _load_from_disk(step: str) -> List[dict]:
    path = _log_file(step)
    if not path.exists():
        return []
    out: List[dict] = []
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.rstrip("\n")
                if not line:
                    continue
                try:
                    out.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    except Exception:
        return []
    if len(out) > MAX_LINES:
        out = out[-MAX_LINES:]
    return out


def _persist_line(step: str, line: dict) -> None:
    path = _log_file(step)
    try:
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(line, ensure_ascii=False) + "\n")
    except Exception:
        pass


def _ensure_loaded(step: str) -> List[dict]:
    bucket = _store.get(step)
    if bucket is None:
        loaded = _load_from_disk(step)
        _store[step] = loaded
        return loaded
    return bucket


def append(step: str, msg: str, level: str = "info") -> None:
    step = (step or "").strip() or "unknown"
    line = {
        "ts": datetime.now().strftime("%H:%M:%S"),
        "level": level if level in ("info", "error", "warn") else "info",
        "msg": str(msg),
    }
    with _lock:
        bucket = _ensure_loaded(step)
        bucket.append(line)
        if len(bucket) > MAX_LINES:
            del bucket[: len(bucket) - MAX_LINES]
        _persist_line(step, line)


def get(step: str) -> List[dict]:
    step = (step or "").strip()
    with _lock:
        bucket = _ensure_loaded(step)
        return list(bucket)


def clear(step: Optional[str] = None) -> None:
    with _lock:
        if step is None:
            for s in list(_store.keys()):
                _store[s] = []
            try:
                for f in LOG_DIR.glob("*.log"):
                    f.unlink()
            except Exception:
                pass
        else:
            step = step.strip()
            _store[step] = []
            try:
                p = _log_file(step)
                if p.exists():
                    p.unlink()
            except Exception:
                pass
