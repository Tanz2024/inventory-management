import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './SideNav.css';

function SideNav({ userId }) {
  const location = useLocation(); // Get current path

  return (
    <div className="side-nav">
      <ul>
        <li>
          <Link to="/admin-dashboard" className={location.pathname === "/admin-dashboard" ? "active" : ""}>
            Home
          </Link>
        </li>
        <li>
          <Link to="/noti" className={location.pathname === "/noti" ? "active" : ""}>
            Notifications
          </Link>
        </li>
        <li>
          <Link to="/reservation" className={location.pathname === "/reservation" ? "active" : ""}>
            Reservation
          </Link>
        </li>

        {/* Admin-only links */}
        {userId === 2 && (
          <>
            <li>
              <Link to="/pending" className={location.pathname === "/pending" ? "active" : ""}>
                Pending
              </Link>
            </li>
            <li>
              <Link to="/logs" className={location.pathname === "/logs" ? "active" : ""}>
                Logs
              </Link>
            </li>
            <li>
              <Link to="/archive" className={location.pathname === "/archive" ? "active" : ""}>
                Archive
              </Link>
            </li>
            {/* New links for Good Receive and Delivery Order */}
            <li>
              <Link to="/good-receive" className={location.pathname === "/good-receive" ? "active" : ""}>
                Good Receive
              </Link>
            </li>
            <li>
              <Link to="/delivery-order" className={location.pathname === "/delivery-order" ? "active" : ""}>
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
