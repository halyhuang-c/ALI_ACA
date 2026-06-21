import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Input,
  Select,
  Pagination,
  Spin,
  Empty,
  Space,
  Typography,
} from 'antd'
import { searchQuestions, getTags, getCategories } from '../api'
import QuestionCard from '../components/QuestionCard'

const { Text } = Typography

function ResultsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTag = searchParams.get('tag') || undefined

  const [tag, setTag] = useState(initialTag || undefined)
  const [keyword, setKeyword] = useState('')
  const [submittedKeyword, setSubmittedKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [category, setCategory] = useState(undefined)
  const [subcategory, setSubcategory] = useState(undefined)
  const [matchFilter, setMatchFilter] = useState('all')
  const [questionType, setQuestionType] = useState(undefined)

  const [data, setData] = useState({ items: [], total: 0 })
  const [tags, setTags] = useState([])
  const [categoryTree, setCategoryTree] = useState([])
  const [loading, setLoading] = useState(false)

  const loadTags = useCallback(async () => {
    try {
      const res = await getTags()
      setTags(Array.isArray(res) ? res : [])
    } catch (e) {
      setTags([])
    }
  }, [])

  const loadCategories = useCallback(async () => {
    try {
      const res = await getCategories()
      setCategoryTree(res?.categories || [])
    } catch (e) {
      setCategoryTree([])
    }
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await searchQuestions({
        page,
        page_size: pageSize,
        keyword: submittedKeyword,
        tag,
        category,
        subcategory,
        only_wrong: matchFilter === 'wrong',
        exclude_wrong: matchFilter === 'correct',
        question_type: questionType,
      })
      setData({
        items: res?.items || [],
        total: res?.total || 0,
      })
    } catch (e) {
      setData({ items: [], total: 0 })
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, submittedKeyword, tag, category, subcategory, matchFilter, questionType])

  useEffect(() => {
    loadTags()
    loadCategories()
  }, [loadTags, loadCategories])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    const t = searchParams.get('tag') || undefined
    setTag(t)
    setPage(1)
  }, [searchParams])

  const handleSearch = (val) => {
    setSubmittedKeyword(val || '')
    setPage(1)
  }

  const handleMatchFilterChange = (value) => {
    setMatchFilter(value)
    setPage(1)
  }

  const handleTagChange = (value) => {
    setTag(value || undefined)
    setPage(1)
    if (value) {
      setCategory(undefined)
      setSubcategory(undefined)
      setSearchParams({ tag: value })
    } else {
      setSearchParams({})
    }
  }

  const handleCategoryChange = (value) => {
    setCategory(value || undefined)
    setSubcategory(undefined)
    setPage(1)
    if (value) {
      setTag(undefined)
      setSearchParams({})
    }
  }

  const handleSubcategoryChange = (value) => {
    setSubcategory(value || undefined)
    setPage(1)
  }

  const subcategoryOptions = (
    categoryTree.find((c) => c.name === category)?.subcategories || []
  )

  return (
    <Spin spinning={loading}>
      <div className="page-title">结果浏览</div>
      <div className="page-subtitle">查看已识别并解析的全部题目</div>

      <div className="search-bar">
        <Input.Search
          placeholder="按关键字搜索（题目/选项/答案/解析），可与下方任意条件联合"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onSearch={handleSearch}
          style={{ maxWidth: 520 }}
          allowClear
        />
      </div>

      <div className="search-bar">
        <Select
          allowClear
          placeholder="按标签筛选（与分类互斥）"
          value={tag}
          onChange={handleTagChange}
          style={{ minWidth: 240 }}
          options={tags.map((t) => ({
            value: t.name,
            label: `${t.display_name || t.name}（${t.ref_count}）`,
          }))}
        />
      </div>

      <div className="search-bar">
        <Select
          allowClear
          placeholder="按大类筛选（与标签互斥）"
          value={category}
          onChange={handleCategoryChange}
          style={{ minWidth: 200 }}
          options={categoryTree.map((c) => ({
            value: c.name,
            label: `${c.name}（${c.count}）`,
          }))}
        />
        <Select
          allowClear
          placeholder="按小类筛选"
          value={subcategory}
          onChange={handleSubcategoryChange}
          style={{ minWidth: 240 }}
          disabled={!category}
          options={subcategoryOptions.map((s) => ({
            value: s.name,
            label: `${s.name}（${s.count}）`,
          }))}
        />
      </div>

      <div className="search-bar">
        <Space>
          <Text type="secondary">答案筛选：</Text>
          <Select
            value={matchFilter}
            onChange={handleMatchFilterChange}
            style={{ width: 220 }}
            options={[
              { value: 'all', label: '全部题目' },
              { value: 'wrong', label: '仅看 AI 与标准答案不一致' },
              { value: 'correct', label: '排除 AI 与标准答案不一致' },
            ]}
          />
        </Space>
        <Space>
          <Text type="secondary">题型：</Text>
          <Select
            allowClear
            value={questionType}
            onChange={(v) => { setQuestionType(v); setPage(1) }}
            style={{ width: 120 }}
            options={[
              { value: '单选', label: '单选题' },
              { value: '多选', label: '多选题' },
            ]}
          />
        </Space>
        <Text type="secondary">共 {data.total} 题</Text>
      </div>

      {data.items.length === 0 && !loading ? (
        <div className="empty-wrap">
          <Empty description="没有符合条件的题目" />
        </div>
      ) : (
        <>
          <Space direction="vertical" size={0} style={{ display: 'block' }}>
            {data.items.map((q) => (
              <QuestionCard
                key={q.id}
                question={q}
                onUpdated={(updated) => {
                  setData((prev) => ({
                    ...prev,
                    items: prev.items.map((it) =>
                      it.id === updated.id ? { ...it, ...updated } : it,
                    ),
                  }))
                }}
              />
            ))}
          </Space>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
            <Pagination
              current={page}
              pageSize={pageSize}
              total={data.total}
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

export default ResultsPage
