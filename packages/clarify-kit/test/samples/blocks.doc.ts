import { asset, code, doc, factBlock, list, scenario, section, table, text } from '../../src/index.ts'
import { designTokenFact, docTypeFact } from './facts.ts'

export default doc({
  id: 'sample-blocks',
  title: 'All seven blocks',
  status: 'draft',
  sections: [
    section('all', 'All', [
      text('Cites fact:acme.tokens.color-primary inline.', { since: '0.1.0' }),
      list(['one', 'two'], { ordered: true }),
      table(['a', 'b'], [['1', '2']]),
      factBlock({ facts: [designTokenFact, 'clarify-kit.doc-types.doc'], renderer: 'table' }, { pending: 'later' }),
      scenario({ scenario: 'S', expected: 'E', judgement: 'J', facts: [docTypeFact] }),
      code('ts', 'const a = 1'),
      asset('images/a.png', { alt: 'A' }),
    ]),
  ],
})
