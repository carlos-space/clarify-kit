import { section, text, research } from '../../src/index.ts'

export default research({
  id: 'sample-research',
  title: 'A research',
  date: '2026-11-02',
  sections: [
    section('question', 'question', [text('question body.')]),
    section('method', 'method', [text('method body.')]),
    section('findings', 'findings', [text('findings body.')]),
    section('conclusion', 'conclusion', [text('conclusion body.')]),
  ],
})
