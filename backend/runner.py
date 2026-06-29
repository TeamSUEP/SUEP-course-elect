import threading
import time
from datetime import datetime
from typing import Callable

from backend.models import CourseNode, GroupNode


def _default_log_callback(log: dict):
    print(f"[{log['time']}] [{log['level'].upper()}] {log['message']}")


class Runner:
    def __init__(self, client, log_callback: Callable[[dict], None] | None = None):
        self.client = client
        self.log_callback = log_callback or _default_log_callback
        self._stop = threading.Event()
        self._threads: list[threading.Thread] = []
        self.statuses: dict[str, str] = {}

    def run(
        self,
        election_id: str,
        tasks: list,
        interval: float,
        threads_interval: float,
        max_retries: int = 0,
    ):
        self._stop.clear()
        self._threads.clear()
        self.statuses.clear()
        self.log("info", f"准备执行 {len(tasks)} 个任务线程")

        # Warm up session for every election profile involved
        election_ids = set()

        def collect_eids(node):
            if node.type == "course" and node.election_id:
                election_ids.add(node.election_id)
            elif node.type == "group" and node.children:
                for child in node.children:
                    collect_eids(child)

        for task in tasks:
            collect_eids(task)
        for eid in election_ids or {election_id}:
            try:
                self.client.head_election(eid)
            except Exception as e:
                self.log("warn", f"预热批次 {eid} 失败: {e}")

        for task in tasks:
            t = threading.Thread(
                target=self._run_node,
                args=(task, election_id, interval, max_retries),
                daemon=True,
            )
            self._threads.append(t)
            t.start()
            time.sleep(threads_interval)

    def run_blocking(
        self,
        election_id: str,
        tasks: list,
        interval: float,
        threads_interval: float,
        max_retries: int = 0,
    ):
        self.run(election_id, tasks, interval, threads_interval, max_retries)
        self.wait()

    def wait(self, timeout: float | None = None):
        for t in self._threads:
            t.join(timeout=timeout)

    def stop(self):
        self._stop.set()
        self.wait(timeout=2)
        self.log("info", "任务已停止")

    def _run_node(
        self,
        node: CourseNode | GroupNode,
        default_election_id: str,
        interval: float,
        max_retries: int,
    ):
        if node.type == "course":
            self._elect_course(node, default_election_id, interval, max_retries)
        elif node.type == "group":
            self._run_group(node, default_election_id, interval, max_retries)

    def _run_group(
        self,
        group: GroupNode,
        default_election_id: str,
        interval: float,
        max_retries: int,
    ):
        self.log("info", f"进入 [{group.op.upper()}] 组合节点")
        group_succeeded = True
        result = {"succeeded": False}
        for child in group.children:
            if self._stop.is_set():
                break
            result = self._run_child(
                child, default_election_id, interval, max_retries
            )
            if group.op == "all":
                if not result["succeeded"]:
                    group_succeeded = False
                    break
            elif group.op == "any":
                if result["succeeded"]:
                    group_succeeded = True
                    break
                group_succeeded = False
            elif group.op == "sequence":
                group_succeeded = result["succeeded"] and group_succeeded
        status = "success" if group_succeeded else "warn"
        self.log(
            status,
            f"[{group.op.upper()}] 组合节点结束，结果: {'成功' if group_succeeded else '失败'}",
        )
        return {"succeeded": group_succeeded}

    def _run_child(
        self,
        child: CourseNode | GroupNode,
        default_election_id: str,
        interval: float,
        max_retries: int,
    ):
        if child.type == "course":
            return self._elect_course(
                child, default_election_id, interval, max_retries
            )
        return self._run_group(child, default_election_id, interval, max_retries)

    def _elect_course(
        self,
        course_node: CourseNode,
        default_election_id: str,
        interval: float,
        max_retries: int,
    ):
        course_id = course_node.id
        name = course_node.name or course_id
        task_id = course_node.task_id or course_id
        election_id = course_node.election_id or default_election_id
        attempt = 0

        self._set_status(task_id, "running")
        self.log(
            "info",
            f"{name} 开始抢课",
            task_id=task_id,
            status="running",
        )

        while not self._stop.is_set():
            if max_retries > 0 and attempt >= max_retries:
                self._set_status(task_id, "failed")
                self.log(
                    "warn",
                    f"{name} 达到最大重试次数 ({max_retries})，停止",
                    task_id=task_id,
                    status="failed",
                )
                return {"succeeded": False}
            attempt += 1
            try:
                _, msg, succeeded, retry = self.client.elect_course(
                    course_id, election_id
                )
            except Exception as e:
                self._set_status(task_id, "failed")
                self.log(
                    "error",
                    f"{name} 请求异常: {e}",
                    task_id=task_id,
                    status="failed",
                )
                return {"succeeded": False}

            if succeeded:
                self._set_status(task_id, "success")
                self.log(
                    "success",
                    f"{name}: {msg} (尝试 {attempt})",
                    task_id=task_id,
                    status="success",
                )
                return {"succeeded": True}

            if retry:
                self._set_status(task_id, "retry")
                self.log(
                    "warn",
                    f"{name}: {msg} (尝试 {attempt})，继续重试",
                    task_id=task_id,
                    status="retry",
                )
                time.sleep(interval)
                continue

            # Non-retryable failure
            self._set_status(task_id, "failed")
            self.log(
                "error",
                f"{name}: {msg} (尝试 {attempt})",
                task_id=task_id,
                status="failed",
            )
            return {"succeeded": False}

        return {"succeeded": False}

    def _set_status(self, task_id: str, status: str):
        self.statuses[task_id] = status

    def log(
        self,
        level: str,
        message: str,
        task_id: str | None = None,
        status: str | None = None,
    ):
        entry = {
            "time": datetime.now().isoformat(timespec="milliseconds"),
            "level": level,
            "message": message,
        }
        if task_id:
            entry["task_id"] = task_id
        if status:
            entry["status"] = status
        try:
            self.log_callback(entry)
        except Exception:
            pass
