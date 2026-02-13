import React from 'react';
import AppShell from '../components/AppShell';
import DiscoverScreen from '../features/discover/DiscoverScreen';

const Discover: React.FC = () => {
  return (
    <AppShell>
      <DiscoverScreen />
    </AppShell>
  );
};

export default Discover;
