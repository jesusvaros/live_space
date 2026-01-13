# Artists and Venues Setup Guide

This guide explains how to set up the artists and venues database tables to avoid duplicates and provide a better user experience with search/autocomplete functionality.

## Overview

Instead of allowing users to type free-form text for artists and venues (which leads to duplicates like "Taylor Swift" vs "taylor swift" vs "T. Swift"), we now have dedicated tables with search functionality.

## Database Schema

### New Tables

1. **artists** - Stores all artists
   - `id` (UUID, primary key)
   - `name` (TEXT, unique) - Artist name
   - `slug` (TEXT, unique) - URL-friendly version
   - `image_url` (TEXT, optional) - Artist image
   - `created_at`, `updated_at` (TIMESTAMPTZ)

2. **venues** - Stores all concert venues
   - `id` (UUID, primary key)
   - `name` (TEXT) - Venue name
   - `slug` (TEXT, unique) - URL-friendly version
   - `city`, `country` (TEXT, optional) - Location info
   - `latitude`, `longitude` (DECIMAL) - GPS coordinates
   - `image_url` (TEXT, optional) - Venue image
   - `created_at`, `updated_at` (TIMESTAMPTZ)
   - Unique constraint on (name, city, country)

3. **videos** - Updated with foreign keys
   - `artist_id` (UUID, references artists.id)
   - `venue_id` (UUID, references venues.id)
   - Old text columns (`artist`, `venue`) kept for backward compatibility

## Setup Instructions

### 1. Run the Migration

Execute the SQL migration in your Supabase SQL Editor:

```bash
# Copy the contents of supabase-artists-venues-migration.sql
# Paste into Supabase Dashboard > SQL Editor > New Query
# Run the query
```

This will:
- Create `artists` and `venues` tables
- Add foreign keys to `videos` table
- Create search functions
- Insert sample data (Spanish venues + popular artists)
- Set up RLS policies

### 2. Verify Tables

Check that the tables were created:

```sql
SELECT * FROM artists LIMIT 5;
SELECT * FROM venues LIMIT 5;
```

### 3. Test Search Functions

```sql
-- Search artists
SELECT * FROM search_artists('taylor', 10);

-- Search venues
SELECT * FROM search_venues('bernabeu', 10);
```

## How It Works

### User Flow

1. **Step 4: Details** - User reaches the final step
2. User clicks on "Lugar del Concierto" dropdown
3. Types to search (e.g., "bernabeu")
4. API calls `/api/venues/search?q=bernabeu`
5. Results show matching venues with city/country
6. User selects existing venue OR creates new one
7. Same process for artist selection

### Search & Create

- **Search**: Debounced search (300ms) with ILIKE matching
- **Create**: If no results found, user can create new entry
- **Duplicates**: Prevented by unique constraints and slug generation
- **Auto-complete**: Shows top 10 results, prioritizes exact matches

### API Endpoints

- `GET /api/artists/search?q={query}` - Search artists
- `POST /api/artists/create` - Create new artist
- `GET /api/venues/search?q={query}` - Search venues
- `POST /api/venues/create` - Create new venue

## Components

### SearchSelect Component

Located at `/components/ui/search-select.tsx`

Features:
- Dropdown with search input
- Debounced API calls
- "Create new" button when no results
- Clear selection option
- Loading states
- Click outside to close

Usage:
```tsx
<SearchSelect
  label="Artista"
  placeholder="Buscar o crear artista..."
  value={selectedArtist}
  onSelect={setSelectedArtist}
  onSearch={searchArtists}
  onCreate={createArtist}
  createLabel="Crear artista"
/>
```

## Benefits

✅ **No Duplicates** - Unique constraints prevent duplicate entries
✅ **Better UX** - Autocomplete is faster than typing
✅ **Data Quality** - Consistent naming across all videos
✅ **Analytics** - Easy to query "all videos by Taylor Swift"
✅ **Scalability** - Can add more metadata (images, bio, etc.)
✅ **SEO** - Clean URLs with slugs

## Sample Data Included

### Artists (10)
- Taylor Swift
- Bad Bunny
- Coldplay
- Rosalía
- The Weeknd
- Dua Lipa
- Ed Sheeran
- Beyoncé
- Drake
- Billie Eilish

### Venues (8 Spanish venues)
- Estadio Santiago Bernabéu (Madrid)
- Camp Nou (Barcelona)
- WiZink Center (Madrid)
- Palau Sant Jordi (Barcelona)
- Estadio Wanda Metropolitano (Madrid)
- Palacio de los Deportes (Madrid)
- RCDE Stadium (Barcelona)
- Estadio de La Cartuja (Sevilla)

## Future Enhancements

- Add artist images and bios
- Add venue capacity and type
- Implement venue verification system
- Add "suggest edit" for existing entries
- Implement admin moderation panel
- Add artist/venue detail pages
- Show "trending" artists and venues

## Troubleshooting

### Search returns no results
- Check that the migration ran successfully
- Verify RLS policies are enabled
- Check browser console for API errors

### Cannot create new artist/venue
- Ensure user is authenticated
- Check for unique constraint violations
- Verify API endpoints are accessible

### Duplicates still appearing
- Check slug generation function
- Verify unique constraints are in place
- May need to clean up existing data

## Migration from Old System

If you have existing videos with text-based artist/venue fields:

```sql
-- Create artists from existing videos
INSERT INTO artists (name, slug)
SELECT DISTINCT artist, generate_slug(artist)
FROM videos
WHERE artist IS NOT NULL
ON CONFLICT (name) DO NOTHING;

-- Update videos with artist_id
UPDATE videos v
SET artist_id = a.id
FROM artists a
WHERE v.artist = a.name;

-- Repeat for venues...
```

## Notes

- Old `artist` and `venue` text columns are kept for backward compatibility
- Can be removed once all data is migrated
- Search functions use ILIKE for case-insensitive matching
- Slugs are auto-generated from names (lowercase, hyphenated)
