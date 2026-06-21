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

export default function ExamHistoryPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [passedFilter, setPassedFilter] = useState(undefined)
  const [stats, setStats] = useState({ total: 0, passed: 0, avg_score: 0, best_score: 0 })

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
