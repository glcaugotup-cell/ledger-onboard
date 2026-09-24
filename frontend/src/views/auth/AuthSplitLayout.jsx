import { Link, Outlet, useLocation } from 'react-router-dom';
import logo from '../../assets/logo.webp';
import houseWelcome from '../../assets/housedesign1.webp';
import houseExplore from '../../assets/housedesign2.webp';

/**
 * Split-screen layout route for /login and /register. It stays mounted when
 * switching between them, so only the form and panel content change.
 * Other auth pages use AuthLayout.jsx.
 */
export default function AuthSplitLayout() {
  const location = useLocation();
  const isRegister = location.pathname === '/register';

  const formPanel = (
    <div className="flex w-full flex-col justify-center px-6 py-10 sm:px-10 md:w-1/2 md:px-14 lg:px-20">
      <Link to="/" className="mb-8 flex items-center gap-3">
        <img src={logo} alt="Ledger OnBoard" className="h-12 w-12 rounded-2xl object-cover shadow-md" />
        <span>
          <span className="block text-lg font-bold leading-tight text-brand-800">Ledger OnBoard</span>
          <span className="block text-xs text-gray-400">Rental Homes. Made Easier.</span>
        </span>
      </Link>

      <div key={location.pathname} className={`mx-auto w-full max-w-md ${isRegister ? 'animate-auth-slide-in-right' : 'animate-auth-slide-in-left'}`}>
        <Outlet />
      </div>

      <p className="mx-auto mt-8 flex w-full max-w-md items-center gap-2 text-xs text-gray-400">
        <ShieldIcon className="h-4 w-4 shrink-0 text-brand-400" />
        Your information is safe with us.
      </p>
    </div>
  );

  const brandPanel = (
    <div
      className={`relative flex w-full flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-800 to-brand-900 px-8 py-10 text-white sm:px-12 md:w-1/2 md:py-14 ${
        isRegister ? 'md:rounded-l-[3rem]' : 'md:rounded-r-[3rem]'
      }`}
    >
      {/* Soft decorative blobs — static, no motion, just texture. */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/5 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-amber-400/10 blur-3xl" />

      <div className="relative z-10 flex items-center justify-end gap-2 text-xs font-medium tracking-wide text-brand-100">
        <ShieldIcon className="h-4 w-4" />
        <span>Safe · Trusted · For You</span>
      </div>

      <div key={location.pathname} className={`relative z-10 ${isRegister ? 'animate-auth-slide-in-right' : 'animate-auth-slide-in-left'}`}>
        <span className="mb-3 block h-1 w-10 rounded-full bg-amber-400" />
        {isRegister ? (
          <>
            <h2 className="text-3xl font-extrabold leading-tight sm:text-4xl">
              Welcome <span className="text-amber-400">Back!</span>
            </h2>
            <p className="mt-4 text-lg font-semibold text-white">Already have an account?</p>
            <p className="mt-2 max-w-sm text-sm text-brand-100">Log in to continue browsing and finding your perfect rental home.</p>
            <Link
              to="/login"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-black/10 transition-colors hover:bg-amber-600"
            >
              Login <span aria-hidden="true">→</span>
            </Link>
          </>
        ) : (
          <>
            <h2 className="text-3xl font-extrabold leading-tight sm:text-4xl">
              Find your next apartment or move into your <span className="text-amber-400">dream boarding house</span>
            </h2>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-brand-100">
              <span className="inline-flex items-center gap-1.5">
                <HomeIcon className="h-4 w-4" /> Verified Listings
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldIcon className="h-4 w-4" /> Safe &amp; Secure
              </span>
              <span className="inline-flex items-center gap-1.5">
                <PinIcon className="h-4 w-4" /> Find Near You
              </span>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-black/10 transition-colors hover:bg-amber-600"
              >
                Register Now <span aria-hidden="true">→</span>
              </Link>
              <a
                href="#discover"
                className="inline-flex items-center gap-2 rounded-xl border border-white/30 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Explore Platform
              </a>
            </div>
          </>
        )}
      </div>

      <div key={`${location.pathname}-illustration`} className={`relative z-10 mx-auto -mb-4 w-full max-w-sm ${isRegister ? 'animate-auth-slide-in-right' : 'animate-auth-slide-in-left'}`}>
        <img src={isRegister ? houseWelcome : houseExplore} alt="" className="w-full drop-shadow-2xl" />
      </div>
    </div>
  );

  // On md+ screens, register mode puts the form on the left and the brand panel on the right.
  return (
    <div className={`flex min-h-screen flex-col bg-white ${isRegister ? 'md:flex-row-reverse' : 'md:flex-row'}`}>
      {brandPanel}
      {formPanel}
    </div>
  );
}

function ShieldIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
    </svg>
  );
}

function HomeIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 11l9-7 9 7M5 10v9a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1v-9" />
    </svg>
  );
}

function PinIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s7-7.5 7-12a7 7 0 10-14 0c0 4.5 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
