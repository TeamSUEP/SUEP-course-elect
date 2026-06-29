import json
import os
import random
from pathlib import Path
from time import sleep

import _jsonnet
import pandas as pd
from lxml import etree

from ids import IdsAuth

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
}

HOST = "https://jw.shiep.edu.cn"
SERVICE = "http://jw.shiep.edu.cn/eams/login.action"


class CourseElectClient:
    def __init__(self, ids_auth: IdsAuth | None = None):
        self.ids = ids_auth or IdsAuth()
        self.headers = HEADERS.copy()
        self.demo = False

    def load_cookies(self) -> bool:
        """Try to restore session from cookies.txt or cookies.json."""
        if os.path.exists("cookies.txt"):
            with open("cookies.txt", "r") as f:
                cookies = {
                    i.split("=")[0]: i.split("=")[1]
                    for i in f.read().split(";")
                    if "=" in i
                }
            self.ids = IdsAuth(cookies)
        elif os.path.exists("cookies.json"):
            with open("cookies.json", "r") as f:
                cookies = json.load(f)
            self.ids = IdsAuth(cookies)
        return self.ids.ok

    def save_cookies(self):
        cookies = self.ids.cookies
        with open("cookies.txt", "w") as f:
            f.write(";".join([f"{k}={v}" for k, v in cookies.items()]))
        with open("cookies.json", "w") as f:
            json.dump(cookies, f)

    def login(self, username: str, password: str) -> bool:
        self.ids.login(username, password, SERVICE)
        if self.ids.ok:
            self.save_cookies()
        return self.ids.ok

    def logout(self):
        self.ids = IdsAuth()
        for p in ("cookies.txt", "cookies.json"):
            path = Path(p)
            if path.exists():
                path.unlink()

    @property
    def is_logged_in(self) -> bool:
        return self.ids.ok

    def get_elections(self) -> dict[str, str]:
        """Find all available election profile {names:ids}."""
        if self.demo:
            return {
                "2026-2027-1 专业必修课": "demo-major-required",
                "2026-2027-1 通识选修课": "demo-general-elective",
                "2026-2027-1 交叉融合课": "demo-cross-disciplinary",
            }
        resp = self.ids.get(
            f"{HOST}/eams/stdElectCourse!innerIndex.action?projectId=1",
            headers=self.headers,
        )
        if resp.status_code != 200:
            raise Exception("Failed to get election profile ids.")
        e = etree.HTML(resp.text)
        election_names = e.xpath(
            '//body/div[@class="ajax_container"]/div/h2/text()'
        )
        election_urls = e.xpath(
            '//body/div[@class="ajax_container"]/div/div/a/@href'
        )
        election_ids = [
            i.split("?")[-1].replace("electionProfile.id=", "")
            for i in election_urls
        ]
        if len(election_names) != len(election_ids):
            raise Exception(
                "Election names and ids do not match: "
                f"{election_names} != {election_ids}"
            )
        return dict(zip(election_names, election_ids))

    _DEMO_COURSES = {
        "demo-major-required": [
            {"id": 1001, "no": "MA101", "name": "高等数学 A", "teachers": "张教授", "available": True},
            {"id": 1002, "no": "MA102", "name": "线性代数", "teachers": "李教授", "available": True},
            {"id": 1003, "no": "PH101", "name": "大学物理", "teachers": "王教授", "available": False},
            {"id": 1004, "no": "CS101", "name": "程序设计基础", "teachers": "赵老师", "available": True},
        ],
        "demo-general-elective": [
            {"id": 2001, "no": "PE101", "name": "篮球", "teachers": "张教练", "available": True},
            {"id": 2002, "no": "PE102", "name": "羽毛球", "teachers": "李教练", "available": True},
            {"id": 2003, "no": "AR101", "name": "电影赏析", "teachers": "王老师", "available": False},
            {"id": 2004, "no": "MU101", "name": "音乐鉴赏", "teachers": "刘老师", "available": True},
        ],
        "demo-cross-disciplinary": [
            {"id": 3001, "no": "AI101", "name": "人工智能导论", "teachers": "陈教授", "available": True},
            {"id": 3002, "no": "DS101", "name": "数据科学基础", "teachers": "周老师", "available": True},
            {"id": 3003, "no": "RO101", "name": "机器人入门", "teachers": "吴老师", "available": False},
            {"id": 3004, "no": "CY101", "name": "网络安全基础", "teachers": "郑老师", "available": True},
        ],
    }

    def get_courses(self, e_id: str) -> list[dict]:
        """Get the course list."""
        if self.demo:
            return self._DEMO_COURSES.get(e_id, [])
        resp = self.ids.get(
            f"{HOST}/eams/stdElectCourse!data.action",
            params={"profileId": e_id},
            headers=self.headers,
        )
        if resp.status_code != 200:
            raise Exception("Failed to get course list.")
        dat = resp.text  # format: javascript code
        dat = dat[dat.find("[") : dat.rfind("]") + 1]  # js object
        return json.loads(_jsonnet.evaluate_snippet("snippet", dat))

    def get_semester_info(self, e_id: str) -> dict:
        """Get semester info."""
        resp = self.ids.get(
            f"{HOST}/eams/stdElectCourse!defaultPage.action",
            params={"electionProfile.id": e_id},
            headers=self.headers,
        )
        if resp.status_code != 200:
            raise Exception("Failed to get semester info.")
        e = etree.HTML(resp.text)
        qr_script_url = e.xpath('//*[@id="qr_script"]/@src')
        if len(qr_script_url) == 0:
            raise Exception("Failed to get semester info.")
        params = {
            i.split("=")[0]: i.split("=")[1]
            for i in qr_script_url[0].split("?")[-1].split("&")
            if "=" in i
        }
        return params

    def get_courses_status(self, params: dict) -> dict:
        """Get courses status."""
        resp = self.ids.get(
            f"{HOST}/eams/stdElectCourse!queryStdCount.action",
            params=params,
            headers=self.headers,
        )
        if resp.status_code != 200:
            raise Exception("Failed to get course status.")
        dat = resp.text  # format: javascript code
        dat = dat[dat.find("{") : dat.rfind("}") + 1]  # js object
        return json.loads(_jsonnet.evaluate_snippet("snippet", dat))

    def head_election(self, e_id: str):
        if self.demo:
            return
        self.ids.head(
            f"{HOST}/eams/stdElectCourse!innerIndex.action?projectId=1",
            headers=self.headers,
        )
        self.ids.head(
            f"{HOST}/eams/stdElectCourse!defaultPage.action",
            params={"electionProfile.id": e_id},
            headers=self.headers,
        )

    def elect_course(self, course_id: str, e_id: str) -> list:
        """Elect a course.

        return: [course_id, message, succeeded?, retry?]
        """
        if self.demo:
            sleep(0.3)
            r = random.random()
            if r < 0.45:
                return [course_id, "成功选中", True, False]
            elif r < 0.75:
                return [course_id, "人数已满", False, False]
            elif r < 0.90:
                return [course_id, "服务器繁忙，继续重试", False, True]
            else:
                return [course_id, "请不要过快点击", False, True]
        request_headers = self.headers.copy()
        request_headers["X-Requested-With"] = "XMLHttpRequest"
        resp = self.ids.post(
            f"{HOST}/eams/stdElectCourse!batchOperator.action",
            params={"profileId": e_id},
            headers=request_headers,
            data={"optype": "true", "operator0": f"{course_id}:true:0"},
            allow_redirects=False,
        )

        if "会话已经被过期" in resp.text:
            return [course_id, "会话已经被过期", False, True]

        if resp.status_code != 200:
            if str(resp.status_code).startswith("4"):
                raise Exception("Failed to elect course.", resp.status_code)
            else:
                return [course_id, str(resp.status_code), False, True]

        e = etree.HTML(resp.text)
        msgs = e.xpath("//table/tr[1]/td/div/text()")
        msg = msgs[0].strip() if len(msgs) > 0 else resp.text
        simplified_msgs = [
            "请不要过快点击",
            "服务器内部错误",
        ]
        for simplified_msg in simplified_msgs:
            if simplified_msg in msg:
                msg = simplified_msg
        if "已经选过" in msg:
            return [course_id, msg, True, False]
        failed_words = ["上限", "已满", "已达", "已经达到", "冲突"]
        error_words = (
            ["失败", "错误", "fail", "error", "503", "过快点击"] + failed_words
        )
        succeeded = not any(i in msg for i in error_words)
        retry = not (any(i in msg for i in failed_words) or succeeded)
        return [course_id, msg, succeeded, retry]

    def export_courses_sheet(
        self, election_id: str, data: list[dict], sheet_format: str
    ) -> str | None:
        """Export course list to a file and return the filename."""
        if sheet_format not in ("tsv", "xlsx"):
            return None
        df = pd.DataFrame(data)
        if sheet_format == "tsv":
            filename = f"{election_id}.tsv"
            df.to_csv(filename, sep="\t", index=False)
        elif sheet_format == "xlsx":
            filename = f"{election_id}.xlsx"
            df.to_excel(filename, index=False)
        return filename
