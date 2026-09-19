import { AddressForm, CartSummary, PaymentForm } from "./parts";

export function CheckoutPage({ cart }: { cart: Cart }) {
  return (
    <main>
      <h1>Checkout</h1>
      <CartSummary cart={cart} />
      <AddressForm />
      <PaymentForm />
    </main>
  );
}
