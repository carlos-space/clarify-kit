import { specFacts, next } from '../../../_lib/spec.ts'

const f = specFacts(['check'], 'check')

export default [
  f.value(
    'codes',
    next('build-check', {
      codes: {
        'missing-required-section': '文件缺範本的必要段落',
        'unknown-fact-reference': '區塊引用不存在的 fact',
        'adopted-content-changed': '已採納的 decision 或寫完的 record 內文與雜湊不同',
        'supersedes-unknown': '`supersedes` 指向不存在的 decision',
        'scenario-without-fact': 'requirement 的驗收情境沒有引用 fact',
        'outside-entry': '`*.doc.ts` 不在任何 entry 底下',
      },
      stable: '`code` 穩定，訊息給人看',
      output: '每筆問題含 `code`、`message` 與 `location`',
      exit: '有任何問題時結束碼為 1',
    }),
    { title: 'check 錯誤碼', description: 'check 回報問題用的穩定錯誤碼，至少六個。' },
  ),
  f.value(
    'fact-lookup',
    next('build-check', {
      rule: '檢查 fact 引用時，用 fact-kit 的 `readFacts` 或 `selectFacts` 讀 fact，不自己解析 `index.json`',
      why: 'fact 的版本與 pending 選取規則只在 fact-kit 一處實作',
    }),
    { title: 'check 讀 fact 的方式', description: '引用檢查透過 fact-kit 的讀取 API 找 fact。' },
  ),
]
