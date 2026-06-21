import json
from typing import Any, Optional

from sqlalchemy.orm import Session

from models import Setting

DEFAULT_EXTRACT_PROMPT = (
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

DEFAULT_ANSWER_PROMPT = (
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

DEFAULT_SETTINGS = {
    "extract_config_id": None,
    "extract_model": "",
    "answer_config_id": None,
    "answer_model": "",
    "extract_prompt": DEFAULT_EXTRACT_PROMPT,
    "answer_system_prompt": DEFAULT_ANSWER_SYSTEM_PROMPT,
    "answer_prompt": DEFAULT_ANSWER_PROMPT,
    "extract_concurrency": 3,
    "answer_concurrency": 3,
}


def get_setting(db: Session, key: str, default: Any = None) -> Any:
    row = db.query(Setting).filter(Setting.key == key).first()
    if row is None:
        return default
    try:
        return json.loads(row.value)
    except (json.JSONDecodeError, TypeError):
        return default


def set_setting(db: Session, key: str, value: Any) -> None:
    payload = json.dumps(value, ensure_ascii=False)
    row = db.query(Setting).filter(Setting.key == key).first()
    if row is None:
        db.add(Setting(key=key, value=payload))
    else:
        row.value = payload
    db.commit()


def get_all_settings(db: Session) -> dict:
    result = dict(DEFAULT_SETTINGS)
    for row in db.query(Setting).all():
        try:
            result[row.key] = json.loads(row.value)
        except (json.JSONDecodeError, TypeError):
            continue
    return result


def update_settings(db: Session, payload: Optional[dict]) -> dict:
    if not payload:
        return get_all_settings(db)
    for key, value in payload.items():
        if key in DEFAULT_SETTINGS:
            if key in ("extract_concurrency", "answer_concurrency"):
                try:
                    value = max(1, min(20, int(value)))
                except (TypeError, ValueError):
                    value = 3
            set_setting(db, key, value)
    return get_all_settings(db)
