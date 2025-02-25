import './Header.css'; // For styling the header
import { useNavigate } from 'react-router-dom';
import React, { useEffect,useState } from 'react';
import Logo from '../images/SQLOGO3.png'
import { FaBars, FaTimes,FaBell } from 'react-icons/fa'; // Importing icons for hamburger menu

const Header = ({ isLoggedIn, username, onLogout }) => {

  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isMobile, setIsMobile] = useState(false); // State to track mobile view
  const [menuOpen, setMenuOpen] = useState(false); // State to handle hamburger menu toggle


  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768); // Set mobile view for screens <= 768px
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Initial check on mount

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchLogs = async () => {
    try {
      const response = await fetch('http://localhost:5000/logs', {
        method: 'GET',
        credentials: 'include', // Ensure cookies are included
      });
      if (response.ok) {
        const data = await response.json();

        // Filter transactions from the last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const filteredLogs = data.logs.filter((log) => {
          const logDate = new Date(log.timestamp);
          return logDate >= sevenDaysAgo;
        });

        setNotifications(filteredLogs);
      } else {
        console.error('Failed to fetch logs.');
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
    }
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      const response = await fetch('http://localhost:5000/logout', {
        method: 'POST',
        credentials: 'include', // Ensure cookies are included
      });
  
      if (response.ok) {
        // Clear the frontend state
        onLogout();
  
        // Redirect to the login page
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
        <div className="header-mobile">
          {isLoggedIn ? (
            <>
              {/* Hamburger menu on the left */}
              <div className="hamburger-container-mobile">

              <button
                className="hamburger-menu-mobile"
                onClick={() => setMenuOpen((prev) => !prev)}
              >
                <FaBars />
              </button>
              </div>

            </>
          ) : (
            // Logo when logged out
            <div className="logo-mobile">
              <img src={Logo} alt="Logo" className="logo-img-mobile" />
            </div>
          )}

          {/* SquareCloud Malaysia centered */}
          {!isLoggedIn && (
          <div className="company-name-container-mobile">
            <h1 className="company-name-mobile">SquareCloud Malaysia</h1>
          </div>
          )}

          {/* Right-side content for logged-in users */}
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
        // Desktop view
        <div className="header-desktop">
          <div className="logo">
            <img src={Logo} alt="Logo" className="logo-img" />
          </div>

          <div className={`company-name-container ${isLoggedIn ? 'logged-in' : ''}`}>
            <h1 className="company-name">SquareCloud Malaysia</h1>
          </div>

          {isLoggedIn && (
            <div className="header-actions">
              <span className="user-info-desktop">Welcome, {username}</span>
              <FaBell
              className="notification-icon"
              onClick={async () => {
                setShowDropdown((prev) => {
                  if (!prev) {
                    fetchLogs(); // Fetch logs only when opening the dropdown
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
                      <li className="notification-item" key={log.transaction_id}>
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