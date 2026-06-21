import { useEffect, useState, useCallback } from 'react'
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  AutoComplete,
  InputNumber,
  Tag,
  Space,
  Typography,
  message,
  Spin,
  Divider,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ExperimentOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  getLLMConfigs,
  createLLMConfig,
  updateLLMConfig,
  deleteLLMConfig,
  testLLMConfig,
  getSettings,
  updateSettings,
} from '../api'

const { Text, Paragraph } = Typography
const { TextArea } = Input

const DEFAULT_PROMPTS = {
  extract_prompt:
    '请识别图片中的所有题目，并以严格 JSON 格式返回，不要输出任何额外文字或解释。\n' +
    '返回格式：{"questions": [{"question_text": "题目正文（不要包含答案标注）", ' +
    '"options": {"A": "选项A", "B": "选项B", "C": "选项C", "D": "选项D", ' +
    '"E": "选项E", "F": "选项F"}, ' +
    '"correct_answer": "图片中标注的准确答案", ' +
    '"question_type": "单选|多选"}]}。\n' +
    '说明：1) 本题库只有 单选 和 多选 两种题型，question_type 只能填 单选 或 多选，' +
    '不要输出 判断/填空/问答 等其它类型；' +
    '2) 选项最多可能有 A~F 共 6 个（多选题常见），请按图片实际选项完整识别，' +
    '不要遗漏 E、F 等后面的选项，也不要截断到 A~D；每道题都一定有 options 字段；' +
    '3) correct_answer 必须填写图片中标注的准确/标准答案：单选填单个字母如 "A"，' +
    '多选填多个字母连写如 "ABD"；如果图片中没有标注答案，correct_answer 设为空字符串 ""；' +
    '4) question_text 只放题目正文，不要把答案标注一起放进来；' +
    '5) 每道题独立成一条；6) 仅输出 JSON。',
  answer_system_prompt: '你是一位严谨且专业的答题助手，始终以 JSON 格式输出。',
  answer_prompt:
    '你是一位严谨的答题专家。请根据下面的题目给出正确答案、选择理由和分类标签。\n' +
    '以严格 JSON 格式返回，不要输出任何额外文字：\n' +
    '{"answer": "正确答案（如 A 或 ABCD）", ' +
    '"explanation": "选择理由或解析", ' +
    '"tags": ["学科", "知识点", "题型", "难度", "..."]}。\n' +
    '要求：1) answer 尽量简短（单选填单个字母，多选填多个字母连写，如 ABCD）；2) explanation 说明为什么选该答案；' +
    '3) tags 覆盖学科/知识点/题型/难度等，3-6 个。\n\n' +
    '题目：{question_text}{options_desc}',
}

function errMsg(e, fallback) {
  return (
    e?.response?.data?.detail ||
    e?.response?.data?.message ||
    e?.message ||
    fallback
  )
}

