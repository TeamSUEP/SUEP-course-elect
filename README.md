# SUEP-course-elect

An automation tool for SUEP course selection, available as a desktop GUI app or a CLI script.

## Usage

### Desktop GUI (recommended)

```bash
pip install -r requirements.txt
python app.py
```

Or build a standalone executable with PyInstaller:

```bash
python build.py
```

### CLI

```bash
cp envconfig.example.py envconfig.py
vim envconfig.py                      # please edit the configuration
pip install -r requirements.txt
python main.py
```

A demo mode is available in the GUI via the toggle button, or in CLI by patching `client.demo = True`. It simulates course selection without real server interactions.

### Docker

```bash
cp envconfig.example.py envconfig.py
vim envconfig.py                      # please edit the configuration
docker build -t suep-course-elect .
docker run -it suep-course-elect
```

For VPN access, use docker-compose with EasyConnect:

```bash
vim docker-compose.yml                # set your VPN credentials
docker-compose up
```

## Configuration

### GUI

All settings are persisted in `config.json` via the web interface.

### CLI (`envconfig.py`)

| Variable                  | Description                                                                |
| ------------------------- | -------------------------------------------------------------------------- |
| username                  | 8-digit student ID in string                                               |
| password                  | password at [IDS](https://ids.shiep.edu.cn)                                |
| skip_course_list          | Skip checking courses list                                                 |
| check_course_availability | Check course availability when listing courses                             |
| sheet_format              | The format of the exported sheet (`tsv` or `xlsx`, leave blank to disable) |
| default_courses_exps      | The default courses expressions                                            |
| interval                  | The interval between two requests (in seconds)                             |
| threads_interval          | The interval between two threads (in seconds)                              |

## Task tree and course expressions

The GUI provides a visual task tree editor. You can build nested `All` (AND), `Any` (OR), and `Sequence` (order) nodes, each containing course IDs. In CLI mode, expressions use the following syntax:

| Operator | Type   | Meaning                                    |
| -------- | ------ | ------------------------------------------ |
| `&&`     | All    | Select all listed courses                  |
| `\|\|`   | Any    | Select the first available course          |
| `;`      | Seq    | Select courses in order                    |

Example:

```python
courses_exps = {
    'election_id_1': [
        '114&&514;810',
        '0721||1919',
    ],
    'election_id_2': [
        '1851;2588',
    ],
}
```

- Thread 1 will attempt both 114 and 514, then select 810 regardless of the previous results.
- Thread 2 will try 0721 first; if it fails, fall back to 1919. (If 0721 succeeds, 1919 will not start.)
- After election_id_1 is finished, election_id_2 will start.

### Timed selection

The GUI supports scheduled course selection: sync the server time, set a target time, and the task will automatically start at that moment.

## Connecting to the course selection platform

As stated in the notice from [the Office of Academic Affairs of SUEP](https://jwc.shiep.edu.cn/), the course selection platform can only be accessed directly outside SUEP during peak hours. During non-peak hours, users from outside SUEP need to use VPN.

### Solution 1: Use EasyConnect client

Downloads:

- [English](https://vpn.shiep.edu.cn/com/installClient_en.html)
- [Chinese (Simplified)](https://vpn.shiep.edu.cn/com/installClient.html)

Documentation:

- [English](https://vpn.shiep.edu.cn/com/help_en/)
- [Chinese (Simplified)](https://vpn.shiep.edu.cn/com/help/)

### Solution 2: Use docker-easyconnect + docker-compose

- [GitHub](https://github.com/Hagb/docker-easyconnect)
- [Docker Hub](https://hub.docker.com/r/hagb/docker-easyconnect)

Edit `docker-compose.yml` with your credentials, then:

```bash
docker-compose up
```

Standalone EasyConnect container:

```bash
docker run --device /dev/net/tun --cap-add NET_ADMIN -it --name easyconnect -p 127.0.0.1:10808:1080 -p 127.0.0.1:10809:8888 -e EC_VER=7.6.3 -e CLI_OPTS="-d vpn.shiep.edu.cn -u username -p password" hagb/docker-easyconnect:cli
export HTTP_PROXY=127.0.0.1:10809
export HTTPS_PROXY=127.0.0.1:10809
```

### Solution 3: Use SUEP's network

Access the platform directly from campus.

## Some words

Every student knows that online course selection is not fair. Everyone has different knowledge, experience, devices, network environment, etc. It is unreasonable to determine whether a person can choose the courses they want in the future semester only by these conditions.

This program may increase the unfairness, but provides a way for people who don't know much about computers. (For those who only need to know a little about HTTP requests, capturing a packet and repeating it to select a course can be done in less than a minute.)

Please use this program reasonably, and don't set the request frequency too high to avoid putting too much pressure on the server. Please help those students who encounter difficulties in online course selection. With great power comes great responsibility, and this is what we should do.

As a PoC, the creation of this program is for the disappearance of this program. I hope this condition will be improved in the future.

## License

GPLv3

This program is provided as is, without warranty or liability. See the LICENSE file for more details.

By using this program, you agree to the terms of the license.
