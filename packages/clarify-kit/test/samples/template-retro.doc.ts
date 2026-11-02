import { section, text, retro } from '../../src/index.ts'

export default retro({
  id: 'sample-retro',
  title: 'A retro',
  date: '2026-11-02',
  sections: [
    section('summary', 'summary', [text('summary body.')]),
    section('went-well', 'went-well', [text('went-well body.')]),
    section('to-improve', 'to-improve', [text('to-improve body.')]),
    section('actions', 'actions', [text('actions body.')]),
  ],
})
