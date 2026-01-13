-- ============================================
-- Desactivar confirmación de email
-- ============================================
-- Ejecuta esto en el SQL Editor de Supabase

-- Actualizar la configuración de auth
UPDATE auth.config 
SET enable_signup = true;

-- Si esto no funciona, también puedes intentar:
-- Nota: Esto requiere permisos de superusuario, puede que no funcione

-- Alternativa: Confirmar manualmente el usuario actual
-- Reemplaza el email con el tuyo
UPDATE auth.users 
SET email_confirmed_at = NOW(),
    confirmed_at = NOW()
WHERE email = 'tu_email@gmail.com';
