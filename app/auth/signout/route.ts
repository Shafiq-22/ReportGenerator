import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { siteUrl } from '@/lib/env'

export async function POST() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login', siteUrl()), { status: 303 })
}
