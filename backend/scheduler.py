import threading
import time


class Scheduler:
    def __init__(self):
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def schedule(self, target_monotonic: float, callback):
        """Wait until target_monotonic time, then call callback()."""
        self._stop.clear()

        def run():
            while not self._stop.is_set():
                remaining = target_monotonic - time.monotonic()
                if remaining <= 0:
                    callback()
                    return
                time.sleep(min(remaining, 0.05))

        self._thread = threading.Thread(target=run, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
        if self._thread is not None and self._thread.is_alive():
            self._thread.join(timeout=1)

    @property
    def is_scheduled(self) -> bool:
        return self._thread is not None and self._thread.is_alive()
