import { history } from 'fact-kit'
import { specFacts } from '../../../_lib/spec.ts'

const f = specFacts(['index-format'], 'index')

export default [
  f.value(
    'fields',
    history({ since: 'next', pending: 'build-check', value: {
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
    } }),
    { title: 'docs index 的頂層欄位', description: '建出的 `dist/<entry>/index.json` 頂層固定六個欄位。' },
  ),
  f.value(
    'format-version',
    history({ since: 'next', pending: 'build-check', value: {
      type: 'string',
      shape: 'major.minor',
      initial: '1.0',
      reader: '讀取端接受同一個 major（`1`），minor 較新時照讀',
      sameMeaningAs: 'fact-kit 2.0 index 的頂層 `formatVersion`',
      dataVersionField: null,
      note: '不另設資料版號欄位',
    } }),
    { title: 'formatVersion', description: '格式版號從 `"1.0"` 起，讀取端接受同一個 major，欄位名稱與意思同 fact-kit 2.0 index。' },
  ),
  f.value(
    'docs-package-convention',
    history({ since: 'next', pending: 'build-check', value: {
      name: '`<product>-docs`',
      exports: { './<entry>/index.json': './dist/<entry>/index.json' },
      files: ['dist'],
      private: 'unset',
      publish: '預設發布，不設 `private`',
      describes: '記涵蓋的產品版號',
      kind: '本身是一個發版單元',
    } }),
    { title: '文件套件慣例', description: '`<product>-docs` 的名稱、exports、`files`，不設 `private`。' },
  ),
]
