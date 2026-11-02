import { section, text, guide } from '../../src/index.ts'

export default guide({
  id: 'sample-guide',
  title: 'A guide',
  status: 'draft',
  sections: [
    section('goal', 'goal', [text('goal body.')]),
    section('prerequisites', 'prerequisites', [text('prerequisites body.')]),
    section('steps', 'steps', [text('steps body.')]),
    section('verify', 'verify', [text('verify body.')]),
  ],
})
