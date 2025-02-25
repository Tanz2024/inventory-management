import './App.css';
import React, { useState, useEffect } from 'react';
import AdminDashboard from './components/AdminDashboard';  // Import the AdminDashboard
import Login from './components/Login';
import Header from './components/Header';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import SideNav from './components/SideNav';  // Import the SideNav
import ProtectedRoute from './components/ProtectedRoute'; // Import the ProtectedRoute component
import LogsPage from './components/LogsPage';
import PendingTransactionsPage from './components/PendingTransactions';
import ZeroQuantityPage from './components/ZeroQuantity';
import ArchiveItemsPage from './components/ArchiveItems';
import Reservation from './components/Reservation';
import DeliveryOrder from './components/Delivery';  // Import the DeliveryOrder component
import GoodReceive from './components/GoodReceive'; // Import the GoodReceive component

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [roleId, setRoleId] = useState(null);
  const [userId, setUserId] = useState(null); // State for userId

  // Check if the user is already logged in (on page reload)
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch('http://localhost:5000/authenticate', {
          method: 'GET',
          credentials: 'include', // Ensures cookies (e.g., session tokens) are included
          headers: {
            'Content-Type': 'application/json',
          },
        });
  
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
  
        const data = await response.json();
        if (data && data.username && data.role_id !== undefined && data.user_id !== undefined) {
          setIsLoggedIn(true);
          setUsername(data.username);
          setRoleId(data.role_id);
          setUserId(data.user_id);
        } else {
          // If the response is missing required fields, log out user
          console.warn("Incomplete user data received:", data);
          setIsLoggedIn(false);
          setUsername('');
          setRoleId(null);
          setUserId(null);
        }
      } catch (error) {
        console.error('Error fetching user authentication:', error);
        setIsLoggedIn(false);
        setUsername('');
        setRoleId(null);
        setUserId(null);
      }
    };
  
    fetchUser();
  }, []);
  

  const handleLogin = (username, roleId, userId) => {
    setIsLoggedIn(true);
    setUsername(username);
    setRoleId(roleId);
    setUserId(userId);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUsername('');
    setRoleId(null);
    setUserId(null);
  };

  return (
    <Router>
      <div className={`app-container ${isLoggedIn ? '' : 'login-page'}`}>
        <Header className='app-header' isLoggedIn={isLoggedIn} username={username} onLogout={handleLogout} />
        <div className="main-section">
          {/* Sidebar */}
          {isLoggedIn && <SideNav userId={userId} />}
          {/* Main Content */}
          <div className={`content-area ${isLoggedIn ? '' : 'login-view'}`}>
            <Routes>
              <Route
                path="/login"
                element={
                  isLoggedIn ? (
                    <Navigate to="/admin-dashboard" />
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
              {/* New Route for GoodReceive */}
              <Route
                path="/good-receive"
                element={
                  <ProtectedRoute isLoggedIn={isLoggedIn}>
                    <GoodReceive />
                  </ProtectedRoute>
                }
              />
              {/* Updated Route for Delivery Order */}
              <Route
                path="/delivery-order"
                element={
                  <ProtectedRoute isLoggedIn={isLoggedIn}>
                    <DeliveryOrder />
                  </ProtectedRoute>
                }
              />
              <Route
                path="*"
                element={
                  <ProtectedRoute isLoggedIn={isLoggedIn}>
                    {isLoggedIn ? <Navigate to="/admin-dashboard" replace /> : <Navigate to="/login" replace />}
                  </ProtectedRoute>
                }
              />
            </Routes>
          </div>
        </div>
      </div>
    </Router>
  );
}

export default App;