import { specFacts, next } from '../../../_lib/spec.ts'

const f = specFacts(['read'], 'read')

export const readApiFacts = [
  f.value(
    'select',
    next('pin-read-impact-render', {
      function: 'readDocs',
      signature: 'readDocs(spec: string, options?: { version?: string; include?: string[]; root?: string }): DocReader',
      version: '沒給 `version` 時讀 head，`next` 的內容可見；給了 `version` 時只看 `since` 不晚於它的內容',
      include: '帶 `pending` 的文件與區塊只在讀 head 且 `include` 含該標籤時可見',
      same: '選取規則同 fact-kit 的 `selectFacts`',
    }),
    { title: '依 version 與 include 讀取', description: '讀取函式依 `version` 與 `include` 選文件與區塊。' },
  ),
  f.value(
    'installed',
    next('pin-read-impact-render', {
      loader: 'loadInstalledJson(spec, root)',
      returns: '`{ data, file, packageName, entry, packageVersion }`',
      errors: { 'not-found': '找不到已安裝的套件', 'not-an-index': 'JSON 壞掉' },
      thenChecks: ['`formatVersion` 的 major 是 1，否則回報 `unsupported-format-version`', '`docs` 是陣列，每份文件有類型與內文區塊'],
      doesNotUse: ['assertIndexFormat', 'loadInstalledIndex'],
      why: '`assertIndexFormat` 看的是 fact-kit 的 `indexFormat`，docs index 沒有這個欄位',
      availability: 'loadInstalledJson 隨 fact-kit 下一版發布，名稱以那一版為準',
    }),
    { title: '讀已安裝的 docs 套件', description: '用 `loadInstalledJson` 讀 `-docs`，再由 clarify-kit 自己檢查 `formatVersion` 與 `docs`，不用 `assertIndexFormat`。' },
  ),
  f.value(
    'impact-extractor',
    next('pin-read-impact-render', {
      registeredWith: 'fact-kit 的 `impactOf` 抽取器註冊介面',
      files: '`*.doc.ts`',
      recognized: [
        'fact 渲染區塊與驗收情境區塊裡的 fact id 字串字面值',
        '從 facts 套件 import 的 fact 物件，在區塊的 `facts` 欄位使用',
        '文字區塊裡的 `fact:<id>`',
      ],
      notRecognized: '運算出來的 id（例如字串串接）',
      result: '`impactOf` 找得到文件引用的 fact',
      availability: '抽取器註冊介面隨 fact-kit 下一版發布，名稱以那一版為準',
    }),
    { title: '影響分析抽取器', description: '向 fact-kit 註冊抽取器，讓 `impactOf` 找到引用某個 fact 的 `.doc.ts`。' },
  ),
]
