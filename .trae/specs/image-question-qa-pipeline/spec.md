# 图片题目识别与 AI 答题系统 Spec

## Why
工作区 `DMX_ACA\image` 中存在约 800+ 张题目截图（PNG），需要自动化地：识别图片中的题目及选项、入库去重，再让大模型逐题作答并给出选择理由。整个流程需要一个可视化的前端界面，把多阶段处理过程以"步骤"形式实时展示，便于用户掌握进度与查看结果。

## What Changes
- 新建后端服务（Python + FastAPI），封装图片扫描、GLM 视觉识别、去重、AI 答题四大能力。
- 新建 SQLite 数据库，存储原始图片记录、识别题目、去重关系、AI 答案与解析。
- 集成智谱 GLM 视觉模型（GLM-4V / GLM-4V-Plus）完成图片识别与答题。
- 实现"标准化文本 + Hash"的题目去重逻辑，剔除重复题目。
- 新建前端界面（React + Vite），以"步骤条 + 实时进度"形式展示整个处理流程。
- 通过 SSE（Server-Sent Events）或轮询把每个步骤的进度与状态推送到前端。

## Impact
- 受影响代码：全新项目，无既有代码冲突。
- 新增目录结构：`backend/`（FastAPI 服务、模型集成、数据库）、`frontend/`（React 应用）、`data/`（SQLite 数据库文件与日志）。
- 依赖：`fastapi`、`uvicorn`、`sqlalchemy`、`zhipuai`（智谱 SDK）、`pillow`、`httpx`；前端 `react`、`vite`、`antd`（或等价 UI 库）。
- 外部依赖：需配置智谱 API Key（环境变量 `ZHIPUAI_API_KEY`）。

## ADDED Requirements

### Requirement: 图片扫描入库
系统 SHALL 扫描 `DMX_ACA\image` 目录下所有 PNG 图片，为每张图片创建数据库记录，初始状态为 `pending`。

#### Scenario: 扫描图片
- **WHEN** 用户在前端点击"开始处理"或调用 `/api/scan` 接口
- **THEN** 系统遍历 `image` 目录所有 PNG，写入 `images` 表（filename、path、status=pending）
- **AND** 已存在（按 filename 唯一）的图片跳过，避免重复入库

### Requirement: GLM 视觉识别题目
系统 SHALL 逐张将图片以 Base64 形式推送给 GLM 视觉模型，按结构化 JSON 解析出题目文本、选项（A/B/C/D...）、题型（单选/多选/判断等）。

#### Scenario: 识别成功
- **WHEN** 某张图片被发送给 GLM-4V
- **THEN** 模型返回结构化题目数据，系统解析后写入 `questions` 表，关联 image_id
- **AND** 一张图片可含多道题，全部拆分入库

#### Scenario: 识别失败
- **WHEN** 模型调用失败或返回无法解析
- **THEN** 图片状态置为 `failed`，记录 error_message，不中断整体流程

### Requirement: 题目去重
系统 SHALL 对 `questions` 表所有题目进行排重：对题干文本做标准化（去除空白/标点/大小写差异），计算 Hash，相同 Hash 视为重复。

#### Scenario: 标记重复
- **WHEN** 去重步骤运行
- **THEN** 首次出现的题目 `is_duplicate=false`，其余 `is_duplicate=true` 并记录 `duplicate_of_id`
- **AND** 后续答题步骤只处理 `is_duplicate=false` 的题目

### Requirement: AI 答题与解析
系统 SHALL 将去重后的题目（题干 + 选项）逐题发送给 GLM，要求返回：正确答案选项、选择理由（为什么这么选），以及一组用于归类题目的 tag 标签。

#### Scenario: 作答成功
- **WHEN** 一道去重题目发送给 GLM
- **THEN** 返回答案、解析与 tag 列表写入 answers 表（关联 question_id），并把 tag 同步到全局 tag 体系
- **AND** 重复题目（is_duplicate=true）自动复用其 `duplicate_of_id` 对应的答案与 tag，无需重复请求

### Requirement: 题目标签（Tag）体系
系统 SHALL 在答题阶段让大模型为每道题目分配若干 tag（如学科、知识点、题型、难度等），所有 tag 汇总形成一个全局唯一的 tag 列表，供前端按 tag 检索与聚合展示。

