from concurrent.futures import as_completed
from typing import Optional, Callable

from sqlalchemy.orm import Session

import llm_client
import log_store
import setting_service
from models import Image, Question, LLMConfig
from services import pipeline_service
from services.pipeline_service import STEP_EXTRACT, ConsecutiveFailureTracker


def extract_all(db: Session, status_feed: Optional[Callable[[dict], None]] = None) -> int:
    settings = setting_service.get_all_settings(db)
    config_id = settings.get("extract_config_id")
    model = settings.get("extract_model") or ""
    instruction = settings.get("extract_prompt") or ""
    llm_config = db.get(LLMConfig, config_id) if config_id is not None else None

    pending_images = db.query(Image).filter(Image.status == "pending").all()
    already_processed = db.query(Image).filter(Image.status == "processed").count()
    already_failed = db.query(Image).filter(Image.status == "failed").count()
    total_all = already_processed + already_failed + len(pending_images)
    this_total = len(pending_images)
    pipeline_service.update_step(db, STEP_EXTRACT, status="running", total=total_all, current=already_processed)
    log_store.clear(STEP_EXTRACT)
    config_name = llm_config.name if llm_config else "未配置"
    log_store.append(STEP_EXTRACT, f"开始识别题目：本次待处理 {this_total} 张（已成功 {already_processed}，已失败 {already_failed}）")
    log_store.append(STEP_EXTRACT, f"使用配置：[{config_name}] 模型：{model or '未配置'}")

    if this_total == 0:
        log_store.append(STEP_EXTRACT, "没有待识别的图片，跳过")
        if already_failed > 0:
            pipeline_service.update_step(db, STEP_EXTRACT, status="partial_failed", total=total_all, current=already_processed)
        else:
            pipeline_service.update_step(db, STEP_EXTRACT, status="completed", total=total_all, current=already_processed)
        return already_processed

    if llm_config is None or not model:
        log_store.append(STEP_EXTRACT, "未配置识别模型，跳过", level="error")
        pipeline_service.update_step(db, STEP_EXTRACT, status="failed")
        return 0

    base_url = llm_config.base_url
    api_key = llm_config.api_key

    executor = llm_client.get_executor_for("extract")
    futures = {
        executor.submit(
            llm_client.extract_questions_from_image,
            img.path, base_url, api_key, model, instruction
        ): img
        for img in pending_images
    }

    processed = 0
    failed = 0
    questions_total = 0
    paused_mid = False
    auto_paused = False
    failure_tracker = ConsecutiveFailureTracker()
    for fut in as_completed(futures):
        if pipeline_service.is_paused():
            paused_mid = True
            break
        img: Image = futures[fut]
        idx = processed + failed + 1
        try:
            questions, raw_content = fut.result()
            created = 0
            for q in questions:
                text = (q.get("question_text") or "").strip()
                if not text:
                    continue
                question = Question(
                    image_id=img.id,
                    question_text=text,
                    options=q.get("options"),
                    question_type=q.get("question_type"),
                    correct_answer=(q.get("correct_answer") or "").strip() or None,
                    norm_text=None,
                    is_duplicate=False,
                )
                db.add(question)
                created += 1
            img.status = "processed"
            img.error_message = None
            img.raw_extract_response = {"raw": raw_content, "parsed": questions}
            img.extract_model = model
            processed += 1
            questions_total += created
            failure_tracker.reset()
            log_store.append(STEP_EXTRACT, f"[{idx}/{this_total}] OK {img.filename} -> 识别 {created} 题")
        except Exception as e:
            img.status = "failed"
            img.error_message = str(e)[:1000]
            img.extract_model = model
            failed += 1
            log_store.append(STEP_EXTRACT, f"[{idx}/{this_total}] FAIL {img.filename} -> {e}", level="error")
            hit = failure_tracker.record_failure(str(e))
            if hit:
                pipeline_service.request_pause()
                auto_paused = True
                log_store.append(
                    STEP_EXTRACT,
                    f"连续 {failure_tracker.count} 次失败原因相同 [{failure_tracker.last_reason}]，自动暂停任务，请检查模型配置或网络后重试",
                    level="error",
                )
                break
        db.commit()
        pipeline_service.update_step(
            db, STEP_EXTRACT,
            current=(already_processed + processed),
        )
        if status_feed is not None:
            status_feed(pipeline_service.get_status(db))

    if auto_paused:
        log_store.append(STEP_EXTRACT, f"自动暂停：本次成功 {processed} 张，失败 {failed} 张，剩余 {this_total - processed - failed} 张待恢复后继续")
        pipeline_service.update_step(db, STEP_EXTRACT, status="paused", current=(already_processed + processed))
        return processed
    if paused_mid:
        log_store.append(STEP_EXTRACT, f"已暂停：本次完成 {processed} 张，剩余 {this_total - processed - failed} 张待恢复后继续")
        pipeline_service.update_step(db, STEP_EXTRACT, status="paused", current=(already_processed + processed))
        return processed
    log_store.append(
        STEP_EXTRACT,
        f"识别完成：本次成功 {processed} 张，失败 {failed} 张，共提取 {questions_total} 道题（累计成功 {already_processed + processed}/{total_all}）",
    )
    if failed > 0:
        log_store.append(STEP_EXTRACT, f"有 {failed} 张图片识别失败，等待你决定：重试失败项 或 忽略并继续", level="warn")
        pipeline_service.update_step(db, STEP_EXTRACT, status="partial_failed", current=(already_processed + processed))
    else:
        pipeline_service.update_step(db, STEP_EXTRACT, status="completed", total=total_all, current=(already_processed + processed))
    return processed
