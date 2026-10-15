import {
  ArrowPathIcon,
  CircleStackIcon,
  ClockIcon,
  Cog6ToothIcon,
  EnvelopeIcon,
  IdentificationIcon,
  MapPinIcon,
  ShareIcon,
  ShieldCheckIcon,
  UserIcon,
} from '@heroicons/react/24/outline';

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
          <li>Property locations (barangay and map coordinates) and caretaker service areas</li>
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
    icon: MapPinIcon,
    title: 'Location (GPS) Information',
    body: (
      <>
        <p className="mb-1.5">Ledger OnBoard uses location information only for its location-based features:</p>
        <ul className="mb-1.5 list-inside list-disc space-y-0.5">
          <li>
            <span className="font-medium text-gray-700">Boarding house locations.</span> Each listing stores its barangay in Dagupan City and the map
            (GPS) coordinates for that barangay, so tenants can see where a property is on the map and search by area.
          </li>
          <li>
            <span className="font-medium text-gray-700">Caretaker service area.</span> A landlord records the barangay a caretaker works in, so the
            system can suggest caretakers who work near a boarding house.
          </li>
        </ul>
        <p>
          Ledger OnBoard does not read your device&apos;s GPS and does not track where you are or where you go. The location data it keeps is the
          property and service-area location entered by landlords. If a future feature ever needs your device&apos;s location, your browser will ask
          for your permission first, and you can say no. By agreeing to this policy, you consent to the use of location information described here.
        </p>
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
      <>
        <p>
          We do not sell your personal information. Information may only be shared when necessary to provide platform services, process
          transactions/reservations, comply with legal requirements, or protect the security of the platform and its users.
        </p>
        <p className="mt-2">
          Once a landlord approves your reservation, you can see that landlord&apos;s contact details (name, email and contact number) so you can
          arrange your move-in. They are not shown before approval or on public listings.
        </p>
      </>
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

/** The Privacy Policy text, shared by the sign-up modal and the public /privacy page. */
export default function PrivacyPolicyContent() {
  return (
    <>
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
    </>
  );
}
