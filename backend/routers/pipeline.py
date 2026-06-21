import asyncio
import json
import threading
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse

from database import SessionLocal, get_db
from schemas import PipelineStatusOut, PipelineStepOut, PipelineOverallOut
from services import pipeline_service, scan_service

router = APIRouter()

_pipeline_lock = threading.Lock()


def _to_status_out(status: dict) -> PipelineStatusOut:
    return PipelineStatusOut(
        steps=[PipelineStepOut.model_validate(s) for s in status["steps"]],
        overall=PipelineOverallOut(**status["overall"]),
    )


def _serialize_status(status: dict) -> str:
    return _to_status_out(status).model_dump_json()


def _run_pipeline_background() -> None:
    db = SessionLocal()
    try:
        pipeline_service.run_pipeline(db)
    finally:
        db.close()


@router.post("/pipeline/start")
def start_pipeline(db: Session = Depends(get_db)):
    if pipeline_service.is_paused_or_running(db):
        return {"status": "already_running", "message": "流水线正在运行或已暂停"}
    pipeline_service.clear_pause()
    thread = threading.Thread(target=_run_pipeline_background, daemon=True)
    thread.start()
    return {"status": "started", "message": "流水线已启动"}


@router.post("/pipeline/pause")
def pause_pipeline(db: Session = Depends(get_db)):
    if not pipeline_service.is_running(db):
        return {"status": "not_running", "message": "流水线未在运行"}
    pipeline_service.request_pause()
    return {"status": "pause_requested", "message": "已请求暂停，将在当前任务完成后停止"}


@router.post("/pipeline/resume")
def resume_pipeline(db: Session = Depends(get_db)):
    if not pipeline_service.is_paused_or_running(db):
        return {"status": "idle", "message": "流水线未在运行"}
    pipeline_service.clear_pause()
    thread = threading.Thread(target=_run_pipeline_background, daemon=True)
    thread.start()
    return {"status": "resumed", "message": "已恢复运行"}


@router.get("/pipeline/status", response_model=PipelineStatusOut)
def get_pipeline_status(db: Session = Depends(get_db)):
    return _to_status_out(pipeline_service.get_status(db))


@router.get("/pipeline/stream")
async def stream_pipeline_status():
    async def event_generator():
        last_payload: Optional[str] = None
        while True:
            db = SessionLocal()
            try:
                status = pipeline_service.get_status(db)
            finally:
                db.close()
            payload = _serialize_status(status)
            if payload != last_payload:
                yield {"event": "status", "data": payload}
                last_payload = payload
            overall = status["overall"]["status"]
            if overall in ("completed", "failed", "partial_failed"):
                yield {"event": "done", "data": payload}
                break
            await asyncio.sleep(1)

    return EventSourceResponse(event_generator())


@router.get("/pipeline/logs")
def get_pipeline_logs(step: str):
    import log_store
    return {"step": step, "logs": log_store.get(step)}


@router.post("/scan")
def scan_only(db: Session = Depends(get_db)):
    new_count = scan_service.scan_images(db)
    return {"status": "completed", "new_images": new_count}


@router.post("/pipeline/reset-failed")
def reset_failed(db: Session = Depends(get_db)):
    from models import Image, Question, Answer, PipelineStep
    if pipeline_service.is_paused_or_running(db):
        return {"status": "busy", "message": "流程运行中，无法重置"}
    failed_images = db.query(Image).filter(Image.status == "failed").all()
    reset_img = 0
    for img in failed_images:
        img.status = "pending"
        img.error_message = None
        reset_img += 1
    failed_q_ids = [
        qid for (qid,) in db.query(Answer.question_id).filter(Answer.answer.is_(None)).all()
    ]
    reset_ans = 0
    for qid in failed_q_ids:
        db.query(Answer).filter(Answer.question_id == qid).delete()
        reset_ans += 1
    pf_steps = db.query(PipelineStep).filter(PipelineStep.status == "partial_failed").all()
    for st in pf_steps:
        st.status = "pending"
    db.commit()
    return {
        "status": "ok",
        "reset_images": reset_img,
        "reset_answers": reset_ans,
        "message": f"已重置 {reset_img} 张失败图片、{reset_ans} 道失败答题，可点「开始处理」重跑",
    }


@router.post("/pipeline/continue")
def continue_pipeline(db: Session = Depends(get_db)):
    from models import PipelineStep
    if pipeline_service.is_paused_or_running(db):
        return {"status": "busy", "message": "流程运行中"}
    pf_steps = db.query(PipelineStep).filter(PipelineStep.status == "partial_failed").all()
    if not pf_steps:
        return {"status": "noop", "message": "没有需要继续的部分失败步骤"}
    for st in pf_steps:
        st.status = "completed"
    db.commit()
    pipeline_service.clear_pause()
    thread = threading.Thread(target=_run_pipeline_background, daemon=True)
    thread.start()
    return {"status": "continued", "message": "已忽略失败项，继续后续流程"}


@router.post("/pipeline/reset-steps")
def reset_steps(payload: Optional[dict] = None, db: Session = Depends(get_db)):
    from models import PipelineStep, Image, Answer
    if pipeline_service.is_paused_or_running(db):
        return {"status": "busy", "message": "流程运行中，无法重置"}
    scope = (payload or {}).get("scope", "steps")
    reset_count = 0
    if scope in ("steps", "images", "full"):
        rows = db.query(PipelineStep).all()
        for st in rows:
            st.status = "pending"
            st.total = 0
            st.current = 0
            st.started_at = None
            st.finished_at = None
            reset_count += 1
    img_reset = 0
    if scope in ("images", "full"):
        for img in db.query(Image).all():
            img.status = "pending"
            img.error_message = None
            img_reset += 1
    ans_del = 0
    if scope == "full":
        from models import Question, QuestionTag
        ans_del = db.query(Answer).count()
        db.query(QuestionTag).delete()
        db.query(Answer).delete()
        db.query(Question).delete()
    db.commit()
    name = {"steps": "步骤状态", "images": "步骤+图片", "full": "完整数据"}[scope]
    msg = f"已重置{name}（{reset_count} 个步骤"
    if scope in ("images", "full"):
        msg += f"，{img_reset} 张图片"
    if scope == "full":
        msg += f"，清空 {ans_del} 条答案/题目"
    msg += "），可点「开始处理」重跑"
    return {"status": "ok", "scope": scope, "message": msg}
