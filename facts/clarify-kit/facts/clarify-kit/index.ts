import type { FactsModule } from 'fact-kit'
import { blockFacts } from './blocks.ts'
import { checkCodeFacts } from './check-codes.ts'
import { cliFacts } from './cli.ts'
import { docTypeFacts } from './doc-types.ts'
import { indexFormatFacts } from './index-format.ts'
import { moduleFacts } from './modules.ts'
import { readApiFacts } from './read.ts'
import { templateFacts } from './templates.ts'
import { topicFacts } from './topics.ts'

// `describes` is a literal until the repository has a release-please manifest to read it from.
const entry: FactsModule = {
  describes: { 'clarify-kit': '0.0.0' },
  publish: { target: 'npm', name: 'clarify-kit' },
  facts: [
    ...docTypeFacts,
    ...blockFacts,
    ...topicFacts,
    ...templateFacts,
    ...moduleFacts,
    ...cliFacts,
    ...indexFormatFacts,
    ...checkCodeFacts,
    ...readApiFacts,
  ],
}

export default entry
