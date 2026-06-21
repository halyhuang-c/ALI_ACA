import { useState } from 'react'
import {
  Card,
  Tag,
  Collapse,
  Typography,
  Space,
  Alert,
  Image as AntImage,
  Button,
  Select,
  Modal,
  Input,
  Tooltip,
  message,
} from 'antd'
import {
  CheckCircleFilled,
  CloseCircleFilled,
  FileTextOutlined,
  FileImageOutlined,
  ReloadOutlined,
  EditOutlined,
  CheckOutlined,
} from '@ant-design/icons'
import { reAnswerQuestion, reviewAnswer, getLLMConfigs } from '../api'

const { Paragraph, Text } = Typography

const ORDER = ['A', 'B', 'C', 'D', 'E', 'F']

function normalizeAnswer(answer) {
  if (answer == null || answer === '') return ''
  const v = String(answer).trim().toUpperCase()
  const noSpace = v.replace(/[\s,，、;；]+/g, '')
  return noSpace.replace(/[（）()]/g, '')
}

function sameSet(a, b) {
  const na = normalizeAnswer(a)
  const nb = normalizeAnswer(b)
  if (!na || !nb) return na === nb
  if (na === nb) return true
  return new Set(na).size === new Set(nb).size && [...new Set(na)].every((c) => new Set(nb).has(c))
}

function ReviewStatusTag({ status, isCorrect }) {
  if (isCorrect === true) return null
  if (status === 'approved') return <Tag color="green">已审核·采纳</Tag>
  if (status === 'rejected') return <Tag color="default">已审核·驳回</Tag>
  if (status === 'pending') return <Tag color="orange">待审核</Tag>
  return null
}

