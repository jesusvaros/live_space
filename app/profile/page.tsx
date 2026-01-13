export default function Profile() {
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Mi Perfil</h1>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center space-x-4 mb-4">
          <div className="w-16 h-16 bg-gray-300 rounded-full"></div>
          <div>
            <h2 className="text-lg font-semibold">Username</h2>
            <p className="text-sm text-gray-600">user@example.com</p>
          </div>
        </div>
        <div className="space-y-2">
          <div className="py-2 border-b">
            <p className="text-sm text-gray-600">Videos subidos</p>
            <p className="text-xl font-bold">0</p>
          </div>
          <div className="py-2">
            <p className="text-sm text-gray-600">Miembro desde</p>
            <p className="text-sm">Enero 2024</p>
          </div>
        </div>
      </div>
    </div>
  );
}
