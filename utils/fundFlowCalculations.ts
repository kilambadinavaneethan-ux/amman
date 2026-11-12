import { roundCurrency } from "./currency";

export interface AccountBalanceSummaryItem {
  balance: number;
  inflowTotal: number;
  outflowTotal: number;
  count: number;
}

/**
 * Computes net liquid balance across all Fund Flow accounts with currency rounding.
 */
export function computeTotalLiquidBalance(
  accountBalances: Record<string, AccountBalanceSummaryItem>
): number {
  return roundCurrency(
    Object.values(accountBalances || {}).reduce(
      (sum, item) => sum + Number(item?.balance || 0),
      0
    )
  );
}

