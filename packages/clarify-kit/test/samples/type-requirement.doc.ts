import { requirement, scenario, section } from '../../src/index.ts'
import { docTypeFact } from './facts.ts'

export default requirement({
  id: 'sample-requirement',
  title: 'A requirement',
  status: 'planned',
  release: '0.2.0',
  sections: [
    section('acceptance', 'Acceptance', [
      scenario({ scenario: 'S', expected: 'E', judgement: 'J', facts: docTypeFact }),
    ]),
  ],
})
