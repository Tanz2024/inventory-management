
import React, { useState, useEffect } from 'react';
import './Reservation_status.css'; // Add styles for the dialog

const Reservation_status = ({ onClose,fetchItems }) => {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [by, setBy] = useState({}); // Store remarks for each item

  // Fetch reservation data
  const fetchItemsFromServer = async () => {
    try {
      const response = await fetch('http://localhost:5000/admin-dashboard/items/reservations', {
        method: 'GET',
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setItems(data.items); // Set the fetched reservation items
      } else {
        setError('Failed to load reservations');
      }
    } catch (error) {
      console.error('Error fetching items:', error);
      setError('An error occurred while fetching the reservations.');
    }
  };

  // Fetch items when the component is mounted
  useEffect(() => {
    fetchItemsFromServer();
  }, []);


  const handleByChange = (reservation_id, newBy) => {
    setBy((prevBy) => ({
      ...prevBy,
      [reservation_id]: newBy, // Update remarks for the specific item
    }));
  };

  // Handle complete reservation action
  const handleComplete = async (reservationId) => {
    const updatedBy = by[reservationId]; // Get the updated remarks

    if (!updatedBy) {  // Check if remarks is empty or null
        alert('No by provided.');
        return;
    }

    try {
      const response = await fetch(`http://localhost:5000/admin-dashboard/items/${reservationId}/complete`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ by: updatedBy}),
      });

      if (response.ok) {
        const result = await response.json();
        fetchItemsFromServer(); // Refresh the list of reservations
        fetchItems();
        alert('Reservation completed successfully');
        setItems((prevItems) =>
          prevItems.map((item) =>
            item.reservation_id === reservationId ? { ...item, reservation_status: 'Completed' } : item
          )
        );
      } else {
        alert('Failed to complete reservation');
      }
    } catch (error) {
      console.error('Error completing reservation:', error);
      alert('An error occurred while completing the reservation.');
    }
  };

  // Handle cancel reservation action
  const handleCancel = async (reservationId) => {
    const updatedBy = by[reservationId]; // Get the updated remarks

    if (!updatedBy) {  // Check if remarks is empty or null
        alert('No by provided.');
        return;
    }
    try {
      const response = await fetch(`http://localhost:5000/admin-dashboard/items/${reservationId}/cancel`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ by: updatedBy}),
      });

      if (response.ok) {
        const result = await response.json();
        fetchItemsFromServer(); // Refresh the list of reservations
        fetchItems();
        alert('Reservation cancelled successfully');
        setItems((prevItems) =>
          prevItems.map((item) =>
            item.reservation_id === reservationId ? { ...item, reservation_status: 'Cancelled' } : item
          )
        );
      } else {
        alert('Failed to cancel reservation');
      }
    } catch (error) {
      console.error('Error canceling reservation:', error);
      alert('An error occurred while canceling the reservation.');
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
                <td>{item.reserved_at}</td>
                <td>{item.reservation_status}</td>
                <td className="dashboard-D">
                  <input
                    type="text"
                    value={by[item.reservation_id] || ''} // Use `by` state for the specific reservation_id
                    onChange={(e) => handleByChange(item.reservation_id, e.target.value)} // Update the "By" field
                    placeholder="By"
                    className="by-input"
                  />
                </td>
                <td>
                  <button onClick={() => handleComplete(item.reservation_id)} className="complete-button">Complete</button>
                  <button onClick={() => handleCancel(item.reservation_id)} className="cancel-button">Cancel</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="close-button-container">
            <button className="close-buttons" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default Reservation_status;
