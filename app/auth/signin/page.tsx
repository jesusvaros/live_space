'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function SignInPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      if (data.user) {
        // Verificar si el usuario tiene perfil completo
        let { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', data.user.id)
          .single()

        // Si no existe el perfil, crearlo y volver a consultar
        if (profileError && profileError.code === 'PGRST116') {
          const { error: insertError } = await supabase
            .from('profiles')
            .insert([{ id: data.user.id, username: null, avatar_url: null }])
          
          if (!insertError) {
            // Volver a consultar el perfil después de crearlo
            const result = await supabase
              .from('profiles')
              .select('username')
              .eq('id', data.user.id)
              .single()
            profile = result.data
          }
        }

        // Redirigir según si tiene username o no
        if (!profile || !profile.username) {
          router.push('/onboarding')
        } else {
          router.push('/feed')
        }
      }
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Iniciar sesión</CardTitle>
          <CardDescription>Accede a tu cuenta de AppMusic</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 p-3 rounded">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            ¿No tienes cuenta?{' '}
            <Link href="/auth/signup" className="text-primary hover:underline">
              Crear cuenta
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
