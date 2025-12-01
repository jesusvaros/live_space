export interface Profile {
  id: string
  username: string | null
  avatar_url: string | null
  created_at: string
}

export interface Video {
  id: string
  user_id: string
  title: string
  url: string
  created_at: string
  profile?: Profile
}
