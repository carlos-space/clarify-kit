import { record, section, text } from '../../src/index.ts'

export default record({
  id: 'sample-record',
  title: 'A record',
  date: '2026-11-02',
  sections: [section('notes', 'Notes', [text('Done.')])],
})
