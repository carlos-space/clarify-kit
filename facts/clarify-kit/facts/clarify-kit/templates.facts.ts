import { history } from 'fact-kit'
import { specFacts } from '../../../_lib/spec.ts'

const f = specFacts(['templates'], 'templates')

/** Required section ids in order. The section titles are the author's. */
const template = (name: string, type: 'doc' | 'record', required: string[], description: string) =>
  f.value(name, history({ since: '0.1.0-alpha.1', value: { name, type, requiredSections: required } }), {
    title: `${name} 範本`,
    description,
  })

export default [
  template('vision', 'doc', ['purpose', 'audience', 'outcome'], '願景：為什麼做、給誰、成功的樣子。'),
  template('goal', 'doc', ['objective', 'measure', 'non-goals'], '目標：要達成什麼、怎麼量、不做什麼。'),
  template('problem', 'doc', ['situation', 'impact', 'cause'], '問題：現況、影響、成因。'),
  template('policy', 'doc', ['rule', 'rationale', 'scope', 'exceptions'], '規範：規則、原因、適用範圍、例外。'),
  template('concept', 'doc', ['definition', 'scope', 'relations'], '概念：定義、範圍、與其他概念的關係。'),
  template('guide', 'doc', ['goal', 'prerequisites', 'steps', 'verify'], '指南：目的、前置條件、步驟、驗證。'),
  template('example', 'doc', ['context', 'sample', 'explanation'], '範例：情境、樣本、說明。'),
  template('research', 'record', ['question', 'method', 'findings', 'conclusion'], '研究紀錄：問題、方法、發現、結論。'),
  template('retro', 'record', ['summary', 'went-well', 'to-improve', 'actions'], '回顧紀錄：摘要、做得好、要改進、行動。'),
  template('release', 'record', ['version', 'changes', 'upgrade-notes'], '發布紀錄：版本、變更、升級注意事項。'),
  f.value(
    'standard-set',
    history({ since: '0.1.0-alpha.1', value: {
      doc: ['vision', 'goal', 'problem', 'policy', 'concept', 'guide', 'example'],
      record: ['research', 'retro', 'release'],
      check: '缺任何必要段落時 check 回報 `missing-required-section`',
    } }),
    { title: '標準範本清單', description: '標準範本共 10 個，doc 有 7 個，record 有 3 個。' },
  ),
]
