import { fromTemplate, section, text } from '../../src/index.ts'
import './acme-module.ts'

export default fromTemplate<'doc'>('acme-brand', {
  id: 'sample-acme-brand',
  title: 'Brand',
  status: 'active',
  sections: [section('logo', 'Logo', [text('Round.')]), section('palette', 'Palette', [text('Blue.')])],
})
