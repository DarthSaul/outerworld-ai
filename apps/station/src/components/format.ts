/** USD for spend: cents normally, four decimals for sub-cent amounts, so small calls stay visible. */
export function formatUsd(amount: number): string {
  if (amount === 0) return "$0.00";
  return amount < 0.01 ? `$${amount.toFixed(4)}` : `$${amount.toFixed(2)}`;
}
