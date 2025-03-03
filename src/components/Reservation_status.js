import React, { useState, useEffect } from 'react';
import './Reservation_status.css'; // Import styles

const Reservation_status = ({ onClose, fetchItems }) => {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [by, setBy] = useState({}); // Stores "by" remarks

  // Function to fetch reservations from backend
  const fetchItemsFromServer = async () => {
    try {
      const response = await fetch('https://3f42-211-25-11-204.ngrok-free.app/admin-dashboard/items/reservations', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': '1'
        },
      });

      if (!response.ok) throw new Error('Failed to load reservations');

      const data = await response.json();
      // Sort reservations with the most recent first (based on reserved_at)
      const sortedItems = data.items.sort((a, b) => new Date(b.reserved_at) - new Date(a.reserved_at));
      setItems(sortedItems);
    } catch (error) {
      console.error('Error fetching items:', error);
      setError('An error occurred while fetching the reservations.');
    }
  };

  // Fetch items when component mounts
  useEffect(() => {
    fetchItemsFromServer();
  }, []);

  // Helper function to format timestamps
  const formatDateTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      timeZone: 'Asia/Kuala_Lumpur', // Change to your preferred timezone
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Update "by" remarks
  const handleByChange = (reservationId, newBy) => {
    setBy((prevBy) => ({
      ...prevBy,
      [reservationId]: newBy,
    }));
  };

  // Generic function for completing or canceling a reservation
  const handleReservationUpdate = async (reservationId, action) => {
    const updatedBy = by[reservationId];
    if (!updatedBy) {
      alert('Please provide remarks before updating.');
      return;
    }

    const endpoint = `https://3f42-211-25-11-204.ngrok-free.app/admin-dashboard/items/${reservationId}/${action}`;
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': '1',
        },
        credentials: 'include',
        body: JSON.stringify({ by: updatedBy }),
      });

      if (!response.ok) throw new Error(`Failed to ${action} reservation`);

      await response.json();
      fetchItemsFromServer(); // Refresh reservations
      fetchItems(); // Refresh main items list

      alert(`Reservation ${action}d successfully`);
      setItems((prevItems) =>
        prevItems.map((item) =>
          item.reservation_id === reservationId
            ? { ...item, reservation_status: action === 'complete' ? 'Completed' : 'Canceled' }
            : item
        )
      );
    } catch (error) {
      console.error(`Error ${action}ing reservation:`, error);
      alert(`An error occurred while ${action}ing the reservation.`);
    }
  };

  return (
    <div className="reserve-item-dialog">
      <div className="reserve-dialog-content">
        <h2>Reservation Table</h2>
        {error && <p className="reserve-error-message">{error}</p>}

        <table className="reservation-table">
          <thead>
            <tr>
              <th>Reservation ID</th>
              <th>Remarks</th>
              <th>Item ID</th>
              <th>Item Name</th>
              <th>Category</th>
              <th>Model</th>
              <th>Unique Id</th>
              <th>Reserved Quantity</th>
              <th>Reserved At</th>
              <th>Reserve Status</th>
              <th>By</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.reservation_id}>
                <td>{item.reservation_id}</td>
                <td>{item.remarks}</td>
                <td>{item.item_id}</td>
                <td>{item.item_name}</td>
                <td>{item.category}</td>
                <td>{item.model}</td>
                <td>{item.item_unique_id}</td>
                <td>{item.reserved_quantity}</td>
                <td>{formatDateTime(item.reserved_at)}</td>
                <td>{item.reservation_status}</td>
                <td>
                  <input
                    type="text"
                    value={by[item.reservation_id] || ''}
                    onChange={(e) => handleByChange(item.reservation_id, e.target.value)}
                    placeholder="By"
                    className="by-input"
                  />
                </td>
                <td>
                  <button onClick={() => handleReservationUpdate(item.reservation_id, 'complete')} className="complete-button">
                    Complete
                  </button>
                  <button onClick={() => handleReservationUpdate(item.reservation_id, 'cancel')} className="cancel-button">
                    Cancel
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="close-button-container">
          <button className="close-buttons" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default Reservation_status;