function ModelConfigPage() {
  const [configs, setConfigs] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [configForm] = Form.useForm()

  const [testModal, setTestModal] = useState({
    open: false,
    config: null,
    model: undefined,
    testing: false,
  })

  const [settingsForm] = Form.useForm()

  const loadConfigs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getLLMConfigs()
      setConfigs(Array.isArray(res) ? res : [])
    } catch {
      message.error('加载模型配置失败')
      setConfigs([])
    } finally {
      setLoading(false)
    }
  }, [])

  const loadSettings = useCallback(async () => {
    try {
      const res = await getSettings()
      settingsForm.setFieldsValue({
        extract_config_id: res?.extract_config_id ?? undefined,
        extract_model: res?.extract_model ?? undefined,
        answer_config_id: res?.answer_config_id ?? undefined,
        answer_model: res?.answer_model ?? undefined,
        extract_prompt: res?.extract_prompt ?? '',
        answer_system_prompt: res?.answer_system_prompt ?? '',
        answer_prompt: res?.answer_prompt ?? '',
        extract_concurrency: res?.extract_concurrency ?? 3,
        answer_concurrency: res?.answer_concurrency ?? 3,
      })
    } catch {
      message.error('加载设置失败')
    }
  }, [settingsForm])

  useEffect(() => {
    loadConfigs()
    loadSettings()
  }, [loadConfigs, loadSettings])

  const openCreate = () => {
    setEditing(null)
    configForm.resetFields()
    configForm.setFieldsValue({ models_text: '' })
    setModalOpen(true)
  }

  const openEdit = (record) => {
    setEditing(record)
    configForm.setFieldsValue({
      name: record.name,
      base_url: record.base_url,
      api_key: '',
      models_text: (record.models || []).join('\n'),
    })
    setModalOpen(true)
  }

  const handleSaveConfig = async () => {
    try {
      const values = await configForm.validateFields()
      const models = (values.models_text || '')
        .split(/[\n,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
      const payload = {
        name: values.name,
        base_url: values.base_url,
        models,
      }
      if (values.api_key) payload.api_key = values.api_key
      if (editing) {
        await updateLLMConfig(editing.id, payload)
        message.success('配置已更新')
      } else {
        await createLLMConfig(payload)
        message.success('配置已创建')
      }
      setModalOpen(false)
      loadConfigs()
    } catch (e) {
      if (e?.errorFields) return
      message.error('保存失败：' + errMsg(e, '请稍后重试'))
    }
  }

  const handleDelete = (record) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除配置「${record.name}」吗？此操作不可恢复。`,
      okType: 'danger',
      okText: '删除',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteLLMConfig(record.id)
          message.success('已删除')
          loadConfigs()
        } catch (e) {
          message.error('删除失败：' + errMsg(e, '请稍后重试'))
        }
      },
    })
  }

  const openTest = (record) => {
    setTestModal({
      open: true,
      config: record,
      model: undefined,
      testing: false,
    })
  }

  const handleTest = async () => {
    const { config, model } = testModal
    if (!model) {
      message.warning('请选择要测试的模型')
      return
    }
    setTestModal((s) => ({ ...s, testing: true }))
    try {
      const res = await testLLMConfig(config.id, model)
      if (res?.ok) {
        message.success(res?.message || '测试成功')
      } else {
        message.error(res?.message || '测试失败')
      }
    } catch (e) {
      message.error(errMsg(e, '测试失败'))
    } finally {
      setTestModal((s) => ({ ...s, testing: false }))
    }
  }

  const handleConfigChange = (configField, modelField) => (val) => {
    const cfg = configs.find((c) => c.id === val)
    const cur = settingsForm.getFieldValue(modelField)
    if (!val) {
      settingsForm.setFieldValue(modelField, undefined)
      return
    }
    if (cfg && cur && !(cfg.models || []).includes(cur)) {
      settingsForm.setFieldValue(modelField, undefined)
    }
  }

  const handleSaveSettings = async () => {
    try {
      const values = await settingsForm.validateFields()
      const warnings = []
      const extCfg = configs.find((c) => c.id === values.extract_config_id)
      const ansCfg = configs.find((c) => c.id === values.answer_config_id)
      if (values.extract_config_id && values.extract_model && extCfg) {
        if (!(extCfg.models || []).includes(values.extract_model)) {
          warnings.push(`识别模型「${values.extract_model}」不在「${extCfg.name}」的可用模型列表中`)
        }
      }
      if (values.answer_config_id && values.answer_model && ansCfg) {
        if (!(ansCfg.models || []).includes(values.answer_model)) {
          warnings.push(`答题模型「${values.answer_model}」不在「${ansCfg.name}」的可用模型列表中`)
        }
      }
      if (warnings.length) {
        message.warning('注意：' + warnings.join('；'))
      }
      setSaving(true)
      const payload = {
        extract_config_id: values.extract_config_id ?? null,
        extract_model: values.extract_model ?? null,
        answer_config_id: values.answer_config_id ?? null,
        answer_model: values.answer_model ?? null,
        extract_prompt: values.extract_prompt ?? '',
        answer_system_prompt: values.answer_system_prompt ?? '',
        answer_prompt: values.answer_prompt ?? '',
        extract_concurrency: values.extract_concurrency ?? 3,
        answer_concurrency: values.answer_concurrency ?? 3,
      }
      await updateSettings(payload)
      message.success('设置已保存')
    } catch (e) {
      if (e?.errorFields) return
      message.error('保存设置失败：' + errMsg(e, '请稍后重试'))
    } finally {
      setSaving(false)
    }
  }

  const handleRestorePrompts = () => {
    settingsForm.setFieldsValue({ ...DEFAULT_PROMPTS })
    message.info('已恢复为默认提示词，请点击「保存设置」以生效')
  }

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name', width: 160 },
    {
      title: 'Base URL',
      dataIndex: 'base_url',
      key: 'base_url',
      ellipsis: true,
      render: (v) => v || <Text type="secondary">-</Text>,
    },
    {
      title: 'API Key',
      key: 'api_key',
      width: 180,
      render: (_, r) =>
        r.has_key ? (
          <Text code>{r.api_key_masked || '••••••'}</Text>
        ) : (
          <Text type="secondary">未设置</Text>
        ),
    },
    {
      title: '可用模型',
      dataIndex: 'models',
      key: 'models',
      render: (models) =>
        models && models.length ? (
          <Space wrap>
            {models.map((m) => (
              <Tag key={m} color="blue">
                {m}
              </Tag>
            ))}
          </Space>
        ) : (
          <Text type="secondary">无</Text>
        ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 260,
      render: (_, r) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEdit(r)}
          >
            编辑
          </Button>
          <Button
            size="small"
            icon={<ExperimentOutlined />}
            onClick={() => openTest(r)}
          >
            测试
          </Button>
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(r)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <Spin spinning={loading}>
      <div className="page-title">模型配置</div>
      <div className="page-subtitle">
        配置 OpenAI 兼容大模型，并选择识别 / 答题模型与提示词
      </div>

      <Card
        title="大模型配置（OpenAI 兼容）"
        style={{ marginBottom: 20, borderRadius: 10 }}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadConfigs}>
              刷新
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openCreate}
            >
              新增配置
            </Button>
          </Space>
        }
      >
        <Paragraph type="secondary" style={{ marginBottom: 16 }}>
          使用 OpenAI 兼容协议配置大模型（base_url + api_key +
          模型名），可接入智谱 GLM、通义千问、DeepSeek、OpenAI
          官方等任意兼容服务。
        </Paragraph>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={configs}
          pagination={false}
          size="middle"
        />
      </Card>

      <Card title="模型选择与提示词" style={{ borderRadius: 10 }}>
        <Form form={settingsForm} layout="vertical">
          <Form.Item label="识别题目模型">
            <div style={{ display: 'flex', gap: 12 }}>
              <Form.Item name="extract_config_id" noStyle>
                <Select
                  allowClear
                  placeholder="选择 LLM 配置"
                  style={{ flex: 1 }}
                  options={configs.map((c) => ({
                    value: c.id,
                    label: c.name,
                  }))}
                  onChange={handleConfigChange(
                    'extract_config_id',
                    'extract_model',
                  )}
                />
              </Form.Item>
              <Form.Item name="extract_model" noStyle>
                <ConfigModelSelect
                  form={settingsForm}
                  configIdField="extract_config_id"
                  configs={configs}
                />
              </Form.Item>
              <Form.Item
                name="extract_concurrency"
                noStyle
                tooltip="识别阶段同时调用大模型的最大并发数。免费模型建议 1-2，付费模型可调高。对下一次流程生效。"
              >
                <InputNumber min={1} max={20} style={{ width: 110 }} addonBefore="并发" />
              </Form.Item>
            </div>
          </Form.Item>

          <Form.Item label="答题解析模型">
            <div style={{ display: 'flex', gap: 12 }}>
              <Form.Item name="answer_config_id" noStyle>
                <Select
                  allowClear
                  placeholder="选择 LLM 配置"
                  style={{ flex: 1 }}
                  options={configs.map((c) => ({
                    value: c.id,
                    label: c.name,
                  }))}
                  onChange={handleConfigChange(
                    'answer_config_id',
                    'answer_model',
                  )}
                />
              </Form.Item>
              <Form.Item name="answer_model" noStyle>
                <ConfigModelSelect
                  form={settingsForm}
                  configIdField="answer_config_id"
                  configs={configs}
                />
              </Form.Item>
              <Form.Item
                name="answer_concurrency"
                noStyle
                tooltip="答题阶段同时调用大模型的最大并发数。免费模型建议 1-2，付费模型可调高。对下一次流程生效。"
              >
                <InputNumber min={1} max={20} style={{ width: 110 }} addonBefore="并发" />
              </Form.Item>
            </div>
          </Form.Item>

          <Divider style={{ margin: '8px 0 20px' }} />

          <Form.Item
            label="识别题目提示词"
            name="extract_prompt"
            tooltip="用于图片题目识别的提示词"
          >
            <TextArea autoSize={{ minRows: 4 }} placeholder="识别题目提示词" />
          </Form.Item>

          <Form.Item
            label="答题 System 提示词"
            name="answer_system_prompt"
            tooltip="答题请求的 system 角色提示词"
          >
            <TextArea autoSize={{ minRows: 4 }} placeholder="答题 System 提示词" />
          </Form.Item>

          <Form.Item
            label="答题 User 提示词"
            name="answer_prompt"
            tooltip="可用 {question} {options} 占位（若后端不做替换则原样保存）"
          >
            <TextArea
              autoSize={{ minRows: 6 }}
              placeholder="可用 {question} {options} 占位"
            />
          </Form.Item>

          <Space>
            <Button
              type="primary"
              loading={saving}
              onClick={handleSaveSettings}
            >
              保存设置
            </Button>
            <Button onClick={handleRestorePrompts}>恢复默认提示词</Button>
            <Button onClick={loadSettings}>重置为已保存设置</Button>
          </Space>
        </Form>
      </Card>

      <Modal
        title={editing ? '编辑配置' : '新增配置'}
        open={modalOpen}
        onOk={handleSaveConfig}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
        width={560}
      >
        <Form form={configForm} layout="vertical">
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="如：智谱 GLM" />
          </Form.Item>
          <Form.Item
            name="base_url"
            label="Base URL"
            rules={[{ required: true, message: '请输入 Base URL' }]}
          >
            <Input placeholder="https://open.bigmodel.cn/api/paas/v4/" />
          </Form.Item>
          <Form.Item name="api_key" label="API Key">
            <Input.Password placeholder="编辑时留空则不修改" />
          </Form.Item>
          <Form.Item
            name="models_text"
            label="可用模型"
            tooltip="每行一个模型名，可直接粘贴（支持按行/逗号/空格分隔自动拆分）"
          >
            <Input.TextArea
              autoSize={{ minRows: 3, maxRows: 8 }}
              placeholder={'每行一个模型名，例如：\nglm-4v-plus\nglm-4-plus\nglm-4v-flash'}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`测试配置：${testModal.config?.name || ''}`}
        open={testModal.open}
        onOk={handleTest}
        onCancel={() =>
          setTestModal({ open: false, config: null, model: undefined, testing: false })
        }
        confirmLoading={testModal.testing}
        okText="开始测试"
        cancelText="取消"
        destroyOnHidden
      >
        <Form layout="vertical">
          <Form.Item label="选择模型">
            <AutoComplete
              value={testModal.model}
              onChange={(val) =>
                setTestModal((s) => ({ ...s, model: val }))
              }
              placeholder="选择或输入要测试的模型名"
              filterOption={(input, option) =>
                (option?.value ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={(testModal.config?.models || []).map((m) => ({
                value: m,
                label: m,
              }))}
            />
          </Form.Item>
          <Text type="secondary">
            将向该配置的 Base URL 发送一次简单请求，以验证连通性与 API Key。
          </Text>
        </Form>
      </Modal>
    </Spin>
  )
}

function ConfigModelSelect({ form, configIdField, configs, value, onChange }) {
  const configId = Form.useWatch(configIdField, form)
  const cfg = configs.find((c) => c.id === configId)
  const baseModels = cfg?.models || []
  const modelSet = new Set(baseModels)
  if (value) modelSet.add(value)
  const options = [...modelSet].map((m) => ({ value: m, label: m }))
  return (
    <AutoComplete
      allowClear
      value={value}
      onChange={onChange}
      placeholder={cfg ? '选择或输入模型名' : '请先选择配置'}
      style={{ flex: 1 }}
      disabled={!cfg}
      filterOption={(input, option) =>
        (option?.value ?? '').toLowerCase().includes(input.toLowerCase())
      }
      options={options}
    />
  )
}

export default ModelConfigPage
