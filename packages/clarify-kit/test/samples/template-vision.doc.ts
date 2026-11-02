import { section, text, vision } from '../../src/index.ts'

export default vision({
  id: 'sample-vision',
  title: 'A vision',
  status: 'draft',
  sections: [
    section('purpose', 'purpose', [text('purpose body.')]),
    section('audience', 'audience', [text('audience body.')]),
    section('outcome', 'outcome', [text('outcome body.')]),
  ],
})
