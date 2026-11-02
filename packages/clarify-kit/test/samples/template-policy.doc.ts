import { section, text, policy } from '../../src/index.ts'

export default policy({
  id: 'sample-policy',
  title: 'A policy',
  status: 'draft',
  sections: [
    section('rule', 'rule', [text('rule body.')]),
    section('rationale', 'rationale', [text('rationale body.')]),
    section('scope', 'scope', [text('scope body.')]),
    section('exceptions', 'exceptions', [text('exceptions body.')]),
  ],
})
