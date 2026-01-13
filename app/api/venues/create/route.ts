import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .trim()
}

export async function POST(request: Request) {
  try {
    const { name, city, country, latitude, longitude } = await request.json()

    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const slug = generateSlug(name)

    const { data, error } = await supabase
      .from('venues')
      .insert({ 
        name: name.trim(), 
        slug,
        city: city?.trim() || null,
        country: country?.trim() || null,
        latitude: latitude || null,
        longitude: longitude || null
      })
      .select()
      .single()

    if (error) {
      // Check if it's a duplicate
      if (error.code === '23505') {
        // Try to fetch the existing venue
        const { data: existing } = await supabase
          .from('venues')
          .select()
          .eq('name', name.trim())
          .maybeSingle()
        
        if (existing) {
          return NextResponse.json(existing)
        }
      }
      throw error
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Venue creation error:', error)
    return NextResponse.json({ error: 'Failed to create venue' }, { status: 500 })
  }
}
