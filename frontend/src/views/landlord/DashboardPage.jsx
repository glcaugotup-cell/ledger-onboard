import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import AnalyticsApi from '../../services/AnalyticsApi.js';
import LandlordVerificationApi from '../../services/LandlordVerificationApi.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import StatTile from '../../components/charts/StatTile.jsx';
import RevenueTrendChart from '../../components/charts/RevenueTrendChart.jsx';
import RoomStatusChart from '../../components/charts/RoomStatusChart.jsx';
import { Badge, ErrorBanner, LoadingState } from '../../components/ui/Feedback.jsx';

function VerificationBanner({ status, rejectionReason }) {
  if (status === 'VERIFIED') return null;

  if (status === 'PENDING') {
    return (
      <Card className="mb-6 border-yellow-200 bg-yellow-50">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-gray-900">Business verification pending</p>
            <p className="text-sm text-gray-600">Your submitted documents are under admin review. You&apos;ll be notified once they&apos;re verified.</p>
          </div>
          <Badge tone="yellow">Pending</Badge>
        </div>
      </Card>
    );
  }

  if (status === 'REJECTED') {
    return (
      <Card className="mb-6 border-red-200 bg-red-50">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-gray-900">Business verification rejected</p>
            <p className="text-sm text-gray-600">{rejectionReason || 'Your submitted documents were not approved.'}</p>
          </div>
          <Link to="/landlord/verification">
            <Button variant="danger">Resubmit documents</Button>
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mb-6 border-amber-200 bg-amber-50">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-gray-900">Business verification required</p>
          <p className="text-sm text-gray-600">Submit your Mayor&apos;s/Business Permit and BIR Form 2303 before you can upload or publish boarding houses.</p>
        </div>
        <Link to="/landlord/verification">
          <Button>Submit documents</Button>
        </Link>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submission, setSubmission] = useState(null);

  useEffect(() => {
    AnalyticsApi.getLandlordAnalytics()
      .then(setData)
      .catch(() => setError('Could not load analytics.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user?.businessVerificationStatus === 'REJECTED') {
      LandlordVerificationApi.getMine()
        .then(({ submission: s }) => setSubmission(s))
        .catch(() => {});
    }
  }, [user?.businessVerificationStatus]);

  return (
    <DashboardLayout>
      <h1 className="mb-4 text-xl font-semibold text-gray-900">Dashboard</h1>
      <VerificationBanner status={user?.businessVerificationStatus} rejectionReason={submission?.rejectionReason} />
      <ErrorBanner message={error} />
      {loading && <LoadingState />}
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile label="Occupancy rate" value={`${data.occupancyRate}%`} sublabel={`${data.occupiedRooms}/${data.totalRooms} rooms occupied`} />
            <StatTile label="Collection rate" value={`${data.collectionRate}%`} sublabel={`₱${data.verifiedPaymentsTotal.toLocaleString()} collected`} />
            <StatTile
              label="Outstanding debt"
              value={`₱${data.outstandingDebt.toLocaleString()}`}
              tone={data.outstandingDebt > 0 ? 'critical' : 'good'}
              sublabel="unpaid + overdue"
            />
            <StatTile label="Properties" value={data.totalProperties} sublabel={`${data.totalRooms} rooms total`} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card title="Revenue trend" className="lg:col-span-2">
              <RevenueTrendChart data={data.revenueTrend} />
            </Card>
            <Card title="Room status">
              <RoomStatusChart breakdown={data.roomStatusBreakdown} />
            </Card>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
