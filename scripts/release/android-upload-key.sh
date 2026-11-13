#!/usr/bin/env bash
# Creates the Google Play upload key for Live Space, once, on your machine.
# You type the password; it is never printed or committed.
#   - key:   ~/.live-space/upload-keystore.jks (outside the repo; back it up)
#   - local: android/keystore.properties (gitignored, chmod 600) so
#            `npm run android:bundle` signs the .aab
#   - CI:    optionally stores the GitHub secrets the release workflow needs
# Prints the SHA-1 to register in Google Cloud (Android OAuth client).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$HOME/.live-space"
STORE="$DIR/upload-keystore.jks"
ALIAS="upload"

mkdir -p "$DIR" && chmod 700 "$DIR"

if [ -f "$STORE" ]; then
  echo "Ya existe $STORE: se reutiliza (no se crea otra clave)."
  read -r -s -p "Contraseña de esa clave: " LS_STORE_PASS; echo
else
  read -r -s -p "Contraseña nueva para la clave de subida (mín. 8): " LS_STORE_PASS; echo
  read -r -s -p "Repítela: " again; echo
  [ "$LS_STORE_PASS" = "$again" ] || { echo "No coinciden." >&2; exit 1; }
  [ "${#LS_STORE_PASS}" -ge 8 ] || { echo "Mínimo 8 caracteres." >&2; exit 1; }
  export LS_STORE_PASS
  keytool -genkeypair -v -storetype PKCS12 -keystore "$STORE" -alias "$ALIAS" \
    -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=Live Space, O=Live Space, C=ES" \
    -storepass:env LS_STORE_PASS -keypass:env LS_STORE_PASS >/dev/null
  chmod 600 "$STORE"
  echo "Clave creada en $STORE. Haz copia (gestor de contraseñas o similar)."
fi
export LS_STORE_PASS

# Fails here if the password is wrong.
keytool -list -v -keystore "$STORE" -alias "$ALIAS" -storepass:env LS_STORE_PASS \
  | grep -E "SHA1:|SHA256:" | sed 's/^[[:space:]]*/  /'
echo "  ↑ SHA-1 para el cliente OAuth Android «release» en Google Cloud (docs/runbooks.md)."

PROPS="$ROOT/android/keystore.properties"
umask 077
cat > "$PROPS" <<PROPS
storeFile=$STORE
storePassword=$LS_STORE_PASS
keyAlias=$ALIAS
keyPassword=$LS_STORE_PASS
PROPS
echo "Escrito android/keystore.properties (no se sube a git)."

read -r -p "¿Guardar también los secretos de GitHub para el workflow de release? [s/N] " yn
if [[ "$yn" =~ ^[sSyY]$ ]]; then
  cd "$ROOT"
  base64 < "$STORE" | gh secret set ANDROID_KEYSTORE_BASE64
  printf '%s' "$LS_STORE_PASS" | gh secret set ANDROID_KEYSTORE_PASSWORD
  printf '%s' "$ALIAS" | gh secret set ANDROID_KEY_ALIAS
  if [ -f android/app/google-services.json ]; then
    base64 < android/app/google-services.json | gh secret set GOOGLE_SERVICES_JSON_BASE64
  fi
  # Public OAuth client IDs (not secrets) from .env, for the app build.
  for name in VITE_GOOGLE_WEB_CLIENT_ID VITE_GOOGLE_IOS_CLIENT_ID; do
    value="$(grep -E "^$name=" .env 2>/dev/null | head -1 | cut -d= -f2- || true)"
    if [ -n "$value" ]; then printf '%s' "$value" | gh variable set "$name"; fi
  done
  echo "Secretos y variables guardados en GitHub."
fi
