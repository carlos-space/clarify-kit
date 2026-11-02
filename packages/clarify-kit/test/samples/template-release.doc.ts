import { section, text, release } from '../../src/index.ts'

export default release({
  id: 'sample-release',
  title: 'A release',
  date: '2026-11-02',
  sections: [
    section('version', 'version', [text('version body.')]),
    section('changes', 'changes', [text('changes body.')]),
    section('upgrade-notes', 'upgrade-notes', [text('upgrade-notes body.')]),
  ],
})
