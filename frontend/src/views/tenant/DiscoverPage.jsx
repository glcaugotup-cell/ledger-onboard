import { Link } from 'react-router-dom';
import { AcademicCapIcon } from '@heroicons/react/24/outline';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import DiscoverContent from '../../components/DiscoverContent.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { reserveBlockedReason, studentIdState } from '../../utils/studentId.js';

export default function DiscoverPage() {
  const { user } = useAuth();
  // Students can browse right away; reserving waits for an approved school ID.
  const blocked = reserveBlockedReason(user);
  const underReview = studentIdState(user) === 'PENDING';

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Discover boarding houses</h1>
        <p className="mt-1 text-sm text-gray-500">Find a comfortable place to stay around Dagupan City.</p>
      </div>
      {blocked && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3" role="note">
          <AcademicCapIcon className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div className="text-sm text-amber-800">
            <p>{blocked}</p>
            {!underReview && <Link to="/tenant/verification" className="font-semibold text-brand-700 hover:underline">Verify your student ID</Link>}
          </div>
        </div>
      )}
      <DiscoverContent linkPrefix="/tenant/properties" mapSection />
    </DashboardLayout>
  );
}
