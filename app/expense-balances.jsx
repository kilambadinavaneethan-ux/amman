import ProtectedRoute from "./components/ProtectedRoute";
import ExpenseBalances from "./pages/ExpenseBalances";

export default function ExpenseBalancesRoute() {
  return (
    <ProtectedRoute>
      <ExpenseBalances />
    </ProtectedRoute>
  );
}
