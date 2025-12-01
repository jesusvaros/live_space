import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function WelcomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-4xl font-bold mb-2">🎵 AppMusic</CardTitle>
          <CardDescription className="text-lg">
            Comparte tus momentos musicales favoritos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-center text-muted-foreground">
            Descubre y comparte videos de conciertos en vivo
          </p>
          <div className="space-y-3">
            <Link href="/auth/signup" className="block">
              <Button className="w-full" size="lg">
                Crear cuenta
              </Button>
            </Link>
            <Link href="/auth/signin" className="block">
              <Button variant="outline" className="w-full" size="lg">
                Iniciar sesión
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
