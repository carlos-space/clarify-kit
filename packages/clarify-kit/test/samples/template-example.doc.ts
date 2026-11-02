import { section, text, example } from '../../src/index.ts'

export default example({
  id: 'sample-example',
  title: 'A example',
  status: 'draft',
  sections: [
    section('context', 'context', [text('context body.')]),
    section('sample', 'sample', [text('sample body.')]),
    section('explanation', 'explanation', [text('explanation body.')]),
  ],
})
