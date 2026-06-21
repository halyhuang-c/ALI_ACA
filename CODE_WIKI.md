# ALI_ACA 项目 Code Wiki

> 本文档为 **ALI_ACA（题目识别与答题系统）** 的结构化代码知识库，涵盖项目整体架构、主要模块职责、关键类与函数说明、依赖关系以及项目运行方式。

---

## 目录

1. [项目概述](#1-项目概述)
2. [整体架构](#2-整体架构)
3. [技术栈与依赖](#3-技术栈与依赖)
4. [目录结构](#4-目录结构)
5. [后端模块详解](#5-后端模块详解)
6. [前端模块详解](#6-前端模块详解)
7. [数据库设计](#7-数据库设计)
8. [核心业务流程（处理流水线）](#8-核心业务流程处理流水线)
9. [API 接口说明](#9-api-接口说明)
10. [关键设计说明](#10-关键设计说明)
11. [项目运行方式](#11-项目运行方式)

---

## 1. 项目概述

### 1.1 项目定位

ALI_ACA 是一个 **AI 驱动的认证考试题库管理系统**。它将"纸质/截图题库"转化为"结构化、可检索、可练习、可导出"的数字题库，并提供 AI 答题解析、智能去重、模拟考试、错题本等完整能力。

### 1.2 核心能力一句话概括

> **拍图 → AI 识别题目 → 自动去重 → AI 答题解析 → 模拟考试 + 错题本**

### 1.3 解决的问题

- 纸质/截图形式的题库难以检索、复习与统计
- 重复题目反复出现，浪费练习时间
- 缺少标准答案解析与知识分类
- 无法量化掌握程度（覆盖率、错题率）

---

## 2. 整体架构

### 2.1 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        浏览器（用户）                              │
└────────────────────────────┬────────────────────────────────────┘
                             │  HTTP / SSE
┌────────────────────────────▼────────────────────────────────────┐
│                    前端 (React + Vite + Ant Design)               │
│   PipelinePage / ResultsPage / ExamPage / WrongQuestionPage ...  │
└────────────────────────────┬────────────────────────────────────┘
                             │  REST API + Server-Sent Events
┌────────────────────────────▼────────────────────────────────────┐
│                 后端 (FastAPI + SQLAlchemy)                       │
│  ┌──────────┐  ┌────────────┐  ┌───────────┐  ┌──────────────┐   │
│  │ Routers  │→ │  Services  │→ │ LLM Client│→ │  外部大模型   │   │
│  │ (API层)  │  │ (业务逻辑) │  │ (线程池)   │  │ (智谱GLM等)  │   │
│  └──────────┘  └────────────┘  └───────────┘  └──────────────┘   │
│                       │                                           │
│                       ▼                                           │
│              ┌────────────────────┐                               │
│              │   SQLite 数据库     │                               │
│              │  (SQLAlchemy ORM)  │                               │
│              └────────────────────┘                               │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 架构特点

| 特点 | 说明 |
|------|------|
| **前后端分离** | 前端 Vite 开发服务器通过代理访问后端 API；生产环境可由后端托管 `frontend/dist` |
| **四步流水线** | scan（扫描）→ extract（识别）→ dedup（去重）→ answer（答题）四阶段顺序处理 |
| **异步 + 后台线程** | 流水线在独立守护线程中运行，通过 SSE 实时推送进度到前端 |
| **并发 LLM 调用** | 基于 `ThreadPoolExecutor` 的线程池，并发度可配置（1~20） |
| **多模型配置** | 支持配置多套 LLM（base_url + api_key + models），识别与答题可使用不同模型 |
| **熔断保护** | 连续失败计数器（`ConsecutiveFailureTracker`），连续相同错误达到阈值自动暂停 |

---

## 3. 技术栈与依赖

### 3.1 后端依赖（[backend/requirements.txt](backend/requirements.txt)）

| 依赖 | 版本 | 用途 |
|------|------|------|
| `fastapi` | 0.115.0 | Web 框架，提供 API 路由与自动文档 |
| `uvicorn[standard]` | 0.30.6 | ASGI 服务器 |
| `sqlalchemy` | 2.0.35 | ORM 框架 |
| `zhipuai` | >=2.1.5,<3 | 智谱 AI SDK（备用） |
| `openai` | >=1.40.0,<2 | 通过 OpenAI 兼容接口调用大模型（主用） |
| `Pillow` | 10.4.0 | 图像处理 |
| `httpx` | 0.27.2 | HTTP 客户端 |
| `python-dotenv` | 1.0.1 | 环境变量加载 |
| `pydantic` | 2.9.2 | 数据校验与序列化 |
| `sse-starlette` | 2.1.3 | Server-Sent Events 支持 |
| `python-docx` | （运行时引入） | 题目导出为 Word 文档 |

### 3.2 前端依赖（[frontend/package.json](frontend/package.json)）

| 依赖 | 版本 | 用途 |
|------|------|------|
| `react` / `react-dom` | ^19.2.6 | UI 框架 |
| `antd` | ^6.4.4 | UI 组件库 |
| `@ant-design/icons` | ^6.2.5 | 图标库 |
| `axios` | ^1.17.0 | HTTP 请求 |
| `react-router-dom` | ^7.17.0 | 路由 |
| `vite` | ^8.0.12 | 构建工具 |
| `@vitejs/plugin-react` | ^6.0.1 | React 插件 |
| `eslint` | ^10.3.0 | 代码检查 |

---

## 4. 目录结构

```
ALI_ACA/
├── backend/                      # 后端服务（FastAPI）
│   ├── main.py                   # 应用入口，路由注册与中间件
│   ├── config.py                 # 配置加载（环境变量、路径、模型名）
│   ├── database.py               # 数据库引擎、会话、轻量迁移、初始化
│   ├── models.py                 # SQLAlchemy 数据模型定义
│   ├── schemas.py                # Pydantic 响应模型（DTO）
│   ├── llm_client.py             # 大模型调用封装（识别 + 答题）
│   ├── category_def.py           # 题目知识分类体系定义
│   ├── setting_service.py        # 系统设置（KV 存储）服务
│   ├── log_store.py              # 流水线日志存储（内存 + 文件）
│   ├── requirements.txt          # Python 依赖
│   ├── .env / .env.example       # 环境变量配置
│   ├── routers/                  # API 路由层
│   │   ├── pipeline.py           # 流水线控制（启动/暂停/状态/SSE）
│   │   ├── scan.py               # 图片扫描与上传
│   │   ├── questions.py          # 题目查询/搜索/重答/审核/导出/去重详情
│   │   ├── exam.py               # 模拟考试（生成/提交/历史/覆盖率）
│   │   ├── llm.py                # LLM 配置与系统设置管理
│   │   ├── tags.py               # 标签查询
│   │   └── raw_responses.py      # AI题目解析（图片识别/答题原文）
│   ├── services/                 # 业务逻辑层
│   │   ├── pipeline_service.py   # 流水线编排与状态管理
│   │   ├── scan_service.py       # 图片扫描入库
│   │   ├── extract_service.py    # 题目识别（多图并发）
│   │   ├── dedup_service.py      # 题目去重（MD5 + 模糊匹配）
│   │   └── answer_service.py     # AI 答题解析（多题并发）
│   └── logs/                     # 运行日志（answer.log 等）
│
├── frontend/                     # 前端应用（React + Vite）
│   ├── index.html
│   ├── vite.config.js            # Vite 配置（含 /api 代理到 8000）
│   ├── package.json
│   └── src/
│       ├── main.jsx              # React 入口
│       ├── App.jsx               # 应用骨架（侧边栏 + 路由）
│       ├── api/index.js          # API 请求封装（axios）
│       ├── components/
│       │   └── QuestionCard.jsx  # 题目卡片组件（答题/重答/审核）
│       └── pages/                # 业务页面
│           ├── PipelinePage.jsx          # 处理流程（流水线总控）
│           ├── ModelConfigPage.jsx       # 模型配置
│           ├── DedupPage.jsx             # 去重详情
│           ├── RawResponsesPage.jsx      # AI题目解析
│           ├── TagsPage.jsx              # 标签总览
│           ├── ResultsPage.jsx           # 结果浏览
│           ├── ExportPage.jsx            # 导出文档
│           ├── ExamPage.jsx              # 模拟考试
│           ├── ExamHistoryPage.jsx       # 考试历史
│           ├── WrongQuestionPage.jsx     # 错题本
│           └── CoverageAnalysisPage.jsx  # 覆盖率分析
│
├── image/                        # 题目图片素材库（扫描源）
├── data/ali_aca.db               # SQLite 数据库文件
└── start.bat                     # Windows 一键启动脚本
```

---

## 5. 后端模块详解

### 5.1 应用入口 — [backend/main.py](backend/main.py)

FastAPI 应用实例创建、CORS 中间件、路由注册。

| 要素 | 说明 |
|------|------|
| `app` | FastAPI 实例，`title="ALI_ACA API"`，`version="1.0.0"` |
| `lifespan` | 生命周期钩子，启动时调用 `init_db()` 初始化数据库 |
| `CORSMiddleware` | 允许所有跨域（开发友好） |
| `api_prefix` | 统一 API 前缀 `/api` |
| 路由注册 | pipeline、questions、tags、llm、raw_responses、scan、exam |
| `/api/health` | 健康检查端点 |

### 5.2 配置模块 — [backend/config.py](backend/config.py)

从 `.env` 加载配置，解析路径。

| 配置项 | 环境变量 | 默认值 | 说明 |
|--------|----------|--------|------|
| `ZHIPUAI_API_KEY` | `ZHIPUAI_API_KEY` | `""` | 智谱 AI 密钥（用于默认种子配置） |
| `IMAGE_DIR` | `IMAGE_DIR` | `../image` | 题目图片目录 |
| `DB_PATH` | `DB_PATH` | `../data/ali_aca.db` | SQLite 数据库路径 |
| `GLM_VISION_MODEL` | `GLM_VISION_MODEL` | `glm-4v-plus` | 视觉识别模型 |
| `GLM_TEXT_MODEL` | `GLM_TEXT_MODEL` | `glm-4-plus` | 文本答题模型 |
| `MAX_CONCURRENCY` | `MAX_CONCURRENCY` | `3` | 默认并发数 |

- `_resolve_path(value, default)`：将相对路径解析为基于 `BACKEND_DIR` 的绝对路径。

### 5.3 数据库模块 — [backend/database.py](backend/database.py)

| 函数 | 职责 |
|------|------|
| `engine` | SQLAlchemy 引擎（SQLite，`check_same_thread=False`） |
| `SessionLocal` | 会话工厂 |
| `Base` | 声明式基类 |
| `_run_lightweight_migrations(conn)` | 轻量迁移：为旧表补充新增列（`raw_extract_response`、`extract_model`、`is_correct` 等） |
| `_seed_default_llm_config()` | 首次启动时种子化默认 LLM 配置（智谱 GLM） |
| `init_db()` | 建表 + 迁移 + 重置中断步骤 + 种子配置（lifespan 调用） |
| `_reset_running_steps_on_startup()` | 启动时把 `running` 状态的流水线步骤改为 `paused`（防止崩溃残留） |
| `get_db()` | FastAPI 依赖注入：提供数据库会话并自动关闭 |

### 5.4 数据模型 — [backend/models.py](backend/models.py)

核心 ORM 模型及其关系：

| 模型 | 表名 | 职责 | 关键关系 |
|------|------|------|----------|
| `Image` | `images` | 题目图片（文件名、路径、状态、原始识别响应） | → `Question`（一对多） |
| `Question` | `questions` | 题目（题干、选项、题型、标准答案、分类、去重哈希） | → `Image`、`Answer`、自引用 `duplicate_of`、`QuestionTag` |
| `Answer` | `answers` | AI 答案（答案、解析、标签、原始响应、模型、是否正确、审核状态） | → `Question`（一对一） |
| `Tag` | `tags` | 知识标签（名称、引用计数） | → `QuestionTag` |
| `QuestionTag` | `question_tags` | 题目-标签多对多关联 | → `Question`、`Tag` |
| `PipelineStep` | `pipeline_steps` | 流水线步骤状态（名称、状态、total/current、时间） | — |
| `LLMConfig` | `llm_configs` | 大模型配置（名称、base_url、api_key、models） | — |
| `Setting` | `settings` | 系统设置（KV 存储，JSON value） | — |
| `QuestionStat` | `question_stats` | 题目统计（被抽中次数、错答次数） | → `Question` |
| `ExamRecord` | `exam_records` | 考试记录（成绩、用时、题目列表、作答） | — |
| `WrongQuestion` | `wrong_questions` | 错题本（用户答案、正确答案、是否复习） | → `Question` |

**关键状态字段：**
- `Image.status`：`pending` / `processed` / `failed`
- `PipelineStep.status`：`pending` / `running` / `completed` / `failed` / `paused` / `partial_failed`
- `Answer.review_status`：`None` / `approved` / `rejected` / `pending`

### 5.5 数据传输对象 — [backend/schemas.py](backend/schemas.py)

Pydantic 响应模型（`ConfigDict(from_attributes=True)` 支持从 ORM 直接转换）：

- `ImageOut`、`AnswerOut`、`QuestionOut`（含答案聚合字段）、`TagOut`
- `PipelineStepOut`、`PipelineOverallOut`、`PipelineStatusOut`（流水线状态）
- `QuestionSearchResult`、`TagSearchResult`（分页结果）

### 5.6 大模型客户端 — [backend/llm_client.py](backend/llm_client.py)

封装与外部大模型（OpenAI 兼容接口）的交互。

| 函数 | 职责 |
|------|------|
| `build_client(config)` | 构造 `openai.OpenAI` 客户端（超时 1200s） |
| `image_to_base64(path)` | 图片转 base64 data URL（自动识别 MIME） |
| `extract_questions_from_image(...)` | **视觉模型识别题目**：发送图片 + 指令，返回 `(题目列表, 原始内容)`，含 3 次重试与 429 退避 |
| `answer_question(...)` | **文本模型答题**：发送题干 + 答题模板，返回 `(答案字典, 原始内容)`，含 3 次重试 |
| `get_executor_for(stage)` | 获取/创建指定阶段（extract/answer）的线程池，并发度从设置读取（1~20） |
| `_extract_json_object` / `_extract_json_list` | 容错 JSON 解析（去代码围栏 + 正则提取） |
| `_backoff_for(err, attempt)` | 退避策略：429 等待 `30*(n+1)` 秒，其它错误指数退避 |

**默认提示词（内置在文件中）：**
- `DEFAULT_EXTRACT_INSTRUCTION`：题目识别指令（要求严格 JSON，支持单选/多选，A~F 选项）
- `DEFAULT_ANSWER_PROMPT_TEMPLATE`：答题模板（答案 + 解析 + 分类 + 标签）

### 5.7 服务层（业务逻辑）— [backend/services/](backend/services)

#### 5.7.1 流水线编排 — [pipeline_service.py](backend/services/pipeline_service.py)

| 名称 | 职责 |
|------|------|
| `STEP_ORDER` | 步骤顺序：`scan → extract → dedup → answer` |
| `run_pipeline(db)` | **核心编排**：按顺序执行四步，支持暂停检查、断点续跑、部分失败处理 |
| `update_step(...)` | 更新步骤状态（自动记录 started_at/finished_at） |
| `get_status(db)` | 计算整体状态与进度百分比 |
| `is_running` / `is_paused_or_running` | 运行状态判断 |
| `request_pause` / `clear_pause` / `is_paused` | 基于 `threading.Event` 的暂停控制 |
| `ConsecutiveFailureTracker` | **熔断器**：连续相同错误达到阈值（默认 5）触发自动暂停 |
| `normalize_error_reason` | 错误归一化（rate_limit / timeout / network / auth_error 等） |

#### 5.7.2 图片扫描 — [scan_service.py](backend/services/scan_service.py)

- `scan_images(db)`：扫描 `IMAGE_DIR` 下支持的图片格式（`.png/.jpg/.jpeg/.webp/.bmp/.gif`），未入库的新图写入 `images` 表（状态 `pending`）。

#### 5.7.3 题目识别 — [extract_service.py](backend/services/extract_service.py)

- `extract_all(db)`：对所有 `pending` 图片并发调用视觉模型识别题目，写入 `Question` 记录，图片状态置为 `processed`/`failed`。包含进度更新、日志记录、熔断保护、部分失败（`partial_failed`）处理。

#### 5.7.4 题目去重 — [dedup_service.py](backend/services/dedup_service.py)

- `normalize_text(text)`：去除空白与标点并小写化。
- `similarity(s1, s2)`：基于 Levenshtein 编辑距离的相似度（0~1）。
- `dedup_questions(db, fuzzy_threshold=0.85)`：**两阶段去重**——①MD5 精确匹配；②对 MD5 不同的组用模糊匹配（题干相似度 ≥ 阈值 且 选项相似度 ≥ 阈值）合并；③标记 `is_duplicate` 与 `duplicate_of_id`。

#### 5.7.5 答题解析 — [answer_service.py](backend/services/answer_service.py)

- `_normalize_answer(raw)` / `_compare_answer(ai, correct)`：答案归一化与正确性比对。
- `_ensure_tag_link(db, question_id, raw_name)`：创建标签并建立题目-标签关联，维护 `ref_count`。
- `answer_all(db)`：对所有无答案题目并发调用答题模型；**重复题自动复用主题答案**；写入 `Answer`、`Tag`、`QuestionTag`，并设置 `category`/`subcategory`。

### 5.8 分类体系 — [backend/category_def.py](backend/category_def.py)

定义 AI 答题所使用的知识分类体系（面向大模型/AIGC 认证）：

- **基础理论类**（大模型定义、训练三阶段、注意力机制、MoE…）
- **提示词工程类**（Zero-shot、Few-shot、温度参数…）
- **核心技术实操类**（API 调用、RAG 全流程、LoRA/QLoRA…）
- **智能体与前沿应用类**（Agent、Tool Calling、MCP、CoT/ToT/ReAct、Multi-Agent…）
- **其他**

- `normalize_category(raw)` / `normalize_subcategory(raw, category)`：将模型返回的分类映射到标准分类。

### 5.9 设置与日志

- [setting_service.py](backend/setting_service.py)：KV 设置存储（`Setting` 表，JSON value），含默认提示词、模型配置 ID、并发度等。
- [log_store.py](backend/log_store.py)：线程安全的日志存储（内存 + 文件持久化），每个步骤独立文件，最大 20 万行。

### 5.10 路由层（API）— [backend/routers/](backend/routers)

详见 [第 9 节 API 接口说明](#9-api-接口说明)。

---

## 6. 前端模块详解

### 6.1 应用骨架 — [frontend/src/App.jsx](frontend/src/App.jsx)

- 使用 `ConfigProvider`（中文 zhCN，主色 `#1677ff`）+ `BrowserRouter`。
- `AppShell`：`Layout`（Header + Sider + Content），左侧 `Menu` 导航，`collapsed` 折叠态。
- `selectKey(pathname)`：根据当前路径高亮菜单（按 key 长度降序匹配前缀）。
- 路由：见下表。

| 路径 | 页面组件 | 功能 |
|------|----------|------|
| `/` | `PipelinePage` | 处理流程（流水线总控） |
| `/settings` | `ModelConfigPage` | 模型配置 |
| `/dedup` | `DedupPage` | 去重详情 |
| `/raw-responses` | `RawResponsesPage` | AI题目解析 |
| `/tags` | `TagsPage` | 标签总览 |
| `/results` | `ResultsPage` | 结果浏览 |
| `/export` | `ExportPage` | 导出文档 |
| `/exam` | `ExamPage` | 模拟考试 |
| `/exam/history` | `ExamHistoryPage` | 考试历史 |
| `/exam/coverage` | `CoverageAnalysisPage` | 覆盖率分析 |
| `/wrong-questions` | `WrongQuestionPage` | 错题本 |

### 6.2 API 层 — [frontend/src/api/index.js](frontend/src/api/index.js)

基于 `axios` 的请求封装，`baseURL` 为空（依赖 Vite 代理或同源），响应拦截器直接返回 `response.data`。导出的函数与后端接口一一对应：

- 流水线：`startPipeline` / `pausePipeline` / `resumePipeline` / `resetFailedPipeline` / `continuePipeline` / `resetPipelineSteps` / `getPipelineStatus` / `getPipelineLogs`
- 图片：`uploadImages`
- 题目：`getQuestions` / `searchQuestions` / `reAnswerQuestion` / `batchReanswer` / `reviewAnswer` / `deleteHistoryItem` / `clearHistory` / `getCategories` / `getDedupDetail` / `getQuestionsByIds`
- 模型与设置：`getLLMConfigs` / `createLLMConfig` / `updateLLMConfig` / `deleteLLMConfig` / `testLLMConfig` / `getSettings` / `updateSettings`
- AI题目解析：`getImageResponses` / `getImageResponseDetail`
- 标签：`getTags`
- 考试：`generateExam` / `submitExam` / `getExamHistory` / `getExamConfig` / `updateExamConfig` / `getCoverageAnalysis`
- 错题本：`getWrongQuestions` / `reviewWrongQuestion` / `deleteWrongQuestion` / `getWrongQuestionStats`

### 6.3 Vite 配置 — [frontend/vite.config.js](frontend/vite.config.js)

开发服务器将 `/api` 代理到 `http://localhost:8000`（后端）。

### 6.4 关键组件 — [QuestionCard.jsx](frontend/src/components/QuestionCard.jsx)

题目卡片：展示题干、选项、标准答案、AI 答案、解析、标签、审核状态；支持「重答」「编辑审核」「采纳历史版本」等交互。内含答案归一化与集合比对的纯函数（`normalizeAnswer` / `sameSet`）。

---

## 7. 数据库设计

### 7.1 ER 关系概览

```
images 1───* questions *───1 answers
                │
                ├──* question_tags *───1 tags
                │
                └──（自引用）duplicate_of_id

question_stats 1───1 questions
exam_records ──（question_ids JSON）── questions
wrong_questions *───1 questions
pipeline_steps / llm_configs / settings（独立配置表）
```

### 7.2 索引与约束

- `questions.dedup_hash`：带索引，加速去重分组。
- `question_tags`：`(question_id, tag_id)` 唯一约束 + `question_id` 索引。
- `images.filename`：唯一约束。
- `answers.question_id`：唯一约束（一对一）。

---

## 8. 核心业务流程（处理流水线）

### 8.1 流水线状态机

```
        ┌────────── start/resume ──────────┐
        ▼                                   │
     pending ──► running ──► completed      │
        │           │           ▲           │
        │           ├──► paused ─┘ (resume) │
        │           │                       │
        │           ├──► partial_failed ────┤ (continue/reset-failed)
        │           │                       │
        │           └──► failed             │
        └───────────────────────────────────┘
```

### 8.2 四阶段处理

1. **scan（扫描）**：`scan_service.scan_images` — 把 `image/` 下新图片登记入库。
2. **extract（识别）**：`extract_service.extract_all` — 并发调用视觉模型，从图片提取题目结构化数据。
3. **dedup（去重）**：`dedup_service.dedup_questions` — MD5 精确 + 模糊匹配去重。
4. **answer（答题）**：`answer_service.answer_all` — 并发调用文本模型答题；重复题复用主题答案。

### 8.3 进度推送

- 前端轮询 `GET /api/pipeline/status`，或订阅 `GET /api/pipeline/stream`（SSE）。
- SSE 每秒推送状态，状态变化时发送 `status` 事件，终态时发送 `done` 事件。

### 8.4 错误处理与熔断

- 单题/单图失败不中断整体，记录 `failed` 状态。
- 连续相同错误（`ConsecutiveFailureTracker`，阈值 5）→ 自动 `request_pause()` 暂停。
- 部分失败（`partial_failed`）→ 前端可选「重试失败项」或「忽略并继续」。

---

## 9. API 接口说明

> 所有接口前缀 `/api`，响应默认 JSON。下表列出主要端点。

### 9.1 流水线（[routers/pipeline.py](backend/routers/pipeline.py)）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/pipeline/start` | 启动流水线（后台线程） |
| POST | `/api/pipeline/pause` | 请求暂停（当前任务完成后停止） |
| POST | `/api/pipeline/resume` | 恢复运行 |
| GET | `/api/pipeline/status` | 获取当前状态（steps + overall + progress） |
| GET | `/api/pipeline/stream` | SSE 实时推送状态 |
| GET | `/api/pipeline/logs?step=` | 获取某步骤日志 |
| POST | `/api/scan` | 仅扫描图片 |
| POST | `/api/pipeline/reset-failed` | 重置失败图片/答题 |
| POST | `/api/pipeline/continue` | 忽略失败项继续后续流程 |
| POST | `/api/pipeline/reset-steps` | 重置（scope: steps/images/full） |

### 9.2 图片上传与AI题目解析（[routers/scan.py](backend/routers/scan.py)、[routers/raw_responses.py](backend/routers/raw_responses.py)）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/scan/upload` | 上传图片（≤25MB/张，≤50张/次） |
| GET | `/api/images/responses` | 图片识别响应列表（分页/筛选） |
| GET | `/api/images/{id}/response` | 单图片识别与答题详情 |
| GET | `/api/images/{id}/file` | 获取图片文件（含路径越权防护） |

### 9.3 题目与答题（[routers/questions.py](backend/routers/questions.py)）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/questions` | 题目列表（分页 + tag/category 筛选） |
| GET | `/api/questions/search` | 题目搜索（关键字/标签/分类/仅错题/题型） |
| GET | `/api/questions/by-ids` | 按 ID 批量查询 |
| GET | `/api/questions/categories` | 分类树统计 |
| GET | `/api/questions/dedup` | 去重分组详情 |
| GET | `/api/questions/export-word` | 导出为 Word 文档（StreamingResponse） |
| POST | `/api/questions/{id}/reanswer` | 重新答题（记录历史版本） |
| POST | `/api/questions/batch-reanswer` | 批量重答 |
| PUT | `/api/answers/{id}/review` | 答案审核（采纳/驳回/采纳历史版本/手动编辑） |
| DELETE | `/api/answers/{id}/history/{index}` | 删除某历史版本 |
| DELETE | `/api/answers/{id}/history` | 清空历史版本 |

### 9.4 模拟考试与错题本（[routers/exam.py](backend/routers/exam.py)）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/exam/config` | 获取抽题配置（`pick_decay`） |
| PUT | `/api/exam/config` | 更新抽题配置 |
| GET | `/api/exam/generate` | 生成一套卷（35 单选 + 15 多选，加权随机） |
| POST | `/api/exam/{id}/submit` | 提交考试（打分 + 错题入库） |
| GET | `/api/exam/history` | 考试历史（含全局统计） |
| GET | `/api/exam/coverage` | 覆盖率分析（已出现/未出现） |
| GET | `/api/wrong-questions` | 错题本列表（去重 + 错次筛选） |
| PUT | `/api/wrong-questions/{id}/review` | 标记复习 |
| DELETE | `/api/wrong-questions/{id}` | 删除错题 |
| GET | `/api/wrong-questions/stats` | 错题统计 |

### 9.5 标签、模型配置与设置（[routers/tags.py](backend/routers/tags.py)、[routers/llm.py](backend/routers/llm.py)）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tags` | 标签列表（按引用数排序） |
| GET/POST | `/api/llm/configs` | 模型配置列表 / 新增 |
| PUT/DELETE | `/api/llm/configs/{id}` | 修改 / 删除 |
| POST | `/api/llm/configs/{id}/test` | 测试连通性 |
| GET/PUT | `/api/settings` | 系统设置读取 / 更新 |

---

## 10. 关键设计说明

### 10.1 加权随机抽题（模拟考试）

在 [routers/exam.py](backend/routers/exam.py) 的 `generate_exam` 中实现：

- 每道题权重 = `pick_decay ^ pick_count`（默认 `pick_decay=0.2`）。
- 从未被抽中（`pick_count=0`）权重为 1.0；抽中次数越多权重指数级下降。
- 效果：多次模拟中尽量让所有题目都有机会出现，避免高频重复。
- `pick_decay` 可在前端调节，范围 `0.05 ~ 0.5`。

### 10.2 题目去重两阶段策略

1. **精确去重**：题干标准化（去标点空白小写）后 MD5 哈希，相同哈希即重复。
2. **模糊去重**：对 MD5 不同但题干/选项编辑距离相似度 ≥ 0.85 的组合并。
- 去重后，`is_duplicate=True` 的题在答题阶段复用主题答案，节省 LLM 调用。

### 10.3 答案正确性比对

`_compare_answer(ai, correct)`（见 [questions.py](backend/routers/questions.py#L487) 与 [answer_service.py](backend/services/answer_service.py#L27)）：
- 归一化：去空格/逗号/括号，大写。
- 比对：先严格相等，否则按字符集合相等（多选题顺序无关）。
- 无标准答案返回 `None`（不参与判定）。

### 10.4 答题历史与审核工作流

- 每次重答把旧答案快照存入 `Answer.raw_response.history`。
- 审核（`/api/answers/{id}/review`）支持：采纳最新重解、驳回、采纳任意历史版本、手动编辑。
- 采纳/驳回后同步清理 history，避免数据膨胀。

### 10.5 错题本"再次答错重置复习"

- 提交考试时，若某错题此前已标记 `reviewed=True`，会重置为 `False`，提示需要重新复习。

---

## 11. 项目运行方式

### 11.1 环境准备

- **Python**：3.12+（项目内置 `.venv`）
- **Node.js**：建议 18+（前端构建）
- **操作系统**：Windows（提供 `start.bat`），亦可在 Linux/macOS 手动启动

### 11.2 配置

复制 [backend/.env.example](backend/.env.example) 为 `backend/.env`，填入：

```env
ZHIPUAI_API_KEY=你的密钥
IMAGE_DIR=../image
DB_PATH=../data/ali_aca.db
GLM_VISION_MODEL=glm-4v-plus
GLM_TEXT_MODEL=glm-4-plus
MAX_CONCURRENCY=3
```

> 密钥也可在前端「模型配置」页面在线配置（存入 `llm_configs` 表）。

### 11.3 一键启动（Windows）

双击 [start.bat](start.bat)，脚本将：
1. 检查后端虚拟环境与前端依赖；
2. 启动后端 `uvicorn main:app --reload --port 8000`；
3. 启动前端 `npm run dev`（Vite，端口 5173）；
4. 5 秒后自动打开浏览器。

### 11.4 手动启动

**后端：**

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Linux/macOS
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**前端：**

```bash
cd frontend
npm install
npm run dev        # 开发模式，访问 http://localhost:5173
# npm run build    # 生产构建，输出到 dist/
```

### 11.5 访问入口

| 入口 | 地址 |
|------|------|
| 前端 UI | http://localhost:5173 |
| 后端 API 文档（Swagger） | http://localhost:8000/docs |
| 健康检查 | http://localhost:8000/api/health |

### 11.6 典型使用流程

1. 进入「模型配置」配置 LLM（识别模型 + 答题模型 + 并发度 + 提示词）。
2. 在「处理流程」上传题目图片（或预先放入 `image/` 目录）。
3. 点击「开始处理」，观察 scan → extract → dedup → answer 四阶段进度与日志。
4. 在「结果浏览」查看题目、AI 答案、解析；对错题可重答或审核。
5. 在「模拟考试」生成试卷练习，错题自动进入「错题本」。
6. 在「覆盖率分析」查看题目被抽中分布，调节 `pick_decay` 优化抽题均衡度。
7. 在「导出文档」按筛选条件导出 Word 题库。

---

## 附录：模块依赖速查

```
main.py
 ├── config.py            (配置)
 ├── database.py          (引擎/会话/迁移)
 │     └── models.py      (ORM 模型)
 ├── routers/*
 │     ├── services/*     (业务逻辑)
 │     │     ├── llm_client.py   (大模型调用)
 │     │     ├── category_def.py (分类体系)
 │     │     ├── setting_service.py
 │     │     ├── log_store.py
 │     │     └── pipeline_service.py (编排)
 │     └── schemas.py     (DTO)

frontend/src
 ├── main.jsx → App.jsx → pages/*
 └── api/index.js (axios 封装，对接 backend routers)
```

---

*本文档基于代码库当前状态自动分析生成，如代码演进请同步更新。*
