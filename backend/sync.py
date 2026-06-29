import time
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

from backend.client import HOST


def sync_server_time(client) -> dict:
    """Synchronize local clock with the server Date header.

    Returns a dict with server_time, local_time, offset_ms, rtt_ms.
    offset_ms = server_time - local_time (positive means local is behind).
    """
    url = f"{HOST}/eams/stdElectCourse!innerIndex.action?projectId=1"
    t0 = time.perf_counter()
    resp = client.ids.head(url, headers=client.headers)
    t1 = time.perf_counter()
    rtt = t1 - t0

    date_header = resp.headers.get("Date")
    if not date_header:
        raise Exception("Server did not return Date header")

    server_time = parsedate_to_datetime(date_header)
    server_time += timedelta(seconds=rtt / 2)
    local_time = datetime.now(timezone.utc)
    offset = server_time - local_time

    return {
        "server_time": server_time.isoformat(),
        "local_time": local_time.isoformat(),
        "offset_ms": offset.total_seconds() * 1000,
        "rtt_ms": rtt * 1000,
    }
