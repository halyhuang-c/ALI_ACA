from datetime import datetime
from typing import Optional
import threading

from sqlalchemy.orm import Session

from models import PipelineStep

STEP_SCAN = "scan"
STEP_EXTRACT = "extract"
STEP_DEDUP = "dedup"
STEP_ANSWER = "answer"

STEP_ORDER = [STEP_SCAN, STEP_EXTRACT, STEP_DEDUP, STEP_ANSWER]

_TERMINAL_STATUSES = {"completed", "failed", "paused", "partial_failed"}
_RUNNING_STATUSES = {"running", "completed", "failed", "paused", "partial_failed"}

_pause_event = threading.Event()

CONSECUTIVE_FAILURE_THRESHOLD = 5


def normalize_error_reason(err_msg: str) -> str:
    msg = (str(err_msg or "")).lower()
    if "429" in msg or "rate limit" in msg or "速率限制" in msg:
        return "rate_limit"
    if "timeout" in msg or "timed out" in msg:
        return "timeout"
    if "connection" in msg or "network" in msg or "unreachable" in msg or "reset" in msg:
        return "network"
    if "401" in msg or "unauthorized" in msg or "api key" in msg or "auth" in msg:
        return "auth_error"
    if "404" in msg or "not found" in msg:
        return "not_found"
    return (str(err_msg or "")).strip()[:80]


class ConsecutiveFailureTracker:
    def __init__(self, threshold: int = CONSECUTIVE_FAILURE_THRESHOLD):
        self.threshold = threshold
        self._last_reason = None
        self._count = 0

    def record_failure(self, reason: str) -> bool:
        norm = normalize_error_reason(reason)
        if norm and norm == self._last_reason:
            self._count += 1
        else:
            self._last_reason = norm
            self._count = 1
        return self._count >= self.threshold

    def reset(self) -> None:
        self._last_reason = None
        self._count = 0

    @property
    def count(self) -> int:
        return self._count

    @property
    def last_reason(self) -> str:
        return self._last_reason or ""


def is_paused() -> bool:
    return _pause_event.is_set()


def request_pause() -> None:
    _pause_event.set()


def clear_pause() -> None:
    _pause_event.clear()


def _check_paused() -> bool:
    return _pause_event.is_set()


def get_or_create_step(db: Session, step_name: str) -> PipelineStep:
    step = db.query(PipelineStep).filter(PipelineStep.step_name == step_name).first()
    if step is None:
        step = PipelineStep(
            step_name=step_name,
            status="pending",
            total=0,
            current=0,
        )
        db.add(step)
        db.flush()
    return step


def update_step(
    db: Session,
    step_name: str,
    status: Optional[str] = None,
    total: Optional[int] = None,
    current: Optional[int] = None,
) -> PipelineStep:
    step = get_or_create_step(db, step_name)
    if status == "running" and step.started_at is None:
        step.started_at = datetime.utcnow()
    if status in _TERMINAL_STATUSES:
        step.finished_at = datetime.utcnow()
    if status is not None:
        step.status = status
    if total is not None:
        step.total = total
    if current is not None:
        step.current = current
    db.commit()
    return step


def _get_all_steps(db: Session) -> list[PipelineStep]:
    steps = {s.step_name: s for s in db.query(PipelineStep).all()}
    result = []
    for name in STEP_ORDER:
        if name in steps:
            result.append(steps[name])
        else:
            result.append(PipelineStep(step_name=name, status="pending", total=0, current=0))
    return result


def get_status(db: Session) -> dict:
    steps = _get_all_steps(db)
    statuses = [s.status for s in steps]

    if all(s == "completed" for s in statuses):
        overall_status = "completed"
    elif any(s == "failed" for s in statuses):
        overall_status = "failed"
    elif any(s == "running" for s in statuses):
        overall_status = "running"
    elif any(s == "partial_failed" for s in statuses):
        overall_status = "partial_failed"
    elif any(s == "paused" for s in statuses):
        overall_status = "paused"
    else:
        overall_status = "pending"

    current_step = None
    progress = 0.0
    for s in steps:
        if s.status == "running":
            current_step = s.step_name
        if s.total and s.total > 0:
            progress += min(s.current / s.total, 1.0)
    progress = round(progress / len(STEP_ORDER) * 100, 2)

    return {
        "steps": steps,
        "overall": {
            "status": overall_status,
            "current_step": current_step,
            "progress": progress,
        },
    }


def run_pipeline(db: Session) -> dict:
    from services import scan_service, extract_service, dedup_service, answer_service

    clear_pause()
    steps = {s.step_name: s for s in _get_all_steps(db)}

    def _step_done(name: str) -> bool:
        st = steps.get(name)
        return st is not None and st.status == "completed"

    if not _step_done(STEP_SCAN):
        update_step(db, STEP_SCAN, status="running")
        try:
            scan_service.scan_images(db)
            update_step(db, STEP_SCAN, status="completed")
        except Exception as e:
            update_step(db, STEP_SCAN, status="failed")
            return get_status(db)

    if _check_paused():
        update_step(db, STEP_EXTRACT, status="paused")
        return get_status(db)
    if not _step_done(STEP_EXTRACT):
        update_step(db, STEP_EXTRACT, status="running")
        try:
            extract_service.extract_all(db)
            if _check_paused():
                update_step(db, STEP_EXTRACT, status="paused")
                return get_status(db)
            latest = db.query(PipelineStep).filter(PipelineStep.step_name == STEP_EXTRACT).first()
            if latest is not None and latest.status == "partial_failed":
                return get_status(db)
            update_step(db, STEP_EXTRACT, status="completed")
        except Exception:
            update_step(db, STEP_EXTRACT, status="failed")
            return get_status(db)

    if _check_paused():
        update_step(db, STEP_DEDUP, status="paused")
        return get_status(db)
    if not _step_done(STEP_DEDUP):
        update_step(db, STEP_DEDUP, status="running")
        try:
            dedup_service.dedup_questions(db)
            update_step(db, STEP_DEDUP, status="completed")
        except Exception:
            update_step(db, STEP_DEDUP, status="failed")
            return get_status(db)

    if _check_paused():
        update_step(db, STEP_ANSWER, status="paused")
        return get_status(db)
    if not _step_done(STEP_ANSWER):
        update_step(db, STEP_ANSWER, status="running")
        try:
            answer_service.answer_all(db)
            if _check_paused():
                update_step(db, STEP_ANSWER, status="paused")
                return get_status(db)
            latest = db.query(PipelineStep).filter(PipelineStep.step_name == STEP_ANSWER).first()
            if latest is not None and latest.status == "partial_failed":
                return get_status(db)
            update_step(db, STEP_ANSWER, status="completed")
        except Exception:
            update_step(db, STEP_ANSWER, status="failed")
            return get_status(db)

    return get_status(db)


def is_running(db: Session) -> bool:
    steps = _get_all_steps(db)
    return any(s.status == "running" for s in steps)


def is_paused_or_running(db: Session) -> bool:
    steps = _get_all_steps(db)
    return any(s.status in ("running", "paused") for s in steps)
