import { useEffect, useState, useCallback } from 'react'
import {
  Input,
  Button,
  Table,
  Tag,
  Drawer,
  Tabs,
  Pagination,
  Spin,
  Empty,
  Space,
  Card,
  Typography,
  Image as AntImage,
  Tooltip,
  message,
} from 'antd'
import {
  ReloadOutlined,
  ExclamationCircleOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import { searchQuestions, getQuestionsByIds, getCategories, getImageResponseDetail } from '../api'

const { Text, Paragraph } = Typography

const PRE_STYLE = {
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  background: '#f6f8fa',
  padding: 12,
  borderRadius: 8,
  fontSize: 12,
  fontFamily: 'Consolas, Menlo, monospace',
  marginTop: 6,
}

function JsonBlock({ value }) {
  let text
  if (value == null || value === '') text = '(空)'
  else if (typeof value === 'string') text = value
  else {
    try {
      text = JSON.stringify(value, null, 2)
    } catch (e) {
      text = String(value)
    }
  }
  return <pre style={PRE_STYLE}>{text}</pre>
}

function RawResponsesPage() {
  const [keyword, setKeyword] = useState('')
  const [submittedKeyword, setSubmittedKeyword] = useState('')
  const [category, setCategory] = useState(undefined)
  const [categoryTree, setCategoryTree] = useState([])
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [data, setData] = useState({ items: [], total: 0 })
  const [loading, setLoading] = useState(false)

  // 重复题目抽屉
  const [dupDrawerOpen, setDupDrawerOpen] = useState(false)
  const [dupDrawerLoading, setDupDrawerLoading] = useState(false)
  const [dupDrawerItems, setDupDrawerItems] = useState([])
  const [dupDrawerPrimary, setDupDrawerPrimary] = useState(null)

  // 原始响应抽屉
  const [rawDrawerOpen, setRawDrawerOpen] = useState(false)
  const [rawDrawerLoading, setRawDrawerLoading] = useState(false)
  const [rawDetail, setRawDetail] = useState(null)
  const [rawQuestion, setRawQuestion] = useState(null)

  const loadCategories = useCallback(async () => {
    try {
      const res = await getCategories()
      setCategoryTree(res?.categories || [])
    } catch (e) {}
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await searchQuestions({
        page,
        page_size: pageSize,
        keyword: submittedKeyword || undefined,
        category: category || undefined,
      })
      setData({ items: res?.items || [], total: res?.total || 0 })
    } catch {
      message.error('加载题目列表失败')
      setData({ items: [], total: 0 })
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, submittedKeyword, category])

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSearch = (val) => {
    setSubmittedKeyword(val || '')
    setPage(1)
  }

  const openDupDrawer = async (record) => {
    setDupDrawerPrimary(record)
    setDupDrawerOpen(true)
    if (!record.duplicate_ids || record.duplicate_ids.length === 0) {
      setDupDrawerItems([])
      return
    }
    setDupDrawerLoading(true)
    try {
      const items = await getQuestionsByIds(record.duplicate_ids)
      setDupDrawerItems(Array.isArray(items) ? items : [])
    } catch {
      message.error('加载重复题目详情失败')
      setDupDrawerItems([])
    } finally {
      setDupDrawerLoading(false)
    }
  }

  const openRawDrawer = async (record) => {
    setRawQuestion(record)
    setRawDrawerOpen(true)
    setRawDrawerLoading(true)
    setRawDetail(null)
    try {
      const res = await getImageResponseDetail(record.image_id)
      setRawDetail(res)
    } catch {
      message.error('加载AI题目解析失败')
    } finally {
      setRawDrawerLoading(false)
    }
  }

  const columns = [
    {
      title: '#',
      dataIndex: 'id',
      key: 'id',
      width: 60,
      render: (id) => <Text type="secondary">#{id}</Text>,
    },
    {
      title: '题干',
      dataIndex: 'question_text',
      key: 'question_text',
      render: (text) => (
        <Paragraph ellipsis={{ rows: 2, tooltip: text }} style={{ margin: 0, maxWidth: 360 }}>
          {text}
        </Paragraph>
      ),
    },
    {
      title: '标准答案',
      dataIndex: 'correct_answer',
      key: 'correct_answer',
      width: 100,
      render: (v) => v ? <Tag color="gold">{v}</Tag> : <Text type="secondary">-</Text>,
    },
    {
      title: 'AI 答案',
      dataIndex: 'answer_text',
      key: 'answer_text',
      width: 120,
      render: (v, r) => (
        <Space size={4}>
          {v ? <Tag color="blue">{v}</Tag> : <Text type="secondary">-</Text>}
          {r.answer_model ? <Text type="secondary" style={{ fontSize: 11 }}>{r.answer_model}</Text> : null}
        </Space>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (cat, r) => (
        <Space size={4}>
          {cat ? <Tag color="purple">{cat}</Tag> : null}
          {r.subcategory && r.subcategory !== cat ? <Tag color="magenta">{r.subcategory}</Tag> : null}
        </Space>
      ),
    },
    {
      title: '重复题目',
      key: 'duplicates',
      width: 150,
      render: (_, r) => {
        const ids = r.duplicate_ids || []
        if (ids.length === 0) return <Text type="secondary" style={{ fontSize: 12 }}>无</Text>
        return (
          <Button
            size="small"
            type="link"
            style={{ padding: 0, height: 'auto' }}
            onClick={() => openDupDrawer(r)}
          >
            <Space size={4}>
              {r.duplicate_answer_conflict ? (
                <Tooltip title="重复题目中存在标准答案不一致">
                  <ExclamationCircleOutlined style={{ color: '#faad14' }} />
                </Tooltip>
              ) : null}
              <span>{ids.length} 道重复</span>
            </Space>
          </Button>
        )
      },
    },
    {
      title: '来源图',
      key: 'image',
      width: 80,
      render: (_, r) => (
        r.image_id ? (
          <Tooltip title={r.image_filename || `图 #${r.image_id}`}>
            <AntImage
              src={`/api/images/${r.image_id}/file`}
              width={40}
              height={40}
              style={{ objectFit: 'cover', borderRadius: 4, border: '1px solid #f0f0f0' }}
              preview={{
                zoomCtrl: true,
                rotateCtrl: true,
                scaleStep: 0.25,
                minScale: 0.2,
                maxScale: 10,
              }}
              fallback="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMTIwIi8+"
            />
          </Tooltip>
        ) : <Text type="secondary">-</Text>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_, r) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => openRawDrawer(r)}
        >
          AI题目解析
        </Button>
      ),
    },
  ]

  // 原始响应抽屉内容
  const image = rawDetail?.image
  const rawExtract = image?.raw_extract_response
  const answers = rawDetail?.answers || []

  const rawTabItems = [
    {
      key: 'extract',
      label: '识别响应',
      children: (
        <div>
          <Text strong>原始文本 (raw)</Text>
          <JsonBlock value={rawExtract?.raw} />
          <div style={{ height: 16 }} />
          <Text strong>解析结果 (parsed)</Text>
          <JsonBlock value={rawExtract?.parsed} />
        </div>
      ),
    },
    {
      key: 'answer',
      label: `答题响应${answers.length ? ` (${answers.length})` : ''}`,
      children: answers.length ? (
        <Space direction="vertical" size={12} style={{ display: 'block' }}>
          {answers.map((a, i) => (
            <Card key={a.question_id || i} size="small" title={`题目 ${i + 1}`}>
              {a.question_text ? (
                <Text type="secondary">{a.question_text}</Text>
              ) : null}
              {a.model ? (
                <div style={{ marginTop: 6 }}>
                  <Tag color="blue">{a.model}</Tag>
                </div>
              ) : null}
              <div style={{ marginTop: 8 }}>
                <Text strong>原始文本</Text>
              </div>
              <JsonBlock value={a.raw_response?.raw} />
              <div style={{ marginTop: 8 }}>
                <Text strong>解析结果</Text>
              </div>
              <JsonBlock value={a.raw_response?.parsed} />
            </Card>
          ))}
        </Space>
      ) : (
        <Empty description="暂无答题响应" />
      ),
    },
  ]

  return (
    <Spin spinning={loading}>
      <div className="page-title">AI题目解析</div>
      <div className="page-subtitle">
        仅展示去重后的非重复题目（共 {data.total} 道），点击「重复题目」列可查看重复题目详情，点击「AI题目解析」查看大模型原始返回
      </div>

      <div className="search-bar">
        <Input.Search
          placeholder="按关键字搜索题目"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onSearch={handleSearch}
          allowClear
          style={{ maxWidth: 360 }}
        />
        <select
          value={category || ''}
          onChange={(e) => { setCategory(e.target.value || undefined); setPage(1) }}
          style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #d9d9d9' }}
        >
          <option value="">全部分类</option>
          {categoryTree.map((c) => (
            <option key={c.name} value={c.name}>{c.name}（{c.count}）</option>
          ))}
        </select>
        <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={data.items}
        pagination={false}
        size="middle"
        rowClassName={(r) => r.is_correct === false ? 'row-answer-mismatch' : ''}
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <Pagination
          current={page}
          pageSize={pageSize}
          total={data.total}
          onChange={(p) => setPage(p)}
          showTotal={(t) => `共 ${t} 条`}
          showSizeChanger={false}
        />
      </div>

      {/* 重复题目抽屉 */}
      <Drawer
        title={dupDrawerPrimary ? `题目 #${dupDrawerPrimary.id} 的重复题目` : '重复题目'}
        placement="right"
        width={620}
        open={dupDrawerOpen}
        onClose={() => setDupDrawerOpen(false)}
        destroyOnHidden
      >
        <Spin spinning={dupDrawerLoading}>
          {dupDrawerPrimary ? (
            <div style={{ marginBottom: 16, padding: 12, background: '#f6ffed', borderRadius: 8, border: '1px solid #b7eb8f' }}>
              <Space size={6} wrap style={{ marginBottom: 4 }}>
                <Tag color="success">主题 #{dupDrawerPrimary.id}</Tag>
                {dupDrawerPrimary.correct_answer ? (
                  <Tag color="gold">标准答案：{dupDrawerPrimary.correct_answer}</Tag>
                ) : null}
              </Space>
              <Paragraph style={{ margin: '6px 0 0', color: 'rgba(0,0,0,0.75)' }}>
                {dupDrawerPrimary.question_text}
              </Paragraph>
              {dupDrawerPrimary.options && typeof dupDrawerPrimary.options === 'object' ? (
                <div style={{ marginTop: 6 }}>
                  {Object.entries(dupDrawerPrimary.options).sort(([a],[b]) => a.localeCompare(b)).map(([key, value]) => (
                    <div key={key} style={{ fontSize: 12, color: 'rgba(0,0,0,0.65)', padding: '2px 0' }}>
                      <Text strong style={{ fontSize: 12 }}>{key}.</Text> {value}
                    </div>
                  ))}
                </div>
              ) : null}
              {dupDrawerPrimary.image_id ? (
                <div style={{ marginTop: 8 }}>
                  <AntImage
                    src={`/api/images/${dupDrawerPrimary.image_id}/file`}
                    width={120}
                    style={{ borderRadius: 6, border: '1px solid #f0f0f0' }}
                    preview={{ zoomCtrl: true, rotateCtrl: true, scaleStep: 0.25, minScale: 0.2, maxScale: 10 }}
                    fallback="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMTIwIi8+"
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {dupDrawerItems.length === 0 && !dupDrawerLoading ? (
            <Empty description="无重复题目" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {dupDrawerItems.map((item) => {
                const answerDiff = dupDrawerPrimary?.correct_answer && item.correct_answer
                  && item.correct_answer.trim().toUpperCase() !== dupDrawerPrimary.correct_answer.trim().toUpperCase()
                return (
                  <div
                    key={item.id}
                    style={{
                      padding: 10,
                      borderRadius: 6,
                      border: `1px solid ${answerDiff ? '#ffe7ba' : '#d9d9d9'}`,
                      background: answerDiff ? '#fff7e6' : '#fafafa',
                    }}
                  >
                    <Space size={6} wrap style={{ marginBottom: 4 }}>
                      <Tag color="default">重复 #{item.id}</Tag>
                      {item.correct_answer ? (
                        <Tag color="gold">标准答案：{item.correct_answer}</Tag>
                      ) : null}
                      {answerDiff ? (
                        <Tag color="warning" icon={<ExclamationCircleOutlined />}>
                          答案不一致
                        </Tag>
                      ) : null}
                      {item.image_id ? (
                        <Text type="secondary" style={{ fontSize: 11 }}>来源图 #{item.image_id}</Text>
                      ) : null}
                    </Space>
                    <Paragraph style={{ margin: '6px 0 0', color: 'rgba(0,0,0,0.75)' }}>
                      {item.question_text}
                    </Paragraph>
                    {item.options && typeof item.options === 'object' ? (
                      <div style={{ marginTop: 6 }}>
                        {Object.entries(item.options).sort(([a],[b]) => a.localeCompare(b)).map(([key, value]) => (
                          <div key={key} style={{ fontSize: 12, color: 'rgba(0,0,0,0.65)', padding: '2px 0' }}>
                            <Text strong style={{ fontSize: 12 }}>{key}.</Text> {value}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {item.image_id ? (
                      <div style={{ marginTop: 8 }}>
                        <AntImage
                          src={`/api/images/${item.image_id}/file`}
                          width={120}
                          style={{ borderRadius: 6, border: '1px solid #f0f0f0' }}
                          preview={{ zoomCtrl: true, rotateCtrl: true, scaleStep: 0.25, minScale: 0.2, maxScale: 10 }}
                          fallback="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMTIwIi8+"
                        />
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </Spin>
      </Drawer>

      {/* 原始响应抽屉 */}
      <Drawer
        title={rawQuestion ? `题目 #${rawQuestion.id} AI题目解析` : 'AI题目解析'}
        placement="right"
        width={760}
        open={rawDrawerOpen}
        onClose={() => setRawDrawerOpen(false)}
        destroyOnHidden
      >
        <Spin spinning={rawDrawerLoading}>
          {rawDetail ? (
            <>
              {image ? (
                <Card size="small" style={{ marginBottom: 16 }}>
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Space size={8} wrap>
                      <Text strong>{image.filename}</Text>
                      {image.extract_model ? (
                        <Tag color="blue">{image.extract_model}</Tag>
                      ) : null}
                    </Space>
                    <div style={{ textAlign: 'center' }}>
                      <AntImage
                        src={`/api/images/${image.id}/file`}
                        alt={image.filename}
                        style={{
                          maxWidth: 360,
                          maxHeight: 360,
                          borderRadius: 8,
                          objectFit: 'contain',
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
                    </div>
                  </Space>
                </Card>
              ) : null}
              <Tabs defaultActiveKey="extract" items={rawTabItems} />
            </>
          ) : !rawDrawerLoading ? (
            <Empty description="暂无数据" />
          ) : null}
        </Spin>
      </Drawer>
    </Spin>
  )
}

export default RawResponsesPage
