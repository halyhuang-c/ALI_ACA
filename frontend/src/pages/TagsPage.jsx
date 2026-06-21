import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Spin, Empty, Row, Col, Typography, Tag as AntTag, Space } from 'antd'
import { TagOutlined, AppstoreOutlined, CloudOutlined } from '@ant-design/icons'
import { getTags } from '../api'

const { Text, Title } = Typography

const PALETTE = [
  'magenta', 'red', 'volcano', 'orange', 'gold',
  'lime', 'green', 'cyan', 'blue', 'geekblue',
  'purple',
]

function TagsPage() {
  const [tags, setTags] = useState([])
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const loadTags = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getTags()
      setTags(Array.isArray(res) ? res : [])
    } catch (e) {
      setTags([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTags()
  }, [loadTags])

  const totalQuestions = tags.reduce((sum, t) => sum + (t.ref_count || 0), 0)

  const handleTagClick = (name) => {
    navigate(`/results?tag=${encodeURIComponent(name)}`)
  }

  return (
    <Spin spinning={loading}>
      <div className="page-title">标签总览</div>
      <div className="page-subtitle">
        <Space>
          <AppstoreOutlined />
          <Text type="secondary">
            共 {tags.length} 个标签，累计引用 {totalQuestions} 次。点击任意标签可查看对应题目。
          </Text>
        </Space>
      </div>

      {tags.length === 0 && !loading ? (
        <div className="empty-wrap">
          <Empty description="暂无标签数据" />
        </div>
      ) : (
        <>
          <Card
            title={
              <Space>
                <CloudOutlined style={{ color: '#1677ff' }} />
                <span>标签云</span>
              </Space>
            }
            style={{ marginBottom: 20, borderRadius: 10 }}
          >
            <div className="tag-cloud">
              {tags.map((t, i) => (
                <AntTag
                  key={t.name}
                  color={PALETTE[i % PALETTE.length]}
                  className="tag-cloud-item"
                  style={{ padding: '6px 12px', fontSize: 14 }}
                  onClick={() => handleTagClick(t.name)}
                >
                  <TagOutlined style={{ marginRight: 4 }} />
                  {t.display_name || t.name}
                  <span style={{ marginLeft: 6, opacity: 0.85 }}>{t.ref_count}</span>
                </AntTag>
              ))}
            </div>
          </Card>

          <Card title="标签卡片" style={{ borderRadius: 10 }}>
            <Row gutter={[16, 16]}>
              {tags.map((t, i) => (
                <Col xs={24} sm={12} md={8} lg={6} key={t.name}>
                  <Card
                    hoverable
                    size="small"
                    className="tag-cloud-item"
                    onClick={() => handleTagClick(t.name)}
                    style={{ height: '100%' }}
                  >
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                      <Title level={5} style={{ margin: 0 }}>
                        <TagOutlined style={{ color: PALETTE[i % PALETTE.length] }} />
                        {' '}
                        {t.display_name || t.name}
                      </Title>
                      <Text type="secondary">题目数：{t.ref_count}</Text>
                      {t.name !== (t.display_name || t.name) ? (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          标识：{t.name}
                        </Text>
                      ) : null}
                    </Space>
                  </Card>
                </Col>
              ))}
            </Row>
          </Card>
        </>
      )}
    </Spin>
  )
}

export default TagsPage
