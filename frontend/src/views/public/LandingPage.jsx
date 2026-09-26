import { useEffect, useRef, useState } from 'react';
import { CheckCircleIcon, XCircleIcon, ChevronDownIcon, ChevronUpIcon, SparklesIcon } from '@heroicons/react/24/outline';
import DiscoverContent from '../../components/DiscoverContent.jsx';
import HeroAuthCard from './HeroAuthCard.jsx';
import logo from '../../assets/logo.webp';
import { capitalizeFirst } from '../../utils/textFormat.js';
import { validateName } from '../../utils/validators.js';

const FEATURES = [
  { icon: '🏠', num: '01', title: 'Discover', desc: 'Browse verified boarding houses across Dagupan City barangays — filtered by university, price, and availability. No more door-to-door hunting.' },
  { icon: '📋', num: '02', title: 'Reserve', desc: 'Submit digital reservation requests from any device. Landlords review and approve online; caretakers assist with onboarding.' },
  { icon: '💡', num: '03', title: 'Track Utilities', desc: 'Caretakers log monthly kWh sub-meter readings. The system automatically splits electricity and water bills among room occupants.' },
  { icon: '📄', num: '04', title: 'Manage Billing', desc: 'Tenants receive itemized digital Statements of Account combining rent, utilities, and outstanding balances every month.' },
  { icon: '💳', num: '05', title: 'Record Payments', desc: 'Upload receipt screenshots or have caretakers log verified cash collections. Every payment is timestamped and traceable.' },
  { icon: '📊', num: '06', title: 'Analytics', desc: 'Landlords access a real-time dashboard tracking occupancy rates, uncollected rent, and monthly cash flow trends.' },
];

const ROLES = [
  { icon: '🏠', title: 'Renters & Boarders', desc: 'Search listings, submit room reservations, view monthly bills, and upload payment receipts.' },
  { icon: '👤', title: 'Landlords', desc: 'Create listings, delegate to caretakers, manage tenants, verify receipts, and view earnings reports.' },
  { icon: '🔑', title: 'Caretakers', desc: 'Log utility sub-meter readings, record on-site cash collections, verify room readiness, and assist landlords.' },
  { icon: '⚙️', title: 'System Administrator', desc: 'Moderate postings, manage user accounts, and maintain overall platform health.' },
];

const BEFORE = [
  'Students walk barangays for days looking for vacant rooms',
  'Landlords track rent in handwritten notebooks (cuadernos)',
  'Utility bills cause disputes — no transparent sub-meter split',
  'Payment receipts get lost; arrears go untracked',
  'No visibility into occupancy or monthly cash flow',
];

const AFTER = [
  'Search and filter verified rooms online in minutes',
  'Digital rent ledger — automated, timestamped, auditable',
  'Sub-meter utility engine splits bills among occupants automatically',
  'Upload payment proofs; arrears tracker flags overdue accounts',
  'Landlord analytics dashboard with occupancy and revenue charts',
];

const SDGS = [
  { tag: 'SDG 8', badge: 'bg-emerald-50 text-emerald-800 border-emerald-200', title: 'Decent Work & Economic Growth', desc: 'Supports local micro-landlords and on-site caretakers by digitizing manual operations, streamlining daily tasks, preventing income loss from unpaid debts, and promoting local economic activity in university communities.' },
  { tag: 'SDG 11', badge: 'bg-amber-50 text-amber-800 border-amber-200', title: 'Sustainable Cities & Communities', desc: 'Improves urban living and tenant mobility in Dagupan City by offering accessible, transparent housing discovery across barangays and universities.' },
];

const TEAM = [
  { name: 'Ferrer, Princess Karel G.', role: 'Project Manager' },
  { name: 'Soy, Paul Andrae J.', role: 'Lead Backend Developer' },
  { name: 'Ugot, Gladdiel Angelo C.', role: 'Frontend Developer' },
  { name: 'Velasco, John Clarence L.', role: 'Database Administrator' },
  { name: 'Yoshioka, Paula Angela D.', role: 'UI/UX Designer & QA' },
];

function initialsFrom(name) {
  const parts = name.split(',');
  const last = parts[0]?.trim()?.[0] || '';
  const first = parts[1]?.trim()?.[0] || '';
  return `${first}${last}`.toUpperCase();
}

function Section({ id, className = '', children }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section
      id={id}
      ref={ref}
      className={`scroll-mt-20 px-6 py-20 transition-all duration-1000 ease-out md:px-16 ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
      } ${className}`}
    >
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="mb-6 flex items-center">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-bold uppercase tracking-widest text-emerald-800 shadow-sm">
        <SparklesIcon className="h-3.5 w-3.5 text-emerald-600" />
        {children}
      </span>
    </div>
  );
}

