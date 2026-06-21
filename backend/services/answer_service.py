from concurrent.futures import as_completed
from typing import Optional, Callable

from sqlalchemy.orm import Session

import llm_client
import log_store
import setting_service
from category_def import normalize_category, normalize_subcategory
from models import Question, Answer, Tag, QuestionTag, LLMConfig
from services import pipeline_service
from services.pipeline_service import STEP_ANSWER, ConsecutiveFailureTracker


def _normalize_answer(raw) -> str:
    if raw is None:
        return ""
    s = str(raw).strip().upper()
    for ch in (" ", "\t", "\n", ",", "，", "、", ";", "；"):
        s = s.replace(ch, "")
    s = s.replace("（", "(").replace("）", ")")
    if s.startswith("("):
        s = s.lstrip("(").rstrip(")")
    return s


def _compare_answer(ai_answer, correct_answer) -> Optional[bool]:
    ai = _normalize_answer(ai_answer)
    correct = _normalize_answer(correct_answer)
    if not correct:
        return None
    if not ai:
        return False
    if ai == correct:
        return True
    return set(ai) == set(correct)


def _ensure_tag_link(db: Session, question_id: int, raw_name: str) -> Optional[int]:
    if not raw_name:
        return None
    display = raw_name.strip()
    name = display.lower()
    if not name:
        return None
    tag = db.query(Tag).filter(Tag.name == name).first()
    if tag is None:
        tag = Tag(name=name, display_name=display, ref_count=0)
        db.add(tag)
        db.flush()
    link = (
        db.query(QuestionTag)
        .filter(QuestionTag.question_id == question_id, QuestionTag.tag_id == tag.id)
        .first()
    )
    if link is None:
        db.add(QuestionTag(question_id=question_id, tag_id=tag.id))
        tag.ref_count = (tag.ref_count or 0) + 1
    return tag.id


def _questions_without_answer(db: Session, is_duplicate: bool) -> list[Question]:
    return (
        db.query(Question)
        .filter(Question.is_duplicate == is_duplicate)
        .outerjoin(Answer, Answer.question_id == Question.id)
        .filter(
            (Answer.id.is_(None)) | (Answer.answer.is_(None))
        )
        .order_by(Question.id.asc())
        .all()
    )


