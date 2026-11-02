import { requirement, scenario, section, text } from 'clarify-kit'

// The `since` of the new block is the literal string next: `clarify-kit pin` rewrites only the literals it finds in the source.
export default requirement({
  id: 'cart-discount',
  title: 'Cart discount and shipping',
  status: 'planned',
  release: '0.1.0',
  sections: [
    section('acceptance', 'Acceptance', [
      scenario({
        scenario: 'A member checks out a cart',
        expected: 'The member discount is taken off the total',
        judgement: 'The total equals the cart total times one minus the member rate',
        facts: 'sample-product.cart.discount-rate',
      }, { since: '0.1.0' }),
      scenario({
        scenario: 'A cart reaches the free shipping threshold',
        expected: 'Shipping costs nothing',
        judgement: 'The shipping line is zero at or above the threshold',
        facts: 'sample-product.cart.free-shipping',
      }, { since: 'next' }),
      text('Coupons stack with the member discount.', { pending: 'coupon' }),
    ]),
  ],
})
