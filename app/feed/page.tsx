'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Video } from '@/lib/types'
import { User } from '@supabase/supabase-js'
import { Music, Users, MapPin } from 'lucide-react'

export default function Feed() {
  const router = useRouter()
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/welcome')
      } else {
        setUser(user)
      }
    }
    checkAuth()
  }, [router])

  useEffect(() => {
    const fetchVideos = async () => {
      try {
        const response = await fetch('/api/feed')
        const data = await response.json()
        setVideos(data)
      } catch (error) {
        console.error('Error fetching videos:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchVideos()
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-2xl font-bold text-gray-900">Live Space</h1>
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                <Music className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
          
          {/* Stats */}
          <div className="flex space-x-6 text-sm">
            <div className="flex items-center space-x-1">
              <Users className="w-4 h-4 text-gray-500" />
              <span className="text-gray-600">1.2k artistas</span>
            </div>
            <div className="flex items-center space-x-1">
              <MapPin className="w-4 h-4 text-gray-500" />
              <span className="text-gray-600">45 lugares</span>
            </div>
          </div>
        </div>
      </header>

      {/* Feed Content */}
      <div className="space-y-4">
        {videos.length === 0 ? (
          // Mock videos when no real videos
          [1, 2, 3, 4, 5, 6].map((i: number) => (
            <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mx-4 mt-4">
              <div className="aspect-video bg-gray-200 rounded-lg mb-3 flex items-center justify-center">
                <div className="text-4xl">🎵</div>
              </div>
              <h3 className="font-semibold text-gray-900">Video Title {i}</h3>
              <p className="text-sm text-gray-600 mt-1">Description for video {i}</p>
              <div className="mt-3 flex items-center space-x-2">
                <div className="w-6 h-6 bg-gray-300 rounded-full"></div>
                <span className="text-xs text-gray-500">Artist {i}</span>
              </div>
            </div>
          ))
        ) : (
          videos.map((video) => (
            <div key={video.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mx-4 mt-4">
              <div className="aspect-video bg-gray-200 rounded-lg mb-3 flex items-center justify-center">
                <div className="text-4xl">🎸</div>
              </div>
              <h3 className="font-semibold text-gray-900">{video.title}</h3>
              <p className="text-sm text-gray-600 mt-1">by {video.profile?.username}</p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}