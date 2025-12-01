import { NextResponse } from 'next/server'

// Mock data para el MVP
const mockVideos = [
  {
    id: '1',
    title: 'Rosalía - Concierto Madrid 2024',
    url: '/placeholder1.mp4',
    created_at: new Date().toISOString(),
    profile: {
      id: 'user1',
      username: 'music_lover',
      avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
      created_at: new Date().toISOString(),
    },
  },
  {
    id: '2',
    title: 'The Weeknd - Live Barcelona',
    url: '/placeholder2.mp4',
    created_at: new Date().toISOString(),
    profile: {
      id: 'user2',
      username: 'concert_fan',
      avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka',
      created_at: new Date().toISOString(),
    },
  },
  {
    id: '3',
    title: 'Bad Bunny - Un Verano Sin Ti Tour',
    url: '/placeholder3.mp4',
    created_at: new Date().toISOString(),
    profile: {
      id: 'user3',
      username: 'live_music',
      avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Luna',
      created_at: new Date().toISOString(),
    },
  },
  {
    id: '4',
    title: 'Taylor Swift - Eras Tour Madrid',
    url: '/placeholder4.mp4',
    created_at: new Date().toISOString(),
    profile: {
      id: 'user4',
      username: 'swiftie_spain',
      avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Max',
      created_at: new Date().toISOString(),
    },
  },
]

export async function GET() {
  // Simular un pequeño delay como si fuera una llamada real a la DB
  await new Promise((resolve) => setTimeout(resolve, 300))
  
  return NextResponse.json(mockVideos)
}
