import { history } from 'fact-kit'
import { specFacts } from '../../../_lib/spec.ts'

const f = specFacts(['blocks'], 'blocks')

/** Every block may carry these two, see `blocks.since-pending`. */
const common = { since: 'optional', pending: 'optional' }

const block = (kind: string, title: string, fields: Record<string, string>) =>
  f.value(kind, history({ since: '0.1.0-alpha.1', value: { kind, fields: { ...fields, ...common } } }), {
    title,
    description: `${title}區塊的欄位。`,
  })

export default [
  block('text', '文字', { text: '內文，Markdown 行內語法' }),
  block('list', '清單', { items: '文字陣列', ordered: '選填，true 為序號清單' }),
  block('table', '表格', { columns: '欄名陣列', rows: '列陣列，每列的格數等於欄數' }),
  block('fact', 'fact 渲染', {
    facts: '要渲染的 fact，見 `clarify-kit.blocks.fact-reference`',
    renderer: '選填，模組登記的渲染函式名稱，沒給時用預設的表格渲染',
  }),
  block('scenario', '驗收情境', {
    scenario: '情境',
    expected: '預期結果',
    judgement: '判定方式',
    facts: '引用的 fact，requirement 的驗收情境至少一筆',
  }),
  block('code', '程式碼片段', { lang: '語言標籤', code: '程式碼原文' }),
  block('asset', '素材檔', { path: '相對於文件源碼的素材檔路徑', alt: '選填，替代文字' }),
  f.value(
    'kinds',
    history({ since: '0.1.0-alpha.1', value: { kinds: ['text', 'list', 'table', 'fact', 'scenario', 'code', 'asset'] } }),
    { title: '區塊種類', description: '核心固定提供 7 種區塊，新增內容種類不新增區塊。' },
  ),
  f.value(
    'since-pending',
    history({ since: '0.1.0-alpha.1', value: {
      appliesTo: ['文件', '每個區塊'],
      since: '版號字串、`next`，或每個發布線一個版號的陣列，寫法同 fact 的 `since`',
      pending: '標籤字串。帶 `pending` 的區塊只有 `include` 含該標籤的 head 讀者看得到',
      pin: 'pin 把 `next` 換成版號，帶 `pending` 的不動；功能落地時作者拿掉 `pending` 標籤，下一次 pin 才釘版號',
    } }),
    { title: '區塊的 since 與 pending', description: '文件和每個區塊都可標 `since` 或 `pending`，寫法同 fact。' },
  ),
  f.value(
    'fact-reference',
    history({ since: '0.1.0-alpha.1', value: {
      accepts: ['fact id 字串（`<tool>.<name>`）', '從 facts 套件 import 的 fact 物件'],
      unknownId: 'check 回報 `unknown-fact-reference`',
      usedBy: ['fact 渲染區塊', '驗收情境區塊', '文字區塊內的 `fact:<id>`'],
    } }),
    { title: 'fact 引用寫法', description: '區塊引用 fact 時接受 fact id 字串與 import 的 fact 物件，兩種寫法的效果相同。' },
  ),
]
