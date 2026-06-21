import llm_client
from services import dedup_service
import hashlib

s1 = '```json\n{"questions":[{"question_text":"a","options":{"A":"x"},"question_type":"single"}]}\n```'
d = llm_client._extract_json_object(s1)
print("JSON_FENCE_PARSE_OK:", type(d).__name__, d.get("questions")[0]["question_type"] if d else None)

s2 = '以下是结果：{"answer":"A","explanation":"因为...","tags":["数学","选择题"]} 完毕'
d2 = llm_client._extract_json_object(s2)
print("JSON_IN_TEXT_OK:", d2.get("answer"), d2.get("tags"))

L = llm_client._extract_json_list('[{"a":1},{"b":2}]')
print("LIST_PARSE_OK:", len(L))

n1 = dedup_service.normalize_text(" Hello, World! ")
n2 = dedup_service.normalize_text("hello world")
print("NORM_EN_OK:", repr(n1), "==", repr(n2), "->", n1 == n2)

nc1 = dedup_service.normalize_text("下列 哪项，是正确的？")
nc2 = dedup_service.normalize_text("下列哪项是正确的")
print("NORM_CN_OK:", repr(nc1), "==", repr(nc2), "->", nc1 == nc2)
print("HASH_OK:", hashlib.md5(n1.encode("utf-8")).hexdigest()[:8])
