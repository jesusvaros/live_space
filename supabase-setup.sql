-- ============================================
-- AppMusic - Configuración de Base de Datos
-- ============================================
-- Ejecuta este script en el SQL Editor de Supabase
-- https://app.supabase.com/project/_/sql

-- ============================================
-- 1. CREAR TABLAS
-- ============================================

-- Tabla de perfiles de usuario
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  username TEXT UNIQUE,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de videos (preparada para futuro)
CREATE TABLE IF NOT EXISTS videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. ACTIVAR ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. POLÍTICAS DE SEGURIDAD - PROFILES
-- ============================================

-- Todos pueden ver todos los perfiles
CREATE POLICY "Usuarios pueden ver todos los perfiles"
  ON profiles FOR SELECT
  USING (true);

-- Los usuarios pueden insertar su propio perfil (o el trigger automático)
CREATE POLICY "Usuarios pueden insertar su propio perfil"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id OR auth.uid() IS NULL);

-- Los usuarios pueden actualizar su propio perfil
CREATE POLICY "Usuarios pueden actualizar su propio perfil"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Los usuarios pueden eliminar su propio perfil
CREATE POLICY "Usuarios pueden eliminar su propio perfil"
  ON profiles FOR DELETE
  USING (auth.uid() = id);

-- ============================================
-- 4. POLÍTICAS DE SEGURIDAD - VIDEOS
-- ============================================

-- Todos pueden ver todos los videos
CREATE POLICY "Usuarios pueden ver todos los videos"
  ON videos FOR SELECT
  USING (true);

-- Los usuarios pueden insertar sus propios videos
CREATE POLICY "Usuarios pueden insertar sus propios videos"
  ON videos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Los usuarios pueden actualizar sus propios videos
CREATE POLICY "Usuarios pueden actualizar sus propios videos"
  ON videos FOR UPDATE
  USING (auth.uid() = user_id);

-- Los usuarios pueden eliminar sus propios videos
CREATE POLICY "Usuarios pueden eliminar sus propios videos"
  ON videos FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 5. ÍNDICES PARA MEJORAR RENDIMIENTO
-- ============================================

-- Índice para búsquedas por username
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

-- Índice para búsquedas de videos por usuario
CREATE INDEX IF NOT EXISTS idx_videos_user_id ON videos(user_id);

-- Índice para ordenar videos por fecha
CREATE INDEX IF NOT EXISTS idx_videos_created_at ON videos(created_at DESC);

-- ============================================
-- 6. FUNCIÓN PARA CREAR PERFIL AUTOMÁTICAMENTE
-- ============================================
-- Esta función crea un perfil automáticamente cuando se registra un usuario

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, avatar_url)
  VALUES (new.id, NULL, NULL);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- 7. TRIGGER PARA EJECUTAR LA FUNCIÓN
-- ============================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 8. STORAGE BUCKET PARA VIDEOS (OPCIONAL - FUTURO)
-- ============================================
-- Descomentar cuando estés listo para subir videos

-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('videos', 'videos', true);

-- CREATE POLICY "Usuarios pueden subir sus propios videos"
--   ON storage.objects FOR INSERT
--   WITH CHECK (
--     bucket_id = 'videos' AND
--     auth.uid()::text = (storage.foldername(name))[1]
--   );

-- CREATE POLICY "Todos pueden ver videos"
--   ON storage.objects FOR SELECT
--   USING (bucket_id = 'videos');

-- CREATE POLICY "Usuarios pueden actualizar sus propios videos"
--   ON storage.objects FOR UPDATE
--   USING (
--     bucket_id = 'videos' AND
--     auth.uid()::text = (storage.foldername(name))[1]
--   );

-- CREATE POLICY "Usuarios pueden eliminar sus propios videos"
--   ON storage.objects FOR DELETE
--   USING (
--     bucket_id = 'videos' AND
--     auth.uid()::text = (storage.foldername(name))[1]
--   );

-- ============================================
-- 9. DATOS DE PRUEBA (OPCIONAL)
-- ============================================
-- Descomentar para insertar datos de prueba

-- INSERT INTO profiles (id, username, avatar_url) VALUES
--   ('00000000-0000-0000-0000-000000000001', 'music_lover', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix'),
--   ('00000000-0000-0000-0000-000000000002', 'concert_fan', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka'),
--   ('00000000-0000-0000-0000-000000000003', 'live_music', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Luna');

-- ============================================
-- VERIFICACIÓN
-- ============================================
-- Ejecuta estas queries para verificar que todo está correcto

-- Ver todas las tablas
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public';

-- Ver políticas de profiles
-- SELECT * FROM pg_policies WHERE tablename = 'profiles';

-- Ver políticas de videos
-- SELECT * FROM pg_policies WHERE tablename = 'videos';

-- Ver todos los perfiles
-- SELECT * FROM profiles;

-- Ver todos los videos
-- SELECT * FROM videos;
