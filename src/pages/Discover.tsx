import React from 'react';
import AppShell from '../components/AppShell';
import DiscoverScreen from './discover/DiscoverScreen';

const Discover: React.FC = () => {
  return (
    <AppShell>
      <DiscoverScreen />
    </AppShell>
  );
};

export default Discover;
