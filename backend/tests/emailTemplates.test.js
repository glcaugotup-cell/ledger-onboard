jest.mock('../config/env', () => ({
  emailAppUrl: 'https://ledger-onboard.vercel.app',
  otpTtlMinutes: 10,
  emailTransport: 'smtp',
  emailFrom: 'Ledger OnBoard <sample@example.com>',
  smtp: {},
}));
jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

const nodemailer = require('nodemailer');
const EmailService = require('../services/EmailService');
const { buildEmail } = require('../utils/emailTemplate');

afterEach(() => jest.restoreAllMocks());

// Phase 5 rule: caretaker invitations send no email, so their template is gone. These two checks of
// the shared layout now use the payment-rejected email and the layout itself.
test('SMTP receives both styled HTML and a usable plain-text email with the same link and details', async () => {
  const sendMail = jest.fn().mockResolvedValue({ accepted: ['tenant@example.com'] });
  nodemailer.createTransport.mockReturnValue({ sendMail });
  const url = 'https://ledger-onboard.vercel.app/tenant/billing';
  await EmailService.sendPaymentRejectedEmail('tenant@example.com', 'Alex Santos', 'Reference SampleOnly123 not found');
  const message = sendMail.mock.calls[0][0];
  expect(message.text).toContain(`Review my payment:\n${url}`);
  expect(message.html).toContain(`href="${url}"`);
  expect(message.html).toContain('Review my payment');
  expect(message.text).toContain('Reason: Reference SampleOnly123 not found');
  expect(message.html).toContain('Reference SampleOnly123 not found');
  expect(message.html).not.toContain('localhost');
});

test('escapes user-controlled text and URL attributes in HTML while preserving readable plain text', () => {
  const send = jest.spyOn(EmailService, 'send').mockImplementation((message) => message);
  const message = EmailService.sendPaymentRejectedEmail('tenant@example.com', '<img src=x onerror=alert(1)>', 'Owner & "Family" <password>');
  expect(send).toHaveBeenCalledTimes(1);
  expect(message.html).not.toContain('<img src=x');
  expect(message.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  expect(message.html).toContain('Owner &amp; &quot;Family&quot; &lt;password&gt;');
  expect(message.text).toContain('Owner & "Family" <password>');

  const url = 'https://ledger-onboard.vercel.app/tenant/billing?tab=open&source=email';
  const layout = buildEmail({ appUrl: 'https://ledger-onboard.vercel.app', action: { label: 'Open', url } });
  expect(layout.html).toContain('tab=open&amp;source=email');
  expect(layout.text).toContain(url);
});

test('OTP keeps its six-digit code and expiry in both alternatives without exposing it in the inbox preview', () => {
  jest.spyOn(EmailService, 'send').mockImplementation((message) => message);
  const message = EmailService.sendOtpEmail('tenant@example.com', '123456', 'email_verification', 'Alex');
  expect(message.text).toContain('123456');
  expect(message.html).toContain('123456');
  expect(message.text).toContain('10 minutes');
  expect(message.html.match(/<div style="display:none[\s\S]*?<\/div>/)[0]).not.toContain('123456');
});

test.each([
  ['sendPaymentVerifiedEmail', ['Alex', '500'], '/tenant/billing'],
  ['sendPaymentRejectedEmail', ['Alex', '<script>reason</script>'], '/tenant/billing'],
  ['sendArchiveWarningEmail', ['Alex', 5], '/login'],
  ['sendArchivedNoticeEmail', ['Alex'], '/account-recovery'],
  ['sendBusinessVerificationApprovedEmail', ['Alex'], '/landlord/properties'],
  ['sendBusinessVerificationRejectedEmail', ['Alex', 'Missing permit'], '/landlord/verification'],
  ['sendBillReminderEmail', ['Alex', { periodLabel: 'October 2026', amount: '500', dueDateLabel: 'October 10', daysRemaining: 7, reference: 'ABC123' }], '/tenant/billing'],
])('%s links to the deployed frontend route in both email alternatives', (method, args, route) => {
  jest.spyOn(EmailService, 'send').mockImplementation((message) => message);
  const message = EmailService[method]('user@example.com', ...args);
  const url = `https://ledger-onboard.vercel.app${route}`;
  expect(message.text).toContain(url);
  expect(message.html).toContain(`href="${url}"`);
  expect(message.html).not.toContain('<script>reason</script>');
});

test('rejects an executable link instead of inserting it into an email', () => {
  expect(() => buildEmail({ appUrl: 'https://ledger-onboard.vercel.app', action: { label: 'Open', url: 'javascript:alert(1)' } })).toThrow(/http\(s\)/);
});
