'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

const AVATAR_OPTIONS = [
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Luna',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Max',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Mia',
]

export default function OnboardingPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [selectedAvatar, setSelectedAvatar] = useState(AVATAR_OPTIONS[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [checkingAuth, setCheckingAuth] = useState(true)

  useEffect(() => {
    const getUser = async () => {
      try {
        // Verificar sesión activa
        const { data: { session } } = await supabase.auth.getSession()
        
        if (session?.user) {
          setUserId(session.user.id)
        } else {
          // No hay sesión activa, redirigir al signin
          console.log('No active session, redirecting to signin')
          router.push('/auth/signin')
        }
      } catch (err) {
        console.error('Error getting user:', err)
        router.push('/auth/signin')
      } finally {
        setCheckingAuth(false)
      }
    }
    
    // Pequeño delay para asegurar que la sesión esté lista
    const timer = setTimeout(getUser, 100)
    return () => clearTimeout(timer)
  }, [router])

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    )
  }

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return

    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          username,
          avatar_url: selectedAvatar,
        })
        .eq('id', userId)

      if (error) throw error

      router.push('/feed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al completar el perfil')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>¡Bienvenido! 🎉</CardTitle>
          <CardDescription>Completa tu perfil para empezar</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleComplete} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="username">Nombre de usuario</Label>
              <Input
                id="username"
                type="text"
                placeholder="tu_nombre"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Elige tu avatar</Label>
              <div className="flex gap-3 justify-center flex-wrap">
                {AVATAR_OPTIONS.map((avatar) => (
                  <button
                    key={avatar}
                    type="button"
                    onClick={() => setSelectedAvatar(avatar)}
                    className={`rounded-full transition-all ${
                      selectedAvatar === avatar
                        ? 'ring-4 ring-primary scale-110'
                        : 'hover:scale-105 opacity-60'
                    }`}
                  >
                    <Avatar className="w-16 h-16">
                      <AvatarImage src={avatar} />
                      <AvatarFallback>?</AvatarFallback>
                    </Avatar>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 p-3 rounded">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Guardando...' : 'Completar perfil'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
