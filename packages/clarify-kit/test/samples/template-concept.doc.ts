import { section, text, concept } from '../../src/index.ts'

export default concept({
  id: 'sample-concept',
  title: 'A concept',
  status: 'draft',
  sections: [
    section('definition', 'definition', [text('definition body.')]),
    section('scope', 'scope', [text('scope body.')]),
    section('relations', 'relations', [text('relations body.')]),
  ],
})
