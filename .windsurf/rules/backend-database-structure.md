---
trigger: manual
---

Conceptos clave
1) “Subject” = cualquier cosa que se puede seguir y aparece en lo social

Tabla: subjects

type = 'user' | 'venue' | 'artist'

Un subject puede envolver:

user → profiles

venue → venue_places

artist/band → artists (bandas y solistas se diferencian por artists.artist_type)

Regla: Todas las relaciones sociales (follow, likes, attendance, etc.) deben apuntar a subjects.id.

2) Bandas y artistas son lo mismo

Tabla: artists

artist_type = 'band' para banda

artist_type = 'solo' para solista

3) Seguir (Follow)

Tabla: follows

follower_subject_id (quién sigue)

target_subject_id (a quién sigue: user/artist/venue)

4) Administración (modo gestión)

Tabla: entity_admins

Un usuario (profiles.id) puede administrar varios subject_id (de tipo artist o venue)

Un subject_id (artist/venue) puede tener varios usuarios admin

Esto permite un feed “enfocado a gestionar” porque el frontend puede:

listar las entidades que administro

permitir seleccionar una “entidad activa” y filtrar el panel por ella

5) Privacidad de usuario (sin requests)

Tabla: profile_privacy

is_private boolean

Por ahora, no hay follow-requests: si is_private=true, el frontend debe tratar el usuario como “no visible”/no followable (según tu UX). La base ya soporta el flag.

Reels dentro del concierto: timeline y navegación cronológica

Tabla: posts

Un post es un reel de un concierto: posts.event_id

Ordenar cronológicamente dentro del evento:

Orden principal: posts.event_offset_ms (ms desde events.starts_at)

Fallback: posts.captured_at

Fallback: posts.created_at

Campos relevantes nuevos:

event_offset_ms bigint

actor_subject_id uuid (quién publicó; normalmente subject user)

performance_artist_id uuid (artist que actuaba/sonaba en ese clip; opcional)

song_id uuid / song_title text (metadatos musicales)

Vista lista para consumir: v_event_posts_with_setlist (expande el post con la canción setlist resuelta automáticamente).

Setlist oficial por evento

Tablas:

event_setlist (oficial, ordenado por ordinal)

songs (catálogo)

event_setlist:

(event_id, ordinal) PK

performer_artist_id (quién interpreta esa entrada en ese evento)

song_id o song_title (si aún no está en catálogo)

starts_offset_ms / ends_offset_ms para ubicarlo en el tiempo del concierto

Resolver canción para un reel:

Si el reel tiene event_offset_ms, usar:

v_event_posts_with_setlist, o

get_setlist_entry_for_offset(event_id, event_offset_ms)

Queries recomendadas (para que la IA de front las genere)
A) Timeline de reels de un evento
select *
from public.v_event_posts_with_setlist
where event_id = $1
order by
  event_offset_ms nulls last,
  captured_at nulls last,
  created_at asc;

B) Setlist oficial del evento
select *
from public.event_setlist
where event_id = $1
order by ordinal asc;

C) Mis entidades administradas (para modo gestión)
select ea.subject_id, ea.role, s.type,
       vu.*, vv.*, va.*
from public.entity_admins ea
join public.subjects s on s.id = ea.subject_id
left join public.v_subject_venues vv on vv.subject_id = s.id
left join public.v_subject_artists va on va.subject_id = s.id
left join public.v_subject_users vu on vu.subject_id = s.id
where ea.profile_id = $1;

D) Seguir / dejar de seguir

Insert:

insert into public.follows(follower_subject_id, target_subject_id)
values ($1, $2);


Delete:

delete from public.follows
where follower_subject_id = $1 and target_subject_id = $2;