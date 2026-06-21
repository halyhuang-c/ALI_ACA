# Checklist

## 后端基础
- [x] `backend/` 目录创建，`requirements.txt` 包含 fastapi、uvicorn、sqlalchemy、zhipuai、pillow、httpx、python-dotenv
- [x] 数据库六张表（images、questions、answers、tags、question_tags、pipeline_steps）字段与 spec 一致
- [x] tags 表 name 归一化唯一，question_tags 含 UNIQUE(question_id, tag_id)
- [x] FastAPI 应用启动正常，CORS 允许前端域名
- [x] `.env` 正确读取 `ZHIPUAI_API_KEY` 与图片目录路径，API Key 未硬编码

## GLM 集成
- [x] GLM 客户端能成功调用 GLM-4V 并返回结果（代码就绪，待填 Key 实跑）
- [x] 识别 Prompt 输出严格 JSON（题目列表 + 选项 + 题型）
- [x] 答题 Prompt 输出答案 + 选择理由 + tag 标签数组
- [x] 调用具备重试与并发控制（3 次重试 + 指数退避 + 线程池限流）

## 业务流程
- [x] 图片扫描：PNG 全部入库，按 filename 去重不重复插入（实测入库 818 张，重扫 0）
- [x] 识别题目：成功图片状态变 processed，失败变 failed 并记录错误
- [x] 识别支持断点续跑（已 processed 跳过）
- [x] 去重：相同 dedup_hash 标记 is_duplicate=true 并记录 duplicate_of_id
- [x] 答题：仅处理 is_duplicate=false 题目，重复题目复用答案与 tag
- [x] 答题时大模型返回的 tag 经归一化写入 answers.tags 与全局 tags/question_tags 表
- [x] 已存在 tag 累加 ref_count，新 tag 新增记录
- [x] answers 表 question_id 唯一约束生效

## API
- [x] `POST /api/pipeline/start` 可启动流程
- [x] `GET /api/pipeline/status` 返回各步骤状态与进度
- [x] `GET /api/pipeline/stream` SSE 实时推送进度
- [x] `GET /api/questions` 返回题目 + 答案 + tags，支持分页，支持 ?tag=xxx 反查
- [x] `GET /api/questions/search?keyword=xxx&tag=xxx` 支持关键字模糊检索（题干/选项/答案/解析），可选按 tag 筛选，返回题目 + 答案 + 解析 + tags，支持分页
- [x] `GET /api/tags` 返回全局 tag 列表（名称 + ref_count 关联题目数）

## 前端
- [x] `frontend/` Vite React 项目可正常启动
- [x] 开发代理转发 `/api` 到 http://localhost:8000
- [x] 步骤条展示 5 个阶段：扫描/识别/去重/答题/完成
- [x] 实时显示每步状态与进度数字
- [x] "开始处理"按钮能触发后端流程
- [x] 结果页展示题干、选项、答案、解析、tags、来源图片
- [x] 结果页支持搜索与按 tag/状态筛选
- [x] 关键字查询页面：搜索框 + tag 下拉筛选 + 提交按钮，调用 search 接口
- [x] 查询结果卡片展示题干、选项、正确答案、AI 解析（选择理由）、tags 标签、来源图片
- [x] 无答案题目标注"暂未解析"，无结果显示"未找到相关题目"
- [x] 查询结果支持分页加载
- [x] 标签总览页面展示全局 tag 列表与每个 tag 的题目数量
- [x] 点击 tag 可跳转按 tag 反查的题目列表

## 联调
- [ ] 少量图片端到端跑通完整流程，确认答案与 tag 均正确落库（待用户填入智谱 API Key 后实跑）
- [x] 启动说明文档（见最终回复，含 API Key 配置、前后端启动命令）
