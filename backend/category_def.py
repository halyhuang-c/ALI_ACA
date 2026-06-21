CATEGORY_SYSTEM_TEXT = (
    "1. 基础理论类 (Basic Theory)：大模型定义与分类 / 训练三阶段(预训练/SFT/RLHF) / "
    "自回归生成原理 / 分词化与注意力机制 / MoE(混合专家模型) / 通义千问产品矩阵\n"
    "2. 提示词工程类 (Prompt Engineering)：提示词编写逻辑 / 零样本提示(Zero-shot) / "
    "少样本提示(Few-shot) / 基础参数配置(温度系数/采样阈值)\n"
    "3. 核心技术实操类 (Core Tech & RAG)：API调用自动化 / 插件能力扩展 / "
    "RAG(检索增强生成)全流程(文档解析/文本分块/向量化/检索/增强生成) / LoRA/QLoRA高效微调\n"
    "4. 智能体与前沿应用类 (Agent & Advanced)：Agent三大核心能力(感知/思考/行动) / "
    "工具调用(Tool Calling) / MCP(模型上下文协议) / Skill与自检闭环 / 规划方法(CoT/ToT/ReAct) / "
    "Multi-Agent(多智能体系统) / 安全合规与伦理边界"
)

CATEGORY_OPTIONS = ["基础理论类", "提示词工程类", "核心技术实操类", "智能体与前沿应用类", "其他"]

SUBCATEGORY_BY_CATEGORY = {
    "基础理论类": [
        "大模型定义与分类",
        "训练三阶段(预训练/SFT/RLHF)",
        "自回归生成原理",
        "分词化与注意力机制",
        "MoE(混合专家模型)",
        "通义千问产品矩阵",
    ],
    "提示词工程类": [
        "提示词编写逻辑",
        "零样本提示(Zero-shot)",
        "少样本提示(Few-shot)",
        "基础参数配置(温度系数/采样阈值)",
    ],
    "核心技术实操类": [
        "API调用自动化",
        "插件能力扩展",
        "RAG全流程",
        "LoRA/QLoRA高效微调",
    ],
    "智能体与前沿应用类": [
        "Agent三大核心能力",
        "工具调用(Tool Calling)",
        "MCP(模型上下文协议)",
        "Skill与自检闭环",
        "规划方法(CoT/ToT/ReAct)",
        "Multi-Agent(多智能体系统)",
        "安全合规与伦理边界",
    ],
    "其他": ["其他"],
}

SUBCATEGORY_ALL = sorted({s for lst in SUBCATEGORY_BY_CATEGORY.values() for s in lst})


def normalize_category(raw: str) -> str:
    s = (raw or "").strip()
    for opt in CATEGORY_OPTIONS:
        if s and opt in s:
            return opt
    return "其他"


def normalize_subcategory(raw: str, category: str) -> str:
    s = (raw or "").strip()
    subs = SUBCATEGORY_BY_CATEGORY.get(category, [])
    for sub in subs:
        key = sub.split("(")[0]
        if s and (sub in s or key in s):
            return sub
    return "其他" if category == "其他" else subs[0] if subs else "其他"
