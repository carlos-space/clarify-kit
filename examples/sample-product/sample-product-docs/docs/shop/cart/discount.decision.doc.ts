import { decision, factBlock, section, text } from 'clarify-kit'

export default decision({
  id: 'cart-discount-is-a-ratio',
  title: 'Take the cart discount as a ratio of the total',
  status: 'accepted',
  appliesFrom: '0.1.0',
  sections: [
    section('context', 'Context', [
      text('A fixed amount stops fitting once carts differ in size, so the discount is a ratio.'),
      factBlock({ facts: 'sample-product.cart.discount-rate' }, { since: '0.1.0' }),
    ]),
    section('decision', 'Decision', [
      text('The discount is a ratio of the cart total for each kind of customer.', { since: '0.1.0' }),
    ]),
  ],
  contentHash: '3ab1e7078c2d6ab39a2885a952486ffacda10a116d70a65b644a9b006d35543d',
})
