import { section, text, problem } from '../../src/index.ts'

export default problem({
  id: 'sample-problem',
  title: 'A problem',
  status: 'draft',
  sections: [
    section('situation', 'situation', [text('situation body.')]),
    section('impact', 'impact', [text('impact body.')]),
    section('cause', 'cause', [text('cause body.')]),
  ],
})