function QuestionCard({ question, onUpdated }) {
  const {
    id,
    image_id,
    image_filename,
    question_text,
    options,
    question_type,
    tags,
    correct_answer,
    answer_text,
    explanation,
    is_correct,
    answer_id,
    answer_model,
    review_status,
    answer_history,
    category,
    subcategory,
  } = question || {}

  const [reanswerOpen, setReanswerOpen] = useState(false)
  const [configs, setConfigs] = useState([])
  const [configId, setConfigId] = useState(null)
  const [modelOptions, setModelOptions] = useState([])
  const [model, setModel] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [editAnswer, setEditAnswer] = useState(answer_text || '')
  const [editExpl, setEditExpl] = useState(explanation || '')
  const [savingReview, setSavingReview] = useState(false)

  const optionEntries = options && typeof options === 'object' ? Object.entries(options) : []
  const sortedOptions = [...optionEntries].sort(
    ([a], [b]) => ORDER.indexOf(a) - ORDER.indexOf(b),
  )

  const hasCorrect = !!normalizeAnswer(correct_answer)
  const hasAiAnswer = !!normalizeAnswer(answer_text)

  const correctSet = new Set(normalizeAnswer(correct_answer).split(''))
  const aiSet = new Set(normalizeAnswer(answer_text).split(''))

  let compareState = 'none'
  let compareMsg = ''
  if (hasAiAnswer) {
    if (is_correct === true || (is_correct == null && sameSet(answer_text, correct_answer))) {
      compareState = hasCorrect ? 'match' : 'noRef'
    } else if (is_correct === false) {
      compareState = 'mismatch'
      compareMsg = `${answer_model || 'AI'} 回答与图片标注的标准答案不一致（${answer_model || 'AI'}：${answer_text} ｜ 标准答案：${correct_answer}）`
    }
  }

  const openReanswer = async () => {
    setReanswerOpen(true)
    if (configs.length === 0) {
      try {
        const res = await getLLMConfigs()
        const list = Array.isArray(res) ? res : res?.items || []
        setConfigs(list)
        if (list.length > 0) {
          setConfigId(list[0].id)
          const ms = Array.isArray(list[0].models) ? list[0].models : []
          setModelOptions(ms)
          setModel(ms[0] || null)
        }
      } catch (e) {
        message.error('加载模型配置失败')
      }
    }
  }

  const onConfigChange = (cid) => {
    setConfigId(cid)
    const c = configs.find((x) => x.id === cid)
    const ms = c ? (Array.isArray(c.models) ? c.models : []) : []
    setModelOptions(ms)
    setModel(ms[0] || null)
  }

  const submitReanswer = async () => {
    if (!configId || !model) {
      message.warning('请选择配置和模型')
      return
    }
    setSubmitting(true)
    try {
      const updated = await reAnswerQuestion(id, configId, model)
      message.success(`已用 ${model} 重新解析`)
      setReanswerOpen(false)
      if (typeof onUpdated === 'function') onUpdated(updated)
    } catch (e) {
      const detail = e?.response?.data?.detail || e?.message || '重解失败'
      message.error(typeof detail === 'string' ? detail : '重解失败')
    } finally {
      setSubmitting(false)
    }
  }

  const openEdit = () => {
    setEditAnswer(answer_text || '')
    setEditExpl(explanation || '')
    setEditOpen(true)
  }

  const saveEdit = async (alsoReview) => {
    if (!answer_id) {
      message.error('答案不存在，无法审核')
      return
    }
    setSavingReview(true)
    try {
      const updated = await reviewAnswer(answer_id, {
        answer: editAnswer,
        explanation: editExpl,
        review_status: alsoReview ? 'approved' : undefined,
      })
      message.success(alsoReview ? '已保存并标记为已审核' : '已保存修改')
      setEditOpen(false)
      if (typeof onUpdated === 'function') onUpdated(updated)
    } catch (e) {
      message.error('保存失败')
    } finally {
      setSavingReview(false)
    }
  }

  return (
    <Card
      className="question-card"
      size="small"
      title={
        <Space size={8} wrap>
          {question_type ? <Tag color="blue">{question_type}</Tag> : null}
          {category ? <Tag color="purple">{category}</Tag> : null}
          {subcategory && subcategory !== category ? (
            <Tag color="magenta">{subcategory}</Tag>
          ) : null}
          {hasCorrect ? (
            <Tag color="gold" icon={<CheckCircleFilled />}>
              标准答案：{correct_answer}
            </Tag>
          ) : null}
          {hasAiAnswer ? (
            <Tag color="processing" icon={<CheckCircleFilled />}>
              AI答案：{answer_text}
            </Tag>
          ) : (
            <Tag color="default">暂未解析</Tag>
          )}
          {answer_model ? <Text type="secondary" style={{ fontSize: 12 }}>{answer_model}</Text> : null}
          <ReviewStatusTag status={review_status} isCorrect={is_correct} />
          {id ? <Text type="secondary" style={{ fontSize: 12 }}>#{id}</Text> : null}
        </Space>
      }
      extra={
        is_correct !== true ? (
          <Space size={4}>
            <Tooltip title="用其他模型重新解析（旧答案会保留为历史版本）">
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={openReanswer}
              >
                重解
              </Button>
            </Tooltip>
            <Tooltip title="人工编辑答案/解析">
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={openEdit}
                disabled={!answer_id}
              >
                人工审核
              </Button>
            </Tooltip>
          </Space>
        ) : null
      }
    >
      <div className="question-stem">{question_text || '（无题干）'}</div>

      {sortedOptions.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {sortedOptions.map(([key, value]) => {
            const k = normalizeAnswer(key)
            const aiHit = hasAiAnswer && aiSet.has(k)
            const refHit = hasCorrect && correctSet.has(k)
            let cls = 'option-item'
            if (hasCorrect && refHit) cls += ' correct'
            else if (hasAiAnswer && aiHit && !hasCorrect) cls += ' correct'
            return (
              <div key={key} className={cls}>
                <span className="option-key">{key}.</span>
                <span className="option-text">{value}</span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                  {hasCorrect && refHit ? (
                    <Text type="success" style={{ fontSize: 12 }}>标准</Text>
                  ) : null}
                  {hasAiAnswer && aiHit ? (
                    <Text type="processing" style={{ fontSize: 12 }}>AI</Text>
                  ) : null}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {compareState === 'mismatch' ? (
        <Alert
          style={{ marginBottom: 12 }}
          type="error"
          showIcon
          icon={<CloseCircleFilled />}
          message="答案不一致"
          description={
            <div>
              <div>{compareMsg}</div>
              <div style={{ marginTop: 6 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  可点右上「重解」用其他模型重新解析，或「审核」手动修订答案
                </Text>
              </div>
            </div>
          }
        />
      ) : null}
      {compareState === 'match' ? (
        <Alert
          style={{ marginBottom: 12 }}
          type="success"
          showIcon
          message="AI 回答与标准答案一致"
        />
      ) : null}
      {compareState === 'noRef' ? (
        <Alert
          style={{ marginBottom: 12 }}
          type="info"
          showIcon
          message="该题图片中未标注标准答案，仅展示 AI 作答"
        />
      ) : null}

      {hasAiAnswer && explanation ? (
        <Collapse
          ghost
          size="small"
          items={[
            {
              key: 'explanation',
              label: (
                <Space size={6}>
                  <FileTextOutlined style={{ color: '#1677ff' }} />
                  <Text strong>AI 解析</Text>
                </Space>
              ),
              children: (
                <Paragraph style={{ color: 'rgba(0,0,0,0.7)', marginBottom: 0 }}>
                  {explanation}
                </Paragraph>
              ),
            },
          ]}
        />
      ) : null}

      <div style={{ marginTop: 12 }}>
        <Space size={6} wrap>
          {(tags || []).map((t, i) => (
            <Tag key={`${t}-${i}`} color="geekblue">{t}</Tag>
          ))}
        </Space>
      </div>

      {image_filename ? (
        <div style={{ marginTop: 8 }}>
          <Space size={8} align="start" wrap>
            {image_id ? (
              <AntImage
                src={`/api/images/${image_id}/file`}
                alt={image_filename}
                width={72}
                height={72}
                style={{
                  objectFit: 'cover',
                  borderRadius: 6,
                  cursor: 'pointer',
                  border: '1px solid #f0f0f0',
                }}
                preview={{
                  zoomCtrl: true,
                  rotateCtrl: true,
                  scaleStep: 0.25,
                  minScale: 0.2,
                  maxScale: 10,
                }}
                placeholder
                fallback="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMTIwIi8+"
              />
            ) : null}
            <Text type="secondary" style={{ fontSize: 12, lineHeight: '18px' }}>
              <FileImageOutlined style={{ marginRight: 4 }} />
              来源图片：
              <br />
              {image_filename}
              <br />
              <Text type="secondary" style={{ fontSize: 11 }}>
                （点击图片可查看原图，支持滚轮缩放、旋转）
              </Text>
            </Text>
          </Space>
        </div>
      ) : null}

      <Modal
        title="用其他模型重新解析"
        open={reanswerOpen}
        onCancel={() => setReanswerOpen(false)}
        onOk={submitReanswer}
        confirmLoading={submitting}
        okText="开始重解"
        cancelText="取消"
      >
        <Alert
          style={{ marginBottom: 12 }}
          type="info"
          showIcon
          message="重解会用新模型结果覆盖当前 AI 答案；原答案会作为历史版本保留，可随时切回。"
        />
        <div style={{ marginBottom: 12 }}>
          <Text strong>配置：</Text>
          <Select
            style={{ width: '100%', marginTop: 4 }}
            value={configId}
            onChange={onConfigChange}
            options={configs.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="选择 LLM 配置"
          />
        </div>
        <div>
          <Text strong>模型：</Text>
          <Select
            style={{ width: '100%', marginTop: 4 }}
            value={model}
            onChange={setModel}
            options={modelOptions.map((m) => ({ value: m, label: m }))}
            placeholder="选择模型"
            disabled={modelOptions.length === 0}
          />
        </div>
      </Modal>

      <Modal
        title="人工审核答案"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setEditOpen(false)}>取消</Button>,
          <Button key="save" loading={savingReview} onClick={() => saveEdit(false)}>
            仅保存
          </Button>,
          <Button
            key="approve"
            type="primary"
            icon={<CheckOutlined />}
            loading={savingReview}
            onClick={() => saveEdit(true)}
          >
            保存并标记已审核
          </Button>,
        ]}
      >
        <div style={{ marginBottom: 12 }}>
          <Text strong>标准答案：</Text>
          <Tag color="gold" style={{ marginLeft: 6 }}>{correct_answer || '（无）'}</Tag>
        </div>
        <div style={{ marginBottom: 12 }}>
          <Text strong>AI 答案：</Text>
          <Input
            value={editAnswer}
            onChange={(e) => setEditAnswer(e.target.value)}
            placeholder="例如 A 或 ABCD"
            style={{ marginTop: 4 }}
          />
        </div>
        <div>
          <Text strong>解析：</Text>
          <Input.TextArea
            value={editExpl}
            onChange={(e) => setEditExpl(e.target.value)}
            rows={4}
            style={{ marginTop: 4 }}
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            保存后会按新答案重新计算「是否与标准答案一致」。「保存并标记已审核」会把这道题标为已审核状态。
          </Text>
        </div>
      </Modal>
    </Card>
  )
}

export default QuestionCard
