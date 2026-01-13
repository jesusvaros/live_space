-- ============================================
-- SCRIPT DE LIMPIEZA - Ejecutar PRIMERO
-- ============================================
-- Este script elimina las políticas y triggers existentes
-- para poder recrearlos con la configuración correcta

-- Eliminar políticas de profiles
DROP POLICY IF EXISTS "Usuarios pueden ver todos los perfiles" ON profiles;
DROP POLICY IF EXISTS "Usuarios pueden insertar su propio perfil" ON profiles;
DROP POLICY IF EXISTS "Usuarios pueden actualizar su propio perfil" ON profiles;
DROP POLICY IF EXISTS "Usuarios pueden eliminar su propio perfil" ON profiles;

-- Eliminar políticas de videos
DROP POLICY IF EXISTS "Usuarios pueden ver todos los videos" ON videos;
DROP POLICY IF EXISTS "Usuarios pueden insertar sus propios videos" ON videos;
DROP POLICY IF EXISTS "Usuarios pueden actualizar sus propios videos" ON videos;
DROP POLICY IF EXISTS "Usuarios pueden eliminar sus propios videos" ON videos;

-- Eliminar trigger existente
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Eliminar función existente
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Mensaje de confirmación
SELECT 'Limpieza completada. Ahora ejecuta supabase-setup.sql' as mensaje;
