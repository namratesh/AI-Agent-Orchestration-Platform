import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import clsx from 'clsx'

import { ThemeProvider } from './context/ThemeContext'
import { useAppStore } from './store'

import Header          from './components/Header'
import Sidebar         from './components/Sidebar'
import Dashboard       from './pages/Dashboard'
import AgentBuilder    from './pages/AgentBuilder'
import WorkflowBuilder from './pages/WorkflowBuilder'
import ExecutionLogs   from './pages/ExecutionLogs'
import ExecutionHistory from './pages/ExecutionHistory'
import Settings        from './pages/Settings'
import Tools           from './pages/Tools'
import Workspace       from './pages/Workspace'

function Layout() {
  const collapsed = useAppStore(s => s.sidebarCollapsed)
  const { pathname } = useLocation()
  const isWorkspace = pathname === '/workspace'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-200">
      <Sidebar />
      <Header />

      <main
        className={clsx(
          'transition-all duration-300 ease-in-out pt-[60px]',
          collapsed ? 'pl-16' : 'pl-60',
        )}
      >
        {isWorkspace ? (
          <Routes>
            <Route path="/workspace" element={<Workspace />} />
          </Routes>
        ) : (
          <div className="p-6 max-w-[1600px] mx-auto">
            <Routes>
              <Route path="/"          element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/agents"    element={<AgentBuilder />} />
              <Route path="/workflows" element={<WorkflowBuilder />} />
              <Route path="/executor"  element={<WorkflowBuilder />} />
              <Route path="/logs"      element={<ExecutionLogs />} />
              <Route path="/history"   element={<ExecutionHistory />} />
              <Route path="/tools"     element={<Tools />} />
              <Route path="/settings"  element={<Settings />} />
            </Routes>
          </div>
        )}
      </main>

      <Toaster
        position="top-right"
        toastOptions={{
          className: 'dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700',
          style: { borderRadius: '10px', fontSize: '13px' },
          success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
          error:   { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
        }}
      />
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    </ThemeProvider>
  )
}
