import { history } from 'fact-kit'
import { specFacts } from '../../../_lib/spec.ts'

const f = specFacts(['check'], 'check')

export default [
  f.value(
    'codes',
    history(
      { since: '0.1.0-alpha.1', value: {
        codes: {
          'missing-required-section': '文件缺範本的必要段落',
          'unknown-fact-reference': '區塊引用不存在的 fact',
          'adopted-content-changed': '已採納的 decision 或寫完的 record 內文與雜湊不同',
          'supersedes-unknown': '`supersedes` 指向不存在的 decision',
          'scenario-without-fact': 'requirement 的驗收情境沒有引用 fact',
          'outside-entry': '`*.doc.ts` 不在任何 entry 底下',
          'load-error': '`index.ts` 或 `*.doc.ts` 載入失敗，或預設匯出不是文件',
          'duplicate-document-id': '同一個 entry 內有兩份文件的 `id` 相同',
        },
        scope: {
          'supersedes-unknown': '`supersedes` 只在同一個 entry 的 decision 之間解析',
          'unknown-fact-reference': '到設定檔 `factSources` 列的 facts 套件找，找法見 `clarify-kit.check.fact-lookup`，pending 列也算存在',
          'adopted-content-changed': '文件帶 `contentHash` 就比對，不看狀態',
        },
        stable: '`code` 穩定，訊息給人看',
        output: '每筆問題含 `code`、`message` 與 `location`',
        exit: '有任何問題時結束碼為 1',
      } },
      { since: '0.2.0-alpha.1', remove: {
        '/codes': ['adopted-content-changed'],
        '/scope': ['adopted-content-changed'],
      } },
      { since: '0.3.0-alpha.1', add: {
        '/codes': {
          'cites-lower-layer': '引用下層的 fact 或文件',
          'undeclared-layer': '文件 entry 或被引用的來源查不到層級',
          'unknown-doc-reference': '`doc:` 引用不存在的文件',
          'layer-mismatch': '設定檔寫的層級和來源 index 的 `layer` 不同',
        },
        '/scope': {
          'cites-lower-layer': '`org`、`product`、`implementation` 照由上而下比較，`tool` 每一層都可引用，見 `clarify-kit.cli.layer`',
          'undeclared-layer': 'entry 沒寫 `layer`，或被引用的來源 index 與設定檔都沒有層級，後者由引用它的文件回報；build 同樣失敗',
          'unknown-doc-reference': '到同專案的 entry 與設定檔 `docSources` 列的文件套件找，見 `clarify-kit.cli.doc-reference`',
          'layer-mismatch': '只在兩邊都有層級又不同時回報，見 `clarify-kit.cli.source-layer`',
        },
      } },
    ),
    { title: 'check 錯誤碼', description: 'check 回報問題用的穩定錯誤碼，至少六個。' },
  ),
  f.value(
    'fact-lookup',
    history({ since: '0.1.0-alpha.1', value: {
      rule: '檢查 fact 引用時，用 fact-kit 的 `loadInstalledIndex` 讀已安裝的 index，再用 `selectFacts` 選 fact，不自己解析 `index.json`',
      why: 'fact 的版本與 pending 選取規則只在 fact-kit 一處實作',
    } }),
    { title: 'check 讀 fact 的方式', description: '引用檢查透過 fact-kit 的讀取 API 找 fact。' },
  ),
]