def answer_all(db: Session, status_feed: Optional[Callable[[dict], None]] = None) -> dict:
    settings = setting_service.get_all_settings(db)
    config_id = settings.get("answer_config_id")
    model = settings.get("answer_model") or ""
    system_prompt = settings.get("answer_system_prompt") or ""
    user_prompt_template = settings.get("answer_prompt") or ""
    llm_config = db.get(LLMConfig, config_id) if config_id is not None else None

    unique_qs = _questions_without_answer(db, is_duplicate=False)
    duplicate_qs = _questions_without_answer(db, is_duplicate=True)
    this_total = len(unique_qs) + len(duplicate_qs)
    total_all = db.query(Question).count()
    already_answered = db.query(Question).join(Answer, Answer.question_id == Question.id).count()

    pipeline_service.update_step(db, STEP_ANSWER, status="running", total=total_all, current=already_answered)
    log_store.clear(STEP_ANSWER)
    config_name = llm_config.name if llm_config else "未配置"
    log_store.append(
        STEP_ANSWER,
        f"开始答题解析：本次待处理 {this_total} 道（去重题 {len(unique_qs)}，重复题 {len(duplicate_qs)} 自动复用；累计已答 {already_answered}/{total_all}）",
    )
    log_store.append(STEP_ANSWER, f"使用配置：[{config_name}] 模型：{model or '未配置'}")

    if llm_config is None or not model:
        log_store.append(STEP_ANSWER, "未配置答题模型，跳过", level="error")
        pipeline_service.update_step(db, STEP_ANSWER, status="failed")
        return {"total": this_total, "answered": 0}

    if this_total == 0:
        log_store.append(STEP_ANSWER, "没有待答题的题目，跳过")
        pipeline_service.update_step(db, STEP_ANSWER, status="completed", total=total_all, current=already_answered)
        return {"total": this_total, "answered": 0}

    base_url = llm_config.base_url
    api_key = llm_config.api_key

    done = 0
    answered = 0
    failed_count = 0
    auto_paused = False
    failure_tracker = ConsecutiveFailureTracker()

    if unique_qs:
        executor = llm_client.get_executor_for("answer")
        futures = {
            executor.submit(
                llm_client.answer_question,
                q.question_text, q.options, base_url, api_key, model, system_prompt, user_prompt_template, q.question_type or ""
            ): q
            for q in unique_qs
        }
        paused_mid = False
        for fut in as_completed(futures):
            if pipeline_service.is_paused():
                paused_mid = True
                break
            q: Question = futures[fut]
            idx = done + 1
            try:
                result, raw_content = fut.result()
                tags = result.get("tags") or []
                ai_ans = result.get("answer")
                correct = q.correct_answer
                is_correct = _compare_answer(ai_ans, correct)
                category = normalize_category(result.get("category"))
                subcategory = normalize_subcategory(result.get("subcategory"), category)
                q.category = category
                q.subcategory = subcategory
                answer = Answer(
                    question_id=q.id,
                    answer=ai_ans,
                    explanation=result.get("explanation"),
                    tags=tags,
                    raw_response={"raw": raw_content, "parsed": result},
                    model=model,
                    is_correct=is_correct,
                    review_status="approved" if is_correct is True else None,
                )
                db.add(answer)
                db.flush()
                for raw_tag in tags:
                    _ensure_tag_link(db, q.id, raw_tag)
                answered += 1
                failure_tracker.reset()
                preview = (q.question_text or "").replace("\n", " ").strip()
                if len(preview) > 30:
                    preview = preview[:30] + "..."
                if is_correct is None:
                    cmp_text = "无标准答案，未对比"
                    cmp_level = "info"
                elif is_correct:
                    cmp_text = f"与标准答案一致({correct})"
                    cmp_level = "info"
                else:
                    cmp_text = f"AI答案[{ai_ans}] 与标准答案[{correct}]不一致!"
                    cmp_level = "error"
                log_store.append(
                    STEP_ANSWER,
                    f"[{idx}/{this_total}] OK #{q.id} AI答案 {ai_ans} | {preview} | 分类:{category}/{subcategory} | tags={tags} | {cmp_text}",
                    level=cmp_level,
                )
            except Exception as e:
                db.add(Answer(
                    question_id=q.id,
                    answer=None,
                    explanation=f"[ERROR] {e}"[:1000],
                    tags=[],
                    model=model,
                ))
                failed_count += 1
                log_store.append(STEP_ANSWER, f"[{idx}/{this_total}] FAIL #{q.id} -> {e}", level="error")
                hit = failure_tracker.record_failure(str(e))
                if hit:
                    pipeline_service.request_pause()
                    auto_paused = True
                    log_store.append(
                        STEP_ANSWER,
                        f"连续 {failure_tracker.count} 次失败原因相同 [{failure_tracker.last_reason}]，自动暂停任务，请检查模型配置或网络后重试",
                        level="error",
                    )
                    break
            db.commit()
            done += 1
            pipeline_service.update_step(db, STEP_ANSWER, current=(already_answered + done - failed_count))
            if status_feed is not None:
                status_feed(pipeline_service.get_status(db))

    if auto_paused:
        log_store.append(STEP_ANSWER, f"自动暂停：本次已答 {done} 道（失败 {failed_count}），剩余 {this_total - done} 道待恢复后继续")
        pipeline_service.update_step(db, STEP_ANSWER, status="paused", current=(already_answered + done - failed_count))
        return {"total": this_total, "answered": answered}

    if paused_mid:
        log_store.append(STEP_ANSWER, f"已暂停：本次已答 {done} 道（失败 {failed_count}），剩余 {this_total - done} 道待恢复后继续")
        pipeline_service.update_step(db, STEP_ANSWER, status="paused", current=(already_answered + done - failed_count))
        return {"total": this_total, "answered": answered}

    for q in duplicate_qs:
        primary = db.get(Question, q.duplicate_of_id) if q.duplicate_of_id else None
        if primary is not None and primary.answer is not None:
            src = primary.answer
            tags = src.tags or []
            is_correct = _compare_answer(src.answer, q.correct_answer)
            q.category = primary.category
            q.subcategory = primary.subcategory
            db.add(Answer(
                question_id=q.id,
                answer=src.answer,
                explanation=src.explanation,
                tags=tags,
                raw_response=src.raw_response,
                model=src.model,
                is_correct=is_correct,
            ))
            db.flush()
            for raw_tag in tags:
                _ensure_tag_link(db, q.id, raw_tag)
        else:
            db.add(Answer(question_id=q.id, answer=None, explanation=None, tags=[]))
        db.commit()
        done += 1
        pipeline_service.update_step(db, STEP_ANSWER, current=(already_answered + done))
        if status_feed is not None:
            status_feed(pipeline_service.get_status(db))

    final_current = already_answered + done - failed_count
    log_store.append(STEP_ANSWER, f"答题解析完成：实际调用大模型 {answered} 道，其余复用，失败 {failed_count} 道（累计 {final_current}/{total_all}）")
    if failed_count > 0:
        log_store.append(STEP_ANSWER, f"有 {failed_count} 道题答题失败，等待你决定：重试失败项 或 忽略并继续", level="warn")
        pipeline_service.update_step(db, STEP_ANSWER, status="partial_failed", current=final_current)
    else:
        pipeline_service.update_step(db, STEP_ANSWER, status="completed", total=total_all, current=final_current)
    return {"total": this_total, "answered": answered}
