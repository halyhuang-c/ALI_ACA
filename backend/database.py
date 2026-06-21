from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base

from config import SQLALCHEMY_DATABASE_URL, ZHIPUAI_API_KEY

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def _ensure_column(conn, table: str, column: str, ddl: str) -> None:
    insp = inspect(conn)
    existing = {c["name"] for c in insp.get_columns(table)}
    if column not in existing:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))


def _run_lightweight_migrations(conn) -> None:
    _ensure_column(conn, "images", "raw_extract_response", "JSON")
    _ensure_column(conn, "images", "extract_model", "VARCHAR")
    _ensure_column(conn, "answers", "raw_response", "JSON")
    _ensure_column(conn, "answers", "model", "VARCHAR")
    _ensure_column(conn, "answers", "is_correct", "BOOLEAN")
    _ensure_column(conn, "questions", "correct_answer", "VARCHAR")
    _ensure_column(conn, "questions", "category", "VARCHAR")
    _ensure_column(conn, "questions", "subcategory", "VARCHAR")


def _seed_default_llm_config() -> None:
    from models import LLMConfig
    import setting_service

    db = SessionLocal()
    try:
        if db.query(LLMConfig).count() > 0:
            return
        cfg = LLMConfig(
            name="智谱GLM",
            base_url="https://open.bigmodel.cn/api/paas/v4/",
            api_key=ZHIPUAI_API_KEY or "",
            models=[],
        )
        db.add(cfg)
        db.commit()
        db.refresh(cfg)

        settings = setting_service.get_all_settings(db)
        patch = {}
        if settings.get("extract_config_id") is None:
            patch["extract_config_id"] = cfg.id
            patch["extract_model"] = ""
        if settings.get("answer_config_id") is None:
            patch["answer_config_id"] = cfg.id
            patch["answer_model"] = ""
        if patch:
            setting_service.update_settings(db, patch)
    finally:
        db.close()


def init_db() -> None:
    import models  # noqa: F401  确保所有模型注册到 Base.metadata
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        _run_lightweight_migrations(conn)
    _reset_running_steps_on_startup()
    _seed_default_llm_config()


def _reset_running_steps_on_startup() -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE pipeline_steps SET status = 'paused' "
                "WHERE status = 'running'"
            )
        )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
