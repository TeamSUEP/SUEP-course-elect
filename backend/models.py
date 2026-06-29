from __future__ import annotations

from pydantic import BaseModel
from typing import Literal


class CourseNode(BaseModel):
    type: Literal["course"]
    id: str
    name: str = ""
    no: str = ""
    teachers: str = ""
    election_id: str = ""
    task_id: str = ""


class GroupNode(BaseModel):
    type: Literal["group"]
    op: Literal["sequence", "all", "any"]
    children: list[GroupNode | CourseNode]
    task_id: str = ""


class TaskConfig(BaseModel):
    election_id: str | None = None
    tasks: list[GroupNode | CourseNode]
    interval: float = 5.0
    threads_interval: float = 0.5
    max_retries: int = 0


class LoginRequest(BaseModel):
    username: str
    password: str
    remember_username: bool = True


class StartRequest(BaseModel):
    election_id: str | None = None
    target_server_time: str | None = None
    tasks: list[GroupNode | CourseNode]
    interval: float = 5.0
    threads_interval: float = 0.5
    max_retries: int = 0
