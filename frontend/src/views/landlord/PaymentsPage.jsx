import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import PaymentVerificationList from '../../components/PaymentVerificationList.jsx';

export default function PaymentsPage() {
  return (
    <DashboardLayout>
      <PageHeader title="Payments" description="Check GCash proofs and cash collections before they count toward a bill." />
      <PaymentVerificationList canVerify={() => true} />
    </DashboardLayout>
  );
}
