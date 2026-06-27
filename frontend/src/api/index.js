import axios from 'axios'

const request = axios.create({
  baseURL: '',
  timeout: 600000,
})

request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('请求错误：', error)
    return Promise.reject(error)
  },
)

export const uploadImages = (fileList) => {
  const formData = new FormData()
  fileList.forEach((f) => {
    const file = f.originFileObj || f
    if (file) formData.append('files', file)
  })
  return request.post('/api/scan/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  })
}

export const startPipeline = () =>
  request.post('/api/pipeline/start')

export const pausePipeline = () =>
  request.post('/api/pipeline/pause')

export const resumePipeline = () =>
  request.post('/api/pipeline/resume')

export const resetFailedPipeline = () =>
  request.post('/api/pipeline/reset-failed')

export const continuePipeline = () =>
  request.post('/api/pipeline/continue')

export const resetPipelineSteps = (scope) =>
  request.post('/api/pipeline/reset-steps', { scope })

export const getPipelineStatus = () =>
  request.get('/api/pipeline/status')

export const getPipelineLogs = (step) =>
  request.get('/api/pipeline/logs', { params: { step } })

export const getQuestions = (params = {}) =>
  request.get('/api/questions', {
    params: {
      page: params.page ?? 1,
      page_size: params.page_size ?? 20,
      ...(params.tag ? { tag: params.tag } : {}),
      ...(params.category ? { category: params.category } : {}),
      ...(params.subcategory ? { subcategory: params.subcategory } : {}),
    },
  })

export const searchQuestions = (params = {}) =>
  request.get('/api/questions/search', {
    params: {
      keyword: params.keyword ?? '',
      page: params.page ?? 1,
      page_size: params.page_size ?? 20,
      ...(params.tag ? { tag: params.tag } : {}),
      ...(params.category ? { category: params.category } : {}),
      ...(params.subcategory ? { subcategory: params.subcategory } : {}),
      ...(params.only_wrong ? { only_wrong: true } : {}),
      ...(params.exclude_wrong ? { exclude_wrong: true } : {}),
      ...(params.question_type ? { question_type: params.question_type } : {}),
    },
  })

export const reAnswerQuestion = (questionId, configId, model) =>
  request.post(`/api/questions/${questionId}/reanswer`, {
    config_id: configId,
    model,
  })

export const batchReanswer = (payload) =>
  request.post('/api/questions/batch-reanswer', payload, { timeout: 600000 })

export const reviewAnswer = (answerId, payload) =>
  request.put(`/api/answers/${answerId}/review`, payload)

export const deleteHistoryItem = (answerId, index) =>
  request.delete(`/api/answers/${answerId}/history/${index}`)

export const clearHistory = (answerId) =>
  request.delete(`/api/answers/${answerId}/history`)

export const getCategories = () =>
  request.get('/api/questions/categories')

export const getDedupDetail = (params = {}) =>
  request.get('/api/questions/dedup', {
    params: {
      ...(params.only_duplicates ? { only_duplicates: true } : {}),
      ...(params.keyword ? { keyword: params.keyword } : {}),
    },
  })

export const getTags = () => request.get('/api/tags')

export const getHealth = () => request.get('/api/health')

export const getLLMConfigs = () => request.get('/api/llm/configs')

export const createLLMConfig = (data) =>
  request.post('/api/llm/configs', data)

export const updateLLMConfig = (id, data) =>
  request.put(`/api/llm/configs/${id}`, data)

export const deleteLLMConfig = (id) =>
  request.delete(`/api/llm/configs/${id}`)

export const testLLMConfig = (id, model) =>
  request.post(`/api/llm/configs/${id}/test`, { model })

export const getSettings = () => request.get('/api/settings')

export const updateSettings = (data) =>
  request.put('/api/settings', data)

export const getQuestionsByIds = (ids) =>
  request.get('/api/questions/by-ids', {
    params: { ids: ids.join(',') },
  })

export const getImageResponses = (params = {}) =>
  request.get('/api/images/responses', {
    params: {
      page: params.page ?? 1,
      page_size: params.page_size ?? 20,
      keyword: params.keyword ?? '',
      ...(params.status ? { status: params.status } : {}),
    },
  })

export const getImageResponseDetail = (imageId) =>
  request.get(`/api/images/${imageId}/response`)

// ===== 考试 =====
export const generateExam = () => request.get('/api/exam/generate')
export const getActiveExam = () => request.get('/api/exam/active')
export const saveExamProgress = (examId, answers) =>
  request.post(`/api/exam/${examId}/save`, {
    answers: answers.map(({ question_id, answer }) => ({ question_id, answer })),
  })
export const abandonExam = (examId) =>
  request.post(`/api/exam/${examId}/abandon`)
export const submitExam = (examId, answers, startedAt) =>
  request.post(`/api/exam/${examId}/submit`, { answers, started_at: startedAt })
export const getExamHistory = (page = 1, pageSize = 20, passed = undefined) =>
  request.get('/api/exam/history', {
    params: { page, page_size: pageSize, ...(passed !== undefined ? { passed } : {}) },
  })
export const getExamConfig = () => request.get('/api/exam/config')
export const updateExamConfig = (pickDecay) =>
  request.put('/api/exam/config', { pick_decay: pickDecay })
export const getCoverageAnalysis = (params = {}) =>
  request.get('/api/exam/coverage', {
    params: {
      page: params.page ?? 1,
      page_size: params.page_size ?? 20,
      ...(params.status ? { status: params.status } : {}),
      ...(params.question_type ? { question_type: params.question_type } : {}),
    },
  })

// ===== 错题本 =====
export const getWrongQuestions = (params = {}) =>
  request.get('/api/wrong-questions', {
    params: {
      page: params.page ?? 1,
      page_size: params.page_size ?? 20,
      ...(params.reviewed !== undefined && params.reviewed !== null ? { reviewed: params.reviewed } : {}),
      ...(params.wrong_times !== undefined && params.wrong_times !== null ? { wrong_times: params.wrong_times } : {}),
    },
  })
export const reviewWrongQuestion = (id, reviewed = true) =>
  request.put(`/api/wrong-questions/${id}/review`, { reviewed })
export const deleteWrongQuestion = (id) =>
  request.delete(`/api/wrong-questions/${id}`)
export const getWrongQuestionStats = () => request.get('/api/wrong-questions/stats')

export default request
