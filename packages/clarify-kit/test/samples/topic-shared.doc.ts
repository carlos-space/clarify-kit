import { doc, section, text } from '../../src/index.ts'
import { designTokenFact } from './facts.ts'

export default doc({
  id: 'sample-topic',
  title: 'Shares a topic with a fact',
  status: 'draft',
  topics: designTokenFact.topics,
  sections: [section('body', 'Body', [text('Tokens.')])],
})
