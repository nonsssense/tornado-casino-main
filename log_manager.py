import logging
from pathlib import Path

Path("logs").mkdir(exist_ok=True)

log = logging.getLogger("casino")
log.setLevel(logging.INFO)

formatter = logging.Formatter(
    "%(asctime)s | %(levelname)s | %(filename)s:%(lineno)d | %(message)s"
)

file_handler = logging.FileHandler("logs/app.log", encoding="utf-8")
file_handler.setFormatter(formatter)

console_handler = logging.StreamHandler()
console_handler.setFormatter(formatter)

log.addHandler(file_handler)
log.addHandler(console_handler)

