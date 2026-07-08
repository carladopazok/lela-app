import { NextResponse } from 'next/server'

export async function GET() {
  const res = NextResponse.redirect(new URL('/install', process.env.APP_URL!))
  res.cookies.delete('lela_session')
  return res
}
