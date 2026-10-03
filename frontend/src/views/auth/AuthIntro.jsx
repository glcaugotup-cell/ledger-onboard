/** Original headings shared by the standalone login and signup forms. */
export default function AuthIntro({ mode = 'login' }) {
  const isRegister = mode === 'register';

  return (
    <>
      <h1 className="text-2xl font-bold text-gray-900">{isRegister ? 'Create Account' : 'Login'}</h1>
      <p className="mt-1 text-sm text-gray-500">
        {isRegister ? 'Join Ledger OnBoard to start your journey.' : 'Ledger Onboard'}
      </p>
    </>
  );
}
