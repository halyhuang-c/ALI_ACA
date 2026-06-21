from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from config import IMAGE_DIR
from database import get_db
from models import Image, Question, Answer

router = APIRouter()


@router.get("/images/{image_id}/file")
def get_image_file(image_id: int, db: Session = Depends(get_db)):
    img = db.get(Image, image_id)
    if img is None:
        raise HTTPException(status_code=404, detail="图片不存在")
    p = IMAGE_DIR / img.filename
    try:
        p = p.resolve()
        if IMAGE_DIR.resolve() not in p.parents and p != IMAGE_DIR.resolve():
            raise HTTPException(status_code=403, detail="非法路径")
    except Exception:
        raise HTTPException(status_code=404, detail="图片文件不可访问")
    if not p.exists() or not p.is_file():
        raise HTTPException(status_code=404, detail="图片文件不存在")
    return FileResponse(str(p))


@router.get("/images/responses")
def list_image_responses(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    keyword: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    base = db.query(Image)
    if keyword:
        base = base.filter(Image.filename.like(f"%{keyword}%"))
    if status:
        base = base.filter(Image.status == status)
    total = base.count()
    skip = (page - 1) * page_size
    rows = base.order_by(Image.id.asc()).offset(skip).limit(page_size).all()

    items = []
    for img in rows:
        qcount = db.query(Question).filter(Question.image_id == img.id).count()
        # 答题状态：该图片关联的非重复题目答题情况
        total_qs = db.query(Question).filter(
            Question.image_id == img.id,
            Question.is_duplicate == False,
        ).count()
        all_qs = db.query(Question).filter(Question.image_id == img.id).count()
        answered_qs = 0
        failed_qs = 0
        if total_qs > 0:
            q_ids = [qid for (qid,) in db.query(Question.id).filter(
                Question.image_id == img.id,
                Question.is_duplicate == False,
            ).all()]
            answered_qs = db.query(Answer).filter(
                Answer.question_id.in_(q_ids),
                Answer.answer.isnot(None),
            ).count()
            failed_qs = db.query(Answer).filter(
                Answer.question_id.in_(q_ids),
                Answer.answer.is_(None),
            ).count()
        if all_qs > 0 and total_qs == 0:
            answer_status = "duplicate"
        elif total_qs == 0:
            answer_status = "pending"
        elif answered_qs == total_qs:
            answer_status = "completed"
        elif answered_qs > 0:
            answer_status = "partial"
        elif failed_qs > 0:
            answer_status = "failed"
        else:
            answer_status = "pending"
        items.append({
            "id": img.id,
            "filename": img.filename,
            "status": img.status,
            "extract_model": img.extract_model,
            "raw_extract_response": img.raw_extract_response,
            "question_count": qcount,
            "answer_status": answer_status,
            "answer_total": total_qs,
            "answer_done": answered_qs,
            "error_message": img.error_message,
            "created_at": img.created_at,
        })

    all_rows = db.query(Image.status).all()
    counts = {"pending": 0, "processed": 0, "failed": 0}
    for (s,) in all_rows:
        if s in counts:
            counts[s] += 1
        else:
            counts[s] = counts.get(s, 0) + 1

    # 答题状态统计
    answer_counts = {"pending": 0, "completed": 0, "partial": 0, "failed": 0, "duplicate": 0}
    for item in items:
        a_s = item["answer_status"]
        if a_s in answer_counts:
            answer_counts[a_s] += 1
        else:
            answer_counts[a_s] = answer_counts.get(a_s, 0) + 1

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "status_counts": counts,
        "answer_status_counts": answer_counts,
    }


@router.get("/images/{image_id}/response")
def get_image_response(image_id: int, db: Session = Depends(get_db)):
    img = db.get(Image, image_id)
    if img is None:
        raise HTTPException(status_code=404, detail="图片不存在")
    questions = (
        db.query(Question)
        .filter(Question.image_id == image_id)
        .order_by(Question.id.asc())
        .all()
    )
    answers = []
    for q in questions:
        ans = q.answer
        answers.append({
            "question_id": q.id,
            "question_text": q.question_text,
            "model": ans.model if ans else None,
            "raw_response": ans.raw_response if ans else None,
        })
    return {
        "image": {
            "id": img.id,
            "filename": img.filename,
            "status": img.status,
            "extract_model": img.extract_model,
            "raw_extract_response": img.raw_extract_response,
        },
        "answers": answers,
    }
