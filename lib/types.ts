export interface Profile {
  id: string
  username: string | null
  avatar_url: string | null
  created_at: string
}

export interface Artist {
  id: string
  name: string
  slug: string
  image_url?: string
  created_at: string
  updated_at: string
}

export interface Venue {
  id: string
  name: string
  slug: string
  city?: string
  country?: string
  latitude?: number
  longitude?: number
  image_url?: string
  created_at: string
  updated_at: string
}

export interface Video {
  id: string
  user_id: string
  title?: string
  url: string
  venue?: string // Legacy field
  artist?: string // Legacy field
  artist_id?: string
  venue_id?: string
  song?: string
  concert_date?: string
  recorded_time?: string
  latitude?: number
  longitude?: number
  thumbnail_url?: string
  duration?: number
  file_size?: number
  created_at: string
  profile?: Profile
  artists?: Artist
  venues?: Venue
}
