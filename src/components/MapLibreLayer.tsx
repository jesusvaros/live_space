import { TileLayer } from 'react-leaflet';

// Raster OpenStreetMap tiles. The vector MapLibre layer this replaced panned at
// ~21 fps inside Leaflet and shipped 1.6 MB of JS plus a worker. Pages that want
// a dark map darken `.leaflet-tile-pane` with a CSS filter so pins keep their colours.
const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '© OpenStreetMap';

const MapLibreLayer = () => (
  <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} maxZoom={19} detectRetina={false} />
);

export default MapLibreLayer;
