'use client'

import { useState, useEffect, useRef } from 'react'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface SearchSelectOption {
  id: string
  name: string
  subtitle?: string
}

interface SearchSelectProps {
  label: string
  placeholder: string
  value: SearchSelectOption | null
  onSelect: (option: SearchSelectOption | null) => void
  onSearch: (query: string) => Promise<SearchSelectOption[]>
  onCreate?: (name: string) => Promise<SearchSelectOption>
  disabled?: boolean
  createLabel?: string
}

export default function SearchSelect({
  label,
  placeholder,
  value,
  onSelect,
  onSearch,
  onCreate,
  disabled = false,
  createLabel = 'Crear nuevo'
}: SearchSelectProps) {
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [options, setOptions] = useState<SearchSelectOption[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  // Search when query changes
  useEffect(() => {
    const searchOptions = async () => {
      if (searchQuery.trim().length < 2) {
        setOptions([])
        return
      }

      setLoading(true)
      try {
        const results = await onSearch(searchQuery)
        setOptions(results)
      } catch (error) {
        console.error('Search error:', error)
        setOptions([])
      } finally {
        setLoading(false)
      }
    }

    const debounce = setTimeout(searchOptions, 300)
    return () => clearTimeout(debounce)
  }, [searchQuery, onSearch])

  const handleCreate = async () => {
    if (!onCreate || !searchQuery.trim()) return

    setCreating(true)
    try {
      const newOption = await onCreate(searchQuery.trim())
      onSelect(newOption)
      setSearchQuery('')
      setOpen(false)
    } catch (error) {
      console.error('Create error:', error)
    } finally {
      setCreating(false)
    }
  }

  const handleSelect = (option: SearchSelectOption) => {
    onSelect(option)
    setSearchQuery('')
    setOpen(false)
  }

  const handleClear = () => {
    onSelect(null)
    setSearchQuery('')
  }

  return (
    <div className="space-y-2" ref={containerRef}>
      <Label>{label}</Label>
      <div className="relative">
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          onClick={() => setOpen(!open)}
          disabled={disabled}
        >
          {value ? (
            <span className="truncate">{value.name}</span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>

        {open && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
            <div className="p-2">
              <Input
                placeholder={`Buscar ${label.toLowerCase()}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9"
                autoFocus
              />
            </div>

            <div className="max-h-60 overflow-y-auto">
              {loading ? (
                <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                  Buscando...
                </div>
              ) : options.length === 0 && searchQuery.length >= 2 ? (
                <div className="px-2 py-4">
                  <p className="text-center text-sm text-muted-foreground mb-2">
                    No se encontraron resultados
                  </p>
                  {onCreate && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={handleCreate}
                      disabled={creating}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {creating ? 'Creando...' : `${createLabel}: "${searchQuery}"`}
                    </Button>
                  )}
                </div>
              ) : options.length > 0 ? (
                <div className="p-1">
                  {options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                      onClick={() => handleSelect(option)}
                    >
                      <Check
                        className={`mr-2 h-4 w-4 ${
                          value?.id === option.id ? 'opacity-100' : 'opacity-0'
                        }`}
                      />
                      <div className="flex flex-col items-start">
                        <span>{option.name}</span>
                        {option.subtitle && (
                          <span className="text-xs text-muted-foreground">
                            {option.subtitle}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ) : searchQuery.length < 2 ? (
                <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                  Escribe al menos 2 caracteres para buscar
                </div>
              ) : null}
            </div>

            {value && (
              <div className="border-t p-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={handleClear}
                >
                  Limpiar selección
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
