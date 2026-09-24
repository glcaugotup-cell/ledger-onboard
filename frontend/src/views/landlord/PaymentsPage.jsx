import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import PaymentVerificationList from '../../components/PaymentVerificationList.jsx';

export default function PaymentsPage() {
  return (
    <DashboardLayout>
      <h1 className="mb-4 text-xl font-semibold text-gray-900">Payments</h1>
      <PaymentVerificationList canVerify={() => true} />
    </DashboardLayout>
  );
}
