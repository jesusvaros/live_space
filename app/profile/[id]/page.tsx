'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Profile } from '@/lib/types'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

export default function ProfilePage() {
  const router = useRouter()
  const params = useParams()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', params.id)
          .single()

        if (error) throw error
        setProfile(data)
      } catch (error) {
        console.error('Error fetching profile:', error)
      } finally {
        setLoading(false)
      }
    }

    if (params.id) {
      fetchProfile()
    }
  }, [params.id])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Cargando perfil...</p>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground mb-4">Perfil no encontrado</p>
            <Button onClick={() => router.push('/feed')}>Volver al feed</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="bg-white dark:bg-gray-950 border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">🎵 AppMusic</h1>
          <Button variant="outline" onClick={() => router.push('/feed')}>
            Volver al feed
          </Button>
        </div>
      </header>

      {/* Profile */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-6">
              <Avatar className="w-24 h-24">
                <AvatarImage src={profile.avatar_url || ''} />
                <AvatarFallback className="text-3xl">
                  {profile.username?.[0]?.toUpperCase() || '?'}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-3xl font-bold mb-1">{profile.username || 'Usuario'}</h2>
                <p className="text-muted-foreground">
                  Miembro desde {new Date(profile.created_at).toLocaleDateString('es-ES')}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border-t pt-6">
              <h3 className="text-xl font-semibold mb-4">Videos publicados</h3>
              <div className="text-center py-12 text-muted-foreground">
                <div className="text-6xl mb-4">🎬</div>
                <p>Aún no hay videos publicados</p>
                <p className="text-sm mt-2">¡Pronto podrás subir tus momentos musicales favoritos!</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