/** Sticky nav bar — transparent over the Hero, solid once the Hero scrolls out of view. */
function NavBar({ heroRef }) {
  const [solid, setSolid] = useState(false);

  // Goes solid once the Hero's bottom edge scrolls above the nav bar.
  useEffect(() => {
    const onScroll = () => {
      const el = heroRef.current;
      if (!el) return;
      // Sections use scroll-mt-20 (80px), so the threshold must exceed 80.
      setSolid(el.getBoundingClientRect().bottom <= 96);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [heroRef]);

  const scrollToId = (id) => (e) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-all duration-300 ${
        solid ? 'border-b border-gray-100 bg-white/95 shadow-sm backdrop-blur' : 'bg-gradient-to-b from-black/35 via-black/10 to-transparent'
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <a href="#top" onClick={scrollToId('top')} className="flex items-center gap-3">
          <img src={logo} alt="Ledger OnBoard" className="h-10 w-10 rounded-xl object-cover shadow-sm" />
          <span>
            <span className={`block text-base font-bold leading-tight transition-colors ${solid ? 'text-brand-800' : 'text-white drop-shadow-sm'}`}>Ledger OnBoard</span>
            <span className={`hidden text-xs sm:block ${solid ? 'text-gray-400' : 'text-white/80'}`}>Rental Homes. Made Easier.</span>
          </span>
        </a>
        <nav className="flex items-center gap-1 sm:gap-2">
          {[
            { id: 'about', label: 'About Platform' },
            { id: 'team', label: 'Team' },
            { id: 'contact', label: 'Contact Us' },
          ].map((link) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              onClick={scrollToId(link.id)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                solid ? 'text-gray-600 hover:bg-gray-100' : 'text-white/90 drop-shadow-sm hover:bg-white/10 hover:text-white'
              }`}
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}

function BackToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 0.6);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Back to top"
      className={`fixed bottom-6 right-6 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-brand-800 text-amber-400 shadow-xl transition-all duration-300 hover:bg-brand-900 hover:shadow-2xl focus:outline-none ${
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
      }`}
    >
      <ChevronUpIcon className="h-5 w-5 stroke-[2.5]" />
    </button>
  );
}

export default function LandingPage() {
  const heroRef = useRef(null);
  const [authMode, setAuthMode] = useState('login');
  const [contactForm, setContactForm] = useState({ fullName: '', email: '', inquiryType: 'General Inquiry', message: '' });
  const [contactStatus, setContactStatus] = useState('');
  const [contactErrors, setContactErrors] = useState({});

  const scrollToAbout = () => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const handleContactSubmit = async (e) => {
    e.preventDefault();
    const errors = {};
    const nameError = validateName(contactForm.fullName.trim());
    if (nameError) errors.fullName = nameError === 'This field is required' ? 'Enter your name.' : nameError;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contactForm.email.trim())) errors.email = 'Enter a valid email address.';
    const message = contactForm.message.trim();
    if (message.length < 10) errors.message = 'Please write at least 10 characters.';
    else if (message.length > 2000) errors.message = 'Please keep your message under 2000 characters.';
    setContactErrors(errors);
    if (Object.keys(errors).length) {
      setContactStatus('');
      return;
    }
    setContactStatus('Sending your message...');
    try {
      // There is no contact endpoint; submission is simulated and nothing is sent.
      await new Promise((resolve) => setTimeout(resolve, 600));
      setContactStatus('Thank you! Your message has been submitted to system admins.');
      setContactForm({ fullName: '', email: '', inquiryType: 'General Inquiry', message: '' });
    } catch {
      setContactStatus('Failed to send message. Please try again.');
    }
  };

  const inputClass =
    'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 transition-all duration-200 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-600';

  return (
    <div id="top" className="bg-slate-50 font-sans text-slate-800 selection:bg-amber-200 selection:text-brand-900">
      <NavBar heroRef={heroRef} />

      {/* HERO — fullscreen sliding Login/Register widget */}
      <div ref={heroRef} className="relative w-full overflow-hidden">
        <HeroAuthCard mode={authMode} onModeChange={setAuthMode} />
        <button
          type="button"
          onClick={scrollToAbout}
          aria-label="Scroll to About section"
          className="absolute bottom-6 left-1/2 z-30 hidden -translate-x-1/2 cursor-pointer animate-bounce rounded-full border border-slate-200 bg-white p-3 text-brand-900 shadow-xl transition-all duration-300 hover:scale-110 hover:shadow-2xl focus:outline-none sm:flex"
        >
          <ChevronDownIcon className="h-5 w-5 stroke-[2.5]" />
        </button>
      </div>

      {/* ABOUT THE PLATFORM */}
      <div id="about" className="scroll-mt-20 bg-slate-50 px-6 pb-12 pt-24 md:px-16">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/50 md:p-14">
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-emerald-100 opacity-60 blur-3xl" />
          <div className="relative z-10">
            <SectionLabel>About the Platform</SectionLabel>
            <h2 className="mb-6 text-3xl font-black leading-tight tracking-tight text-brand-800 md:text-4xl">
              Built for Dagupan City&apos;s <br className="hidden md:block" />
              boarding house community
            </h2>
            <p className="mb-8 max-w-3xl text-lg leading-relaxed text-slate-600 md:text-xl">
              Ledger OnBoard was born from a simple observation: thousands of students and workers arrive in Dagupan City every year,
              spending days walking barangay streets looking for vacant rooms, while micro-landlords struggled with manual ledgers and
              complex sub-meter utility billing. Ledger OnBoard bridges this gap with an all-in-one digital platform tailored
              specifically for the Dagupan City ecosystem.
            </p>
            <div className="grid gap-6 border-t border-slate-100 pt-6 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <span className="mb-1 block text-2xl font-black text-brand-800">100%</span>
                <span className="text-xs font-medium text-slate-500">Digital Room Search & Online Requests</span>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <span className="mb-1 block text-2xl font-black text-brand-800">Sub-Meter</span>
                <span className="text-xs font-medium text-slate-500">Automated Electricity & Water Splitting</span>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <span className="mb-1 block text-2xl font-black text-brand-800">Real-Time</span>
                <span className="text-xs font-medium text-slate-500">Landlord Analytics & Monthly Cashflow</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BROWSE LISTINGS — real, working property search (existing functionality) */}
      <section id="discover" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-12 sm:px-6">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold text-gray-900">Browse available boarding houses</h2>
          <p className="mt-2 text-sm text-gray-500">Filter by barangay, room type, or budget to find the right fit.</p>
        </div>
        <DiscoverContent linkPrefix="/properties" />
      </section>

      {/* CORE FEATURES */}
      <Section id="features">
        <SectionLabel>Core Platform Features</SectionLabel>
        <h2 className="mb-12 text-3xl font-black tracking-tight text-brand-800 md:text-4xl">Everything you need to rent &amp; manage</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((item) => (
            <div
              key={item.num}
              className="group relative rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-xl"
            >
              <div className="mb-6 flex items-center justify-between">
                <span className="rounded-2xl bg-emerald-50 p-3 text-3xl transition-transform group-hover:scale-110">{item.icon}</span>
                <span className="font-mono text-xs font-black tracking-widest text-slate-300">{item.num}</span>
              </div>
              <h3 className="mb-2 text-xl font-bold text-slate-900">{item.title}</h3>
              <p className="text-sm leading-relaxed text-slate-600">{item.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* WHO IS IT FOR? (ROLES) */}
      <Section id="roles" className="bg-slate-100/70">
        <SectionLabel>Platform Roles</SectionLabel>
        <h2 className="mb-12 text-3xl font-black tracking-tight text-brand-800 md:text-4xl">Designed for all stakeholders</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((role) => (
            <div
              key={role.title}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-lg"
            >
              <div>
                <span className="mb-4 block text-3xl">{role.icon}</span>
                <h3 className="mb-2 text-lg font-bold text-slate-900">{role.title}</h3>
                <p className="text-xs leading-relaxed text-slate-600">{role.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* BEFORE VS AFTER */}
      <Section id="comparison">
        <SectionLabel>Transformation</SectionLabel>
        <h2 className="mb-12 text-3xl font-black tracking-tight text-brand-800 md:text-4xl">Modernizing traditional boarding houses</h2>
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="rounded-3xl border border-rose-100 bg-rose-50/50 p-8">
            <h3 className="mb-6 flex items-center gap-2 text-xl font-bold text-rose-950">
              <XCircleIcon className="h-6 w-6 text-rose-600" />
              Traditional Manual Process
            </h3>
            <ul className="space-y-4">
              {BEFORE.map((item, idx) => (
                <li key={idx} className="flex items-start gap-3 text-sm text-rose-900/80">
                  <span className="font-bold text-rose-500">&bull;</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50/50 p-8 shadow-md">
            <h3 className="mb-6 flex items-center gap-2 text-xl font-bold text-emerald-950">
              <CheckCircleIcon className="h-6 w-6 text-emerald-600" />
              With Ledger OnBoard
            </h3>
            <ul className="space-y-4">
              {AFTER.map((item, idx) => (
                <li key={idx} className="flex items-start gap-3 text-sm font-medium text-emerald-900">
                  <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* UN SDGs ALIGNMENT */}
      <Section id="sdgs" className="rounded-t-[3rem] bg-brand-900 text-white">
        <div className="mb-8">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-700/50 bg-emerald-900/80 px-3.5 py-1.5 text-xs font-bold uppercase tracking-widest text-emerald-300">
            <SparklesIcon className="h-3.5 w-3.5" />
            Sustainability Impact
          </span>
        </div>
        <h2 className="mb-12 text-3xl font-black tracking-tight text-white md:text-4xl">Supporting UN Sustainable Development Goals</h2>
        <div className="grid gap-8 md:grid-cols-2">
          {SDGS.map((sdg) => (
            <div key={sdg.tag} className="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8">
              <div>
                <span className={`mb-4 inline-block rounded-full border px-3 py-1 text-xs font-extrabold uppercase ${sdg.badge}`}>{sdg.tag}</span>
                <h3 className="mb-3 text-2xl font-bold text-white">{sdg.title}</h3>
                <p className="text-sm leading-relaxed text-brand-100">{sdg.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* PROJECT TEAM */}
      <Section id="team">
        <SectionLabel>Capstones &amp; Creators</SectionLabel>
        <h2 className="mb-12 text-3xl font-black tracking-tight text-brand-800 md:text-4xl">Meet the Development Team</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {TEAM.map((member) => (
            <div
              key={member.name}
              className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-200 bg-emerald-100 text-lg font-black text-brand-800">
                {initialsFrom(member.name)}
              </div>
              <h3 className="mb-1 text-sm font-bold leading-snug text-slate-900">{member.name}</h3>
              <p className="text-xs font-medium text-slate-500">{member.role}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* CONTACT & SUPPORT FORM */}
      <Section id="contact" className="bg-slate-100/80">
        <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 shadow-xl sm:p-12">
          <SectionLabel>Contact Support</SectionLabel>
          <h2 className="mb-2 text-2xl font-black tracking-tight text-brand-800 sm:text-3xl">Have questions or feedback?</h2>
          <p className="mb-8 text-sm text-slate-600">Send a direct message to our system administration team and we will respond shortly.</p>

          <form onSubmit={handleContactSubmit} noValidate className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">Full Name</label>
                <input
                  type="text"
                  placeholder="Juan Dela Cruz"
                  aria-label="Full Name"
                  value={contactForm.fullName}
                  onChange={(e) => setContactForm({ ...contactForm, fullName: capitalizeFirst(e.target.value) })}
                  className={`${inputClass} ${contactErrors.fullName ? '!border-red-400' : ''}`}
                />
                {contactErrors.fullName && <p className="mt-1 text-xs text-red-600">{contactErrors.fullName}</p>}
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">Email Address</label>
                <input
                  type="email"
                  placeholder="juan@gmail.com"
                  aria-label="Email Address"
                  value={contactForm.email}
                  onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                  className={`${inputClass} ${contactErrors.email ? '!border-red-400' : ''}`}
                />
                {contactErrors.email && <p className="mt-1 text-xs text-red-600">{contactErrors.email}</p>}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">Inquiry Type</label>
              <select value={contactForm.inquiryType} onChange={(e) => setContactForm({ ...contactForm, inquiryType: e.target.value })} className={inputClass}>
                <option>General Inquiry</option>
                <option>Landlord Listing Registration</option>
                <option>Technical Support</option>
                <option>Feedback & Suggestions</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">Message</label>
              <textarea
                rows={4}
                maxLength={2000}
                placeholder="How can we help you today?"
                aria-label="Message"
                value={contactForm.message}
                onChange={(e) => setContactForm({ ...contactForm, message: capitalizeFirst(e.target.value) })}
                className={`${inputClass} ${contactErrors.message ? '!border-red-400' : ''}`}
              />
              {contactErrors.message && <p className="mt-1 text-xs text-red-600">{contactErrors.message}</p>}
            </div>

            {contactStatus && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">{contactStatus}</p>}

            <button
              type="submit"
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand-900 px-6 py-4 text-sm font-bold text-amber-400 shadow-lg transition-all hover:bg-brand-800"
            >
              <span>Submit Message</span>
            </button>
          </form>
        </div>
      </Section>

      {/* FOOTER */}
      <footer className="border-t border-brand-800 bg-brand-900 px-6 py-12 text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 text-center md:flex-row md:text-left">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Ledger OnBoard" className="h-10 w-10 rounded-xl object-cover shadow-sm" />
            <div>
              <span className="block text-lg font-extrabold leading-none">Ledger OnBoard</span>
              <span className="text-xs text-brand-200">Dagupan City Boarding House Management Platform</span>
            </div>
          </div>
          <div className="text-xs text-brand-200/80">&copy; {new Date().getFullYear()} Ledger OnBoard. All rights reserved.</div>
        </div>
      </footer>

      <BackToTopButton />
    </div>
  );
}
