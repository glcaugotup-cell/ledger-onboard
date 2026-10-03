/** Generate HTML previews with sample data. No SMTP connection or database access. */
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const EmailService = require('../services/EmailService');
const env = require('../config/env');

// Capture the actual template output without invoking any email transport.
EmailService.send = (message) => message;
const outputDir = path.join(__dirname, '..', '.email-previews');
fs.mkdirSync(outputDir, { recursive: true });

const recipient = 'sample@example.com';
const name = 'Alex Santos';
const activationUrl = `${env.emailAppUrl}/activate-caretaker?token=preview-only-not-a-valid-token`;
const samples = [
  ['caretaker-invitation', 'sendCaretakerCreatedEmail', name, activationUrl, 'Jamie Reyes', 'SampleOnly123!'],
  ['caretaker-activation', 'sendCaretakerActivationEmail', name, activationUrl, 'Jamie Reyes'],
  ['email-verification', 'sendOtpEmail', '123456', 'email_verification', 'Alex'],
  ['login-verification', 'sendOtpEmail', '123456', 'login_mfa', 'Alex'],
  ['password-reset', 'sendOtpEmail', '123456', 'password_reset', 'Alex'],
  ['archive-warning', 'sendArchiveWarningEmail', name, 5],
  ['account-archived', 'sendArchivedNoticeEmail', name],
  ['payment-verified', 'sendPaymentVerifiedEmail', name, '3,500.00'],
  ['payment-rejected', 'sendPaymentRejectedEmail', name, 'The payment reference could not be confirmed. Please upload a clearer receipt.'],
  ['bill-reminder', 'sendBillReminderEmail', name, {
    periodLabel: 'October 2026', amount: '3,500.00', dueDateLabel: 'October 10, 2026', daysRemaining: 7, reference: 'ABC123',
  }],
  ['business-approved', 'sendBusinessVerificationApprovedEmail', name],
  ['business-rejected', 'sendBusinessVerificationRejectedEmail', name, 'Please upload a clear copy of your business permit.'],
];

for (const [slug, method, ...args] of samples) {
  const message = EmailService[method](recipient, ...args);
  fs.writeFileSync(path.join(outputDir, `${slug}.html`), message.html, 'utf8');
}
console.log(`Created ${samples.length} sample email previews in ${outputDir}. No emails were sent.`);
