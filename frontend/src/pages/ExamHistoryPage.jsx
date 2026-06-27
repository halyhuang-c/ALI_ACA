import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Typography,
  Space,
  Button,
  Spin,
  Tag,
  Statistic,
  Row,
  Col,
  Select,
  Table,
  Empty,
  message,
} from 'antd'
import {
  HistoryOutlined,
  ThunderboltOutlined,
  RollbackOutlined,
  TrophyOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons'
import { getExamHistory } from '../api'

const { Text } = Typography

function formatTime(seconds) {
  if (!seconds && seconds !== 0) return '-'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}分${s}秒`
}

// 纯 SVG 分数走势图（无第三方图表依赖）
function ScoreTrendChart({ items, passScore = 80 }) {
  const W = 820
  const H = 150
  const padL = 44, padR = 24, padT = 20, padB = 32
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const yMax = 100

  if (!items.length) return <Empty description="暂无考试数据" />

  const n = items.length
  const xStep = n > 1 ? plotW / (n - 1) : 0
  const pts = items.map((it, i) => ({
    x: padL + i * xStep,
    y: padT + plotH - ((it.score || 0) / yMax) * plotH,
    ...it,
  }))
  const pathD = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ')
  const passY = padT + plotH - (passScore / yMax) * plotH
  const yTicks = [0, 20, 40, 60, 80, 100]
  const showAllLabels = n <= 20
  const xLabelStep = Math.ceil(n / 12)

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        {/* y 刻度网格线 + 标签 */}
        {yTicks.map((t) => {
          const y = padT + plotH - (t / yMax) * plotH
          return (
            <g key={t}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#f0f0f0" strokeWidth={1} />
              <text x={padL - 8} y={y + 4} textAnchor="end" fontSize={11} fill="#999">{t}</text>
            </g>
          )
        })}
        {/* 合格基准线 */}
        <line
          x1={padL} y1={passY} x2={W - padR} y2={passY}
          stroke="#fa8c16" strokeWidth={1.5} strokeDasharray="6 4"
        />
        {/* 分数折线 */}
        <path d={pathD} fill="none" stroke="#1677ff" strokeWidth={2} />
        {/* 分数点 */}
        {pts.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x} cy={p.y} r={4}
              fill={p.passed ? '#52c41a' : '#ff4d4f'}
              stroke="#fff" strokeWidth={1.5}
            >
              <title>{`第 ${i + 1} 次\n分数：${p.score}\n${p.submitted_at ? new Date(p.submitted_at).toLocaleString('zh-CN') : ''}\n正确：${p.correct_count}/${p.total_questions}`}</title>
            </circle>
            {showAllLabels ? (
              <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize={10} fill={p.passed ? '#52c41a' : '#ff4d4f'}>
                {p.score}
              </text>
            ) : null}
          </g>
        ))}
        {/* x 轴序号标签 */}
        {pts.map((p, i) => {
          if (!showAllLabels && i % xLabelStep !== 0 && i !== n - 1) return null
          return (
            <text key={i} x={p.x} y={H - padB + 14} textAnchor="middle" fontSize={10} fill="#999">
              {i + 1}
            </text>
          )
        })}
      </svg>
      {/* 图例（放在图表下方） */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 4 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <span style={{ display: 'inline-block', width: 18, height: 0, borderTop: '2px dashed #fa8c16' }} />
          <span style={{ color: '#fa8c16' }}>合格线 {passScore} 分</span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#52c41a', border: '1.5px solid #fff' }} />
          <span style={{ color: '#52c41a' }}>合格</span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#ff4d4f', border: '1.5px solid #fff' }} />
          <span style={{ color: '#ff4d4f' }}>未通过</span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <span style={{ display: 'inline-block', width: 18, height: 2, background: '#1677ff' }} />
          <span style={{ color: '#1677ff' }}>分数走势</span>
        </span>
      </div>
    </div>
  )
}

export default function ExamHistoryPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [passedFilter, setPassedFilter] = useState(undefined)
  const [stats, setStats] = useState({ total: 0, passed: 0, avg_score: 0, best_score: 0 })
  const [chartItems, setChartItems] = useState([])

  const loadChartData = useCallback(async () => {
    try {
      const res = await getExamHistory(1, 500)
      setChartItems([...(res?.items || [])].reverse())
    } catch (e) {}
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getExamHistory(page, pageSize, passedFilter)
      setItems(res?.items || [])
      setTotal(res?.total || 0)
      setStats(res?.stats || { total: 0, passed: 0, avg_score: 0, best_score: 0 })
    } catch (e) {
      message.error('加载历史记录失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, passedFilter])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    loadChartData()
  }, [loadChartData])

  const handleFilterChange = (v) => {
    setPassedFilter(v)
    setPage(1)
  }

  const columns = [
    {
      title: '#',
      dataIndex: 'id',
      width: 70,
      render: (id) => <Text type="secondary">#{id}</Text>,
    },
    {
      title: '提交时间',
      dataIndex: 'submitted_at',
      width: 180,
      render: (v) => (
        <Text style={{ fontSize: 12 }}>
          {v ? new Date(v).toLocaleString('zh-CN') : '-'}
        </Text>
      ),
    },
    {
      title: '分数',
      dataIndex: 'score',
      width: 100,
      render: (score, r) => (
        <Tag color={r.passed ? 'green' : 'red'} style={{ fontSize: 13 }}>
          {score} 分
        </Tag>
      ),
      sorter: (a, b) => (a.score || 0) - (b.score || 0),
    },
    {
      title: '结果',
      dataIndex: 'passed',
      width: 90,
      render: (passed) =>
        passed ? (
          <Tag color="success" icon={<CheckCircleOutlined />}>合格</Tag>
        ) : (
          <Tag color="error">未通过</Tag>
        ),
    },
    {
      title: '正确率',
      width: 140,
      render: (_, r) => (
        <Text style={{ fontSize: 13 }}>
          {r.correct_count} / {r.total_questions}
          <Text type="secondary" style={{ fontSize: 12 }}>
            {' '}(错 {r.wrong_count})
          </Text>
        </Text>
      ),
    },
    {
      title: '用时',
      dataIndex: 'duration_seconds',
      width: 110,
      render: (v) => <Text type="secondary">{formatTime(v)}</Text>,
    },
  ]

  return (
    <Spin spinning={loading}>
      <Card
        title={
          <Space>
            <HistoryOutlined />
            <Text strong>考试历史</Text>
          </Space>
        }
        extra={
          <Space>
            <Select
              value={passedFilter}
              onChange={handleFilterChange}
              style={{ width: 140 }}
              allowClear
              placeholder="全部"
              options={[
                { value: true, label: '仅合格' },
                { value: false, label: '仅未通过' },
              ]}
            />
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              onClick={() => navigate('/exam')}
            >
              去考试
            </Button>
          </Space>
        }
        style={{ marginBottom: 12 }}
      >
        <Row gutter={16}>
          <Col span={6}>
            <Card size="small">
              <Statistic title="考试次数" value={stats.total} prefix={<HistoryOutlined />} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="合格次数"
                value={stats.passed}
                valueStyle={{ color: '#52c41a' }}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="平均分"
                value={stats.avg_score}
                precision={1}
                prefix={<ThunderboltOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="最高分"
                value={stats.best_score}
                precision={1}
                valueStyle={{ color: '#fa8c16' }}
                prefix={<TrophyOutlined />}
              />
            </Card>
          </Col>
        </Row>
      </Card>

      {/* 分数走势图 */}
      <Card
        size="small"
        title={
          <Space>
            <ThunderboltOutlined />
            <Text strong>分数走势</Text>
          </Space>
        }
        style={{ marginBottom: 12 }}
      >
        <ScoreTrendChart items={chartItems} passScore={80} />
      </Card>

      <Card>
        {items.length === 0 ? (
          <Empty description="暂无考试记录" />
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={items}
            pagination={{
              current: page,
              pageSize,
              total,
              onChange: (p) => setPage(p),
              showTotal: (t) => `共 ${t} 次考试`,
              showSizeChanger: false,
            }}
            size="middle"
          />
        )}
      </Card>

      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <Button
          type="link"
          icon={<RollbackOutlined />}
          onClick={() => navigate('/exam')}
        >
          返回模拟考试
        </Button>
      </div>
    </Spin>
  )
}
