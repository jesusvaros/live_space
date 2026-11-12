import React, { useState } from 'react';
import { IconInfo } from '../../components/icons';
import { SettingsGroup, SettingsHelp, SettingsItem, Switch } from '../settings/SettingsList';
import { setAnalyticsSharing } from './analytics';
import { getAnalyticsSharing } from './settings';

/** Ajustes → Privacidad → «Compartir cómo usas la app». */
const AnalyticsSharingSetting: React.FC<{ privacyLink?: React.ReactNode }> = ({ privacyLink }) => {
  const [on, setOn] = useState(getAnalyticsSharing);
  return (
    <>
      <SettingsGroup label="Uso de la app">
        <SettingsItem icon={<IconInfo size={18} />} title="Compartir cómo usas la app">
          <Switch
            checked={on}
            label="Compartir cómo usas la app"
            onChange={value => {
              setOn(value);
              setAnalyticsSharing(value);
            }}
          />
        </SettingsItem>
      </SettingsGroup>
      <SettingsHelp>
        Datos de uso (qué pantallas abres, si una subida falla…) para mejorar la app. Se guardan en nuestros
        servidores, no los compartimos con terceros y nunca incluyen tu nombre, tu email, tu ubicación ni tus fotos.
        Si lo apagas, este móvil deja de enviarlos y borra los pendientes. {privacyLink}
      </SettingsHelp>
    </>
  );
};

export default AnalyticsSharingSetting;
