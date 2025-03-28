import React, { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './SideNav.css';
import { FaBars } from 'react-icons/fa';
import Logo from '../images/SQLOGO3.png';

function SideNav({ userId, onToggleSidebar, isSidebarOpen }) {
  const location = useLocation();
  const sideNavRef = useRef(null);

  // OPTIONAL: swipe to close the sidebar from inside the side nav
  useEffect(() => {
    const sideNav = sideNavRef.current;
    if (!sideNav) return;

    let touchStartX = 0;
    let touchCurrentX = 0;

    const handleTouchStart = (e) => {
      touchStartX = e.touches[0].clientX;
    };

    const handleTouchMove = (e) => {
      touchCurrentX = e.touches[0].clientX;
    };

    const handleTouchEnd = () => {
      // If user swiped left more than 50px inside the side nav, close it
      if (touchStartX - touchCurrentX > 50) {
        onToggleSidebar();
      }
    };

    sideNav.addEventListener('touchstart', handleTouchStart);
    sideNav.addEventListener('touchmove', handleTouchMove);
    sideNav.addEventListener('touchend', handleTouchEnd);

    return () => {
      sideNav.removeEventListener('touchstart', handleTouchStart);
      sideNav.removeEventListener('touchmove', handleTouchMove);
      sideNav.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onToggleSidebar]);

  return (
    <div ref={sideNavRef} className={`side-nav ${isSidebarOpen ? 'open' : ''}`}>
      {/* Top bar: hamburger + logo */}
      <div className="top-bar">
        <button className="hamburger-icon" onClick={onToggleSidebar}>
          <FaBars />
        </button>
        <div className="logo-container">
          <img src={Logo} alt="Logo" className="logo-img" />
        </div>
      </div>

      <ul>
        <li>
          <Link
            to="/admin-dashboard"
            className={location.pathname === '/admin-dashboard' ? 'active' : ''}
          >
            Home
          </Link>
        </li>
        <li>
          <Link to="/noti" className={location.pathname === '/noti' ? 'active' : ''}>
            Notifications
          </Link>
        </li>
        <li>
          <Link
            to="/reservation"
            className={location.pathname === '/reservation' ? 'active' : ''}
          >
            Reservation
          </Link>
        </li>

        {/* Admin-only links */}
        {userId === 2 && (
          <>
            <li>
              <Link to="/pending" className={location.pathname === '/pending' ? 'active' : ''}>
                Pending
              </Link>
            </li>
            <li>
              <Link to="/logs" className={location.pathname === '/logs' ? 'active' : ''}>
                Logs
              </Link>
            </li>
            <li>
              <Link to="/archive" className={location.pathname === '/archive' ? 'active' : ''}>
                Archive
              </Link>
            </li>
            <li>
              <Link
                to="/good-receive"
                className={location.pathname === '/good-receive' ? 'active' : ''}
              >
                Good Receive
              </Link>
            </li>
            <li>
              <Link
                to="/delivery-order"
                className={location.pathname === '/delivery-order' ? 'active' : ''}
              >
                Delivery Order
              </Link>
            </li>
          </>
        )}
      </ul>
    </div>
  );
}

export default SideNav;