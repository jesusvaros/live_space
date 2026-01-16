export default function Upload() {
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Subir Video</h1>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="aspect-video bg-gray-200 rounded-lg flex items-center justify-center mb-4">
          <div className="text-center">
            <div className="text-6xl mb-2">📹</div>
            <p className="text-sm text-gray-600">Video upload placeholder</p>
          </div>
        </div>
        <button className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors">
          Seleccionar Video
        </button>
      </div>
    </div>
  );
}