import socket
import threading

import uvicorn
import webview

from backend.api import app


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main():
    port = find_free_port()
    server = threading.Thread(
        target=lambda: uvicorn.run(
            app, host="127.0.0.1", port=port, log_level="warning"
        ),
        daemon=True,
    )
    server.start()
    window = webview.create_window(
        "Course Elect Terminal",
        f"http://127.0.0.1:{port}",
        width=1400,
        height=900,
        min_size=(1100, 700),
    )
    webview.start()


if __name__ == "__main__":
    main()
