/** Plain-language fix for each email delivery result, shown to the main admin by the test email check. */
const EMAIL_ADVICE = Object.freeze({
  accepted: 'The email was accepted for delivery. Check your inbox and spam folder (with Brevo it also appears in Brevo → Transactional → Logs; with Gmail, in the Sent folder of the sending account).',
  missing_gmail_credentials: 'EMAIL_TRANSPORT is gmail but GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET or GMAIL_REFRESH_TOKEN is empty. Add all three on the server.',
  gmail_auth_failed: 'Google refused the Gmail credentials. Check the client ID and secret, and make a new refresh token in the OAuth Playground (the Google Cloud app must be In production, or tokens expire after 7 days).',
  gmail_permission: 'Gmail refused to send. Make sure the Gmail API is enabled in Google Cloud, the refresh token was made with the gmail.send scope, and EMAIL_FROM is the same Gmail address.',
  transport_disabled: 'Sending is switched off: EMAIL_TRANSPORT is "none" on Render. Set EMAIL_TRANSPORT=brevo and save.',
  console_in_production: 'Sending is switched off: EMAIL_TRANSPORT is missing (or "console") on Render. Set EMAIL_TRANSPORT=brevo and save.',
  missing_api_key: 'BREVO_API_KEY is empty on Render. Paste the API key from Brevo → SMTP & API → API keys (it starts with xkeysib-).',
  sender_invalid: 'Brevo does not accept the sender. In Brevo → Senders, make sure it is verified, and set EMAIL_FROM on Render to exactly that address.',
  ip_not_authorized: "Brevo blocked Render's IP address. In Brevo → Security → Authorized IPs, authorize the address under Unauthorized IPs, or deactivate blocking for API keys.",
  authentication_failed: 'Brevo rejected BREVO_API_KEY. Create a new API key in this Brevo account (an API key, not an SMTP key) and paste it on Render.',
  sending_not_enabled: 'This Brevo account cannot send transactional email yet. Contact Brevo support to activate it.',
  quota_exceeded: 'The Brevo sending limit is used up. Wait until it resets or upgrade the plan.',
  timeout: 'Brevo did not answer in time. Try again in a minute.',
  network_error: 'The server could not reach Brevo. Try again in a minute.',
  invalid_response: 'Brevo answered without confirming the email. Check Brevo → Transactional → Logs and the account status.',
  provider_rejected: 'Brevo refused the email. Check the account status in Brevo and Brevo → Transactional → Logs.',
  smtp_error: 'The SMTP server refused the email. Check the SMTP_* settings, or switch to EMAIL_TRANSPORT=brevo.',
});

module.exports = { EMAIL_ADVICE };
