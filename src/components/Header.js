import './Header.css';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { List, Bell } from '@phosphor-icons/react';

const Header = ({ isLoggedIn, username, onLogout, onToggleSidebar, isSidebarOpen }) => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchLogs = async () => {
    try {
      const response = await fetch('http://localhost:5000/logs', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          
        },
      });
      if (response.ok) {
        const data = await response.json();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const filteredLogs = data.logs.filter(
          (log) => new Date(log.timestamp) >= sevenDaysAgo
        );
        setNotifications(filteredLogs);
      } else {
        console.error('Failed to fetch logs.');
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
    }
  };

  const handleLogout = async () => {
    try {
      const response = await fetch('http://localhost:5000/logout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          
        },
      });

      if (response.ok) {
        onLogout();
        navigate('/login');
      } else {
        alert('Logout failed. Please try again.');
      }
    } catch (error) {
      console.error('Error during logout:', error);
      alert('An error occurred while logging out.');
    }
  };

  return (
    <header className="header">
      {isMobile ? (
        /* ---------------- MOBILE LAYOUT ---------------- */
        <div className="header-mobile">
          {isLoggedIn && (
            <button className="hamburger-menu-mobile" onClick={onToggleSidebar}>
              <List size={22} weight="bold" />
            </button>
          )}
          {!isLoggedIn && (
            <>
              <div className="company-name-container-mobile">
                <h1 className="company-name-mobile">Leopard Inventory</h1>
              </div>
            </>
          )}
          {isLoggedIn && (
            <div className="header-actions-mobile">
              <div className="user-info-mobile">
                <span>Welcome, {username}</span>
              </div>
              <button className="logout-btn-mobile" onClick={handleLogout}>
                Logout
              </button>
            </div>
          )}
        </div>
      ) : (
        /* ---------------- DESKTOP LAYOUT ---------------- */
        <div className="header-desktop">
          {/* Left side: Hamburger + Logo */}
          <div className="left-actions">
            {isLoggedIn && (
              <button className="toggle-sidebar-btn" onClick={onToggleSidebar}>
              <List size={22} weight="bold" />
            </button>
          )}
        </div>

        {/* Center: Company Name */}
        <div className="center-title">
          <h1 className="company-name">Leopard Inventory</h1>
        </div>

          {/* Right side: Notifications, User Info, Logout */}
          {isLoggedIn && (
            <div className="right-actions">
              <Bell
                className="notification-icon"
                size={22}
                weight="bold"
                onClick={() => {
                  setShowDropdown((prev) => {
                    if (!prev) {
                      fetchLogs();
                    }
                    return !prev;
                  });
                }}
              />
              {showDropdown && (
                <div className="notification-dropdown">
                  <h4>Notifications</h4>
                  {notifications.length > 0 ? (
                    <ul className="notification-list">
                      {notifications.map((log) => (
                        <li
                          className="notification-item"
                          key={log.transaction_id}
                        >
                          <p className="notification-title">
                            <strong>{log.item_name}</strong> ({log.model})
                          </p>
                          <div className="notification-details">
                            <span>Type: {log.transaction_type}</span>
                            <span>Qty: {log.quantity_change}</span>
                            <span>Status: {log.status}</span>
                          </div>
                          <p className="notification-remarks">
                            <span>Remarks: {log.remarks || 'N/A'}</span>
                          </p>
                          <p className="notification-date">
                            {new Date(log.timestamp).toLocaleString()}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No transactions in the last 7 days.</p>
                  )}
                </div>
              )}
              <span className="user-info-desktop">Welcome, {username}</span>
              <button className="logout-btn-desktop" onClick={handleLogout}>
                Logout
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
};

export default Header;
