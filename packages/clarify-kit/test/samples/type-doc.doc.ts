import { doc, section, text } from '../../src/index.ts'

export default doc({
  id: 'sample-doc',
  title: 'A living document',
  status: 'active',
  since: '0.1.0',
  topics: ['design:token'],
  sections: [section('overview', 'Overview', [text('A paragraph.')])],
})
