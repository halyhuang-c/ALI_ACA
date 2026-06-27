import random
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import Question, Answer, QuestionStat, ExamRecord, WrongQuestion
import setting_service

router = APIRouter()

EXAM_SINGLE_COUNT = 35
EXAM_MULTI_COUNT = 15
EXAM_TOTAL = EXAM_SINGLE_COUNT + EXAM_MULTI_COUNT
EXAM_DURATION_MINUTES = 60
PASS_SCORE = 80
FULL_SCORE = 100

# 加权衰减因子默认值：权重 = PICK_DECAY ^ pick_count
# 每多被抽中 1 次，权重缩为原来的 PICK_DECAY 倍。
#   pick_count=0（从未出现）：权重 1.0
#   pick_count=1（出现 1 次）：权重 0.2   （是未出现的 1/5）
#   pick_count=2（出现 2 次）：权重 0.04  （是未出现的 1/25）
#   pick_count=3（出现 3 次）：权重 0.008 （是未出现的 1/125）
# 数值越小，出现过的题越难再次出现；建议范围 0.05~0.5。
# 该值可在前端「模拟考试」页面调节，保存在 settings 表 key=pick_decay。
PICK_DECAY_DEFAULT = 0.2
PICK_DECAY_MIN = 0.05
PICK_DECAY_MAX = 0.5


def _get_pick_decay(db: Session) -> float:
    """从 settings 读取衰减因子，缺失或非法时回退默认值"""
    val = setting_service.get_setting(db, "pick_decay", PICK_DECAY_DEFAULT)
    try:
        val = float(val)
    except (TypeError, ValueError):
        return PICK_DECAY_DEFAULT
    if val < PICK_DECAY_MIN or val > PICK_DECAY_MAX:
        return PICK_DECAY_DEFAULT
    return val


# ===== 考试进度恢复辅助 =====
def _is_overdue(record: ExamRecord) -> bool:
    """考试是否已超时（超过考试时长）"""
    if not record.started_at:
        return True
    elapsed = (datetime.utcnow() - record.started_at).total_seconds()
    return elapsed >= EXAM_DURATION_MINUTES * 60


def _remaining_seconds(record: ExamRecord) -> int:
    """考试剩余秒数（最小为 0）"""
    if not record.started_at:
        return 0
    elapsed = (datetime.utcnow() - record.started_at).total_seconds()
    remain = EXAM_DURATION_MINUTES * 60 - elapsed
    return int(max(0, remain))


def _get_active_record(db: Session) -> Optional[ExamRecord]:
    """获取进行中且未超时的考试记录（submitted_at 与 abandoned_at 均为空）"""
    return (
        db.query(ExamRecord)
        .filter(ExamRecord.submitted_at.is_(None), ExamRecord.abandoned_at.is_(None))
        .order_by(ExamRecord.id.desc())
        .first()
    )


def _expire_overdue_active(db: Session) -> None:
    """将所有进行中但已超时的考试标记为已作废（超时放弃）"""
    overdue = (
        db.query(ExamRecord)
        .filter(ExamRecord.submitted_at.is_(None), ExamRecord.abandoned_at.is_(None))
        .all()
    )
    now = datetime.utcnow()
    changed = False
    for r in overdue:
        if _is_overdue(r):
            r.abandoned_at = now
            changed = True
    if changed:
        db.commit()


def _build_exam_questions(record: ExamRecord, db: Session):
    """构建考试题目列表（不含正确答案），按原抽题顺序返回"""
    question_ids = record.question_ids or []
    questions = db.query(Question).filter(Question.id.in_(question_ids)).all()
    q_map = {q.id: q for q in questions}
    exam_questions = []
    for idx, qid in enumerate(question_ids, 1):
        q = q_map.get(qid)
        if not q:
            continue
        exam_questions.append({
            "index": idx,
            "id": q.id,
            "question_type": q.question_type,
            "question_text": q.question_text,
            "options": q.options,
        })
    return exam_questions


