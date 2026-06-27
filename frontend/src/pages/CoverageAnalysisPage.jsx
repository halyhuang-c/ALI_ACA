import { useState, useEffect, useCallback } from 'react'
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
  Progress,
  Tooltip,
  Modal,
  Empty,
  message,
} from 'antd'
import {
  PieChartOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  MinusCircleOutlined,
  ReloadOutlined,
  EyeOutlined,
  RobotOutlined,
} from '@ant-design/icons'
import { getCoverageAnalysis } from '../api'

const { Text, Paragraph } = Typography

export default function CoverageAnalysisPage() {
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState(null)
  const [distribution, setDistribution] = useState({})
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [statusFilter, setStatusFilter] = useState(undefined)
  const [typeFilter, setTypeFilter] = useState(undefined)
  const [detailItem, setDetailItem] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, page_size: pageSize }
      if (statusFilter) params.status = statusFilter
      if (typeFilter) params.question_type = typeFilter
      const res = await getCoverageAnalysis(params)
      setSummary(res?.summary || null)
      setDistribution(res?.distribution || {})
      setItems(res?.items || [])
      setTotal(res?.total || 0)
    } catch (e) {
      message.error('加载覆盖率数据失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, statusFilter, typeFilter])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleStatusChange = (v) => {
    setStatusFilter(v)
    setPage(1)
  }

  const handleTypeChange = (v) => {
    setTypeFilter(v)
    setPage(1)
  }

  const handleRefresh = () => loadData()

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 70,
    },
    {
      title: '题型',
      dataIndex: 'question_type',
      width: 80,
      render: (v) =>
        v === '多选' ? (
          <Tag color="purple">多选</Tag>
        ) : (
          <Tag color="blue">单选</Tag>
        ),
    },
    {
      title: '状态',
      dataIndex: 'appeared',
      width: 100,
      render: (v) =>
        v ? (
          <Tag color="green" icon={<CheckCircleOutlined />}>
            已出现
          </Tag>
        ) : (
          <Tag color="default" icon={<MinusCircleOutlined />}>
            未出现
          </Tag>
        ),
    },
    {
      title: '出现次数',
      dataIndex: 'pick_count',
      width: 100,
      sorter: (a, b) => a.pick_count - b.pick_count,
      render: (v) => (v > 0 ? <Tag color="orange">{v} 次</Tag> : <Text type="secondary">-</Text>),
    },
    {
      title: '错答次数',
      dataIndex: 'wrong_count',
      width: 100,
      sorter: (a, b) => a.wrong_count - b.wrong_count,
      render: (v) =>
        v > 0 ? <Tag color="red">{v} 次</Tag> : <Text type="secondary">-</Text>,
    },
    {
      title: '上次抽中',
      dataIndex: 'last_picked_at',
      width: 160,
      render: (v) =>
        v ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {new Date(v).toLocaleString('zh-CN')}
          </Text>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      width: 120,
      render: (v) => (v ? <Tag>{v}</Tag> : <Text type="secondary">-</Text>),
    },
    {
      title: '题目',
      dataIndex: 'question_text',
      ellipsis: true,
      render: (v) => (
        <Tooltip title={v} placement="topLeft">
          <Text style={{ fontSize: 12 }}>{v}</Text>
        </Tooltip>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 90,
      fixed: 'right',
      render: (_, r) => (
        <Button
          size="small"
          type="link"
          icon={<EyeOutlined />}
          onClick={() => setDetailItem(r)}
        >
          明细
        </Button>
      ),
    },
  ]

  const distEntries = Object.entries(distribution)
    .map(([k, v]) => ({ times: Number(k), count: v }))
    .sort((a, b) => a.times - b.times)

  const coverageRate = summary?.coverage_rate ?? 0
  const singleRate =
    summary && summary.total_single
      ? Math.round((summary.appeared_single / summary.total_single) * 1000) / 10
      : 0
  const multiRate =
    summary && summary.total_multi
      ? Math.round((summary.appeared_multi / summary.total_multi) * 1000) / 10
      : 0

  return (
    <Spin spinning={loading}>
      <Card
        title={
          <Space>
            <PieChartOutlined />
            <Text strong>题目覆盖率分析</Text>
          </Space>
        }
        extra={
          <Space wrap>
            <Select
              value={statusFilter}
              onChange={handleStatusChange}
              style={{ width: 130 }}
              allowClear
              placeholder="出现状态"
              options={[
                { value: 'appeared', label: '已出现' },
                { value: 'unappeared', label: '未出现' },
              ]}
            />
            <Select
              value={typeFilter}
              onChange={handleTypeChange}
              style={{ width: 110 }}
              allowClear
              placeholder="题型"
              options={[
                { value: '单选', label: '单选题' },
                { value: '多选', label: '多选题' },
              ]}
            />
            <Tooltip title="刷新">
              <Button icon={<ReloadOutlined />} onClick={handleRefresh} />
            </Tooltip>
          </Space>
        }
      >
        {summary ? (
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="总覆盖率"
                  value={coverageRate}
                  suffix="%"
                  valueStyle={{ color: coverageRate >= 80 ? '#3f8600' : '#cf1322' }}
                />
                <Progress
                  percent={coverageRate}
                  size="small"
                  status={coverageRate >= 80 ? 'success' : 'active'}
                  style={{ marginTop: 8 }}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {summary.appeared_count} / {summary.total_questions} 题
                </Text>
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="已出现题目" value={summary.appeared_count} prefix={<CheckCircleOutlined />} />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  未出现：<Text strong>{summary.unappeared_count}</Text> 题
                </Text>
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="单选题覆盖" value={singleRate} suffix="%" />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {summary.appeared_single} / {summary.total_single} 题
                </Text>
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="多选题覆盖" value={multiRate} suffix="%" />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {summary.appeared_multi} / {summary.total_multi} 题
                </Text>
              </Card>
            </Col>
          </Row>
        ) : null}

        {distEntries.length > 0 ? (
          <Card size="small" type="inner" title={<Text strong>出现次数分布</Text>} style={{ marginBottom: 16 }}>
            <Space wrap>
              {distEntries.map((d) => (
                <Tag key={d.times} color={d.times >= 3 ? 'volcano' : d.times === 2 ? 'orange' : 'blue'}>
                  出现 {d.times} 次：{d.count} 题
                </Tag>
              ))}
            </Space>
          </Card>
        ) : null}

        <Table
          size="small"
          rowKey="id"
          columns={columns}
          dataSource={items}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: false,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p) => setPage(p),
          }}
          scroll={{ x: 990 }}
        />
      </Card>

      {/* 题目明细弹窗 */}
      <Modal
        open={!!detailItem}
        title={detailItem ? `题目明细 #${detailItem.id}` : ''}
        footer={null}
        width={720}
        onCancel={() => setDetailItem(null)}
      >
        {detailItem ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Space wrap>
              {detailItem.question_type === '多选' ? (
                <Tag color="purple">多选</Tag>
              ) : (
                <Tag color="blue">单选</Tag>
              )}
              {detailItem.category ? <Tag>{detailItem.category}</Tag> : null}
              {detailItem.subcategory ? <Tag color="blue">{detailItem.subcategory}</Tag> : null}
              {detailItem.appeared ? (
                <Tag color="green" icon={<CheckCircleOutlined />}>已出现 {detailItem.pick_count} 次</Tag>
              ) : (
                <Tag color="default" icon={<MinusCircleOutlined />}>未出现</Tag>
              )}
              {detailItem.wrong_count > 0 ? (
                <Tag color="red">错答 {detailItem.wrong_count} 次</Tag>
              ) : null}
              {detailItem.last_picked_at ? (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  上次抽中：{new Date(detailItem.last_picked_at).toLocaleString('zh-CN')}
                </Text>
              ) : null}
            </Space>

            <Paragraph style={{ marginBottom: 0 }}>{detailItem.full_text}</Paragraph>

            {detailItem.options ? (
              <div>
                <Text strong style={{ fontSize: 13 }}>选项：</Text>
                <div style={{ marginTop: 6 }}>
                  {Object.entries(detailItem.options).map(([key, val]) => {
                    const correctSet = new Set((detailItem.correct_answer || '').split('').map((c) => c.toUpperCase()))
                    const isCorrect = correctSet.has(key.toUpperCase())
                    return (
                      <div
                        key={key}
                        style={{
                          padding: '6px 10px',
                          marginBottom: 4,
                          borderRadius: 4,
                          background: isCorrect ? '#f6ffed' : undefined,
                          border: isCorrect ? '1px solid #b7eb8f' : '1px solid #f0f0f0',
                        }}
                      >
                        <Text strong>{key}.</Text> {val}
                        {isCorrect ? (
                          <CheckCircleOutlined style={{ color: '#52c41a', marginLeft: 8 }} />
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}

            <Space size={8} wrap>
              <Tag color="green">标准答案：{detailItem.correct_answer || '（无）'}</Tag>
              {detailItem.ai_answer ? (
                <Tag color={detailItem.ai_is_correct === true ? 'geekblue' : detailItem.ai_is_correct === false ? 'purple' : 'default'}>
                  <RobotOutlined /> AI答案：{detailItem.ai_answer}
                  {detailItem.ai_is_correct === true ? '（一致）' : detailItem.ai_is_correct === false ? '（不一致）' : ''}
                </Tag>
              ) : (
                <Tag color="default"><RobotOutlined /> 暂无AI答案</Tag>
              )}
              {detailItem.ai_model ? <Tag color="blue">{detailItem.ai_model}</Tag> : null}
            </Space>

            {detailItem.ai_explanation ? (
              <div style={{ background: '#fafafa', padding: 12, borderRadius: 6 }}>
                <Space size={4} style={{ marginBottom: 6 }}>
                  <RobotOutlined style={{ color: '#1677ff' }} />
                  <Text strong style={{ fontSize: 13 }}>AI 题目分析</Text>
                </Space>
                <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 13 }}>
                  {detailItem.ai_explanation}
                </Paragraph>
              </div>
            ) : null}
          </Space>
        ) : (
          <Empty />
        )}
      </Modal>
    </Spin>
  )
}
