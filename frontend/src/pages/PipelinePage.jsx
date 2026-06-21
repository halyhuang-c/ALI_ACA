import { useEffect, useRef, useState } from 'react'
import {
  Card,
  Button,
  Steps,
  Progress,
  Collapse,
  Tag,
  Space,
  Typography,
  Alert,
  Spin,
  Drawer,
  Empty,
  Modal,
  Upload,
  message,
} from 'antd'
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  PictureOutlined,
  ScanOutlined,
  CopyOutlined,
  SolutionOutlined,
  CheckCircleOutlined,
  ReloadOutlined,
  FileTextOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import {
  startPipeline,
  pausePipeline,
  resumePipeline,
  resetFailedPipeline,
  continuePipeline,
  resetPipelineSteps,
  getPipelineStatus,
  getPipelineLogs,
  uploadImages,
} from '../api'

const { Text } = Typography

const STAGES = [
  {
    key: 'scan',
    title: '扫描图片',
    icon: <ScanOutlined />,
    keywords: ['scan', 'image', '图片', '扫描'],
  },
  {
    key: 'recognize',
    title: 'AI识别题目',
    icon: <PictureOutlined />,
    keywords: ['recogn', 'ocr', '题目', '识别', 'detect', 'extract', 'parse'],
  },
  {
    key: 'dedup',
    title: '题目去重',
    icon: <CopyOutlined />,
    keywords: ['dedup', '重复', '去重', 'duplicate'],
  },
  {
    key: 'answer',
    title: 'AI答题解析',
    icon: <SolutionOutlined />,
    keywords: ['answer', '解析', '答题', 'analy', 'solve', 'llm', 'ai'],
  },
  {
    key: 'complete',
    title: '完成',
    icon: <CheckCircleOutlined />,
    keywords: ['complete', 'done', 'finish', '完成'],
  },
]

function matchStage(stepName) {
  const name = String(stepName || '').toLowerCase()
  for (const stage of STAGES) {
    if (stage.keywords.some((k) => name.includes(String(k).toLowerCase()))) {
      return stage.key
    }
  }
  return null
}

const LOG_STEP_MAP = {
  recognize: 'extract',
  answer: 'answer',
}
const LOG_ENABLED_STAGES = ['recognize', 'answer']

const LOG_TITLE = {
  extract: 'AI 识别题目 - 处理日志',
  answer: 'AI 答题解析 - 处理日志',
}

function mapAntdStatus(s) {
  switch (String(s || '').toLowerCase()) {
    case 'completed':
    case 'success':
    case 'done':
      return 'finish'
    case 'running':
    case 'in_progress':
    case 'processing':
      return 'process'
    case 'paused':
      return 'wait'
    case 'partial_failed':
      return 'error'
    case 'failed':
    case 'error':
      return 'error'
    default:
      return 'wait'
  }
}

function progressStatusOf(antdStatus) {
  if (antdStatus === 'finish') return 'success'
  if (antdStatus === 'process') return 'active'
  if (antdStatus === 'error') return 'exception'
  return 'normal'
}

const STATUS_TEXT = {
  finish: '已完成',
  process: '进行中',
  error: '失败',
  wait: '等待中',
}

function overallStatusOf(status) {
  if (!status) return 'pending'
  if (typeof status.overall === 'string') return status.overall
  return status.overall?.status || 'pending'
}

function computeStageMap(status) {
  const steps = status?.steps || []
  const map = {}
  STAGES.forEach((s) => {
    map[s.key] = { status: 'wait', current: 0, total: 0, found: false, raw: null }
  })
  steps.forEach((stp) => {
    const key = matchStage(stp.step_name)
    if (key) {
      map[key] = {
        status: mapAntdStatus(stp.status),
        current: stp.current || 0,
        total: stp.total || 0,
        found: true,
        raw: stp,
      }
    }
  })
  if (overallStatusOf(status) === 'completed') {
    STAGES.forEach((s) => {
      map[s.key].status = 'finish'
      map[s.key].current = map[s.key].total || map[s.key].current
    })
  }
  return map
}

