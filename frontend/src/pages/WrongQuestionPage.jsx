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
  Pagination,
  Empty,
  Popconfirm,
  Tooltip,
  Collapse,
  message,
} from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  EyeOutlined,
  ReloadOutlined,
  BookOutlined,
  RobotOutlined,
} from '@ant-design/icons'
import {
  getWrongQuestions,
  reviewWrongQuestion,
  deleteWrongQuestion,
  getWrongQuestionStats,
} from '../api'

const { Text, Paragraph } = Typography

export default function WrongQuestionPage() {
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [reviewedFilter, setReviewedFilter] = useState(undefined)
  const [wrongTimes, setWrongTimes] = useState(undefined)
  const [stats, setStats] = useState({ total: 0, reviewed: 0, pending: 0 })

  const loadStats = useCallback(async () => {
    try {
      const res = await getWrongQuestionStats()
      setStats(res || { total: 0, reviewed: 0, pending: 0 })
    } catch (e) {}
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, page_size: pageSize }
      if (reviewedFilter !== undefined && reviewedFilter !== null) params.reviewed = reviewedFilter
      if (wrongTimes !== undefined && wrongTimes !== null) params.wrong_times = wrongTimes
      const res = await getWrongQuestions(params)
      setItems(res?.items || [])
      setTotal(res?.total || 0)
    } catch (e) {
      message.error('加载错题本失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, reviewedFilter, wrongTimes])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const handleReview = async (id, reviewed) => {
    try {
      await reviewWrongQuestion(id, reviewed)
      message.success(reviewed ? '已标记为已复习' : '已标记为未复习')
      loadData()
      loadStats()
    } catch (e) {
      message.error('操作失败')
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteWrongQuestion(id)
      message.success('已删除')
      loadData()
      loadStats()
    } catch (e) {
      message.error('删除失败')
    }
  }

  const handleFilterChange = (v) => {
    setReviewedFilter(v)
    setPage(1)
  }

  const handleWrongTimesChange = (v) => {
    setWrongTimes(v)
    setPage(1)
  }

  const handleRefresh = () => {
    loadData()
    loadStats()
  }

  return (
    <Spin spinning={loading}>
      <Card
        title={
          <Space>
            <BookOutlined />
            <Text strong>错题本</Text>
          </Space>
        }
        extra={
          <Space wrap>
            <Space size={4}>
              <Text type="secondary" style={{ fontSize: 12 }}>复习状态</Text>
              <Select
                value={reviewedFilter}
                onChange={handleFilterChange}
                style={{ width: 120 }}
                allowClear
                placeholder="全部"
                options={[
                  { value: false, label: '未复习' },
                  { value: true, label: '已复习' },
                ]}
              />
            </Space>
            <Space size={4}>
              <Text type="secondary" style={{ fontSize: 12 }}>错答次数</Text>
              <Select
                value={wrongTimes}
                onChange={handleWrongTimesChange}
                style={{ width: 130 }}
                allowClear
                placeholder="全部"
                options={[
                  { value: 1, label: '1 次' },
                  { value: 2, label: '2 次' },
                  { value: 3, label: '3 次' },
                  { value: 4, label: '4 次' },
                  { value: 5, label: '5 次及以上' },
                ]}
              />
            </Space>
            <Tooltip title="刷新">
              <Button icon={<ReloadOutlined />} onClick={handleRefresh} />
            </Tooltip>
          </Space>
        }
        style={{ marginBottom: 12 }}
      >
        <Row gutter={16}>
          <Col span={8}>
            <Card size="small">
              <Statistic title="错题总数" value={stats.total} prefix={<BookOutlined />} />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small">
              <Statistic
                title="已复习"
                value={stats.reviewed}
                valueStyle={{ color: '#52c41a' }}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small">
              <Statistic
                title="待复习"
                value={stats.pending}
                valueStyle={{ color: '#faad14' }}
                prefix={<EyeOutlined />}
              />
            </Card>
          </Col>
        </Row>
      </Card>

      {items.length === 0 ? (
        <Card>
          <Empty description="暂无错题记录" />
        </Card>
      ) : (
        <>
          {items.map((w) => {
            const q = w.question
            if (!q) {
              return (
                <Card key={w.id} size="small" style={{ marginBottom: 12 }}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Text type="secondary">题目已删除（ID: {w.question_id}）</Text>
                    <Popconfirm
                      title="确定删除该错题记录？"
                      onConfirm={() => handleDelete(w.id)}
                    >
                      <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                  </Space>
                </Card>
              )
            }
            const correctSet = new Set((w.correct_answer || '').split('').map((c) => c.toUpperCase()))
            const userSet = new Set((w.user_answer || '').split('').map((c) => c.toUpperCase()))
            return (
              <Card
                key={w.id}
                size="small"
                style={{ marginBottom: 12 }}
                title={
                  <Space>
                    <Tag color={q.question_type === '多选' ? 'volcano' : 'cyan'}>
                      {q.question_type || '未知'}
                    </Tag>
                    {q.category ? <Tag>{q.category}</Tag> : null}
                    {q.subcategory ? <Tag color="blue">{q.subcategory}</Tag> : null}
                    {w.wrong_count > 1 ? (
                      <Tooltip title="该题在历次考试中的累计错答次数">
                        <Tag color="red">错 {w.wrong_count} 次</Tag>
                      </Tooltip>
                    ) : null}
                    {w.reviewed ? (
                      <Tag color="green" icon={<CheckCircleOutlined />}>已复习</Tag>
                    ) : (
                      <Tag color="orange" icon={<EyeOutlined />}>待复习</Tag>
                    )}
                  </Space>
                }
                extra={
                  <Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {w.created_at ? new Date(w.created_at).toLocaleString('zh-CN') : ''}
                    </Text>
                    {w.reviewed ? (
                      <Button
                        size="small"
                        onClick={() => handleReview(w.id, false)}
                      >
                        标记未复习
                      </Button>
                    ) : (
                      <Button
                        size="small"
                        type="primary"
                        ghost
                        icon={<CheckCircleOutlined />}
                        onClick={() => handleReview(w.id, true)}
                      >
                        标记已复习
                      </Button>
                    )}
                    <Popconfirm
                      title="确定删除该错题记录？"
                      onConfirm={() => handleDelete(w.id)}
                    >
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                }
              >
                <Paragraph style={{ marginBottom: 12 }}>{q.question_text}</Paragraph>

                {q.options ? (
                  <div style={{ marginBottom: 12 }}>
                    {Object.entries(q.options).map(([key, val]) => {
                      const isCorrect = correctSet.has(key.toUpperCase())
                      const isUserWrong = userSet.has(key.toUpperCase()) && !isCorrect
                      return (
                        <div
                          key={key}
                          style={{
                            padding: '4px 8px',
                            marginBottom: 2,
                            borderRadius: 4,
                            background: isCorrect ? '#f6ffed' : isUserWrong ? '#fff2f0' : undefined,
                            border: isCorrect
                              ? '1px solid #b7eb8f'
                              : isUserWrong
                              ? '1px solid #ffccc7'
                              : '1px solid #f0f0f0',
                          }}
                        >
                          <Text strong>{key}.</Text> {val}
                          {isCorrect ? (
                            <CheckCircleOutlined style={{ color: '#52c41a', marginLeft: 8 }} />
                          ) : null}
                          {isUserWrong ? (
                            <CloseCircleOutlined style={{ color: '#ff4d4f', marginLeft: 8 }} />
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                ) : null}

                <Space size={8} wrap>
                  <Tag color="red">你的答案：{w.user_answer || '（未作答）'}</Tag>
                  <Tag color="green">正确答案：{w.correct_answer || '（无）'}</Tag>
                  {q.ai_answer ? (
                    <Tag color={q.ai_is_correct === true ? 'geekblue' : q.ai_is_correct === false ? 'purple' : 'default'}>
                      <RobotOutlined /> AI答案：{q.ai_answer}
                      {q.ai_is_correct !== null && q.ai_is_correct !== undefined ? (
                        q.ai_is_correct ? '（与标准答案一致）' : '（与标准答案不一致）'
                      ) : null}
                    </Tag>
                  ) : (
                    <Tag color="default"><RobotOutlined /> 暂无AI答案</Tag>
                  )}
                </Space>

                {q.correct_answer && q.correct_answer !== w.correct_answer ? (
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      最新正确答案：{q.correct_answer}
                    </Text>
                  </div>
                ) : null}

                {/* AI 分析结果（可展开） */}
                {q.ai_explanation ? (
                  <div style={{ marginTop: 12 }}>
                    <Collapse
                      size="small"
                      items={[{
                        key: 'ai-analysis',
                        label: (
                          <Space size={4}>
                            <RobotOutlined style={{ color: '#1677ff' }} />
                            <Text strong style={{ fontSize: 13 }}>AI 题目分析</Text>
                            {q.ai_model ? (
                              <Tag color="blue" style={{ fontSize: 11 }}>{q.ai_model}</Tag>
                            ) : null}
                            {q.ai_review_status ? (
                              <Tag style={{ fontSize: 11 }}>{q.ai_review_status}</Tag>
                            ) : null}
                          </Space>
                        ),
                        children: (
                          <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 13 }}>
                            {q.ai_explanation}
                          </Paragraph>
                        ),
                      }]}
                    />
                  </div>
                ) : null}
              </Card>
            )
          })}

          <div style={{ textAlign: 'right', marginTop: 16 }}>
            <Pagination
              current={page}
              pageSize={pageSize}
              total={total}
              onChange={(p) => setPage(p)}
              showTotal={(t) => `共 ${t} 条`}
              showSizeChanger={false}
            />
          </div>
        </>
      )}
    </Spin>
  )
}
