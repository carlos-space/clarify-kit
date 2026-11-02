import { decision, section, text } from '../../src/index.ts'

export default decision({
  id: 'sample-decision',
  title: 'A decision',
  status: 'accepted',
  appliesFrom: 'next',
  supersedes: ['older-decision'],
  contentHash: 'a'.repeat(64),
  sections: [section('context', 'Context', [text('Why.')])],
})
