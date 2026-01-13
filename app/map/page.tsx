export default function Map() {
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Mapa</h1>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="aspect-square bg-gray-200 rounded-lg flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-2">🗺️</div>
            <p className="text-sm text-gray-600">Map placeholder</p>
          </div>
        </div>
      </div>
    </div>
  );
}
