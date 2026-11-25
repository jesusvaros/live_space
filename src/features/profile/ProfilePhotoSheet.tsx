import React, { useRef, useState } from 'react';
import { Modal, useToast } from '../../components/ui/AppPrimitives';
import { supabase } from '../../lib/supabase';
import { compressProductPhoto } from '../merch/compressImage';

const BUCKET = 'profile-photos';

type ProfilePhotoSheetProps = {
  isOpen: boolean;
  userId: string;
  hasPhoto: boolean;
  onClose: () => void;
  // Called after profiles.avatar_url changed (refresh the session profile).
  onChanged: () => Promise<void> | void;
};

/** Your profile photo: pick a new one from the gallery or camera, or remove it. */
const ProfilePhotoSheet: React.FC<ProfilePhotoSheetProps> = ({ isOpen, userId, hasPhoto, onClose, onChanged }) => {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { presentToast } = useToast();

  const save = async (url: string | null) => {
    const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId);
    if (error) throw error;
    await onChanged();
  };

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const { blob, extension } = await compressProductPhoto(file);
      const path = `${userId}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
      if (error) throw error;
      await save(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
      presentToast({ message: 'Foto de perfil actualizada.' });
      onClose();
    } catch {
      presentToast({ message: 'No se ha podido cambiar la foto. Inténtalo de nuevo.' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await save(null);
      presentToast({ message: 'Foto de perfil quitada.' });
      onClose();
    } catch {
      presentToast({ message: 'No se ha podido quitar la foto.' });
    } finally {
      setBusy(false);
    }
  };

  const row =
    'flex min-h-12 w-full items-center rounded-2xl border border-app-line bg-app-surface px-4 text-left text-[15px] font-semibold text-app-ink disabled:opacity-50';

  return (
    <Modal isOpen={isOpen} onDidDismiss={onClose} initialBreakpoint={0.35} title="Foto de perfil">
      <div className="flex flex-col gap-2 p-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))]">
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="hidden"
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void upload(file);
          }}
        />
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className={row}>
          {busy ? 'Subiendo…' : hasPhoto ? 'Cambiar foto' : 'Elegir foto'}
        </button>
        {hasPhoto ? (
          <button type="button" disabled={busy} onClick={() => void remove()} className={`${row} text-rose-300`}>
            Quitar foto
          </button>
        ) : null}
      </div>
    </Modal>
  );
};

export default ProfilePhotoSheet;
