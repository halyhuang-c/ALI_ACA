import { useState, useEffect, useCallback } from 'react'
import {
  Card,
  Select,
  Typography,
  Space,
  Button,
  Spin,
  Tag,
  message,
} from 'antd'
import {
  DownloadOutlined,
  FileWordOutlined,
} from '@ant-design/icons'
import { getCategories } from '../api'

const { Text } = Typography

export default function ExportPage() {
  const [matchFilter, setMatchFilter] = useState('all')
  const [questionType, setQuestionType] = useState(undefined)
  const [category, setCategory] = useState(undefined)
  const [subcategory, setSubcategory] = useState(undefined)
  const [categoryTree, setCategoryTree] = useState([])
  const [exporting, setExporting] = useState(false)

  const loadCategories = useCallback(async () => {
    try {
      const res = await getCategories()
      setCategoryTree(res?.categories || [])
    } catch (e) {}
  }, [])

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  const subcategoryOptions = (
    categoryTree.find((c) => c.name === category)?.subcategories || []
  )

  const handleExport = async () => {
    setExporting(true)
    try {
      const params = new URLSearchParams()
      if (matchFilter === 'wrong') params.set('only_wrong', 'true')
      if (matchFilter === 'correct') params.set('exclude_wrong', 'true')
      if (questionType) params.set('question_type', questionType)
      if (category) params.set('category', category)
      if (subcategory) params.set('subcategory', subcategory)

      const resp = await fetch(`/api/questions/export-word?${params.toString()}`)
      if (!resp.ok) throw new Error('导出失败')

      const blob = await resp.blob()
      const disposition = resp.headers.get('content-disposition')
      let filename = '题目导出.docx'
      if (disposition) {
        const match = disposition.match(/filename\*=UTF-8''(.+)/)
        if (match) filename = decodeURIComponent(match[1])
      }

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      message.success('导出成功')
    } catch (e) {
      message.error('导出失败')
    } finally {
      setExporting(false)
    }
  }

  return (
    <Spin spinning={exporting} tip="正在生成文档…">
      <Card
        title={
          <Space size={8}>
            <FileWordOutlined />
            <Text strong>导出 Word 文档</Text>
          </Space>
        }
        style={{ marginBottom: 12 }}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
              选择筛选条件后点击导出，将符合条件的题目生成为 Word 文档
            </Text>
          </div>

          <Space size={16} wrap>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>答案筛选：</Text>
              <Select
                value={matchFilter}
                onChange={setMatchFilter}
                style={{ width: 240, marginLeft: 6 }}
                options={[
                  { value: 'all', label: '全部题目' },
                  { value: 'wrong', label: '仅 AI 与标准答案不一致' },
                  { value: 'correct', label: '排除 AI 与标准答案不一致' },
                ]}
              />
            </div>

            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>题型：</Text>
              <Select
                allowClear
                value={questionType}
                onChange={setQuestionType}
                style={{ width: 120, marginLeft: 6 }}
                options={[
                  { value: '单选', label: '单选题' },
                  { value: '多选', label: '多选题' },
                ]}
              />
            </div>

            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>分类：</Text>
              <Select
                allowClear
                value={category}
                onChange={(v) => { setCategory(v); setSubcategory(undefined) }}
                style={{ width: 180, marginLeft: 6 }}
                options={categoryTree.map((c) => ({ value: c.name, label: `${c.name}（${c.count}）` }))}
              />
            </div>

            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>小类：</Text>
              <Select
                allowClear
                value={subcategory}
                onChange={setSubcategory}
                style={{ width: 200, marginLeft: 6 }}
                disabled={!category}
                options={subcategoryOptions.map((s) => ({ value: s.name, label: `${s.name}（${s.count}）` }))}
              />
            </div>
          </Space>

          <div>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              size="large"
              onClick={handleExport}
              loading={exporting}
            >
              导出 Word 文档
            </Button>
          </div>
        </Space>
      </Card>

      <Card size="small" title={<Text strong style={{ fontSize: 13 }}>文档内容说明</Text>}>
        <Space direction="vertical" size={4}>
          <div><Tag color="blue">题型</Tag> 每道题标注单选/多选</div>
          <div><Tag color="blue">题目</Tag> 题干正文</div>
          <div><Tag color="blue">选项</Tag> A/B/C/D/E/F 选项列表</div>
          <div><Tag color="green">答案</Tag> 正确答案</div>
          <div><Tag color="green">解析</Tag> 答案解析</div>
          <div style={{ marginTop: 8 }}>
            <Tag color="red">不一致</Tag> 当 AI 答案与标准答案不一致时，额外显示：
          </div>
          <div style={{ paddingLeft: 16 }}>
            <Text type="secondary">标准答案（绿色） + AI 答案和模型（红色） + AI 解析</Text>
          </div>
        </Space>
      </Card>
    </Spin>
  )
}
