# Video Upload Feature Setup Guide

## Overview

This feature allows users to upload concert videos with rich metadata including:
- **Venue** (concert location name)
- **Artist** (performing artist)
- **Song** (song name)
- **Concert date** (extracted from video metadata)
- **Recording time** (extracted from video metadata)
- **GPS location** (user can select on map using Leaflet + OpenFreeMap)
- **Video thumbnail** (auto-generated)
- **Duration & file size** (auto-extracted)

## Database Setup

### 1. Run the Migration Script

Execute the SQL migration in your Supabase SQL Editor:

```bash
# File: supabase-video-upload-migration.sql
```

This will:
- Add new columns to the `videos` table
- Create `videos` and `thumbnails` storage buckets
- Set up Row Level Security policies for storage

### 2. Verify Storage Buckets

Go to **Storage** in your Supabase dashboard and verify:
- ✅ `videos` bucket exists (public)
- ✅ `thumbnails` bucket exists (public)

### 3. Configure Storage Limits (Optional)

In Supabase Storage settings, you can configure:
- Maximum file size (default: 50MB, recommended: 500MB for videos)
- Allowed MIME types (video/*)

## Features

### Metadata Extraction

The app automatically extracts:
- **Duration**: Video length in seconds
- **File size**: Total file size in bytes
- **Creation time**: From file's lastModified timestamp
- **Video dimensions**: Width and height

**Note**: GPS coordinates are typically not accessible from browser APIs. Users must manually select the location on the map.

### Map Integration

- Uses **Leaflet** for interactive maps
- Uses **OpenFreeMap** tiles (free, no API key required)
- Users can click on the map to set concert location
- Default location: Madrid, Spain (can be changed)

### Video Upload Flow

1. User selects video file
2. App extracts metadata automatically
3. User fills in: venue, artist, song
4. User optionally selects location on map
5. App generates thumbnail from video
6. Video and thumbnail upload to Supabase Storage
7. Metadata saved to database
8. User redirected to feed

## File Structure

```
app/
  upload/
    page.tsx              # Upload page with form
components/
  map/
    LocationMap.tsx       # Leaflet map component
lib/
  video-metadata.ts       # Metadata extraction utilities
  types.ts               # TypeScript interfaces
supabase-video-upload-migration.sql  # Database migration
```

## Usage

### Access Upload Page

- Click "Subir Video" button in the feed header
- Or navigate to `/upload`

### Form Fields

**Required:**
- Video file (max 500MB)
- Venue name
- Artist name
- Song name

**Optional:**
- Location (click on map)

**Auto-extracted:**
- Duration
- File size
- Recording date/time
- Thumbnail

## Technical Details

### Storage Structure

Videos are stored with this path pattern:
```
videos/{userId}/{timestamp}_{filename}
thumbnails/{userId}/{timestamp}_thumbnail.jpg
```

### Database Schema

```sql
videos (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  title TEXT,                    -- Auto-generated: "Artist - Song"
  url TEXT NOT NULL,             -- Public URL from Storage
  venue TEXT,                    -- Concert venue name
  artist TEXT,                   -- Artist name
  song TEXT,                     -- Song name
  concert_date TIMESTAMPTZ,      -- Date of concert
  recorded_time TIMESTAMPTZ,     -- Exact recording time
  latitude DECIMAL(10, 8),       -- GPS latitude
  longitude DECIMAL(11, 8),      -- GPS longitude
  thumbnail_url TEXT,            -- Thumbnail public URL
  duration INTEGER,              -- Video duration in seconds
  file_size BIGINT,              -- File size in bytes
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

### Indexes

For optimal query performance:
- `idx_videos_venue` - Search by venue
- `idx_videos_artist` - Search by artist
- `idx_videos_song` - Search by song
- `idx_videos_concert_date` - Sort by concert date
- `idx_videos_location` - Spatial queries (lat/lng)

## Map Configuration

### Default Location

Currently set to Madrid, Spain (40.4168, -3.7038). To change:

```typescript
// In components/map/LocationMap.tsx
const map = L.map(containerRef.current).setView(
  [YOUR_LAT, YOUR_LNG], // Change these coordinates
  zoom
)
```

### Map Tiles

Using OpenFreeMap (no API key needed):
```
https://tiles.openfreemap.org/osm/{z}/{x}/{y}.png
```

Alternative tile providers:
- OpenStreetMap: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`
- CartoDB: `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png`

## Limitations

### Browser Metadata Access

Browsers have limited access to video metadata:
- ✅ Duration, dimensions, file size
- ✅ File modification date
- ❌ GPS coordinates (not accessible via browser APIs)
- ❌ Camera make/model
- ❌ Original creation date (only file modification date)

For full EXIF/metadata extraction, you would need server-side processing with tools like:
- FFmpeg (server-side)
- ExifTool (server-side)

### File Size Limits

- Client-side validation: 500MB
- Supabase default: 50MB (needs to be increased in dashboard)
- Recommended: Configure Supabase to allow up to 500MB-1GB

## Troubleshooting

### Upload Fails

1. Check Supabase Storage bucket exists
2. Verify RLS policies are set correctly
3. Check file size limits in Supabase dashboard
4. Ensure user is authenticated

### Map Not Showing

1. Verify Leaflet CSS is loaded
2. Check browser console for errors
3. Ensure container has explicit height
4. Verify OpenFreeMap tiles are accessible

### Metadata Not Extracted

1. Ensure video file is valid
2. Check browser console for errors
3. Try different video format (MP4 recommended)

## Next Steps

### Enhancements

1. **Server-side metadata extraction** - Use FFmpeg for full metadata
2. **Video compression** - Reduce file sizes before upload
3. **Multiple video formats** - Support more formats
4. **Progress tracking** - Real-time upload progress
5. **Drag & drop** - Improve UX with drag-drop upload
6. **Video preview** - Show preview before upload
7. **Geolocation API** - Auto-detect user location
8. **Search by location** - Find videos near a location

### Display in Feed

Update feed to show:
- Video player (instead of placeholder)
- Venue, artist, song info
- Location on mini-map
- Duration badge

## Security Notes

- Videos are stored in public buckets (anyone can view)
- RLS policies ensure users can only upload/delete their own videos
- File size validation prevents abuse
- MIME type validation ensures only videos are uploaded

## Cost Considerations

Supabase Storage pricing:
- Free tier: 1GB storage
- Pro tier: 100GB included, then $0.021/GB/month
- Bandwidth: $0.09/GB

For a video-heavy app, consider:
- CDN for video delivery
- Video compression
- Cloudflare R2 or AWS S3 for cheaper storage