def _saved_answers_map(record: ExamRecord) -> dict:
    """从已保存进度中恢复答案 {question_id: answer}"""
    saved = record.answers or []
    if isinstance(saved, list):
        return {item["question_id"]: item.get("answer", "") for item in saved if isinstance(item, dict)}
    return {}


class ExamSubmitAnswer(BaseModel):
    question_id: int
    answer: str


class ExamSubmitRequest(BaseModel):
    answers: list[ExamSubmitAnswer]
    started_at: Optional[str] = None


def _normalize_answer(ans: str) -> str:
    if not ans:
        return ""
    return "".join(sorted(c.strip().upper() for c in ans if c.strip()))


class ExamConfigUpdate(BaseModel):
    pick_decay: Optional[float] = None


@router.get("/exam/config")
def get_exam_config(db: Session = Depends(get_db)):
    """获取考试抽题配置"""
    decay = _get_pick_decay(db)
    return {
        "pick_decay": decay,
        "pick_decay_default": PICK_DECAY_DEFAULT,
        "pick_decay_min": PICK_DECAY_MIN,
        "pick_decay_max": PICK_DECAY_MAX,
    }


@router.put("/exam/config")
def update_exam_config(payload: ExamConfigUpdate, db: Session = Depends(get_db)):
    """更新考试抽题配置"""
    decay = payload.pick_decay
    if decay is None:
        raise HTTPException(status_code=400, detail="pick_decay 不能为空")
    try:
        decay = float(decay)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="pick_decay 必须是数字")
    if decay < PICK_DECAY_MIN or decay > PICK_DECAY_MAX:
        raise HTTPException(
            status_code=400,
            detail=f"pick_decay 取值范围 {PICK_DECAY_MIN} ~ {PICK_DECAY_MAX}",
        )
    setting_service.set_setting(db, "pick_decay", decay)
    return {"ok": True, "pick_decay": decay}


