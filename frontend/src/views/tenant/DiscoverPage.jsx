import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import DiscoverContent from '../../components/DiscoverContent.jsx';

export default function DiscoverPage() {
  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Discover boarding houses</h1>
        <p className="mt-1 text-sm text-gray-500">Find a comfortable place to stay around Dagupan City.</p>
      </div>
      <DiscoverContent linkPrefix="/tenant/properties" mapSection />
    </DashboardLayout>
  );
}
