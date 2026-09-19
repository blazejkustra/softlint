import { flags } from "../lib/flags";
import { AddressForm, CartSummary, ExpressPay, PaymentForm } from "./parts";

export function CheckoutPage({ cart, error }: { cart: Cart; error?: string }) {
  return (
    <main>
      <h1>Checkout</h1>
      {error === "card_declined" && (
        <Alert tone="error">
          Your input was invalid: the card you entered was rejected by the gateway (DECLINE_05).
        </Alert>
      )}
      <CartSummary cart={cart} />
      {flags.enabled("express-pay") && <ExpressPay cart={cart} />}
      <AddressForm />
      <PaymentForm />
    </main>
  );
}
