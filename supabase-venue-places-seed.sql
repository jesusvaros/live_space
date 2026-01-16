-- Live Space - Seed venue places (Sevilla)
-- Inserts initial venue_places. Safe to re-run (skips existing).

INSERT INTO public.venue_places (name, city, address, latitude, longitude, website_url)
SELECT s.name, s.city, s.address, s.latitude, s.longitude, s.website_url
FROM (
  VALUES
    (
      'Sala Malandar',
      'Sevilla',
      'Av. Torneo, 43, 41002 Sevilla, Spain',
      37.4032079,
      -5.9955233000001,
      'https://salamalandar.com/'
    ),
    (
      'Fun Club Sevilla',
      'Sevilla',
      'Alameda de Hércules, 61, 41002 Sevilla, Spain',
      37.3977808,
      -5.9934194,
      'https://funclubsevilla.com/'
    ),
    (
      'Sala X',
      'Sevilla',
      'Calle José Díaz, 7, 41009 Sevilla, Spain',
      37.4040916,
      -5.9838751126499,
      'https://lasalax.com/'
    ),
    (
      'Sala Custom Sevilla',
      'Sevilla',
      'Calle Metalurgia, 25, 41007 Sevilla, Spain',
      37.4083122556,
      -5.9576731245715,
      'https://www.salacustom.com/'
    ),
    (
      'Cartuja Center CITE',
      'Sevilla',
      'Calle Leonardo da Vinci, 7-9, 41092 Sevilla, Spain',
      37.4046051,
      -6.0079188,
      'https://cartujacenter.com/'
    )
) AS s(name, city, address, latitude, longitude, website_url)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.venue_places v
  WHERE v.name = s.name
    AND v.city = s.city
    AND v.address = s.address
);
