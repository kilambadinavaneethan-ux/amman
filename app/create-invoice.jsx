import ProtectedRoute from "./components/ProtectedRoute";
import CreateInvoice from "./pages/CreateInvoice";

export default function CreateInvoiceRoute() {
  return (
    <ProtectedRoute>
      <CreateInvoice />
    </ProtectedRoute>
  );
}
