import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')

  if (!query || query.length < 2) {
    return NextResponse.json([])
  }

  try {
    const { data, error } = await supabase.rpc('search_venues', {
      search_query: query,
      result_limit: 10
    })

    if (error) throw error

    return NextResponse.json(data || [])
  } catch (error) {
    console.error('Venue search error:', error)
    return NextResponse.json({ error: 'Failed to search venues' }, { status: 500 })
  }
}
