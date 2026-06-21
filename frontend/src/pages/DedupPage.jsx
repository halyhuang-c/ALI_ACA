import { useEffect, useState, useCallback } from 'react'
import {
  Card,
  Statistic,
  Row,
  Col,
  Input,
  Switch,
  Spin,
  Empty,
  Tag,
  Collapse,
  Typography,
  Space,
  Tooltip,
  Progress,
} from 'antd'
import {
  CopyOutlined,
  CheckCircleFilled,
  WarningFilled,
  NumberOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { getDedupDetail } from '../api'

const { Text, Paragraph } = Typography

function truncate(s, n = 40) {
  if (!s) return ''
  return s.length > n ? s.slice(0, n) + '...' : s
}

function DedupPage() {
  const [keyword, setKeyword] = useState('')
  const [onlyDuplicates, setOnlyDuplicates] = useState(false)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getDedupDetail({
        keyword: keyword.trim() || undefined,
        only_duplicates: onlyDuplicates,
      })
      setData(res)
    } catch (e) {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [keyword, onlyDuplicates])

  useEffect(() => {
    load()
  }, [load])

  const summary = data?.summary || {}
  const groups = data?.groups || []
  const dupGroups = groups.filter((g) => g.members.length > 1)

  return (
    <Spin spinning={loading}>
      <div className="page-title">去重详情</div>
      <div className="page-subtitle">
        基于「题干文本标准化 + MD5 哈希 + 模糊匹配」方法排重，相似度 ≥ 85% 的题目也会被归为重复组
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic title="题目总数" value={summary.total_questions || 0} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic
              title="去重后(主题)"
              value={summary.total_unique || 0}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic
              title="重复题数"
              value={summary.total_duplicates || 0}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic title="去重率" value={((summary.dedup_rate || 0) * 100).toFixed(1)} suffix="%" />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic title="哈希分组数" value={summary.group_count || 0} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic
              title="有重复的组"
              value={dupGroups.length}
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        style={{ marginBottom: 16 }}
        extra={
          <Space>
            <span>仅看重复题</span>
            <Switch
              checked={onlyDuplicates}
              onChange={(v) => setOnlyDuplicates(v)}
            />
            <Tooltip title="刷新">
              <ReloadOutlined onClick={load} style={{ cursor: 'pointer' }} />
            </Tooltip>
          </Space>
        }
      >
        <Input.Search
          placeholder="按题干/标准化文本关键字检索分组"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onSearch={load}
          allowClear
          style={{ maxWidth: 420 }}
        />
      </Card>

      {groups.length === 0 ? (
        <div className="empty-wrap">
          <Empty description="暂无去重数据，请先运行识别+去重流程" />
        </div>
      ) : (
        <Collapse
          accordion={false}
          items={groups.map((g, idx) => {
            const count = g.members.length
            const hasDup = count > 1
            return {
              key: g.dedup_hash || idx,
              label: (
                <Space size={8} wrap>
                  {hasDup ? (
                    <Tag color="warning" icon={<WarningFilled />}>
                      重复组 ×{count}
                    </Tag>
                  ) : (
                    <Tag color="success" icon={<CheckCircleFilled />}>
                      唯一
                    </Tag>
                  )}
                  {g.is_fuzzy ? (
                    <Tag color="purple">模糊匹配</Tag>
                  ) : null}
                  <Text strong style={{ maxWidth: 520 }} ellipsis>
                    {truncate(g.members[0]?.question_text, 50)}
                  </Text>
                  <Tooltip title={g.dedup_hash || '无哈希'}>
                    <Tag icon={<NumberOutlined />} color="default" style={{ fontFamily: 'monospace' }}>
                      {(g.dedup_hash || '—').slice(0, 8)}
                    </Tag>
                  </Tooltip>
                </Space>
              ),
              children: (
                <div>
                  <div style={{ marginBottom: 12, padding: 12, background: '#f6f8fa', borderRadius: 8 }}>
                    <Space size={6} style={{ marginBottom: 4 }}>
                      <CopyOutlined style={{ color: '#8c8c8c' }} />
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        标准化文本（去空白/标点/统一小写，保留中文）
                      </Text>
                    </Space>
                    <Paragraph
                      style={{ margin: 0, fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all' }}
                    >
                      {g.norm_text || '（空）'}
                    </Paragraph>
                    {g.dedup_hash ? (
                      <div style={{ marginTop: 6 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>MD5：</Text>
                        <Text code style={{ fontSize: 12 }}>{g.dedup_hash}</Text>
                      </div>
                    ) : null}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {g.members.map((m) => {
                      const isPrimary = !m.is_duplicate
                      return (
                        <div
                          key={m.id}
                          style={{
                            padding: 10,
                            borderRadius: 6,
                            border: `1px solid ${isPrimary ? '#b7eb8f' : '#d9d9d9'}`,
                            background: isPrimary ? '#f6ffed' : '#fafafa',
                          }}
                        >
                          <Space size={8} wrap>
                            {isPrimary ? (
                              <Tag color="success">主题 #{m.id}</Tag>
                            ) : (
                              <Tag color="default">重复 #{m.id}</Tag>
                            )}
                            {m.duplicate_of_id ? (
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                指向 #{m.duplicate_of_id}
                              </Text>
                            ) : null}
                            {m.image_id ? (
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                来源图 #{m.image_id}
                              </Text>
                            ) : null}
                            {m.similarity != null ? (
                              <Tag color="purple" style={{ fontSize: 11 }}>
                                相似度 {(m.similarity * 100).toFixed(1)}%
                              </Tag>
                            ) : null}
                          </Space>
                          <Paragraph style={{ margin: '6px 0 0', color: 'rgba(0,0,0,0.75)' }}>
                            {m.question_text}
                          </Paragraph>
                          {m.options && typeof m.options === 'object' ? (
                            <div style={{ marginTop: 6 }}>
                              {Object.entries(m.options).sort(([a],[b]) => a.localeCompare(b)).map(([key, value]) => (
                                <div key={key} style={{ fontSize: 12, color: 'rgba(0,0,0,0.65)', padding: '2px 0' }}>
                                  <Text strong style={{ fontSize: 12 }}>{key}.</Text> {value}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ),
            }
          })}
          defaultActiveKey={[]}
        />
      )}

      {dupGroups.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <Progress
            percent={Math.round(((summary.total_duplicates || 0) / (summary.total_questions || 1)) * 100)}
            status="active"
            format={() =>
              `重复题占 ${(Math.round(((summary.total_duplicates || 0) / (summary.total_questions || 1)) * 1000) / 10)}%`
            }
          />
        </div>
      ) : null}
    </Spin>
  )
}

export default DedupPage
