import os

import pandas as pd

from backend.client import CourseElectClient
from backend.expression import parse_expression
from backend.runner import Runner
from envconfig import (
    check_course_availability,
    default_courses_exps,
    interval,
    password,
    sheet_format,
    skip_course_list,
    threads_interval,
    username,
)


def prompt_for_expressions() -> list[str]:
    print(
        "Please input the courses expressions you want to elect, "
        "end with an empty line."
    )
    exps = []
    while True:
        exp = input("Courses expression: ")
        if exp == "":
            break
        exps.append(exp)
    return exps


def select_election(client: CourseElectClient) -> str:
    elections = client.get_elections()
    print("Available elections: ")
    for name, election_id in elections.items():
        print(f"  {name}: {election_id}")

    if len(elections) == 0:
        print("No available elections.")
        return ""
    elif len(elections) == 1:
        election_id = list(elections.values())[0]
    else:
        election_id = input("Please select an election id: ")
    print(f"Selected {election_id}.")
    return election_id


def display_courses(client: CourseElectClient, election_id: str):
    data = client.get_courses(election_id)

    if check_course_availability:
        courses_status = client.get_courses_status(
            client.get_semester_info(election_id)
        )
        for course in data:
            cid = str(course["id"])
            course["available"] = (
                courses_status[cid]["sc"] < courses_status[cid]["lc"]
            )
        data.sort(key=lambda x: (not x["available"], x["id"]))
    else:
        data.sort(key=lambda x: x["id"])

    if sheet_format in ("tsv", "xlsx"):
        df = pd.DataFrame(data)
        if sheet_format == "tsv":
            df.to_csv(f"{election_id}.tsv", sep="\t", index=False)
        elif sheet_format == "xlsx":
            df.to_excel(f"{election_id}.xlsx", index=False)
        print(f"Please checkout full information on website or in the file.")
    else:
        print("Please checkout full information on website.")

    print("Courses: ")
    column_keys = ["id", "no", "name", "teachers"]
    if check_course_availability:
        column_keys.append("available")

    print("  " + "\t".join(column_keys))
    for course in data:
        print("  " + "\t".join([str(course[key]) for key in column_keys]))


def main():
    client = CourseElectClient()

    if client.load_cookies() and client.is_logged_in:
        print("Login success via cookies.")
    else:
        print("Logging in by username and password...")
        if not client.login(username, password):
            print("Login failed.")
            return
        print("Login success.")

    runner = Runner(client)

    if default_courses_exps:
        for election_id, courses_exps in default_courses_exps.items():
            tasks = [parse_expression(exp) for exp in courses_exps]
            runner.run_blocking(
                election_id, tasks, interval, threads_interval, max_retries=0
            )
        return

    election_id = select_election(client)
    if not election_id:
        return

    client.head_election(election_id)

    if skip_course_list:
        exps = prompt_for_expressions()
        tasks = [parse_expression(exp) for exp in exps]
        runner.run_blocking(
            election_id, tasks, interval, threads_interval, max_retries=0
        )
        return

    display_courses(client, election_id)

    exps = prompt_for_expressions()
    tasks = [parse_expression(exp) for exp in exps]
    runner.run_blocking(
        election_id, tasks, interval, threads_interval, max_retries=0
    )


if __name__ == "__main__":
    main()
