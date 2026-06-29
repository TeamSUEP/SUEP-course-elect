"""Build the GUI app with PyInstaller.

Run:
    D:\\miniconda3\\envs\\SUEP\\python.exe build.py
"""
import sys


def main():
    sys.argv = [
        "pyinstaller",
        "--name=Course Elect Terminal",
        "--icon=favicon.ico",
        "--add-data=frontend;frontend",
        "--hidden-import=backend",
        "--hidden-import=ids",
        "--hidden-import=_jsonnet",
        "--hidden-import=lxml",
        "--hidden-import=uvicorn",
        "--exclude-module=tkinter",
        "--exclude-module=PIL",
        "--exclude-module=matplotlib",
        "--onefile",
        "--console",
        "--distpath=dist",
        "app.py",
    ]
    import PyInstaller.__main__

    PyInstaller.__main__.run()


if __name__ == "__main__":
    main()
