from __future__ import annotations

import logging
import threading
import time
from collections import deque
from pathlib import Path


class RingHandler(logging.Handler):
    def __init__(self, capacity: int = 3000) -> None:
        super().__init__()
        self._items: deque[dict] = deque(maxlen=capacity)
        self._lock = threading.Lock()
        self._next_id = 0

    def emit(self, record: logging.LogRecord) -> None:
        with self._lock:
            self._items.append({
                "id": self._next_id,
                "ts": time.time(),
                "level": record.levelname,
                "logger": record.name,
                "message": self.format(record),
            })
            self._next_id += 1

    def snapshot(self, *, limit: int = 500, since_id: int | None = None) -> list[dict]:
        with self._lock:
            items = list(self._items)
        if since_id is not None:
            items = [item for item in items if item["id"] > since_id]
        return items[-max(1, min(limit, 2000)):]

    def clear(self) -> None:
        with self._lock: self._items.clear()


ring = RingHandler()


def install(log_root: Path) -> None:
    log_root.mkdir(parents=True, exist_ok=True)
    ring.setFormatter(logging.Formatter("%(message)s"))
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    if ring not in root.handlers: root.addHandler(ring)

