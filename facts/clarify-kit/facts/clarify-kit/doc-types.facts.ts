import { specFacts, next } from '../../../_lib/spec.ts'

const f = specFacts(['doc-model'], 'doc-types')

export default [
  f.value(
    'doc',
    next('doc-model', {
      kind: 'doc',
      lifecycle: 'living',
      states: { draft: '草稿', active: '生效', deprecated: '棄用' },
      versionField: 'since',
      versionRule: '文件與段落都可標 `since`，段落可標 `pending`',
      specificRules: [],
    }),
    { title: 'doc 類型', description: '活文件。狀態是草稿、生效、棄用，版本欄位是 `since`，沒有特有規則。' },
  ),
  f.value(
    'requirement',
    next('doc-model', {
      kind: 'requirement',
      lifecycle: 'living',
      states: { planned: '規劃中', 'in-progress': '進行中', shipped: '已出貨' },
      versionField: 'release',
      versionRule: '排進的版本：Release Plan 的產品版號、`next`，或未排定（`null`）',
      specificRules: [
        'scenarios: 驗收情境由情境（scenario）、預期結果（expected）、判定方式（judgement）三欄組成，並引用 fact',
        'scenario-needs-fact: 驗收情境沒有引用任何 fact 時 check 回報 `scenario-without-fact`',
      ],
    }),
    { title: 'requirement 類型', description: '活文件。狀態是規劃中、進行中、已出貨，版本欄位 `release` 記排進的版本，驗收情境引用 fact。' },
  ),
  f.value(
    'decision',
    next('doc-model', {
      kind: 'decision',
      lifecycle: 'record',
      states: { proposed: '提案中', accepted: '已採納', rejected: '已否決', superseded: '已取代' },
      versionField: 'appliesFrom',
      versionRule: '開始適用的版本',
      specificRules: [
        'supersedes: 用 `supersedes` 指向被取代的 decision，被取代的那份狀態改為已取代',
        'adopted-content-frozen: 採納後內文不改，採納時寫入內文雜湊，check 重算比對',
      ],
      covers: ['ADR', 'PDR', '組織決策', 'RFC'],
    }),
    { title: 'decision 類型', description: '紀錄。狀態是提案中、已採納、已否決、已取代，用 `supersedes` 取代，採納後內文不改。' },
  ),
  f.value(
    'record',
    next('doc-model', {
      kind: 'record',
      lifecycle: 'record',
      states: {},
      versionField: 'date',
      versionRule: '日期（`YYYY-MM-DD`）',
      specificRules: ['written-once: 寫完不改，寫入雜湊的那一刻就是寫完'],
    }),
    { title: 'record 類型', description: '紀錄。沒有狀態欄，版本欄位是日期，寫完不改。' },
  ),
  f.value(
    'content-hash',
    next('doc-model', {
      algorithm: 'sha256',
      input: '建置後正規化的內文區塊（key 排序的 JSON）',
      excludes: ['狀態', '版本欄位', 'since', 'supersedes', '被取代的關係'],
      appliesTo: ['decision', 'record'],
      writtenBy: 'adopt',
      checkedBy: 'adopted-content-changed',
      limit: '作者重跑 adopt 就能更新雜湊，所以這套機制防的是不小心改到內文，有意的修改仍靠 PR 審查',
    }),
    {
      title: '採納後內文的雜湊規則',
      description: '採納時把內文雜湊寫進源碼。雜湊只算內文區塊，不含狀態、版本欄位、`since`、`supersedes` 與被取代的關係，所以 pin 與取代不會被當成改內文。record 用同一套雜湊。',
    },
  ),
  f.value(
    'new-type-condition',
    next('doc-model', {
      rule: '內容需要一套現有類型都沒有的生命週期、狀態、版本欄位或關係規則時，才新增類型',
      otherwise: '用範本、主題、區塊與模組表示內容種類',
      mapping: { ADR: 'decision', PDR: 'decision', RFC: 'decision', epic: 'requirement', feature: 'requirement', story: 'requirement' },
    }),
    { title: '新增文件類型的條件', description: '類型只依治理規則分，內容種類不另開類型。' },
  ),
]
