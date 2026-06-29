import asyncio
import queue
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
import sys

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.client import CourseElectClient
from backend.config import config
from ids import IdsAuth
from backend.models import LoginRequest, StartRequest
from backend.runner import Runner
from backend.scheduler import Scheduler
from backend.sync import sync_server_time

# Shared application state
client = CourseElectClient()
runner = Runner(client)
scheduler = Scheduler()
sync_state: dict = {"offset_ms": 0.0}

log_queue: queue.Queue = queue.Queue()


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        dead: list[WebSocket] = []
        for conn in self.active_connections:
            try:
                await conn.send_json(message)
            except Exception:
                dead.append(conn)
        for conn in dead:
            self.disconnect(conn)


manager = ConnectionManager()


def log_callback(log: dict):
    log_queue.put(log)


def _drain_logs(loop: asyncio.AbstractEventLoop):
    while True:
        message = log_queue.get()
        asyncio.run_coroutine_threadsafe(manager.broadcast(message), loop)


@asynccontextmanager
async def lifespan(app: FastAPI):
    loop = asyncio.get_running_loop()
    t = threading.Thread(target=_drain_logs, args=(loop,), daemon=True)
    t.start()
    try:
        IdsAuth.rVerify = config.get("verify_ssl", True)
    except Exception:
        pass
    try:
        if client.load_cookies():
            runner.log_callback = log_callback
    except Exception:
        pass
    yield


if getattr(sys, "frozen", False):
    FRONTEND_DIR = Path(sys._MEIPASS) / "frontend"
else:
    FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

app = FastAPI(title="Course Elect API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.post("/login")
def login(req: LoginRequest):
    if req.remember_username:
        config.set("username", req.username)
    ok = client.login(req.username, req.password)
    if not ok:
        raise HTTPException(status_code=401, detail="Login failed")
    runner.log_callback = log_callback
    return {"ok": True, "username": req.username}


@app.post("/logout")
def logout():
    client.logout()
    return {"ok": True}


@app.get("/me")
def me():
    return {
        "logged_in": client.is_logged_in,
        "username": config.get("username", ""),
    }


@app.get("/config")
def get_config():
    return config._data


@app.post("/config")
def set_config(payload: dict):
    config.set_many(payload)
    return {"ok": True}


@app.get("/verify-ssl")
def get_verify_ssl():
    return {"enabled": config.get("verify_ssl", True)}


@app.post("/verify-ssl")
def set_verify_ssl(payload: dict):
    enabled = payload.get("enabled", True)
    config.set("verify_ssl", enabled)
    IdsAuth.rVerify = enabled
    return {"enabled": enabled}


@app.get("/demo")
def get_demo():
    return {"enabled": client.demo}


@app.post("/demo")
def set_demo(payload: dict):
    enabled = payload.get("enabled", False)
    client.demo = enabled
    return {"enabled": client.demo}


@app.get("/elections")
def elections():
    try:
        return client.get_elections()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/courses")
def courses(election_id: str, check_availability: bool = False):
    try:
        data = client.get_courses(election_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    if check_availability and not client.demo:
        try:
            courses_status = client.get_courses_status(
                client.get_semester_info(election_id)
            )
            for course in data:
                cid = str(course.get("id"))
                if cid in courses_status:
                    course["available"] = (
                        courses_status[cid]["sc"] < courses_status[cid]["lc"]
                    )
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    return data


@app.post("/sync-time")
def sync_time():
    global sync_state
    if client.demo:
        result = {
            "server_time": datetime.now(timezone.utc).isoformat(),
            "local_time": datetime.now(timezone.utc).isoformat(),
            "offset_ms": 0.0,
            "rtt_ms": 0.0,
        }
    else:
        try:
            result = sync_server_time(client)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    sync_state = result
    return result


@app.post("/start")
def start(req: StartRequest):
    if runner._threads and any(t.is_alive() for t in runner._threads):
        raise HTTPException(status_code=409, detail="Task already running")

    default_election_id = req.election_id
    # If no default election is provided, all course nodes must carry their own.
    if not default_election_id:
        for task in req.tasks:
            if not _task_has_election_id(task):
                raise HTTPException(
                    status_code=400,
                    detail="任务中存在未指定批次的课程节点，请选择默认批次或为每门课程设置批次",
                )

    config.set_many(
        {
            "election_id": req.election_id,
            "tasks": [t.model_dump() for t in req.tasks],
            "interval": req.interval,
            "threads_interval": req.threads_interval,
            "max_retries": req.max_retries,
            "target_server_time": req.target_server_time,
        }
    )

    def do_start():
        runner.run(
            default_election_id or "",
            req.tasks,
            req.interval,
            req.threads_interval,
            req.max_retries,
        )

    if req.target_server_time:
        try:
            server_target = datetime.fromisoformat(req.target_server_time)
        except ValueError:
            raise HTTPException(
                status_code=400, detail="Invalid target_server_time"
            )
        offset_sec = sync_state.get("offset_ms", 0) / 1000
        local_target_wall = server_target.timestamp() - offset_sec
        target_monotonic = time.monotonic() + max(
            0, local_target_wall - time.time()
        )
        scheduler.schedule(target_monotonic, do_start)
        return {
            "ok": True,
            "scheduled": True,
            "local_trigger": datetime.fromtimestamp(
                local_target_wall, tz=timezone.utc
            ).isoformat(),
        }

    do_start()
    return {"ok": True, "scheduled": False}


def _task_has_election_id(task) -> bool:
    if task.type == "course":
        return bool(task.election_id)
    for child in task.children:
        if not _task_has_election_id(child):
            return False
    return True


@app.post("/stop")
def stop():
    scheduler.stop()
    runner.stop()
    return {"ok": True}


@app.get("/status")
def status():
    running = bool(runner._threads) and any(t.is_alive() for t in runner._threads)
    return {
        "running": running,
        "scheduled": scheduler.is_scheduled,
        "statuses": runner.statuses,
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# Serve frontend static files (must be last so API routes take precedence)
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
