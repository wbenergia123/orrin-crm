import { useState } from 'react'
import Clientes from './pages/Clientes'
import Reunioes from './pages/Reunioes'
import Prospeccao from './pages/Prospeccao'
import './App.css'

export default function App() {
  const [currentPage, setCurrentPage] = useState('prospeccao')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">Orrin CRM</h1>
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => setCurrentPage('prospeccao')}
                className={`px-4 py-2 rounded font-medium transition ${
                  currentPage === 'prospeccao'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Dashboard
              </button>
              <button
                onClick={() => setCurrentPage('clientes')}
                className={`px-4 py-2 rounded font-medium transition ${
                  currentPage === 'clientes'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Clientes
              </button>
              <button
                onClick={() => setCurrentPage('reunioes')}
                className={`px-4 py-2 rounded font-medium transition ${
                  currentPage === 'reunioes'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Reuniões
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main>
        {currentPage === 'prospeccao' && <Prospeccao />}
        {currentPage === 'clientes' && <Clientes />}
        {currentPage === 'reunioes' && <Reunioes />}
      </main>
    </div>
  )
}
