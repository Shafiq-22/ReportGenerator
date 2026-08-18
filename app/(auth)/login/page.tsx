import { LoginForm } from './login-form'

export const metadata = { title: 'Sign in · Report Generator' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-slate-900">Report Generator</h1>
          <p className="mt-1 text-sm text-slate-500">Daily progress capture and reporting</p>
        </div>
        <LoginForm next={next ?? '/dashboard'} />
      </div>
    </main>
  )
}
