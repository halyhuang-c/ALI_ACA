from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import LLMConfig
import setting_service
import llm_client

router = APIRouter()
settings_router = APIRouter()


class LLMConfigIn(BaseModel):
    name: str
    base_url: str
    api_key: Optional[str] = None
    models: list[str] = []


class LLMConfigTestIn(BaseModel):
    model: str


def _mask_key(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "****"
    return f"{key[:4]}****{key[-4:]}"


def _serialize_config(c: LLMConfig) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "base_url": c.base_url,
        "api_key_masked": _mask_key(c.api_key or ""),
        "has_key": bool(c.api_key),
        "models": c.models or [],
        "created_at": c.created_at,
        "updated_at": c.updated_at,
    }


@router.get("/configs")
def list_configs(db: Session = Depends(get_db)):
    rows = db.query(LLMConfig).order_by(LLMConfig.id.asc()).all()
    return [_serialize_config(c) for c in rows]


@router.post("/configs")
def create_config(payload: LLMConfigIn, db: Session = Depends(get_db)):
    cfg = LLMConfig(
        name=payload.name,
        base_url=payload.base_url,
        api_key=payload.api_key or "",
        models=payload.models,
    )
    db.add(cfg)
    db.commit()
    db.refresh(cfg)
    return {"id": cfg.id}


@router.put("/configs/{config_id}")
def update_config(config_id: int, payload: LLMConfigIn, db: Session = Depends(get_db)):
    cfg = db.get(LLMConfig, config_id)
    if cfg is None:
        raise HTTPException(status_code=404, detail="配置不存在")
    cfg.name = payload.name
    cfg.base_url = payload.base_url
    if payload.api_key:
        cfg.api_key = payload.api_key
    cfg.models = payload.models
    cfg.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.delete("/configs/{config_id}")
def delete_config(config_id: int, db: Session = Depends(get_db)):
    cfg = db.get(LLMConfig, config_id)
    if cfg is None:
        raise HTTPException(status_code=404, detail="配置不存在")
    db.delete(cfg)
    db.commit()
    return {"ok": True}


@router.post("/configs/{config_id}/test")
def test_config(config_id: int, payload: LLMConfigTestIn, db: Session = Depends(get_db)):
    cfg = db.get(LLMConfig, config_id)
    if cfg is None:
        raise HTTPException(status_code=404, detail="配置不存在")
    try:
        client = llm_client.build_client({"base_url": cfg.base_url, "api_key": cfg.api_key})
        resp = client.chat.completions.create(
            model=payload.model,
            messages=[{"role": "user", "content": "ping"}],
        )
        msg = (resp.choices[0].message.content or "")[:200]
        return {"ok": True, "message": msg or "连接成功"}
    except Exception as e:
        return {"ok": False, "message": str(e)[:500]}


@settings_router.get("/settings")
def get_settings(db: Session = Depends(get_db)):
    return setting_service.get_all_settings(db)


@settings_router.put("/settings")
def update_settings(payload: dict, db: Session = Depends(get_db)):
    updated = setting_service.update_settings(db, payload)
    return {"ok": True, "settings": updated}
