import base64
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

import openai

from config import MAX_CONCURRENCY
from category_def import CATEGORY_SYSTEM_TEXT as _CATEGORY_SYSTEM_TEXT


def _is_rate_limited(err: Exception) -> bool:
    text = str(err)
    return "429" in text or "rate limit" in text.lower() or "速率限制" in text


def _backoff_for(err: Exception, attempt: int) -> None:
    if _is_rate_limited(err):
        wait = 30 * (attempt + 1)
        import log_store
        log_store.append(
            "extract",
            f"触发速率限制(429)，等待 {wait}s 后重试（第 {attempt + 1} 次）",
            level="warn",
        )
        time.sleep(wait)
    else:
        time.sleep(2 ** (attempt + 1))

DEFAULT_EXTRACT_INSTRUCTION = (
    "请识别图片中的所有题目，并以严格 JSON 格式返回，不要输出任何额外文字或解释。\n"
    "返回格式：{\"questions\": [{\"question_text\": \"题目正文（不要包含答案标注）\", "
    "\"options\": {\"A\": \"选项A\", \"B\": \"选项B\", \"C\": \"选项C\", \"D\": \"选项D\", "
    "\"E\": \"选项E\", \"F\": \"选项F\"}, "
    "\"correct_answer\": \"图片中标注的准确答案\", "
    "\"question_type\": \"单选|多选\"}]}。\n"
    "说明：1) 本题库只有 单选 和 多选 两种题型，question_type 只能填 单选 或 多选，"
    "不要输出 判断/填空/问答 等其它类型；"
    "2) 选项最多可能有 A~F 共 6 个（多选题常见），请按图片实际选项完整识别，"
    "不要遗漏 E、F 等后面的选项，也不要截断到 A~D；每道题都一定有 options 字段；"
    "3) correct_answer 必须填写图片中标注的准确/标准答案：单选填单个字母如 \"A\"，"
    "多选填多个字母连写如 \"ABD\"；如果图片中没有标注答案，correct_answer 设为空字符串 \"\"；"
    "4) question_text 只放题目正文，不要把答案标注一起放进来；"
    "5) 每道题独立成一条；6) 仅输出 JSON。"
)

DEFAULT_ANSWER_SYSTEM_PROMPT = "你是一位严谨且专业的答题助手，始终以 JSON 格式输出。"

DEFAULT_ANSWER_PROMPT_TEMPLATE = (
    "你是一位严谨的答题专家。请根据下面的题目给出正确答案、选择理由、知识分类和标签。\n"
    "以严格 JSON 格式返回，不要输出任何额外文字：\n"
    "{\"answer\": \"正确答案（如 A 或 ABCD）\", "
    "\"explanation\": \"选择理由或解析\", "
    "\"category\": \"大类\", "
    "\"subcategory\": \"小类\", "
    "\"tags\": [\"知识点\", \"难度\", \"...\"]}。\n"
    "分类体系（必须从以下大类中选择 category，并给出对应的 subcategory）：\n"
    "{category_system}\n"
    "分类要求：1) category 只能从【基础理论类 / 提示词工程类 / 核心技术实操类 / "
    "智能体与前沿应用类 / 其他】中选择；2) subcategory 必须与 category 对应，"
    "从该大类下的具体小类中选择；3) 如果题目无法归入以上任何分类，category 填 \"其他\"，"
    "subcategory 填 \"其他\"；4) 分类基于题目考查的知识点判断。\n"
    "其它要求：1) answer 尽量简短，只填选项字母；2) explanation 说明为什么选该答案；"
    "3) tags 补充难度/易错点等，2-4 个。\n\n"
    "【重要】题型：{question_type}\n"
    "如果是「单选」，answer 只能填 1 个字母（如 A），绝对不能填多个字母；"
    "如果是「多选」，answer 填多个字母连写（如 ABCD）。\n\n"
    "题目：{question_text}{options_desc}"
)

_executors = {}


def _ensure_executor(tag: str, workers: int):
    cur = _executors.get(tag)
    if cur is None or cur[1] != workers:
        if cur is not None:
            try:
                cur[0].shutdown(wait=False)
            except Exception:
                pass
        ex = ThreadPoolExecutor(max_workers=max(1, workers))
        _executors[tag] = (ex, workers)
    return _executors[tag][0]


def get_executor(workers: int = None) -> ThreadPoolExecutor:
    try:
        from database import SessionLocal
        import setting_service
        db = SessionLocal()
        try:
            if workers is None:
                workers = int(setting_service.get_setting(db, "extract_concurrency") or 3)
        finally:
            db.close()
    except Exception:
        workers = workers or MAX_CONCURRENCY
    return _ensure_executor("default", max(1, min(20, workers)))


