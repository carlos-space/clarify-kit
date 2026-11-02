import { history } from 'fact-kit'
import { specFacts } from '../../../_lib/spec.ts'

const f = specFacts(['modules'], 'modules')

export default [
  f.value(
    'register-template',
    history({ since: '0.1.0-alpha.1', value: {
      function: 'registerTemplate',
      signature: 'registerTemplate(template: { name: string; type: DocType; sections: { id: string; title: string; required: boolean }[] }): void',
      provides: '段落骨架與必要段落檢查',
      duplicateName: '同名範本已登記時拋錯',
    } }),
    { title: '模組登記範本', description: '模組用 `registerTemplate` 登記範本，核心用範本的必要段落做檢查。' },
  ),
  f.value(
    'register-renderer',
    history({ since: '0.1.0-alpha.1', value: {
      function: 'registerRenderer',
      signature: 'registerRenderer(name: string, render: (fact: SelectedFact, context: RenderContext) => string): void',
      usedBy: 'fact 渲染區塊的 `renderer` 欄位',
      returns: 'Markdown 字串',
    } }),
    { title: '模組登記渲染函式', description: '模組用 `registerRenderer` 登記 fact 的渲染函式，fact 渲染區塊用名稱選它。' },
  ),
  f.value(
    'render-context',
    history({ since: '0.1.0-alpha.1', value: {
      type: 'RenderContext',
      fields: {
        version: '讀者執行的版本，或 `head`；與渲染挑 fact 時用的 `version` 相同',
        include: '讀者帶入的 `pending` 標籤；與渲染挑 fact 時用的 `include` 相同',
        document: '區塊所在的文件，`{ id, type }`',
        section: '區塊所在段落的 id',
      },
      why: '渲染函式查另一個 fact 時能用同一個讀者，並能寫出整批渲染內唯一的錨點與連結',
      calledBy: 'render 對每個 fact 渲染區塊的每個 fact 呼叫一次',
    } }),
    { title: 'RenderContext', description: '渲染函式收到的讀者與區塊位置：version、include、document 與 section。' },
  ),
  f.value(
    'scope',
    history({ since: '0.1.0-alpha.1', value: {
      provides: ['fact 的 builder 與檢查', '範本', '渲染函式'],
      builderChecks: 'fact 一側的共用寫法放進 fact-kit，用 `registerBuilderCheck` 這類擴充點登記',
      newContent: '新增內容種類（例如設計系統）只加範本與模組，不改核心的類型與區塊',
    } }),
    { title: '模組的範圍', description: '模組提供 fact 的 builder 與檢查、範本和渲染函式。' },
  ),
]
