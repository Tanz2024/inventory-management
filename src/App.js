import './App.css';
import React, { useState, useEffect } from 'react';
import {
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from 'react-router-dom';
import { useSwipeable } from 'react-swipeable';
import AdminDashboard from './components/AdminDashboard';
import Login from './components/Login';
import Header from './components/Header';
import SideNav from './components/SideNav';
import ProtectedRoute from './components/ProtectedRoute';
import LogsPage from './components/LogsPage';
import PendingTransactionsPage from './components/PendingTransactions';
import ZeroQuantityPage from './components/ZeroQuantity';
import ArchiveItemsPage from './components/ArchiveItems';
import Reservation from './components/Reservation';
import DeliveryOrder from './components/Delivery';
import GoodReceive from './components/GoodReceive';
import ReportView from './components/Reportview';

function App() {
  return <AppContent />;
}

function AppContent() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [roleId, setRoleId] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);

  // Sidebar state
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const navigate = useNavigate();
  const location = useLocation();

  // Setup swipe handlers: swipe left to hide sidebar, right to show sidebar
  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => setIsSidebarOpen(false),
    onSwipedRight: () => setIsSidebarOpen(true),
    trackMouse: true, // also track mouse drags
  });

  // Authenticate user and retrieve stored credentials
  useEffect(() => {
    const authenticateUser = async () => {
      setLoading(true);

      const storedUsername = localStorage.getItem('username');
      const storedRoleId = localStorage.getItem('roleId');
      const storedUserId = localStorage.getItem('userId');

      if (storedUsername && storedRoleId && storedUserId) {
        setIsLoggedIn(true);
        setUsername(storedUsername);
        setRoleId(parseInt(storedRoleId, 10));
        setUserId(parseInt(storedUserId, 10));
        setLoading(false);
        return;
      }

      try {
        const response = await fetch('https://e89d-211-25-11-204.ngrok-free.app/authenticate', {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (
            data &&
            data.username &&
            data.role_id !== undefined &&
            data.user_id !== undefined
          ) {
            setIsLoggedIn(true);
            setUsername(data.username);
            setRoleId(data.role_id);
            setUserId(data.user_id);

            localStorage.setItem('username', data.username);
            localStorage.setItem('roleId', data.role_id.toString());
            localStorage.setItem('userId', data.user_id.toString());
          } else {
            clearAuthAndRedirect();
          }
        } else if (response.status === 401 || response.status === 403) {
          clearAuthAndRedirect();
        } else {
          console.error(`Authentication failed: ${response.status}`);
        }
      } catch (error) {
        console.error('Authentication error:', error);
      } finally {
        setLoading(false);
      }
    };

    authenticateUser();
  }, []);

  // Clear authentication and redirect to login
  const clearAuthAndRedirect = () => {
    setIsLoggedIn(false);
    setUsername('');
    setRoleId(null);
    setUserId(null);
    localStorage.removeItem('username');
    localStorage.removeItem('roleId');
    localStorage.removeItem('userId');
    navigate('/login', { replace: true });
  };

  // Save last path visited when logged in
  useEffect(() => {
    if (isLoggedIn) {
      sessionStorage.setItem('lastPath', location.pathname);
    }
  }, [location.pathname, isLoggedIn]);

  // Navigate to saved path on login
  useEffect(() => {
    if (isLoggedIn) {
      const savedPath = sessionStorage.getItem('lastPath');
      if (savedPath && savedPath !== location.pathname) {
        navigate(savedPath, { replace: true });
      }
    }
  }, [isLoggedIn, navigate, location.pathname]);

  // Handle login and store user credentials
  const handleLogin = (username, roleId, userId) => {
    setIsLoggedIn(true);
    setUsername(username);
    setRoleId(roleId);
    setUserId(userId);

    localStorage.setItem('username', username);
    localStorage.setItem('roleId', roleId.toString());
    localStorage.setItem('userId', userId.toString());

    const savedPath = sessionStorage.getItem('lastPath') || '/admin-dashboard';
    navigate(savedPath, { replace: true });
  };

  // Logout and clear credentials
  const handleLogout = () => {
    clearAuthAndRedirect();
  };

  // Toggle sidebar visibility (for header or side nav button click)
  const handleToggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }
  const hideHeaderRoutes = ['/login'];
  const shouldShowHeader = !hideHeaderRoutes.includes(location.pathname.toLowerCase());
  return (
    <div>
      {/* Conditionally render Header */}
    {shouldShowHeader && (
      <Header
        isLoggedIn={isLoggedIn}
        username={username}
        onLogout={handleLogout}
        onToggleSidebar={handleToggleSidebar}
        isSidebarOpen={isSidebarOpen}
      />
    )}

<div
      className={`app-container ${isLoggedIn ? '' : 'login-page'}`}
      {...(isLoggedIn ? swipeHandlers : {})}
    >
      <div className="main-section">
        {isLoggedIn && isSidebarOpen && (
          <>
            <div className="sidebar-overlay" onClick={handleToggleSidebar} />
            <SideNav
              userId={userId}
              isSidebarOpen={isSidebarOpen}
              onToggleSidebar={handleToggleSidebar}
            />
          </>
        )}

        <div
          className={`content-area ${isLoggedIn ? '' : 'login-view'} ${
            isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'
          }`}
        >
            <Routes>
              <Route
                path="/login"
                element={
                  isLoggedIn ? (
                    <Navigate to={sessionStorage.getItem('lastPath') || '/admin-dashboard'} />
                  ) : (
                    <Login onLogin={handleLogin} />
                  )
                }
              />
              <Route
                path="/admin-dashboard"
                element={
                  <ProtectedRoute isLoggedIn={isLoggedIn}>
                    <AdminDashboard onLogout={handleLogout} userId={userId} username={username} />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reservation"
                element={
                  <ProtectedRoute isLoggedIn={isLoggedIn}>
                    <Reservation onLogout={handleLogout} userId={userId} username={username} />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/logs"
                element={
                  <ProtectedRoute isLoggedIn={isLoggedIn}>
                    <LogsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/pending"
                element={
                  <ProtectedRoute isLoggedIn={isLoggedIn}>
                    <PendingTransactionsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/noti"
                element={
                  <ProtectedRoute isLoggedIn={isLoggedIn}>
                    <ZeroQuantityPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/archive"
                element={
                  <ProtectedRoute isLoggedIn={isLoggedIn}>
                    <ArchiveItemsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/good-receive"
                element={
                  <ProtectedRoute isLoggedIn={isLoggedIn}>
                    <GoodReceive />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/delivery-order"
                element={
                  <ProtectedRoute isLoggedIn={isLoggedIn}>
                    <DeliveryOrder />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/report-view"
                element={
                  <ProtectedRoute isLoggedIn={isLoggedIn}>
                    <ReportView />
                  </ProtectedRoute>
                }
              />
              <Route
                path="*"
                element={
                  <ProtectedRoute isLoggedIn={isLoggedIn}>
                    <Navigate to={sessionStorage.getItem('lastPath') || '/admin-dashboard'} replace />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;