def get_executor_for(stage: str) -> ThreadPoolExecutor:
    key = "extract_concurrency" if stage == "extract" else "answer_concurrency"
    try:
        from database import SessionLocal
        import setting_service
        db = SessionLocal()
        try:
            workers = int(setting_service.get_setting(db, key) or 3)
        finally:
            db.close()
    except Exception:
        workers = MAX_CONCURRENCY
    return _ensure_executor(stage, max(1, min(20, workers)))


def build_client(config: dict) -> openai.OpenAI:
    return openai.OpenAI(
        base_url=config.get("base_url"),
        api_key=config.get("api_key") or "EMPTY",
        timeout=1200.0,
    )


def image_to_base64(path: str) -> str:
    with open(path, "rb") as f:
        data = base64.b64encode(f.read()).decode("utf-8")
    lower = path.lower()
    if lower.endswith(".png"):
        mime = "image/png"
    elif lower.endswith((".jpg", ".jpeg")):
        mime = "image/jpeg"
    elif lower.endswith(".gif"):
        mime = "image/gif"
    elif lower.endswith(".webp"):
        mime = "image/webp"
    else:
        mime = "image/png"
    return f"data:{mime};base64,{data}"


def _strip_code_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n", "", text)
        text = re.sub(r"\n```\s*$", "", text)
    return text.strip()


def _extract_json_object(text: str):
    cleaned = _strip_code_fence(text)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[\s\S]*\}", cleaned)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    return None


def _extract_json_list(text: str) -> list:
    cleaned = _strip_code_fence(text)
    try:
        data = json.loads(cleaned)
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            for key in ("questions", "data", "items", "results"):
                if isinstance(data.get(key), list):
                    return data[key]
            return [data]
    except json.JSONDecodeError:
        pass
    match = re.search(r"\[[\s\S]*\]", cleaned)
    if match:
        try:
            data = json.loads(match.group(0))
            if isinstance(data, list):
                return data
        except json.JSONDecodeError:
            pass
    return []


def extract_questions_from_image(
    path: str,
    base_url: str,
    api_key: str,
    model: str,
    instruction: str,
    max_retries: int = 3,
) -> tuple[list[dict], str]:
    data_url = image_to_base64(path)
    instruction = instruction or DEFAULT_EXTRACT_INSTRUCTION
    client = build_client({"base_url": base_url, "api_key": api_key})

    last_error: Optional[Exception] = None
    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "image_url", "image_url": {"url": data_url}},
                            {"type": "text", "text": instruction},
                        ],
                    }
                ],
            )
            content = response.choices[0].message.content or ""
            data = _extract_json_object(content)
            if data is None:
                raise ValueError(f"无法解析为 JSON: {content[:200]}")
            questions = data.get("questions", []) if isinstance(data, dict) else data
            if not isinstance(questions, list):
                questions = []
            questions = [q for q in questions if isinstance(q, dict)]
            return questions, content
        except Exception as e:
            last_error = e
            if attempt < max_retries - 1:
                _backoff_for(e, attempt)
    raise last_error if last_error else RuntimeError("extract_questions_from_image failed")


def answer_question(
    question_text: str,
    options: Optional[dict] = None,
    base_url: str = "",
    api_key: str = "",
    model: str = "",
    system_prompt: str = "",
    user_prompt_template: str = "",
    question_type: str = "",
    max_retries: int = 3,
) -> tuple[dict, str]:
    options_desc = ""
    if options:
        lines = [f"{key}. {options.get(key)}" for key in sorted(options.keys())]
        options_desc = "\n选项：\n" + "\n".join(lines)

    q_type = question_type or "未知"
    template = user_prompt_template or DEFAULT_ANSWER_PROMPT_TEMPLATE
    instruction = (
        template.replace("{question_type}", q_type)
        .replace("{question_text}", question_text)
        .replace("{options_desc}", options_desc)
        .replace("{category_system}", _CATEGORY_SYSTEM_TEXT)
    )

    sys_msg = system_prompt or DEFAULT_ANSWER_SYSTEM_PROMPT
    client = build_client({"base_url": base_url, "api_key": api_key})

    last_error: Optional[Exception] = None
    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": sys_msg},
                    {"role": "user", "content": instruction},
                ],
            )
            content = response.choices[0].message.content or ""
            data = _extract_json_object(content)
            if not isinstance(data, dict):
                raise ValueError(f"无法解析为 JSON: {content[:200]}")
            data.setdefault("answer", "")
            data.setdefault("explanation", "")
            data.setdefault("category", "")
            data.setdefault("subcategory", "")
            data.setdefault("tags", [])
            if not isinstance(data["tags"], list):
                data["tags"] = []
            return data, content
        except Exception as e:
            last_error = e
            if attempt < max_retries - 1:
                _backoff_for(e, attempt)
    raise last_error if last_error else RuntimeError("answer_question failed")
