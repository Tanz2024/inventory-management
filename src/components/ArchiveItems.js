import React, { useState, useEffect } from 'react';
import './ArchiveItems.css';

const ArchivedItems = () => {
  const [archivedItems, setArchivedItems] = useState([]);
  const [error, setError] = useState('');

  // -----------------------------------------------------
  // 1) Fetch Archived Items on Component Mount
  // -----------------------------------------------------
  useEffect(() => {
    fetchArchivedItems();
  }, []);

  const fetchArchivedItems = async () => {
    try {
      const response = await fetch('https://3f42-211-25-11-204.ngrok-free.app/admin-dashboard/items/archive', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': '1',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setArchivedItems(data.items || []);
        setError('');
      } else {
        setError('Failed to fetch archived items');
      }
    } catch (error) {
      console.error(error);
      setError('An error occurred while fetching archived items');
    }
  };

  // -----------------------------------------------------
  // 2) Restore a Single Item
  // -----------------------------------------------------
  const handleRestore = async (itemId) => {
    try {
      const response = await fetch('https://3f42-211-25-11-204.ngrok-free.app/admin-dashboard/items/restore', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': '1',
        },
        body: JSON.stringify({ itemIds: [itemId] }),
      });

      const data = await response.json();
      if (response.ok) {
        alert(data.message || 'Item restored successfully');

        // Mark item as restored + highlight
        setArchivedItems((prevItems) =>
          prevItems.map((item) => {
            if (item.item_id === itemId) {
              return {
                ...item,
                archived_at: null, 
                highlight: true, // <-- Add highlight flag
              };
            }
            return item;
          })
        );

        // Remove highlight after 3 seconds
        setTimeout(() => {
          setArchivedItems((prevItems) =>
            prevItems.map((item) => {
              if (item.item_id === itemId) {
                return { ...item, highlight: false };
              }
              return item;
            })
          );
        }, 3000);

      } else {
        alert(`Failed to restore: ${data.error || data.message}`);
      }
    } catch (error) {
      console.error('Error restoring item:', error);
      alert('An error occurred while restoring the item.');
    }
  };

  // -----------------------------------------------------
  // 3) Permanently Delete a Single Item
  // -----------------------------------------------------
  const handlePermanentDelete = async (itemId) => {
    if (!window.confirm('Are you sure you want to permanently delete this item?')) {
      return;
    }

    try {
      const response = await fetch('https://3f42-211-25-11-204.ngrok-free.app/admin-dashboard/items/permanent', {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': '1',
        },
        body: JSON.stringify({ itemIds: [itemId] }),
      });

      const data = await response.json();
      if (response.ok) {
        alert(data.message || 'Item permanently deleted');
        // Remove the deleted item from local state
        setArchivedItems((prevItems) =>
          prevItems.filter((item) => item.item_id !== itemId)
        );
      } else {
        alert(`Failed to permanently delete: ${data.error || data.message}`);
      }
    } catch (error) {
      console.error('Error deleting item:', error);
      alert('An error occurred while deleting the item.');
    }
  };

  // -----------------------------------------------------
  // 4) Sort items before rendering:
  //    - Items that are still archived (archived_at not null) come first.
  //    - "None" for archived item ID, real ID for restored items.
  // -----------------------------------------------------
  const sortedItems = [...archivedItems].sort((a, b) => {
    // If one is archived and the other is restored
    if (a.archived_at && !b.archived_at) return -1;
    if (!a.archived_at && b.archived_at) return 1;

    // If both are restored, sort by item_id ascending
    if (!a.archived_at && !b.archived_at) {
      return a.item_id - b.item_id;
    }
    // Otherwise, maintain descending archived_at order
    return new Date(b.archived_at) - new Date(a.archived_at);
  });

  // -----------------------------------------------------
  // 5) Render Archived Items Table
  // -----------------------------------------------------
  return (
    <div className="archived-items-container">
      <h2>Archived Items</h2>
      {error && <p className="error-message">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>No.</th>
            <th>Item ID</th>
            <th>Category</th>
            <th>Item Name</th>
            <th>Model</th>
            <th>Unique ID</th>
            <th>Archived At</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedItems.map((item, index) => (
            <tr
              key={item.item_id}
              // If highlight is true, apply a highlight class
              className={item.highlight ? 'green-row highlight' : ''}
            >
              <td>{index + 1}</td>
              <td>{item.archived_at ? 'None' : item.item_id}</td>
              <td>{item.category}</td>
              <td>{item.item_name}</td>
              <td>{item.model}</td>
              <td>{item.item_unique_id}</td>
              <td>
                {item.archived_at
                  ? new Date(item.archived_at).toLocaleString()
                  : 'Restored'}
              </td>
              <td>
                {item.archived_at && (
                  <button
                    className="restore-button"
                    onClick={() => handleRestore(item.item_id)}
                  >
                    Restore
                  </button>
                )}
                <button
                  className="delete-button"
                  onClick={() => handlePermanentDelete(item.item_id)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ArchivedItems;
