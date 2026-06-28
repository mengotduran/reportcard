import api from './client'
import { saveBlob } from '../csv'

export interface ExcelTemplate {
  id: string
  name: string
  classLevels: string[]
  createdAt: string
}

export const listExcelTemplatesApi = async (): Promise<{ templates: ExcelTemplate[]; total: number; max: number }> => {
  const res = await api.get('/excel-templates')
  return res.data
}

export const uploadExcelTemplateApi = async (
  file: File,
  name: string,
  classLevels: string[],
): Promise<{ template: ExcelTemplate }> => {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('name', name)
  fd.append('classLevels', JSON.stringify(classLevels))
  const res = await api.post('/excel-templates', fd)
  return res.data
}

export const updateExcelTemplateApi = async (
  id: string,
  patch: { name?: string; classLevels?: string[] },
): Promise<{ template: ExcelTemplate }> => {
  const res = await api.put(`/excel-templates/${id}`, patch)
  return res.data
}

export const deleteExcelTemplateApi = async (id: string): Promise<void> => {
  await api.delete(`/excel-templates/${id}`)
}

export const downloadExcelTranscriptApi = async (
  templateId: string,
  studentId: string,
  session: string,
  filename: string,
): Promise<void> => {
  const res = await api.get(`/excel-templates/${templateId}/generate/${studentId}`, {
    params: { session },
    responseType: 'blob',
  })
  saveBlob(res.data, filename)
}

export const fetchExcelPreviewHtmlApi = async (
  templateId: string,
  studentId: string,
  session: string,
): Promise<string> => {
  const res = await api.get(`/excel-templates/${templateId}/html-preview/${studentId}`, { params: { session } })
  return res.data.html as string
}

export const previewExcelTemplateApi = async (id: string, name: string): Promise<void> => {
  const res = await api.get(`/excel-templates/${id}/preview`, { responseType: 'blob' })
  saveBlob(res.data, `${name.replace(/\s+/g, '_')}_preview.xlsx`)
}

export const downloadExampleTemplateApi = async (): Promise<void> => {
  const res = await api.get('/excel-templates/example', { responseType: 'blob' })
  saveBlob(res.data, 'excel_template_example.xlsx')
}
