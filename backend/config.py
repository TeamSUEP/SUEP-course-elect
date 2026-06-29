import json
from pathlib import Path

CONFIG_PATH = Path("config.json")


class Config:
    def __init__(self):
        self._data = {}
        if CONFIG_PATH.exists():
            try:
                self._data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            except Exception:
                self._data = {}

    def get(self, key, default=None):
        return self._data.get(key, default)

    def set(self, key, value):
        self._data[key] = value
        self.save()

    def set_many(self, data: dict):
        self._data.update(data)
        self.save()

    def save(self):
        CONFIG_PATH.write_text(
            json.dumps(self._data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )


config = Config()
