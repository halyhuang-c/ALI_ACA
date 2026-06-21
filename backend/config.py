import os
from pathlib import Path
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent
ROOT_DIR = BACKEND_DIR.parent

load_dotenv(BACKEND_DIR / ".env", override=True)


def _resolve_path(value: str, default: str) -> Path:
    raw = os.getenv(value, default)
    p = Path(raw)
    if not p.is_absolute():
        p = (BACKEND_DIR / raw).resolve()
    return p


ZHIPUAI_API_KEY = os.getenv("ZHIPUAI_API_KEY", "")

IMAGE_DIR = _resolve_path("IMAGE_DIR", "../image")

DB_PATH = _resolve_path("DB_PATH", "../data/ali_aca.db")
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

GLM_VISION_MODEL = os.getenv("GLM_VISION_MODEL", "glm-4v-plus")
GLM_TEXT_MODEL = os.getenv("GLM_TEXT_MODEL", "glm-4-plus")

MAX_CONCURRENCY = int(os.getenv("MAX_CONCURRENCY", "3"))

SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH.as_posix()}"
