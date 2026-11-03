import { decision, section, text } from '../../src/index.ts'

export default decision({
  id: 'sample-decision',
  title: 'A decision',
  status: 'accepted',
  appliesFrom: 'next',
  supersedes: ['older-decision'],
  sections: [section('context', 'Context', [text('Why.')])],
})
