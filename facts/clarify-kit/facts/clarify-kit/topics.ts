import { specFacts, next } from '../../../_lib/spec.ts'

const f = specFacts(['doc-model'], 'topics')

export const topicFacts = [
  f.value(
    'format',
    next('doc-model', {
      pattern: '^[a-z0-9-]+:[a-z0-9-]+$',
      examples: ['design:token', 'ddd:entity'],
      sharedWith: 'fact 的 `topics`',
      field: 'topics',
      meaning: '同一個主題標籤在 fact 與文件裡意思相同，用它找出同主題的 fact 與文件',
    }),
    { title: '主題格式', description: '文件的 `topics` 與 fact 的 `topics` 共用標籤，格式是 `<領域>:<名稱>`。' },
  ),
]
