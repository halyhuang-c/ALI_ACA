import { useState } from 'react'
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, theme, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import {
  ApartmentOutlined,
  FileSearchOutlined,
  TagsOutlined,
  ThunderboltOutlined,
  SettingOutlined,
  DatabaseOutlined,
  ForkOutlined,
  FileWordOutlined,
  BookOutlined,
  PieChartOutlined,
} from '@ant-design/icons'
import './App.css'

import PipelinePage from './pages/PipelinePage'
import ResultsPage from './pages/ResultsPage'
import TagsPage from './pages/TagsPage'
import ModelConfigPage from './pages/ModelConfigPage'
import RawResponsesPage from './pages/RawResponsesPage'
import DedupPage from './pages/DedupPage'
import ExportPage from './pages/ExportPage'
import ExamPage from './pages/ExamPage'
import ExamHistoryPage from './pages/ExamHistoryPage'
import WrongQuestionPage from './pages/WrongQuestionPage'
import CoverageAnalysisPage from './pages/CoverageAnalysisPage'

const { Header, Sider, Content } = Layout

const MENU_ITEMS = [
  { key: '/settings', icon: <SettingOutlined />, label: '模型配置' },
  { key: '/', icon: <ApartmentOutlined />, label: '处理流程' },
  { key: '/dedup', icon: <ForkOutlined />, label: '去重详情' },
  { key: '/raw-responses', icon: <DatabaseOutlined />, label: 'AI题目解析' },
  { key: '/tags', icon: <TagsOutlined />, label: '标签总览' },
  { key: '/results', icon: <FileSearchOutlined />, label: '结果浏览' },
  { key: '/export', icon: <FileWordOutlined />, label: '导出文档' },
  { key: '/exam', icon: <ThunderboltOutlined />, label: '模拟考试' },
  { key: '/wrong-questions', icon: <BookOutlined />, label: '错题本' },
  { key: '/exam/coverage', icon: <PieChartOutlined />, label: '覆盖率分析' },
]

function selectKey(pathname) {
  const sorted = [...MENU_ITEMS].sort((a, b) => b.key.length - a.key.length)
  const match = sorted.find(
    (m) => pathname === m.key || pathname.startsWith(m.key + '/'),
  )
  return match ? match.key : '/'
}

function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = theme.useToken()

  const selectedKey = selectKey(location.pathname)

  return (
    <Layout className="app-layout">
      <Sider
        className="app-sider"
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="dark"
        width={220}
      >
        <div
          style={{
            height: 56,
            margin: 12,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            color: '#69b1ff',
            fontWeight: 700,
            background: 'rgba(22, 119, 255, 0.12)',
          }}
        >
          <ThunderboltOutlined style={{ fontSize: 20 }} />
          {!collapsed ? <span>ALI_ACA</span> : null}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          onClick={({ key }) => navigate(key)}
          items={MENU_ITEMS}
        />
      </Sider>
      <Layout>
        <Header className="app-header" style={{ background: token.colorBgContainer }}>
          <div className="app-logo">
            <ThunderboltOutlined className="app-logo-icon" />
            <span>ALI_ACA 题目识别与答题系统</span>
          </div>
        </Header>
        <Content className="app-content-wrap">
          <div className="app-content">
            <Routes>
              <Route path="/" element={<PipelinePage />} />
              <Route path="/results" element={<ResultsPage />} />
              <Route path="/tags" element={<TagsPage />} />
              <Route path="/dedup" element={<DedupPage />} />
              <Route path="/raw-responses" element={<RawResponsesPage />} />
              <Route path="/settings" element={<ModelConfigPage />} />
              <Route path="/export" element={<ExportPage />} />
              <Route path="/exam" element={<ExamPage />} />
              <Route path="/exam/history" element={<ExamHistoryPage />} />
            <Route path="/exam/coverage" element={<CoverageAnalysisPage />} />
            <Route path="/wrong-questions" element={<WrongQuestionPage />} />
            </Routes>
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}

function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 8,
        },
      }}
    >
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </ConfigProvider>
  )
}

export default App
