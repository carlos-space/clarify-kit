// A module of someone else: it registers a template and a renderer when it is imported.
import { registerRenderer, registerTemplate } from '../../src/index.ts'

registerTemplate({
  name: 'acme-brand',
  type: 'doc',
  sections: [
    { id: 'logo', title: 'Logo', required: true },
    { id: 'palette', title: 'Palette', required: true },
    { id: 'notes', title: 'Notes', required: false },
  ],
})

registerRenderer('acme-swatch', (fact) => `swatch ${fact.id}`)
