import { section, text, goal } from '../../src/index.ts'

export default goal({
  id: 'sample-goal',
  title: 'A goal',
  status: 'draft',
  sections: [
    section('objective', 'objective', [text('objective body.')]),
    section('measure', 'measure', [text('measure body.')]),
    section('non-goals', 'non-goals', [text('non-goals body.')]),
  ],
})