function PipelinePage() {
  const [status, setStatus] = useState(null)
  const [starting, setStarting] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const streamRef = useRef(null)
  const pollRef = useRef(null)
  const finishedRef = useRef(false)

  const [logStage, setLogStage] = useState(null)
  const [logs, setLogs] = useState([])
  const [logLoading, setLogLoading] = useState(false)
  const logPollRef = useRef(null)
  const statusRef = useRef(null)

  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadFileList, setUploadFileList] = useState([])

  const logStep = logStage ? LOG_STEP_MAP[logStage] : null

  const applyStatus = (data) => {
    if (!data) return
    statusRef.current = data
    setStatus(data)
    const ov = overallStatusOf(data)
    if (ov === 'completed' || ov === 'failed' || ov === 'partial_failed') {
      finishedRef.current = true
      closeStream()
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }

  function closeStream() {
    if (streamRef.current) {
      streamRef.current.close()
      streamRef.current = null
    }
  }

  function startPolling() {
    if (pollRef.current) return
    const poll = async () => {
      if (finishedRef.current) return
      try {
        const data = await getPipelineStatus()
        applyStatus(data)
      } catch (e) {
        // ignore polling errors
      }
    }
    poll()
    pollRef.current = setInterval(poll, 1000)
  }

  function openStream() {
    closeStream()
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    finishedRef.current = false
    let es
    try {
      es = new EventSource('/api/pipeline/stream')
      streamRef.current = es
      const handleData = (ev) => {
        try {
          const data = JSON.parse(ev.data)
          applyStatus(data)
        } catch (e) {
          // ignore parse errors
        }
      }
      es.addEventListener('status', handleData)
      es.addEventListener('message', handleData)
      es.addEventListener('done', (ev) => {
        try {
          const data = JSON.parse(ev.data)
          applyStatus(data)
        } catch (e) {}
        finishedRef.current = true
        closeStream()
      })
      es.onerror = () => {
        closeStream()
        if (finishedRef.current) return
        if (pollRef.current) return
        const poll = async () => {
          if (finishedRef.current) return
          try {
            const data = await getPipelineStatus()
            applyStatus(data)
          } catch (e) {
            // ignore polling errors
          }
        }
        poll()
        pollRef.current = setInterval(poll, 1500)
      }
    } catch (e) {
      startPolling()
    }
  }

  const handleStart = async () => {
    setStarting(true)
    try {
      await startPipeline()
      message.success('处理流程已启动')
      openStream()
    } catch (e) {
      message.error('启动处理失败，请检查后端服务')
    } finally {
      setStarting(false)
    }
  }

  const handlePause = async () => {
    try {
      await pausePipeline()
      message.info('已请求暂停，将在当前任务完成后停止')
    } catch (e) {
      message.error('暂停失败')
    }
  }

  const handleResume = async () => {
    try {
      await resumePipeline()
      message.success('已恢复运行')
      openStream()
    } catch (e) {
      message.error('恢复失败')
    }
  }

  const handleResetFailed = () => {
    Modal.confirm({
      title: '重试失败项',
      content: '将把所有失败的图片/答题重置为待处理，已成功的不会动。重置后请点「开始处理」重新跑失败的部分。是否继续？',
      okText: '重置',
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await resetFailedPipeline()
          if (res?.status === 'busy') {
            message.warning(res.message)
            return
          }
          message.success(res?.message || '已重置')
          const data = await getPipelineStatus()
          statusRef.current = data
          setStatus(data)
        } catch (e) {
          message.error('重置失败')
        }
      },
    })
  }

  const handleContinue = () => {
    Modal.confirm({
      title: '忽略失败项并继续',
      content: '将忽略当前失败项，直接继续后续流程（去重/答题）。失败项不会被处理。是否继续？',
      okText: '继续',
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await continuePipeline()
          if (res?.status === 'busy') {
            message.warning(res.message)
            return
          }
          if (res?.status === 'noop') {
            message.info(res.message)
            return
          }
          message.success(res?.message || '已继续')
          openStream()
        } catch (e) {
          message.error('继续失败')
        }
      },
    })
  }

  const handleUploadSubmit = async () => {
    if (uploadFileList.length === 0) {
      message.warning('请先选择图片')
      return
    }
    setUploading(true)
    try {
      const res = await uploadImages(uploadFileList)
      const ok = res?.saved_count ?? 0
      const lines = []
      if (ok > 0) lines.push(`成功上传 ${ok} 张`)
      if (res?.skipped?.length) lines.push(`跳过 ${res.skipped.length} 个（不支持格式）`)
      if (res?.failed?.length) {
        lines.push(`失败 ${res.failed.length} 个：`)
        res.failed.slice(0, 5).forEach((f) => lines.push(`  ${f.filename}: ${f.reason}`))
      }
      message.success(lines.join('\n') || '上传完成')
      setUploadFileList([])
      setUploadOpen(false)
      const data = await getPipelineStatus()
      statusRef.current = data
      setStatus(data)
    } catch (e) {
      const detail = e?.response?.data?.detail || e?.message || '上传失败'
      message.error(typeof detail === 'string' ? detail : '上传失败')
    } finally {
      setUploading(false)
    }
  }

  const handleResetSteps = () => {
    Modal.confirm({
      title: '重置流程状态',
      icon: null,
      content: (
        <div>
          <div style={{ color: 'rgba(0,0,0,0.65)' }}>
            将把 scan / extract / dedup / answer 四个步骤的状态改回 pending（待开始），便于重新跑流程。
          </div>
          <div style={{ marginTop: 8, color: 'rgba(0,0,0,0.65)' }}>
            不会动图片、题目、答案数据，也不会删除 image 目录文件。
          </div>
        </div>
      ),
      okText: '确认重置',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await resetPipelineSteps('steps')
          if (res?.status === 'busy') {
            message.warning(res.message)
            return
          }
          message.success(res?.message || '已重置')
          const data = await getPipelineStatus()
          statusRef.current = data
          setStatus(data)
        } catch (e) {
          message.error('重置失败')
        }
      },
    })
  }

  useEffect(() => {
    const init = async () => {
      try {
        const data = await getPipelineStatus()
        statusRef.current = data
        setStatus(data)
        const ov = overallStatusOf(data)
        if (data && ov !== 'completed' && ov !== 'failed' && ov !== 'partial_failed') {
          openStream()
        }
      } catch (e) {
        // backend may not be ready
      } finally {
        setInitialLoading(false)
      }
    }
    init()
    return () => {
      closeStream()
      if (pollRef.current) clearInterval(pollRef.current)
      if (logPollRef.current) clearInterval(logPollRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!logStage) {
      if (logPollRef.current) {
        clearInterval(logPollRef.current)
        logPollRef.current = null
      }
      return
    }
    const step = LOG_STEP_MAP[logStage]
    if (!step) return
    let stopped = false
    const fetchLogs = async () => {
      try {
        setLogLoading(true)
        const res = await getPipelineLogs(step)
        if (stopped) return
        const lines = res?.logs || []
        setLogs(lines)
        const rawStatus = computeStageMap(statusRef.current)[logStage]?.raw?.status
        const active = rawStatus === 'running'
        if (!active && logPollRef.current) {
          clearInterval(logPollRef.current)
          logPollRef.current = null
        }
      } catch (e) {
        // ignore
      } finally {
        if (!stopped) setLogLoading(false)
      }
    }
    fetchLogs()
    logPollRef.current = setInterval(fetchLogs, 1500)
    return () => {
      stopped = true
      if (logPollRef.current) {
        clearInterval(logPollRef.current)
        logPollRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logStage])

  const stageMap = computeStageMap(status)
  const overall = overallStatusOf(status)

  let currentIdx = STAGES.findIndex((s) => stageMap[s.key].status === 'process')
  if (currentIdx === -1) {
    const lastFinished = STAGES.reduce(
      (acc, s, i) => (stageMap[s.key].status === 'finish' ? i : acc),
      -1,
    )
    currentIdx = overall === 'completed' ? STAGES.length - 1 : lastFinished + 1
    if (currentIdx < 0) currentIdx = 0
    if (currentIdx > STAGES.length - 1) currentIdx = STAGES.length - 1
  }

  const items = STAGES.map((s) => ({
    title: s.title,
    status: stageMap[s.key].status,
    icon: s.icon,
  }))

  const overallTagColor = {
    pending: 'default',
    running: 'processing',
    paused: 'warning',
    partial_failed: 'warning',
    completed: 'success',
    failed: 'error',
  }[overall] || 'default'

  const overallTagText = {
    pending: '等待开始',
    running: '处理中',
    paused: '已暂停',
    partial_failed: '部分失败·待处理',
    completed: '全部完成',
    failed: '处理失败',
  }[overall] || '等待开始'

  return (
    <Spin spinning={initialLoading} tip="加载流程状态...">
      <div className="page-title">处理流程</div>
      <div className="page-subtitle">
        一键启动图片扫描、题目识别、去重与 AI 答题解析。新增图片后再点「开始处理」会自动跳过已处理项，只处理增量部分。
      </div>

      <Card
        style={{ marginBottom: 20, borderRadius: 10 }}
        extra={
          <Space>
            <Tag color={overallTagColor} style={{ margin: 0 }}>
              {overallTagText}
            </Tag>
            {overall === 'running' ? (
              <Button
                danger
                icon={<PauseCircleOutlined />}
                onClick={handlePause}
              >
                暂停
              </Button>
            ) : null}
            {overall === 'paused' ? (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handleResume}
              >
                恢复
              </Button>
            ) : null}
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              loading={starting}
              onClick={handleStart}
              disabled={overall === 'running' || overall === 'paused' || overall === 'partial_failed'}
            >
              {overall === 'running'
                ? '处理中...'
                : overall === 'paused'
                ? '已暂停'
                : overall === 'partial_failed'
                ? '部分失败'
                : '开始处理'}
            </Button>
            <Button
              icon={<UploadOutlined />}
              onClick={() => setUploadOpen(true)}
              disabled={overall === 'running'}
            >
              上传图片
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => getPipelineStatus().then(setStatus)}>
              刷新
            </Button>
            {overall === 'failed' || overall === 'partial_failed' ? (
              <Button onClick={handleResetFailed}>
                重试失败项
              </Button>
            ) : null}
            {overall === 'partial_failed' ? (
              <Button type="primary" onClick={handleContinue}>
                忽略并继续
              </Button>
            ) : null}
            {overall === 'completed' || overall === 'failed' || overall === 'partial_failed' ? (
              <Button danger onClick={handleResetSteps}>
                重置流程
              </Button>
            ) : null}
          </Space>
        }
        title="整体流程"
      >
        {overall === 'failed' ? (
          <Alert
            style={{ marginBottom: 16 }}
            type="error"
            showIcon
            message="处理流程出现错误，请查看下方失败步骤的详细信息"
          />
        ) : null}
        {overall === 'partial_failed' ? (
          <Alert
            style={{ marginBottom: 16 }}
            type="warning"
            showIcon
            message="有部分图片/题目处理失败"
            description="流程已暂停在此阶段。你可以：点「重试失败项」重置失败项后重新处理；或点「忽略并继续」跳过失败项进入下一阶段。"
          />
        ) : null}
        {overall === 'paused' ? (
          <Alert
            style={{ marginBottom: 16 }}
            type="warning"
            showIcon
            message="流程已暂停"
            description="点击「恢复」将从断点继续处理未完成的任务（已完成的图片/题目不会重复处理）。"
          />
        ) : null}
        <Steps
          current={currentIdx}
          size="default"
          items={items}
          style={{ padding: '8px 0' }}
        />
      </Card>

      <Card title="阶段详情" style={{ borderRadius: 10 }}>
        <Collapse
          defaultActiveKey={STAGES.map((s) => s.key)}
          items={STAGES.map((s) => {
            const info = stageMap[s.key]
            const percent =
              info.status === 'finish'
                ? 100
                : info.total > 0
                ? Math.min(100, Math.round((info.current / info.total) * 100))
                : 0
            return {
              key: s.key,
              label: (
                <Space>
                  {s.icon}
                  <Text strong>{s.title}</Text>
                  <Tag
                    color={
                      info.status === 'finish'
                        ? 'success'
                        : info.status === 'process'
                        ? 'processing'
                        : info.status === 'error'
                        ? 'error'
                        : 'default'
                    }
                  >
                    {STATUS_TEXT[info.status]}
                  </Tag>
                </Space>
              ),
              children: (
                <div style={{ paddingBottom: 8 }}>
                  {info.total > 0 || info.status !== 'wait' ? (
                    <>
                      <Progress
                        percent={percent}
                        status={progressStatusOf(info.status)}
                        format={() =>
                          info.total > 0 ? `${info.current} / ${info.total}` : `${percent}%`
                        }
                      />
                      <Space style={{ marginTop: 8 }} wrap>
                        <Text type="secondary">当前进度：</Text>
                        <Text strong>{info.total > 0 ? `${info.current} / ${info.total}` : '—'}</Text>
                        <Text type="secondary">| 状态：{STATUS_TEXT[info.status]}</Text>
                        {LOG_ENABLED_STAGES.includes(s.key) ? (
                          <Button
                            size="small"
                            icon={<FileTextOutlined />}
                            onClick={() => {
                              setLogs([])
                              setLogStage(s.key)
                            }}
                          >
                            查看日志
                          </Button>
                        ) : null}
                      </Space>
                    </>
                  ) : (
                    <Space>
                      <Text type="secondary">该阶段尚未开始。</Text>
                      {LOG_ENABLED_STAGES.includes(s.key) ? (
                        <Button
                          size="small"
                          icon={<FileTextOutlined />}
                          onClick={() => {
                            setLogs([])
                            setLogStage(s.key)
                          }}
                        >
                          查看日志
                        </Button>
                      ) : null}
                    </Space>
                  )}
                </div>
              ),
            }
          })}
        />
      </Card>

      <Modal
        title="上传图片到扫描目录"
        open={uploadOpen}
        onCancel={() => {
          if (!uploading) setUploadOpen(false)
        }}
        onOk={handleUploadSubmit}
        confirmLoading={uploading}
        okText={`上传${uploadFileList.length > 0 ? ` ${uploadFileList.length} 张` : ''}`}
        cancelText="取消"
        maskClosable={!uploading}
        width={560}
      >
        <Alert
          style={{ marginBottom: 12 }}
          type="info"
          showIcon
          message="支持 png / jpg / jpeg / webp / bmp / gif"
          description="单文件最大 25MB，单次最多 50 张。上传后会自动加入扫描库，点击「开始处理」即可走识别/答题流程。"
        />
        <Upload.Dragger
          multiple
          listType="picture"
          fileList={uploadFileList}
          beforeUpload={() => false}
          onChange={({ fileList: fl }) => setUploadFileList(fl)}
          accept=".png,.jpg,.jpeg,.webp,.bmp,.gif"
        >
          <p className="ant-upload-drag-icon">
            <UploadOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽图片到此处</p>
          <p className="ant-upload-hint">支持单次多选</p>
        </Upload.Dragger>
      </Modal>

      <Drawer
        title={logStep ? LOG_TITLE[logStep] : '处理日志'}
        placement="right"
        width={720}
        open={!!logStage}
        onClose={() => setLogStage(null)}
        destroyOnClose
        extra={
          <Space>
            <Tag
              color={
                logStage && stageMap[logStage]?.status === 'finish'
                  ? 'success'
                  : logStage && stageMap[logStage]?.status === 'process'
                  ? 'processing'
                  : logStage && stageMap[logStage]?.status === 'error'
                  ? 'error'
                  : 'default'
              }
            >
              {logStage ? STATUS_TEXT[stageMap[logStage]?.status] : ''}
            </Tag>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              loading={logLoading}
              onClick={() => {
                if (logStep) getPipelineLogs(logStep).then((res) => setLogs(res?.logs || []))
              }}
            >
              刷新
            </Button>
          </Space>
        }
      >
        <div
          style={{
            fontFamily: 'Consolas, Menlo, monospace',
            fontSize: 12.5,
            lineHeight: 1.7,
            background: '#1e1e1e',
            color: '#d4d4d4',
            padding: 12,
            borderRadius: 8,
            height: 'calc(100% - 8px)',
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
          ref={(el) => {
            if (el) el.scrollTop = el.scrollHeight
          }}
        >
          {logs.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: 60 }}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={logLoading ? '加载中...' : '暂无日志'}
              />
            </div>
          ) : (
            logs.map((ln, i) => (
              <div
                key={i}
                style={{
                  color: ln.level === 'error' ? '#ff6b6b' : ln.level === 'warn' ? '#ffd43b' : '#d4d4d4',
                }}
              >
                <span style={{ color: '#858585' }}>{ln.ts}</span>{' '}
                {ln.msg}
              </div>
            ))
          )}
        </div>
      </Drawer>
    </Spin>
  )
}

export default PipelinePage