#### Scenario: 分配 tag
- **WHEN** 模型为某题返回 tag（数组形式，如 ["数据结构", "二叉树", "中等"]）
- **THEN** 系统对 tag 做归一化（去空白/统一大小写），写入该题目的 tags 字段（JSON 数组）
- **AND** 将 tag 注册到全局 tags 表（不存在则新增，存在则累加引用计数）

#### Scenario: 全局 tag 列表
- **WHEN** 前端请求 tag 列表
- **THEN** 系统返回去重后的全局 tag 字典，含每个 tag 的名称与关联题目数量
- **AND** 支持按 tag 反查题目

#### Scenario: 重复题目复用 tag
- **WHEN** 一道 is_duplicate=true 的题目处理
- **THEN** 其 tags 直接复用 `duplicate_of_id` 题目的 tags，不重复调用大模型

### Requirement: 流程步骤可视化
前端 SHALL 以"步骤条"形式展示 5 个阶段：扫描图片 → AI 识别题目 → 题目去重 → AI 答题解析 → 完成。

#### Scenario: 实时进度
- **WHEN** 后端处理进行中
- **THEN** 每个步骤实时显示状态（pending/running/completed/failed）与进度（如 "识别中 45/832"）
- **AND** 步骤完成后可点击查看该阶段明细

### Requirement: 结果浏览
前端 SHALL 提供结果列表页，展示去重后的题目、选项、AI 答案与解析，支持搜索与筛选。

#### Scenario: 查看答案
- **WHEN** 用户打开结果页
- **THEN** 列表展示每道题的题干、选项、正确答案、解析，并标注来源图片

### Requirement: 关键字查询界面
前端 SHALL 提供独立的"题目查询"界面，用户输入关键字后，系统返回匹配的题目并完整展示：题干、全部选项、AI 给出的正确答案以及选择理由（为什么这么选）。

#### Scenario: 关键字检索
- **WHEN** 用户在查询框输入关键字（支持题干、选项内容模糊匹配）并提交
- **THEN** 后端对去重后的题目（is_duplicate=false）及其关联答案执行模糊检索
- **AND** 命中结果按相关度/时间排序，分页返回

#### Scenario: 展示答案与原因
- **WHEN** 查询结果返回
- **THEN** 每条结果卡片完整展示：题干文本、选项列表（A/B/C/D...）、正确答案、AI 解析（选择理由）、来源图片缩略信息
- **AND** 无答案的题目明确标注"暂未解析"，不报错

#### Scenario: 空结果
- **WHEN** 关键字无任何匹配
- **THEN** 界面友好提示"未找到相关题目"，并给出重新查询的引导

## 数据模型

- **images**: id, filename(UNIQUE), path, status(pending/processed/failed), error_message, created_at
- **questions**: id, image_id(FK), question_text, options(JSON), question_type, norm_text, dedup_hash, is_duplicate(bool), duplicate_of_id(FK self, nullable), created_at
- **answers**: id, question_id(UNIQUE FK), answer, explanation, tags(JSON 数组), created_at
- **tags**: id, name(UNIQUE，归一化后), display_name, ref_count(关联题目数), created_at
- **question_tags**: id, question_id(FK), tag_id(FK)（多对多关联，便于按 tag 反查题目，UNIQUE(question_id, tag_id)）
- **pipeline_steps**: id, step_name(UNIQUE), status, total, current, started_at, finished_at

## API 概览

- `POST /api/pipeline/start` — 启动整个流程（或单步）
- `GET /api/pipeline/status` — 获取各步骤状态与进度（轮询）
- `GET /api/pipeline/stream` — SSE 实时推送进度
- `GET /api/questions` — 分页查询去重后的题目（含答案）
- `GET /api/questions/search?keyword=xxx&tag=xxx&page=1&page_size=20` — 关键字模糊检索（题干/选项/答案/解析），可选按 tag 筛选，返回题目 + 答案 + 解析 + tags
- `GET /api/tags` — 返回全局 tag 列表（含名称与关联题目数）
- `GET /api/questions?tag=xxx` — 按 tag 反查题目
- `GET /api/images` — 图片列表与状态

## 非功能要求
- 单步流程可独立触发，支持失败重试，断点续跑（已 processed 的图片跳过）。
- API Key 通过环境变量读取，不硬编码。
- 大模型调用需有限并发与重试机制，避免触发限流。
