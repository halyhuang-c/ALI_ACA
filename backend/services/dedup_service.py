import hashlib
import re

from sqlalchemy.orm import Session

from models import Question
from services import pipeline_service
from services.pipeline_service import STEP_DEDUP

# 模糊匹配相似度阈值（0~1，越大越严格）
FUZZY_THRESHOLD = 0.85


def normalize_text(text: str) -> str:
    if not text:
        return ""
    cleaned = re.sub(r"[\s\W_]+", "", text, flags=re.UNICODE)
    return cleaned.lower()


def _edit_distance(s1: str, s2: str) -> int:
    """计算两个字符串的编辑距离（Levenshtein distance）"""
    if len(s1) < len(s2):
        return _edit_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)
    prev = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        curr = [i + 1]
        for j, c2 in enumerate(s2):
            curr.append(min(
                prev[j + 1] + 1,      # 删除
                curr[j] + 1,           # 插入
                prev[j] + (0 if c1 == c2 else 1),  # 替换
            ))
        prev = curr
    return prev[-1]


def similarity(s1: str, s2: str) -> float:
    """基于编辑距离的相似度，返回 0~1 之间的值"""
    if not s1 and not s2:
        return 1.0
    if not s1 or not s2:
        return 0.0
    dist = _edit_distance(s1, s2)
    max_len = max(len(s1), len(s2))
    return 1.0 - dist / max_len


def dedup_questions(db: Session, fuzzy_threshold: float = FUZZY_THRESHOLD) -> dict:
    questions = db.query(Question).order_by(Question.id.asc()).all()
    total = len(questions)
    pipeline_service.update_step(db, STEP_DEDUP, status="running", total=total, current=0)

    # 第一步：标准化 + MD5 精确匹配
    hash_groups: dict[str, list[Question]] = {}
    for q in questions:
        norm = normalize_text(q.question_text)
        q.norm_text = norm
        dedup_hash = hashlib.md5(norm.encode("utf-8")).hexdigest() if norm else ""
        q.dedup_hash = dedup_hash
        if dedup_hash:
            hash_groups.setdefault(dedup_hash, []).append(q)

    # 第二步：对 MD5 不同的组，用模糊匹配合并
    # 条件：题干相似度 >= 阈值 且 选项相似度 >= 阈值
    hash_keys = list(hash_groups.keys())
    merge_map: dict[str, str] = {}  # child_hash -> parent_hash

    for i in range(len(hash_keys)):
        hi = hash_keys[i]
        if hi in merge_map:
            continue
        rep_i = hash_groups[hi][0]
        norm_i = rep_i.norm_text
        opts_i = normalize_text(str(rep_i.options or ""))
        for j in range(i + 1, len(hash_keys)):
            hj = hash_keys[j]
            if hj in merge_map:
                continue
            rep_j = hash_groups[hj][0]
            norm_j = rep_j.norm_text
            q_sim = similarity(norm_i, norm_j)
            if q_sim < fuzzy_threshold:
                continue
            opts_j = normalize_text(str(rep_j.options or ""))
            o_sim = similarity(opts_i, opts_j)
            if o_sim < fuzzy_threshold:
                continue
            merge_map[hj] = hi

    # 执行合并：将被合并组的题目加入主组，并删除子组
    merged_child_hashes = set()
    for child_hash, parent_hash in merge_map.items():
        hash_groups[parent_hash].extend(hash_groups[child_hash])
        # 更新被合并组题目的 dedup_hash 指向主组
        for q in hash_groups[child_hash]:
            q.dedup_hash = parent_hash
        merged_child_hashes.add(child_hash)

    # 删除已合并的子组，避免重复处理
    for ch in merged_child_hashes:
        del hash_groups[ch]

    # 第三步：标记重复
    unique_count = 0
    duplicate_count = 0
    fuzzy_merge_count = len(merge_map)

    for hash_val, group in hash_groups.items():
        group.sort(key=lambda x: x.id)
        primary = group[0]
        primary.is_duplicate = False
        primary.duplicate_of_id = None
        unique_count += 1
        for dup in group[1:]:
            dup.is_duplicate = True
            dup.duplicate_of_id = primary.id
            duplicate_count += 1

    for q in questions:
        if not q.dedup_hash:
            q.is_duplicate = False
            q.duplicate_of_id = None
            unique_count += 1

    db.commit()

    pipeline_service.update_step(
        db, STEP_DEDUP, status="completed", total=total, current=total
    )
    return {
        "total": total,
        "unique": unique_count,
        "duplicates": duplicate_count,
        "fuzzy_merges": fuzzy_merge_count,
    }
