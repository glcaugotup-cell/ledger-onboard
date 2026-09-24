import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowPathIcon,
  CircleStackIcon,
  ClockIcon,
  Cog6ToothIcon,
  EnvelopeIcon,
  IdentificationIcon,
  ShareIcon,
  ShieldCheckIcon,
  UserIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import Button from './ui/Button.jsx';

const TRANSITION_MS = 200;

const SECTIONS = [
  {
    icon: UserIcon,
    title: 'Information We Collect',
    body: (
      <>
        <p className="mb-1.5">We may collect information such as:</p>
        <ul className="list-inside list-disc space-y-0.5">
          <li>Full name</li>
          <li>Email address</li>
          <li>Mobile number</li>
          <li>Account information</li>
          <li>Property and reservation information</li>
          <li>Information provided during registration and verification</li>
        </ul>
      </>
    ),
  },
  {
    icon: Cog6ToothIcon,
    title: 'How We Use Your Information',
    body: (
      <>
        <p className="mb-1.5">We use your information to:</p>
        <ul className="list-inside list-disc space-y-0.5">
          <li>Create and manage your account</li>
          <li>Verify your email and account</li>
          <li>Process reservations</li>
          <li>Connect tenants and landlords</li>
          <li>Manage property listings</li>
          <li>Improve the Ledger OnBoard platform</li>
          <li>Provide important system notifications</li>
        </ul>
      </>
    ),
  },
  {
    icon: ShieldCheckIcon,
    title: 'Information Protection',
    body: <p>We take reasonable measures to protect your personal information and prevent unauthorized access, alteration, disclosure, or misuse.</p>,
  },
  {
    icon: ShareIcon,
    title: 'Information Sharing',
    body: (
      <p>
        We do not sell your personal information. Information may only be shared when necessary to provide platform services, process
        transactions/reservations, comply with legal requirements, or protect the security of the platform and its users.
      </p>
    ),
  },
  {
    icon: CircleStackIcon,
    title: 'Cookies and Similar Technologies',
    body: <p>Ledger OnBoard may use cookies or similar technologies to maintain sessions, remember preferences, and improve the user experience.</p>,
  },
  {
    icon: IdentificationIcon,
    title: 'User Rights',
    body: <p>Users may request access to, correction of, or deletion of their personal information, subject to applicable laws and system requirements.</p>,
  },
  {
    icon: ClockIcon,
    title: 'Data Retention',
    body: (
      <p>
        We retain information only for as long as reasonably necessary to provide our services, maintain records, resolve disputes, and comply with
        applicable requirements.
      </p>
    ),
  },
  {
    icon: ArrowPathIcon,
    title: 'Policy Updates',
    body: <p>This Privacy Policy may be updated when necessary. Users will be informed of significant changes through appropriate platform notices.</p>,
  },
  {
    icon: EnvelopeIcon,
    title: 'Contact Us',
    body: (
      <p>
        If you have questions or concerns about this Privacy Policy, please contact Ledger OnBoard through the official contact information provided
        on the platform.
      </p>
    ),
  },
];

/**
 * Reusable Privacy Policy popup, controlled by the caller's `open` flag.
 * Rendered through a portal into document.body so `position: fixed` isn't
 * trapped by transformed ancestors (the animated auth panels).
 */
export default function PrivacyPolicyModal({ open, onClose }) {
  const closeButtonRef = useRef(null);
  const previouslyFocusedRef = useRef(null);
  const [rendered, setRendered] = useState(false); // in the DOM at all (covers the exit-transition window)
  const [visible, setVisible] = useState(false); // in its "shown" resting state, vs. the initial/exiting transform

  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current = document.activeElement;
      setRendered(true);
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    const timeout = setTimeout(() => {
      setRendered(false);
      previouslyFocusedRef.current?.focus?.();
    }, TRANSITION_MS);
    return () => clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (!rendered) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // lock background scroll for the whole mounted window, including the exit animation

    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [rendered, onClose]);

  useEffect(() => {
    if (visible) closeButtonRef.current?.focus();
  }, [visible]);

  if (!rendered) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto bg-brand-900/60 p-3 backdrop-blur-sm transition-opacity duration-200 ease-out sm:p-4 md:p-6 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-policy-modal-title"
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[88vh] w-full flex-col overflow-hidden rounded-[22px] border border-gray-100 bg-white shadow-2xl transition-all duration-200 ease-out sm:max-h-[82vh] sm:w-[700px] sm:max-w-[90vw] ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
        }`}
      >
        {/* Header */}
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-brand-50 via-white to-amber-50/50 px-5 py-4 sm:px-7 sm:py-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm sm:h-11 sm:w-11">
                <ShieldCheckIcon className="h-5 w-5 sm:h-6 sm:w-6" />
              </span>
              <div>
                <h2 id="privacy-policy-modal-title" className="text-lg font-bold leading-tight text-gray-900 sm:text-xl">
                  Privacy Policy
                </h2>
                <p className="text-xs text-gray-500 sm:text-sm">Your privacy matters to us.</p>
              </div>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Close Privacy Policy"
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="h-[3px] shrink-0 bg-gradient-to-r from-brand-600 via-brand-400 to-amber-400" />

        {/* Scrollable content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 text-sm leading-relaxed text-gray-700 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-track]:bg-transparent sm:px-7 sm:py-6">
          <p className="mb-6">
            Ledger OnBoard respects your privacy. This Privacy Policy explains how we collect, use, and protect your information when you use our
            platform.
          </p>

          <div className="space-y-6">
            {SECTIONS.map((section, i) => (
              <div key={section.title} className="flex gap-3">
                <div className="flex shrink-0 flex-col items-center gap-1.5 pt-0.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{i + 1}</span>
                  <section.icon className="h-4 w-4 text-brand-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="mb-1.5 font-semibold text-brand-800">{section.title}</h3>
                  <div className="text-gray-600">{section.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 justify-end border-t border-gray-100 px-5 py-3.5 sm:px-7">
          <Button type="button" variant="primary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