@router.get("/exam/generate")
def generate_exam(db: Session = Depends(get_db)):
    """随机生成一套考试题：35单选 + 15多选，使用加权随机降低高频题目被选中概率"""
    # 先把超时但未提交的进行中考试作废
    _expire_overdue_active(db)
    # 若仍有进行中且未超时的考试，禁止新建考试，需先完成或放弃现有考试
    active = _get_active_record(db)
    if active:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "您有未完成的考试，请先完成或放弃后再开始新考试",
                "active_exam_id": active.id,
                "remaining_seconds": _remaining_seconds(active),
                "started_at": (active.started_at.isoformat() + "Z") if active.started_at else None,
            },
        )

    # 取所有非重复、有标准答案的题目
    single_qs = (
        db.query(Question)
        .filter(
            Question.is_duplicate.is_(False),
            Question.question_type == "单选",
            Question.correct_answer.isnot(None),
            Question.correct_answer != "",
        )
        .all()
    )
    multi_qs = (
        db.query(Question)
        .filter(
            Question.is_duplicate.is_(False),
            Question.question_type == "多选",
            Question.correct_answer.isnot(None),
            Question.correct_answer != "",
        )
        .all()
    )

    if len(single_qs) < EXAM_SINGLE_COUNT:
        raise HTTPException(
            status_code=400,
            detail=f"单选题不足：需要 {EXAM_SINGLE_COUNT} 道，仅有 {len(single_qs)} 道",
        )
    if len(multi_qs) < EXAM_MULTI_COUNT:
        raise HTTPException(
            status_code=400,
            detail=f"多选题不足：需要 {EXAM_MULTI_COUNT} 道，仅有 {len(multi_qs)} 道",
        )

    # 获取统计
    all_ids = [q.id for q in single_qs + multi_qs]
    stats = {s.question_id: s for s in db.query(QuestionStat).filter(QuestionStat.question_id.in_(all_ids)).all()}

    # 读取当前衰减因子
    decay = _get_pick_decay(db)

    def weighted_pick(questions, n):
        """加权随机不放回选择：权重 = decay ^ pick_count
        从未出现的题权重最高，出现次数越多权重按指数级下降，
        从而在多次模拟中尽可能让所有题都有机会出现。
        """
        weights = []
        for q in questions:
            stat = stats.get(q.id)
            pick_count = stat.pick_count if stat else 0
            w = decay ** pick_count
            weights.append(w)

        # 加权随机不放回选择
        selected = []
        remaining = list(range(len(questions)))
        remaining_weights = list(weights)

        for _ in range(n):
            if not remaining:
                break
            total = sum(remaining_weights)
            r = random.uniform(0, total)
            cumulative = 0
            chosen_idx = 0
            for i, w in enumerate(remaining_weights):
                cumulative += w
                if r <= cumulative:
                    chosen_idx = i
                    break
            selected.append(questions[remaining[chosen_idx]])
            remaining.pop(chosen_idx)
            remaining_weights.pop(chosen_idx)

        return selected

    selected_single = weighted_pick(single_qs, EXAM_SINGLE_COUNT)
    selected_multi = weighted_pick(multi_qs, EXAM_MULTI_COUNT)
    selected = selected_single + selected_multi

    # 更新统计
    now = datetime.utcnow()
    for q in selected:
        stat = stats.get(q.id)
        if stat:
            stat.pick_count += 1
            stat.last_picked_at = now
        else:
            db.add(QuestionStat(question_id=q.id, pick_count=1, wrong_count=0, last_picked_at=now))
    db.commit()

    # 构建考试数据（不含 correct_answer）
    exam_questions = []
    for idx, q in enumerate(selected, 1):
        exam_questions.append({
            "index": idx,
            "id": q.id,
            "question_type": q.question_type,
            "question_text": q.question_text,
            "options": q.options,
        })

    # 创建考试记录
    record = ExamRecord(
        started_at=now,
        total_questions=EXAM_TOTAL,
        question_ids=[q.id for q in selected],
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return {
        "exam_id": record.id,
        "duration_minutes": EXAM_DURATION_MINUTES,
        "pass_score": PASS_SCORE,
        "full_score": FULL_SCORE,
        "total_questions": EXAM_TOTAL,
        "single_count": EXAM_SINGLE_COUNT,
        "multi_count": EXAM_MULTI_COUNT,
        "questions": exam_questions,
    }


@router.get("/exam/active")
def get_active_exam(db: Session = Depends(get_db)):
    """获取进行中且未超时的考试，用于恢复未完成的考试"""
    # 先作废已超时的进行中考试
    _expire_overdue_active(db)
    active = _get_active_record(db)
    if not active:
        return {"active": False}

    return {
        "active": True,
        "exam_id": active.id,
        "started_at": (active.started_at.isoformat() + "Z") if active.started_at else None,
        "remaining_seconds": _remaining_seconds(active),
        "duration_minutes": EXAM_DURATION_MINUTES,
        "pass_score": PASS_SCORE,
        "full_score": FULL_SCORE,
        "total_questions": active.total_questions,
        "questions": _build_exam_questions(active, db),
        "saved_answers": _saved_answers_map(active),
    }


class ExamSaveRequest(BaseModel):
    answers: list[ExamSubmitAnswer]


@router.post("/exam/{exam_id}/save")
def save_exam_progress(exam_id: int, payload: ExamSaveRequest, db: Session = Depends(get_db)):
    """保存考试答题进度，便于退出后恢复"""
    record = db.query(ExamRecord).filter(ExamRecord.id == exam_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="考试记录不存在")
    if record.submitted_at:
        raise HTTPException(status_code=400, detail="该考试已提交，无法保存进度")
    if record.abandoned_at:
        raise HTTPException(status_code=400, detail="该考试已放弃，无法保存进度")
    if _is_overdue(record):
        record.abandoned_at = datetime.utcnow()
        db.commit()
        raise HTTPException(status_code=400, detail="考试已超时，无法继续作答")

    record.answers = [{"question_id": a.question_id, "answer": a.answer} for a in payload.answers]
    db.commit()
    return {"ok": True, "saved_at": datetime.utcnow().isoformat() + "Z"}


@router.post("/exam/{exam_id}/abandon")
def abandon_exam(exam_id: int, db: Session = Depends(get_db)):
    """放弃未完成的考试，释放阻塞（之后可开始新考试）"""
    record = db.query(ExamRecord).filter(ExamRecord.id == exam_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="考试记录不存在")
    if record.submitted_at:
        raise HTTPException(status_code=400, detail="该考试已提交，无法放弃")
    record.abandoned_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.post("/exam/{exam_id}/submit")
def submit_exam(exam_id: int, payload: ExamSubmitRequest, db: Session = Depends(get_db)):
    """提交考试，打分并记录错题"""
    record = db.query(ExamRecord).filter(ExamRecord.id == exam_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="考试记录不存在")

    if record.submitted_at:
        raise HTTPException(status_code=400, detail="该考试已提交")
    if record.abandoned_at:
        raise HTTPException(status_code=400, detail="该考试已放弃，无法提交")

    # 取题目和标准答案
    question_ids = record.question_ids or []
    questions = (
        db.query(Question)
        .filter(Question.id.in_(question_ids))
        .all()
    )
    q_map = {q.id: q for q in questions}

    # 评分
    correct_count = 0
    wrong_list = []
    answer_map = {a.question_id: a.answer for a in payload.answers}

    for qid in question_ids:
        q = q_map.get(qid)
        if not q:
            continue
        user_ans = _normalize_answer(answer_map.get(qid, ""))
        correct_ans = _normalize_answer(q.correct_answer or "")

        if user_ans == correct_ans:
            correct_count += 1
        else:
            wrong_list.append({
                "question_id": qid,
                "user_answer": answer_map.get(qid, ""),
                "correct_answer": q.correct_answer or "",
            })

    wrong_count = len(question_ids) - correct_count
    score = round(correct_count / len(question_ids) * FULL_SCORE, 1) if question_ids else 0
    passed = score >= PASS_SCORE

    # 更新考试记录
    now = datetime.utcnow()
    record.submitted_at = now
    record.correct_count = correct_count
    record.wrong_count = wrong_count
    record.score = score
    record.passed = passed
    # 优先用后端记录的真实开始时间计算用时；前端传入的 started_at 仅作兜底
    start = record.started_at
    if start is None and payload.started_at:
        try:
            start = datetime.fromisoformat(payload.started_at.replace("Z", ""))
        except Exception:
            start = None
    if start:
        record.duration_seconds = int((now - start).total_seconds())
    record.answers = [{"question_id": a.question_id, "answer": a.answer} for a in payload.answers]

    # 记录错题到错题本
    # 再次答错的题需要重新复习：先把该题所有历史记录的 reviewed 重置为 false
    if wrong_list:
        wrong_qids = [w["question_id"] for w in wrong_list]
        db.query(WrongQuestion).filter(
            WrongQuestion.question_id.in_(wrong_qids),
            WrongQuestion.reviewed == True,
        ).update({WrongQuestion.reviewed: False}, synchronize_session=False)
    for w in wrong_list:
        db.add(WrongQuestion(
            question_id=w["question_id"],
            exam_id=exam_id,
            user_answer=w["user_answer"],
            correct_answer=w["correct_answer"],
            reviewed=False,
        ))

    # 更新题目统计的 wrong_count
    stat_map = {s.question_id: s for s in db.query(QuestionStat).filter(QuestionStat.question_id.in_([w["question_id"] for w in wrong_list])).all()}
    for w in wrong_list:
        stat = stat_map.get(w["question_id"])
        if stat:
            stat.wrong_count += 1
        else:
            db.add(QuestionStat(question_id=w["question_id"], pick_count=0, wrong_count=1))

    db.commit()

    # 返回详细结果（含正确答案和解析）
    result_questions = []
    for qid in question_ids:
        q = q_map.get(qid)
        if not q:
            continue
        ans = q.answer
        result_questions.append({
            "id": q.id,
            "question_type": q.question_type,
            "question_text": q.question_text,
            "options": q.options,
            "correct_answer": q.correct_answer,
            "user_answer": answer_map.get(qid, ""),
            "is_correct": _normalize_answer(answer_map.get(qid, "")) == _normalize_answer(q.correct_answer or ""),
            "explanation": ans.explanation if ans else None,
        })

    return {
        "exam_id": exam_id,
        "score": score,
        "passed": passed,
        "correct_count": correct_count,
        "wrong_count": wrong_count,
        "total_questions": len(question_ids),
        "duration_seconds": record.duration_seconds,
        "questions": result_questions,
    }


@router.get("/exam/history")
def exam_history(
    page: int = 1,
    page_size: int = 20,
    passed: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
):
    """考试历史记录（支持按是否通过筛选）"""
    # 历史记录只展示已提交的考试（进行中 / 已放弃的不计入）
    base_filter = ExamRecord.submitted_at.isnot(None)
    query = db.query(ExamRecord).filter(base_filter)
    if passed is not None:
        query = query.filter(ExamRecord.passed == passed)
    total = query.count()
    records = (
        query.order_by(ExamRecord.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    # 全局统计（仅已提交）
    all_records = db.query(ExamRecord).filter(base_filter).all()
    stats = {
        "total": len(all_records),
        "passed": sum(1 for r in all_records if r.passed),
        "avg_score": round(sum((r.score or 0) for r in all_records) / len(all_records), 1) if all_records else 0,
        "best_score": max((r.score or 0) for r in all_records) if all_records else 0,
    }

    return {
        "total": total,
        "stats": stats,
        "items": [
            {
                "id": r.id,
                "started_at": (r.started_at.isoformat() + "Z") if r.started_at else None,
                "submitted_at": (r.submitted_at.isoformat() + "Z") if r.submitted_at else None,
                "total_questions": r.total_questions,
                "correct_count": r.correct_count,
                "wrong_count": r.wrong_count,
                "score": r.score,
                "passed": r.passed,
                "duration_seconds": r.duration_seconds,
            }
            for r in records
        ],
    }


# ===== 错题本 =====

class WrongQuestionReviewRequest(BaseModel):
    reviewed: bool = True


def _latest_wrong_question_ids_subq(db: Session):
    """子查询：每个 question_id 在错题本中最新一条记录的 id"""
    return (
        db.query(func.max(WrongQuestion.id).label("max_id"))
        .group_by(WrongQuestion.question_id)
    )


@router.get("/wrong-questions")
def list_wrong_questions(
    page: int = 1,
    page_size: int = 20,
    reviewed: Optional[bool] = Query(None),
    wrong_times: Optional[int] = Query(None, description="错答次数过滤：1/2/3/4 表示恰好 N 次，5 表示 5 次及以上"),
    db: Session = Depends(get_db),
):
    """错题本列表（按 question_id 去重，每题显示最近一次错答）"""
    # 子查询：每个 question_id 最新一条记录的 id + 累计错答次数
    subq = (
        db.query(
            func.max(WrongQuestion.id).label("max_id"),
            WrongQuestion.question_id.label("qid"),
            func.count(WrongQuestion.id).label("cnt"),
        )
        .group_by(WrongQuestion.question_id)
        .subquery()
    )
    # 按 wrong_times 过滤
    cnt_filter = None
    if wrong_times is not None:
        if wrong_times >= 5:
            cnt_filter = subq.c.cnt >= 5
        else:
            cnt_filter = subq.c.cnt == wrong_times
    if cnt_filter is not None:
        latest_ids = (
            db.query(subq.c.max_id).filter(cnt_filter).subquery()
        )
    else:
        latest_ids = db.query(subq.c.max_id).subquery()

    query = db.query(WrongQuestion).filter(WrongQuestion.id.in_(latest_ids))
    if reviewed is not None:
        query = query.filter(WrongQuestion.reviewed == reviewed)
    total = query.count()
    items = (
        query.order_by(WrongQuestion.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    # 统计每题历史错答次数
    wrong_counts = {}
    if items:
        qids = [w.question_id for w in items]
        wrong_counts = dict(
            db.query(WrongQuestion.question_id, func.count(WrongQuestion.id))
            .filter(WrongQuestion.question_id.in_(qids))
            .group_by(WrongQuestion.question_id)
            .all()
        )

    return {
        "total": total,
        "items": [
            {
                "id": w.id,
                "question_id": w.question_id,
                "exam_id": w.exam_id,
                "user_answer": w.user_answer,
                "correct_answer": w.correct_answer,
                "created_at": (w.created_at.isoformat() + "Z") if w.created_at else None,
                "reviewed": w.reviewed,
                "wrong_count": wrong_counts.get(w.question_id, 1),
                "question": {
                    "id": w.question.id,
                    "question_type": w.question.question_type,
                    "question_text": w.question.question_text,
                    "options": w.question.options,
                    "correct_answer": w.question.correct_answer,
                    "category": w.question.category,
                    "subcategory": w.question.subcategory,
                    # AI 答题信息：用于在错题本中对比 AI 答案与标准答案、展示 AI 解析
                    "ai_answer": w.question.answer.answer if w.question.answer else None,
                    "ai_explanation": w.question.answer.explanation if w.question.answer else None,
                    "ai_is_correct": w.question.answer.is_correct if w.question.answer else None,
                    "ai_model": w.question.answer.model if w.question.answer else None,
                    "ai_review_status": w.question.answer.review_status if w.question.answer else None,
                } if w.question else None,
            }
            for w in items
        ],
    }


@router.put("/wrong-questions/{wq_id}/review")
def review_wrong_question(wq_id: int, payload: WrongQuestionReviewRequest, db: Session = Depends(get_db)):
    """标记错题为已复习（同步更新该题的所有历史记录）"""
    wq = db.query(WrongQuestion).filter(WrongQuestion.id == wq_id).first()
    if not wq:
        raise HTTPException(status_code=404, detail="错题记录不存在")
    db.query(WrongQuestion).filter(
        WrongQuestion.question_id == wq.question_id
    ).update({WrongQuestion.reviewed: payload.reviewed}, synchronize_session=False)
    db.commit()
    return {"ok": True}


@router.delete("/wrong-questions/{wq_id}")
def delete_wrong_question(wq_id: int, db: Session = Depends(get_db)):
    """删除错题记录（同时删除该题的所有历史记录）"""
    wq = db.query(WrongQuestion).filter(WrongQuestion.id == wq_id).first()
    if not wq:
        raise HTTPException(status_code=404, detail="错题记录不存在")
    db.query(WrongQuestion).filter(
        WrongQuestion.question_id == wq.question_id
    ).delete(synchronize_session=False)
    db.commit()
    return {"ok": True}


@router.get("/wrong-questions/stats")
def wrong_question_stats(db: Session = Depends(get_db)):
    """错题本统计（按 question_id 去重）"""
    base = db.query(WrongQuestion).filter(
        WrongQuestion.id.in_(_latest_wrong_question_ids_subq(db))
    )
    total = base.count()
    reviewed = base.filter(WrongQuestion.reviewed == True).count()
    pending = total - reviewed
    return {"total": total, "reviewed": reviewed, "pending": pending}


@router.get("/exam/coverage")
def exam_coverage(
    status: Optional[str] = Query(None, description="筛选：appeared=已出现 / unappeared=未出现"),
    question_type: Optional[str] = Query(None, description="题型：单选/多选"),
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
):
    """题目覆盖率分析：哪些题在模拟考试中出现过、哪些没出现过"""
    # 题库总量（排除重复题）
    base_q = db.query(Question).filter(Question.is_duplicate == False)
    total_questions = base_q.count()
    total_single = base_q.filter(Question.question_type == "单选").count()
    total_multi = base_q.filter(Question.question_type == "多选").count()

    # 统计表：每个 question_id 的 pick_count
    stats_map = {
        s.question_id: s
        for s in db.query(QuestionStat).all()
    }

    # 出现过的题（pick_count > 0）
    appeared_ids = {qid for qid, s in stats_map.items() if s.pick_count > 0}
    appeared_count = len(appeared_ids)
    unappeared_count = total_questions - appeared_count

    # 按题型细分覆盖率
    if appeared_ids:
        appeared_single = db.query(Question).filter(
            Question.id.in_(appeared_ids),
            Question.question_type == "单选",
        ).count()
        appeared_multi = db.query(Question).filter(
            Question.id.in_(appeared_ids),
            Question.question_type == "多选",
        ).count()
    else:
        appeared_single = 0
        appeared_multi = 0

    # 出现次数分布
    distribution = {}
    for qid, s in stats_map.items():
        if s.pick_count > 0:
            distribution[s.pick_count] = distribution.get(s.pick_count, 0) + 1

    # 列表查询：支持按 status / question_type 筛选
    list_q = db.query(Question).filter(Question.is_duplicate == False).options(joinedload(Question.answer))
    if question_type:
        list_q = list_q.filter(Question.question_type == question_type)
    if status == "appeared":
        if not appeared_ids:
            return {
                "summary": {
                    "total_questions": total_questions,
                    "total_single": total_single,
                    "total_multi": total_multi,
                    "appeared_count": appeared_count,
                    "unappeared_count": unappeared_count,
                    "appeared_single": appeared_single,
                    "appeared_multi": appeared_multi,
                    "coverage_rate": round(appeared_count / total_questions * 100, 1) if total_questions else 0,
                },
                "distribution": distribution,
                "total": 0,
                "items": [],
            }
        list_q = list_q.filter(Question.id.in_(appeared_ids))
    elif status == "unappeared":
        if appeared_ids:
            list_q = list_q.filter(~Question.id.in_(appeared_ids))
    list_total = list_q.count()
    questions = (
        list_q.order_by(Question.id.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    items = []
    for q in questions:
        s = stats_map.get(q.id)
        a = q.answer
        items.append({
            "id": q.id,
            "question_type": q.question_type,
            "question_text": (q.question_text or "")[:120],
            # 完整信息用于明细弹窗
            "full_text": q.question_text or "",
            "options": q.options,
            "correct_answer": q.correct_answer,
            "category": q.category,
            "subcategory": q.subcategory,
            "pick_count": s.pick_count if s else 0,
            "wrong_count": s.wrong_count if s else 0,
            "last_picked_at": (s.last_picked_at.isoformat() + "Z") if (s and s.last_picked_at) else None,
            "appeared": (s.pick_count > 0) if s else False,
            # AI 答题信息
            "ai_answer": a.answer if a else None,
            "ai_explanation": a.explanation if a else None,
            "ai_is_correct": a.is_correct if a else None,
            "ai_model": a.model if a else None,
        })

    return {
        "summary": {
            "total_questions": total_questions,
            "total_single": total_single,
            "total_multi": total_multi,
            "appeared_count": appeared_count,
            "unappeared_count": unappeared_count,
            "appeared_single": appeared_single,
            "appeared_multi": appeared_multi,
            "coverage_rate": round(appeared_count / total_questions * 100, 1) if total_questions else 0,
        },
        "distribution": distribution,
        "total": list_total,
        "items": items,
    }
