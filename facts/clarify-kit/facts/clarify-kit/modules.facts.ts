import { history } from 'fact-kit'
import { specFacts } from '../../../_lib/spec.ts'

const f = specFacts(['modules'], 'modules')

export default [
  f.value(
    'register-template',
    history({ since: 'next', value: {
      function: 'registerTemplate',
      signature: 'registerTemplate(template: { name: string; type: DocType; sections: { id: string; title: string; required: boolean }[] }): void',
      provides: '段落骨架與必要段落檢查',
      duplicateName: '同名範本已登記時拋錯',
    } }),
    { title: '模組登記範本', description: '模組用 `registerTemplate` 登記範本，核心用範本的必要段落做檢查。' },
  ),
  f.value(
    'register-renderer',
    history({ since: 'next', value: {
      function: 'registerRenderer',
      signature: 'registerRenderer(name: string, render: (fact: SelectedFact, context: RenderContext) => string): void',
      usedBy: 'fact 渲染區塊的 `renderer` 欄位',
      returns: 'Markdown 字串',
    } }),
    { title: '模組登記渲染函式', description: '模組用 `registerRenderer` 登記 fact 的渲染函式，fact 渲染區塊用名稱選它。' },
  ),
  f.value(
    'scope',
    history({ since: 'next', value: {
      provides: ['fact 的 builder 與檢查', '範本', '渲染函式'],
      builderChecks: 'fact 一側的共用寫法放進 fact-kit，用 `registerBuilderCheck` 這類擴充點登記',
      newContent: '新增內容種類（例如設計系統）只加範本與模組，不改核心的類型與區塊',
    } }),
    { title: '模組的範圍', description: '模組提供 fact 的 builder 與檢查、範本和渲染函式。' },
  ),
]
