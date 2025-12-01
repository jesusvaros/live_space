'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Video } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { User } from '@supabase/supabase-js'

export default function FeedPage() {
  const router = useRouter()
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [emailConfirmed, setEmailConfirmed] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/welcome')
      } else {
        setUser(user)
        // Verificar si el email está confirmado
        setEmailConfirmed(!!user.email_confirmed_at)
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

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/welcome')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="bg-white dark:bg-gray-950 border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">🎵 AppMusic</h1>
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push(`/profile/${user?.id}`)}>
              Mi perfil
            </Button>
            <Button variant="outline" onClick={handleSignOut}>
              Salir
            </Button>
          </div>
        </div>
      </header>

      {/* Feed */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Banner de confirmación de email */}
        {!emailConfirmed && (
          <div className="mb-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📧</span>
              <div className="flex-1">
                <p className="font-semibold text-yellow-900 dark:text-yellow-100">
                  Confirma tu email
                </p>
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  Revisa tu bandeja de entrada y confirma tu email para desbloquear todas las funciones.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mb-6">
          <h2 className="text-3xl font-bold mb-2">Feed de videos</h2>
          <p className="text-muted-foreground">Descubre los mejores momentos musicales</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {videos.map((video) => (
            <Card key={video.id} className="overflow-hidden hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3 mb-2">
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={video.profile?.avatar_url || ''} />
                    <AvatarFallback>{video.profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold text-sm">{video.profile?.username}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(video.created_at).toLocaleDateString('es-ES')}
                    </p>
                  </div>
                </div>
                <CardTitle className="text-lg">{video.title}</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Placeholder para el video */}
                <div className="aspect-video bg-gradient-to-br from-purple-200 to-blue-200 dark:from-purple-900 dark:to-blue-900 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-6xl mb-2">🎸</div>
                    <p className="text-sm text-muted-foreground">Video placeholder</p>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button variant="ghost" size="sm" className="flex-1">
                    ❤️ Me gusta
                  </Button>
                  <Button variant="ghost" size="sm" className="flex-1">
                    💬 Comentar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {videos.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No hay videos todavía</p>
          </div>
        )}
      </main>
    </div>
  )
}
