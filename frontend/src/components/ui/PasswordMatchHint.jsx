/** Live "✓ Passwords match" / "Passwords do not match" under a Confirm password field — nothing while it's empty. */
export default function PasswordMatchHint({ password, confirmPassword }) {
  if (!confirmPassword) return null;

  if (confirmPassword === password) {
    return (
      <p className="mt-2 flex items-center gap-2 text-xs text-green-600">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-100 text-[10px] text-green-600">✓</span>
        Passwords match
      </p>
    );
  }
  return <p className="mt-2 text-xs text-red-600">Passwords do not match</p>;
}
