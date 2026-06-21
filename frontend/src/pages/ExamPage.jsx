import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Card,
  Button,
  Typography,
  Space,
  Spin,
  Tag,
  Progress,
  Radio,
  Checkbox,
  Result,
  Empty,
  Modal,
  Slider,
  InputNumber,
  Tooltip,
  Row,
  Col,
  message,
} from 'antd'
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ThunderboltOutlined,
  ExclamationCircleOutlined,
  HistoryOutlined,
  SlidersOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { generateExam, submitExam, getExamHistory, getExamConfig, updateExamConfig } from '../api'

const { Text, Title, Paragraph } = Typography

const EXAM_DURATION = 60 * 60 // 60 minutes in seconds

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function ExamPage() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState('idle') // idle | loading | exam | result
  const [examData, setExamData] = useState(null)
  const [answers, setAnswers] = useState({})
  const [currentIdx, setCurrentIdx] = useState(0)
  const [timeLeft, setTimeLeft] = useState(EXAM_DURATION)
  const [result, setResult] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [history, setHistory] = useState([])
  const [pickDecay, setPickDecay] = useState(0.2)
  const [savedDecay, setSavedDecay] = useState(0.2)
  const [decayRange, setDecayRange] = useState({ min: 0.05, max: 0.5 })
  const [decayDefault, setDecayDefault] = useState(0.2)
  const [savingDecay, setSavingDecay] = useState(false)
  const timerRef = useRef(null)
  const startTimeRef = useRef(null)

  const loadHistory = useCallback(async () => {
    try {
      const res = await getExamHistory(1, 5)
      setHistory(res?.items || [])
    } catch (e) {}
  }, [])

  const loadConfig = useCallback(async () => {
    try {
      const res = await getExamConfig()
      const decay = res?.pick_decay ?? 0.2
      setPickDecay(decay)
      setSavedDecay(decay)
      setDecayRange({ min: res?.pick_decay_min ?? 0.05, max: res?.pick_decay_max ?? 0.5 })
      setDecayDefault(res?.pick_decay_default ?? 0.2)
    } catch (e) {}
  }, [])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  const decayDirty = Math.abs(pickDecay - savedDecay) > 1e-6
  const isAtDefault = Math.abs(pickDecay - decayDefault) < 1e-6

  const clampDecay = (v) => {
    if (v == null || isNaN(v)) return savedDecay
    return Math.min(decayRange.max, Math.max(decayRange.min, Number(v)))
  }

  const handleSaveDecay = async () => {
    const val = clampDecay(pickDecay)
    setSavingDecay(true)
    try {
      const res = await updateExamConfig(val)
      const finalVal = res?.pick_decay ?? val
      setSavedDecay(finalVal)
      setPickDecay(finalVal)
      message.success('抽题策略已更新')
    } catch (e) {
      message.error(e?.response?.data?.detail || '保存失败')
    } finally {
      setSavingDecay(false)
    }
  }

  const handleResetDecay = () => {
    setPickDecay(decayDefault)
  }

  const handleDiscardDecay = () => {
    setPickDecay(savedDecay)
  }

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  // 倒计时
  useEffect(() => {
    if (phase !== 'exam') return
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          handleAutoSubmit()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [phase])

  const handleAutoSubmit = () => {
    message.warning('考试时间到，自动提交')
    doSubmit(true)
  }

  const startExam = async () => {
    setPhase('loading')
    try {
      const res = await generateExam()
      setExamData(res)
      setAnswers({})
      setCurrentIdx(0)
      setTimeLeft(EXAM_DURATION)
      setResult(null)
      startTimeRef.current = new Date().toISOString()
      setPhase('exam')
    } catch (e) {
      message.error(e?.response?.data?.detail || '生成考试失败')
      setPhase('idle')
    }
  }

  const doSubmit = async (isAuto = false) => {
    if (!isAuto && examData) {
      const unanswered = examData.questions.filter((q) => !answers[q.id]).length
      if (unanswered > 0) {
        Modal.confirm({
          title: '确认提交',
          content: `还有 ${unanswered} 道题未作答，确定提交吗？`,
          okText: '提交',
          cancelText: '继续答题',
          onOk: () => doSubmitActual(),
        })
        return
      }
    }
    doSubmitActual()
  }

  const doSubmitActual = async () => {
    if (!examData) return
    setSubmitting(true)
    clearInterval(timerRef.current)
    try {
      const answerList = examData.questions.map((q) => ({
        question_id: q.id,
        answer: answers[q.id] || '',
      }))
      const res = await submitExam(examData.exam_id, answerList, startTimeRef.current)
      setResult(res)
      setPhase('result')
      loadHistory()
    } catch (e) {
      message.error('提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAnswer = (qid, value) => {
    setAnswers((prev) => ({ ...prev, [qid]: value }))
  }

  const exitExam = () => {
    setPhase('idle')
    setExamData(null)
    setAnswers({})
    setResult(null)
  }

  // ===== 考试中 =====
  if (phase === 'exam' && examData) {
    const questions = examData.questions
    const q = questions[currentIdx]
    const answeredCount = questions.filter((qq) => answers[qq.id]).length
    const isMulti = q.question_type === '多选'
    const userAns = answers[q.id] || (isMulti ? [] : '')

    return (
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <Card
          size="small"
          style={{ marginBottom: 12, position: 'sticky', top: 0, zIndex: 10 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space>
              <ThunderboltOutlined />
              <Text strong>模拟考试</Text>
              <Tag color={timeLeft < 300 ? 'red' : 'blue'}>
                <ClockCircleOutlined /> {formatTime(timeLeft)}
              </Tag>
            </Space>
            <Space>
              <Text type="secondary">已答 {answeredCount}/{questions.length}</Text>
              <Button size="small" danger onClick={exitExam}>放弃</Button>
            </Space>
          </div>
          <Progress
            percent={Math.round((answeredCount / questions.length) * 100)}
            size="small"
            style={{ marginTop: 8 }}
          />
        </Card>

        <Card
          title={
            <Space>
              <Tag color={isMulti ? 'volcano' : 'cyan'}>{q.question_type}</Tag>
              <Text>第 {currentIdx + 1} 题 / 共 {questions.length} 题</Text>
            </Space>
          }
          extra={
            <Space>
              <Button
                size="small"
                disabled={currentIdx === 0}
                onClick={() => setCurrentIdx(currentIdx - 1)}
              >
                上一题
              </Button>
              <Button
                size="small"
                type="primary"
                disabled={currentIdx === questions.length - 1}
                onClick={() => setCurrentIdx(currentIdx + 1)}
              >
                下一题
              </Button>
            </Space>
          }
        >
          <Paragraph style={{ fontSize: 15, marginBottom: 16 }}>
            {q.question_text}
          </Paragraph>

          {q.options ? (
            isMulti ? (
              <Checkbox.Group
                value={typeof userAns === 'string' ? userAns.split('') : (Array.isArray(userAns) ? userAns : [])}
                onChange={(vals) => handleAnswer(q.id, vals.join(''))}
                style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                {Object.entries(q.options).map(([key, val]) => (
                  <Checkbox key={key} value={key} style={{ fontSize: 14 }}>
                    <Text strong>{key}.</Text> {val}
                  </Checkbox>
                ))}
              </Checkbox.Group>
            ) : (
              <Radio.Group
                value={userAns}
                onChange={(e) => handleAnswer(q.id, e.target.value)}
                style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                {Object.entries(q.options).map(([key, val]) => (
                  <Radio key={key} value={key} style={{ fontSize: 14 }}>
                    <Text strong>{key}.</Text> {val}
                  </Radio>
                ))}
              </Radio.Group>
            )
          ) : (
            <Empty description="无选项" />
          )}
        </Card>

        {/* 题号导航 */}
        <Card size="small" style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {questions.map((qq, i) => {
              const answered = !!answers[qq.id]
              const isCurrent = i === currentIdx
              return (
                <Button
                  key={qq.id}
                  size="small"
                  type={isCurrent ? 'primary' : answered ? 'default' : 'dashed'}
                  style={{
                    width: 36,
                    height: 36,
                    background: answered && !isCurrent ? '#f6ffed' : undefined,
                    borderColor: answered ? '#52c41a' : undefined,
                  }}
                  onClick={() => setCurrentIdx(i)}
                >
                  {i + 1}
                </Button>
              )
            })}
          </div>
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <Button
              type="primary"
              size="large"
              loading={submitting}
              onClick={() => doSubmit(false)}
              icon={<CheckCircleOutlined />}
            >
              提交考试
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  // ===== 考试结果 =====
  if (phase === 'result' && result) {
    const wrongQuestions = result.questions.filter((q) => !q.is_correct)
    return (
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <Result
          status={result.passed ? 'success' : 'error'}
          title={
            <span>
              {result.passed ? '恭喜通过！' : '未通过'}
            </span>
          }
          subTitle={
            <Space direction="vertical" size={4}>
              <Title level={2} style={{ margin: 0 }}>
                {result.score} 分
              </Title>
              <Text type="secondary">
                正确 {result.correct_count} / {result.total_questions} 题，
                错误 {result.wrong_count} 题，
                用时 {formatTime(result.duration_seconds || 0)}
              </Text>
              <Text type="secondary">合格线：80 分</Text>
            </Space>
          }
          extra={[
            <Button type="primary" key="retry" onClick={startExam}>
              再考一次
            </Button>,
            <Button key="home" onClick={exitExam}>
              返回
            </Button>,
          ]}
        />

        {wrongQuestions.length > 0 ? (
          <Card title={<Text strong>错题回顾（{wrongQuestions.length} 道）</Text>} style={{ marginTop: 12 }}>
            {wrongQuestions.map((q, idx) => (
              <Card
                key={q.id}
                size="small"
                type="inner"
                style={{ marginBottom: 12 }}
                title={
                  <Space>
                    <Tag color={q.question_type === '多选' ? 'volcano' : 'cyan'}>{q.question_type}</Tag>
                    <Text>第 {idx + 1} 题</Text>
                  </Space>
                }
              >
                <Paragraph>{q.question_text}</Paragraph>
                {q.options ? (
                  <div style={{ marginBottom: 8 }}>
                    {Object.entries(q.options).map(([key, val]) => {
                      const isCorrect = q.correct_answer?.includes(key)
                      const isUserWrong = q.user_answer?.includes(key) && !isCorrect
                      return (
                        <div
                          key={key}
                          style={{
                            padding: '4px 8px',
                            marginBottom: 2,
                            borderRadius: 4,
                            background: isCorrect ? '#f6ffed' : isUserWrong ? '#fff2f0' : undefined,
                            border: isCorrect ? '1px solid #b7eb8f' : isUserWrong ? '1px solid #ffccc7' : '1px solid #f0f0f0',
                          }}
                        >
                          <Text strong>{key}.</Text> {val}
                          {isCorrect ? <CheckCircleOutlined style={{ color: '#52c41a', marginLeft: 8 }} /> : null}
                          {isUserWrong ? <CloseCircleOutlined style={{ color: '#ff4d4f', marginLeft: 8 }} /> : null}
                        </div>
                      )
                    })}
                  </div>
                ) : null}
                <Space direction="vertical" size={2} style={{ width: '100%' }}>
                  <div>
                    <Tag color="red">你的答案：{q.user_answer || '（未作答）'}</Tag>
                    <Tag color="green">正确答案：{q.correct_answer || '（无）'}</Tag>
                  </div>
                  {q.explanation ? (
                    <Paragraph type="secondary" style={{ fontSize: 12, margin: 0 }}>
                      <Text strong>解析：</Text>{q.explanation}
                    </Paragraph>
                  ) : null}
                </Space>
              </Card>
            ))}
          </Card>
        ) : (
          <Card style={{ marginTop: 12 }}>
            <Empty description="全部答对，无错题" />
          </Card>
        )}
      </div>
    )
  }

  // ===== 首页 =====
  return (
    <Spin spinning={phase === 'loading'}>
      <Card
        title={
          <Space>
            <ThunderboltOutlined />
            <Text strong>模拟考试</Text>
          </Space>
        }
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Card size="small" type="inner" style={{ height: '100%' }}>
                <Space direction="vertical" size={4}>
                  <Text strong>考试规则</Text>
                  <Text>• 考试时长：60 分钟</Text>
                  <Text>• 题目数量：50 道（35 道单选 + 15 道多选）</Text>
                  <Text>• 评分规则：满分 100 分，80 分及以上合格</Text>
                  <Text>• 评分标准：以标准答案为准</Text>
                  <Text>• 错题自动加入错题本</Text>
                </Space>
              </Card>
            </Col>

            <Col xs={24} md={12}>
              <Card
                size="small"
                type="inner"
                style={{ height: '100%' }}
                title={
              <Space>
                <SlidersOutlined />
                <Text strong>抽题策略</Text>
                {!decayDirty && <Tag color="green" style={{ marginLeft: 4 }}>已保存</Tag>}
                {decayDirty && <Tag color="orange" style={{ marginLeft: 4 }}>未保存</Tag>}
              </Space>
            }
            extra={
              <Tooltip title={isAtDefault ? '当前已是默认值' : '将滑块重置为默认值（不会立即保存）'}>
                <Button
                  size="small"
                  type="link"
                  disabled={isAtDefault}
                  onClick={handleResetDecay}
                >
                  恢复默认
                </Button>
              </Tooltip>
            }
          >
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  衰减因子（{decayRange.min} ~ {decayRange.max}，默认 {decayDefault}）：数值越小，出现过的题越难再次出现，未出现过的题更优先被选中。
                </Text>
              </div>
              <Space style={{ width: '100%' }} align="center">
                <Slider
                  style={{ flex: 1, minWidth: 220 }}
                  min={decayRange.min}
                  max={decayRange.max}
                  step={0.01}
                  value={pickDecay}
                  onChange={(v) => setPickDecay(clampDecay(v))}
                  tooltip={{ formatter: (v) => `${v}` }}
                />
                <InputNumber
                  size="small"
                  min={decayRange.min}
                  max={decayRange.max}
                  step={0.01}
                  value={pickDecay}
                  onChange={(v) => v != null && setPickDecay(clampDecay(v))}
                  style={{ width: 80 }}
                />
                <Button
                  type="primary"
                  size="small"
                  loading={savingDecay}
                  disabled={!decayDirty}
                  onClick={handleSaveDecay}
                >
                  保存
                </Button>
                <Button
                  size="small"
                  disabled={!decayDirty}
                  onClick={handleDiscardDecay}
                >
                  撤销
                </Button>
              </Space>
              <Card size="small" style={{ background: '#fafafa' }}>
                <Space direction="vertical" size={2} style={{ width: '100%' }}>
                  <Text style={{ fontSize: 12 }}>
                    <Tag color="cyan">从未出现</Tag> 权重 1.0
                  </Text>
                  <Text style={{ fontSize: 12 }}>
                    <Tag color="orange">出现 1 次</Tag> 权重 {Math.pow(pickDecay, 1).toFixed(3)}（未出现的 1/{Math.round(1 / pickDecay)}）
                  </Text>
                  <Text style={{ fontSize: 12 }}>
                    <Tag color="volcano">出现 2 次</Tag> 权重 {Math.pow(pickDecay, 2).toFixed(3)}（未出现的 1/{Math.round(1 / (pickDecay * pickDecay))}）
                  </Text>
                  <Text style={{ fontSize: 12 }}>
                    <Tag color="red">出现 3 次</Tag> 权重 {Math.pow(pickDecay, 3).toFixed(3)}
                  </Text>
                </Space>
              </Card>
            </Space>
          </Card>
            </Col>
          </Row>

          <Button
            type="primary"
            size="large"
            icon={<ThunderboltOutlined />}
            onClick={startExam}
            block
          >
            开始考试
          </Button>

          {history.length > 0 ? (
            <Card
              size="small"
              type="inner"
              title={<Text strong>最近考试记录</Text>}
              extra={
                <Button
                  size="small"
                  type="link"
                  icon={<HistoryOutlined />}
                  onClick={() => navigate('/exam/history')}
                >
                  查看全部
                </Button>
              }
            >
              {history.map((h) => (
                <div
                  key={h.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 0',
                    borderBottom: '1px solid #f0f0f0',
                  }}
                >
                  <Space>
                    <Tag color={h.passed ? 'green' : 'red'}>
                      {h.score} 分
                    </Tag>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {h.submitted_at ? new Date(h.submitted_at).toLocaleString('zh-CN') : '-'}
                    </Text>
                  </Space>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    正确 {h.correct_count}/{h.total_questions}，用时 {formatTime(h.duration_seconds || 0)}
                  </Text>
                </div>
              ))}
            </Card>
          ) : null}
        </Space>
      </Card>
    </Spin>
  )
}
