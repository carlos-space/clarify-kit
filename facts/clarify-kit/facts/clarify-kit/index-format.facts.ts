import { history } from 'fact-kit'
import { specFacts } from '../../../_lib/spec.ts'

const f = specFacts(['index-format'], 'index')

export default [
  f.value(
    'fields',
    history(
      { since: '0.1.0-alpha.1', value: {
        topLevel: ['formatVersion', 'package', 'entry', 'describes', 'publish', 'docs'],
        meaning: {
          formatVersion: 'index 的格式版號，見 `clarify-kit.index.format-version`',
          package: '文件套件名稱，`<product>-docs`',
          entry: 'entry 名稱',
          describes: '涵蓋的產品版號，例如 `{ "clarify-kit": "0.1.0" }`',
          publish: '發布位置 `{ target, name }`',
          docs: '文件陣列，每份文件含類型、狀態、版本欄位與內文區塊',
        },
        noOtherFields: true,
      } },
      { since: 'next',
        replace: {
          '/topLevel': ['formatVersion', 'package', 'entry', 'layer', 'describes', 'publish', 'docs'],
          '/meaning/package': '文件套件名稱，`<RepoName>-docs`，私有倉加 `@<OrgName>/`，見 `clarify-kit.index.docs-package-convention`',
        },
        add: { '/meaning': { layer: 'entry 宣告的層級，`org`、`product`、`implementation` 或 `tool`，見 `clarify-kit.cli.layer`' } },
      },
    ),
    { title: 'docs index 的頂層欄位', description: '建出的 `dist/<entry>/index.json` 頂層固定六個欄位。' },
  ),
  f.value(
    'format-version',
    history(
      { since: '0.1.0-alpha.1', value: {
        type: 'string',
        shape: 'major.minor',
        initial: '1.0',
        reader: '讀取端接受同一個 major（`1`），minor 較新時照讀',
        sameMeaningAs: 'fact-kit 2.0 index 的頂層 `formatVersion`',
        dataVersionField: null,
        note: '不另設資料版號欄位',
      } },
      { since: 'next',
        replace: { '/reader': '讀取端接受同一個 major（`1`），1.0 與 1.1 都讀，minor 較新時照讀' },
        add: { '': { current: '1.1', changes: '1.1 加頂層 `layer` 與每份文件的 `docRefs`' } },
      },
    ),
    { title: 'formatVersion', description: '格式版號從 `"1.0"` 起，讀取端接受同一個 major，欄位名稱與意思同 fact-kit 2.0 index。' },
  ),
  f.value(
    'doc-fields',
    history(
      { since: '0.1.0-alpha.1', value: {
          required: ['id', 'type', 'title', 'topics', 'sections', 'factRefs'],
          optional: ['template', 'pending'],
          meaning: {
            id: '文件 id，同一個 entry 內不重複，`supersedes` 指向它',
            type: '`doc`、`requirement`、`decision` 或 `record`',
            title: '標題',
            topics: '主題，格式同 fact 的 `topics`，可為空陣列',
            sections: '內文，每段含 `id`、`title` 與 `blocks`',
            factRefs: '內文引用的 fact id，依第一次出現的順序排列，各一次',
            template: '寫成這份文件所用的範本名稱，沒用範本時不寫',
            pending: '只有帶這個標籤的讀取端看得到這份文件，沒標時不寫',
          },
          byType: {
            doc: { required: ['status'], optional: ['since'] },
            requirement: { required: ['status', 'release'], optional: [] },
            decision: { required: ['status', 'appliesFrom', 'supersedes'], optional: ['contentHash'] },
            record: { required: ['date'], optional: ['contentHash'] },
          },
          noOtherFields: true,
        } },
        { since: '0.2.0-alpha.1', replace: { '/byType/decision/optional': [], '/byType/record/optional': [] } },
        { since: 'next',
          replace: { '/required': ['id', 'type', 'title', 'topics', 'sections', 'factRefs', 'docRefs'] },
          add: { '/meaning': { docRefs: '內文用 `doc:<target>#<id>` 引用的文件，值是 `<target>#<id>` 字串陣列，依第一次出現的順序排列，各一次，見 `clarify-kit.cli.doc-reference`' } },
        },
      ),
      { title: 'docs index 裡文件的欄位', description: '`docs` 陣列的每份文件都有 `id`、`type`、`title`、`topics`、`sections` 與 `factRefs`，用了範本才有 `template`，再加各類型自己的欄位。' },
    ),
    f.value(
      'docs-package-convention',
      history(
      { since: '0.1.0-alpha.1', value: {
        name: '`<product>-docs`',
        exports: { './<entry>/index.json': './dist/<entry>/index.json' },
        files: ['dist'],
        private: 'unset',
        publish: '預設發布，不設 `private`',
        describes: '記涵蓋的產品版號',
        kind: '本身是一個發版單元',
      } },
      { since: 'next', replace: { '/name': '`<RepoName>-docs`，私有倉加 `@<OrgName>/`，例如 `@carlos-space/blueprint-poly-hub-docs`' } },
    ),
    { title: '文件套件慣例', description: '`<product>-docs` 的名稱、exports、`files`，不設 `private`。' },
  ),
]
