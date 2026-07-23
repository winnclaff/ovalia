import Sidebar from './Sidebar'

export default function Layout({ onLogout, children }) {
  return (
    <div className="app-layout">
      <Sidebar onLogout={onLogout} />
      <main className="page-content">
        {children}
      </main>
    </div>
  )
}
