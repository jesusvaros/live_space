'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import LocationMap from '@/components/map/LocationMap'
import { MapPin } from 'lucide-react'

interface CreateVenueDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onVenueCreated: (venue: { id: string; name: string; subtitle?: string }) => void
  initialName?: string
}

export default function CreateVenueDialog({
  open,
  onOpenChange,
  onVenueCreated,
  initialName = ''
}: CreateVenueDialogProps) {
  const [name, setName] = useState(initialName)
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [latitude, setLatitude] = useState<number | undefined>(40.4168) // Default Madrid
  const [longitude, setLongitude] = useState<number | undefined>(-3.7038)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLocationSelect = (lat: number, lng: number) => {
    setLatitude(lat)
    setLongitude(lng)
  }

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('El nombre del lugar es requerido')
      return
    }

    if (!latitude || !longitude) {
      setError('Por favor selecciona una ubicación en el mapa')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/venues/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          city: city.trim() || null,
          country: country.trim() || null,
          latitude,
          longitude
        })
      })

      if (!response.ok) {
        throw new Error('Error al crear el lugar')
      }

      const data = await response.json()
      
      onVenueCreated({
        id: data.id,
        name: data.name,
        subtitle: data.city && data.country ? `${data.city}, ${data.country}` : data.city || data.country
      })

      // Reset form
      setName('')
      setCity('')
      setCountry('')
      setLatitude(40.4168)
      setLongitude(-3.7038)
      onOpenChange(false)
    } catch (err) {
      console.error('Error creating venue:', err)
      setError(err instanceof Error ? err.message : 'Error al crear el lugar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crear Nuevo Lugar</DialogTitle>
          <DialogDescription>
            Añade un nuevo lugar de concierto con su ubicación en el mapa
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="venue-name">Nombre del Lugar *</Label>
            <Input
              id="venue-name"
              placeholder="ej. Estadio Santiago Bernabéu"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">Ciudad</Label>
              <Input
                id="city"
                placeholder="ej. Madrid"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="country">País</Label>
              <Input
                id="country"
                placeholder="ej. España"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Ubicación en el Mapa *
            </Label>
            <p className="text-sm text-muted-foreground mb-2">
              Haz clic en el mapa para marcar la ubicación exacta
            </p>
            <LocationMap
              latitude={latitude}
              longitude={longitude}
              onLocationSelect={handleLocationSelect}
              editable={!loading}
              height="300px"
              zoom={13}
            />
            {latitude && longitude && (
              <p className="text-xs text-muted-foreground font-mono">
                {latitude.toFixed(6)}, {longitude.toFixed(6)}
              </p>
            )}
          </div>

          {error && (
            <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 p-3 rounded">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !name.trim() || !latitude || !longitude}
          >
            {loading ? 'Creando...' : 'Crear Lugar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
