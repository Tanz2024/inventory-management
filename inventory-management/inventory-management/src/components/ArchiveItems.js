import React, { useState, useEffect } from 'react';
import './ArchiveItems.css';  // Import the CSS for styling

const ArchivedItems = () => {
  const [archivedItems, setArchivedItems] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    // Fetch archived items from the backend
    const fetchArchivedItems = async () => {
      try {
        const response = await fetch('http://localhost:5000/admin-dashboard/items/archive', {
          method: 'GET',
          credentials: 'include',  // If you're using cookies for authentication
        });

        if (response.ok) {
          const data = await response.json();
          setArchivedItems(data.items);
        } else {
          setError('Failed to load archived items');
        }
      } catch (error) {
        setError('An error occurred while fetching archived items');
      }
    };

    fetchArchivedItems();
  }, []);

  return (
    <div className="archived-items-container">
      <h2>Archived Items</h2>
      {error && <p className="error-message">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Item ID</th>
            <th>Category</th>
            <th>Item Name</th>
            <th>Model</th>
            <th>Unique Id</th>
            <th>Archived At</th>
          </tr>
        </thead>
        <tbody>
          {archivedItems.map((item) => (
            <tr key={item.item_id}>
              <td>{item.item_id}</td>
              <td>{item.category}</td>
              <td>{item.item_name}</td>
              <td>{item.model}</td>
              <td>{item.item_unique_id}</td>
              <td>{new Date(item.archived_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ArchivedItems;