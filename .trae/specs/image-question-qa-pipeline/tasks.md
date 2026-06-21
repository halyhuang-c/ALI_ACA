# Tasks

- [x] Task 1: 搭建后端项目骨架（Python + FastAPI + SQLite + SQLAlchemy）
  - [x] SubTask 1.1: 创建 `backend/` 目录，初始化 `requirements.txt`（fastapi、uvicorn、sqlalchemy、zhipuai、pillow、httpx、python-dotenv）
  - [x] SubTask 1.2: 创建数据库模型（images、questions、answers、tags、question_tags、pipeline_steps 六张表）
  - [x] SubTask 1.3: 创建 FastAPI 应用入口 `main.py`，配置 CORS 与路由注册
  - [x] SubTask 1.4: 配置 `.env` 读取 `ZHIPUAI_API_KEY` 与图片目录路径

- [x] Task 2: 集成智谱 GLM 视觉模型
  - [x] SubTask 2.1: 封装 GLM 客户端模块 `llm_client.py`（图片转 Base64、调用 GLM-4V）
  - [x] SubTask 2.2: 编写识别题目 Prompt，要求模型以严格 JSON 返回题目列表
  - [x] SubTask 2.3: 编写答题 Prompt，要求模型返回答案 + 选择理由 + tag 标签数组
  - [x] SubTask 2.4: 实现调用重试与限流（控制并发、指数退避）

- [x] Task 3: 实现图片扫描入库
  - [x] SubTask 3.1: 实现 `scan_service.py`：遍历 `image/` 目录 PNG，按 filename 去重写入 images 表
  - [x] SubTask 3.2: 暴露 `POST /api/scan` 接口，更新 pipeline_steps 进度

- [x] Task 4: 实现 GLM 视觉识别题目步骤
  - [x] SubTask 4.1: 实现 `extract_service.py`：逐张处理 status=pending 的图片
  - [x] SubTask 4.2: 解析模型 JSON 返回，拆分多题写入 questions 表
  - [x] SubTask 4.3: 处理失败标记（status=failed + error_message），支持断点续跑

- [x] Task 5: 实现题目去重
  - [x] SubTask 5.1: 实现 `dedup_service.py`：标准化题干（去空白/标点/统一大小写）、计算 dedup_hash
  - [x] SubTask 5.2: 标记首条为 is_duplicate=false，其余 is_duplicate=true 并记录 duplicate_of_id

- [x] Task 6: 实现 AI 答题与解析（含 tag 分配）
  - [x] SubTask 6.1: 实现 `answer_service.py`：遍历 is_duplicate=false 题目调用 GLM 答题
  - [x] SubTask 6.2: 写入 answers 表（question_id 唯一），保存 tags 字段（JSON 数组）
  - [x] SubTask 6.3: 对 tag 做归一化（去空白/统一大小写），写入全局 tags 表与 question_tags 关联表，已存在则累加 ref_count
  - [x] SubTask 6.4: 对重复题目复用 duplicate_of_id 的答案与 tag，不重复调用大模型

- [x] Task 7: 实现流程编排与进度推送
  - [x] SubTask 7.1: 实现 `pipeline_service.py` 串联步骤 1-4，更新 pipeline_steps 状态
  - [x] SubTask 7.2: 实现 `GET /api/pipeline/status` 轮询接口
  - [x] SubTask 7.3: 实现 `GET /api/pipeline/stream` SSE 实时推送接口
  - [x] SubTask 7.4: 实现题目结果接口 `GET /api/questions`（分页 + 含答案 + 含 tags，支持 ?tag=xxx 反查）

- [x] Task 8: 搭建前端项目骨架（React + Vite）
  - [x] SubTask 8.1: 在 `frontend/` 创建 Vite React 项目，安装依赖（antd、axios）
  - [x] SubTask 8.2: 配置开发代理转发 `/api` 到后端（http://localhost:8000）

- [x] Task 9: 实现前端步骤可视化界面
  - [x] SubTask 9.1: 用步骤条组件展示 5 个阶段（扫描/识别/去重/答题/完成）
  - [x] SubTask 9.2: 通过 SSE 或轮询实时更新每步状态与进度（"识别中 45/832"）
  - [x] SubTask 9.3: 实现"开始处理"按钮调用 `/api/pipeline/start`

- [x] Task 10: 实现前端结果浏览页
  - [x] SubTask 10.1: 题目列表展示题干、选项、答案、解析、tags、来源图片
  - [x] SubTask 10.2: 支持搜索与按状态/tag 筛选

- [x] Task 12: 实现关键字查询界面（题目/答案/原因检索）
  - [x] SubTask 12.1: 后端实现 `GET /api/questions/search?keyword=xxx&tag=xxx` 接口，对 is_duplicate=false 题目及其关联答案做模糊检索（题干/选项/答案/解析），可选按 tag 筛选，返回题目 + 答案 + 解析 + tags，支持分页
  - [x] SubTask 12.2: 前端新建"题目查询"独立页面，含搜索输入框、tag 下拉筛选与提交按钮
  - [x] SubTask 12.3: 结果卡片完整展示题干、选项列表、正确答案、AI 解析（选择理由）、tags 标签、来源图片，无答案时标注"暂未解析"
  - [x] SubTask 12.4: 空结果友好提示与分页加载

- [x] Task 13: 实现 Tag 列表体系
  - [x] SubTask 13.1: 后端实现 `GET /api/tags` 返回全局 tag 列表（名称 + 关联题目数 ref_count）
  - [x] SubTask 13.2: 前端新增"标签管理/总览"页面，展示全局 tag 列表与每个 tag 的题目数量
  - [x] SubTask 13.3: 点击 tag 跳转到按 tag 反查的题目列表（调用 `/api/questions?tag=xxx`）

- [ ] Task 11: 联调验证与文档
  - [ ] SubTask 11.1: 端到端跑通完整流程（少量图片验证，确认答案 + tag 均落库）
  - [x] SubTask 11.2: 编写启动说明（如何配置 API Key、启动前后端）

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 1
- Task 4 depends on Task 2, Task 3
- Task 5 depends on Task 4
- Task 6 depends on Task 2, Task 5
- Task 7 depends on Task 3, Task 4, Task 5, Task 6
- Task 9 depends on Task 7, Task 8
- Task 10 depends on Task 7, Task 8
- Task 12 depends on Task 7, Task 8, Task 13
- Task 13 depends on Task 6, Task 7
- Task 11 depends on Task 9, Task 10, Task 12, Task 13
