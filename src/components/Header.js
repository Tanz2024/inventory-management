import './Header.css';
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Logo from '../images/sqc-logo.png';
import { FaBars, FaBell } from 'react-icons/fa';

const Header = ({ isLoggedIn, username, onLogout, onToggleSidebar }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [notifications, setNotifications] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Hide header on login route
  if (location.pathname === '/login') return null;

  const fetchLogs = async () => {
    try {
      const res = await fetch('http://localhost:5000/logs', {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' }
      });
      if (res.ok) {
        const data = await res.json();
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 7);
        setNotifications(data.logs.filter(log => new Date(log.timestamp) >= cutoff));
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
    }
  };

  const handleLogout = async () => {
    try {
      const res = await fetch('http://localhost:5000/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' }
      });
      if (res.ok) {
        onLogout();
        navigate('/login');
      } else {
        alert('Logout failed');
      }
    } catch {
      alert('Error logging out');
    }
  };

  return (
    <header className="header">
      {isMobile ? (
        <div className="header-mobile">
          {isLoggedIn && <button className="hamburger-menu-mobile" onClick={onToggleSidebar}><FaBars/></button>}
          {!isLoggedIn && (
            <>
              <div className="logo-mobile"><img src={Logo} alt="Logo" className="logo-img-mobile"/></div>
              <h1 className="company-name-mobile">Inventory System Dashboard</h1>
            </>
          )}
          {isLoggedIn && (
            <div className="header-actions-mobile">
              <span className="user-info-mobile">Welcome, {username}</span>
              <button className="logout-btn-mobile" onClick={handleLogout}>Logout</button>
            </div>
          )}
        </div>
      ) : (
        <div className="header-desktop">
          <div className="left-actions">
            {isLoggedIn && <button className="toggle-sidebar-btn" onClick={onToggleSidebar}><FaBars/></button>}
            <img src={Logo} alt="Logo" className="logo-img"/>
          </div>
          <div className="center-title"><h1 className="company-name">Inventory System Dashboard</h1></div>
          {isLoggedIn && (
            <div className="right-actions">
              <FaBell className="notification-icon" onClick={() => { if (!showDropdown) fetchLogs(); setShowDropdown(prev => !prev); }}/>
              {showDropdown && (
                <div className="notification-dropdown">
                  <h4>Notifications</h4>
                  {notifications.length ? (
                    <ul className="notification-list">
                      {notifications.map(log => (
                        <li key={log.transaction_id} className="notification-item">
                          <strong>{log.item_name}</strong> ({log.model}) — {log.transaction_type}, Qty {log.quantity_change}, {log.status}
                          <div className="notification-date">{new Date(log.timestamp).toLocaleString()}</div>
                        </li>
                      ))}
                    </ul>
                  ) : <p>No recent transactions.</p>}
                </div>
              )}
              <span className="user-info-desktop">Welcome, {username}</span>
              <button className="logout-btn-desktop" onClick={handleLogout}>Logout</button>
            </div>
          )}
        </div>
      )}
    </header>
  );
};

export default Header;
