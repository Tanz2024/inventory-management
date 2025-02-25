import React, { useState } from 'react';
import './DeleteItems.css';

const DeleteItems = ({ items, onDelete, onClose }) => {
  const [selectedItems, setSelectedItems] = useState([]);

  // Toggle selection of an item
  const handleCheckboxChange = (itemId) => {
    setSelectedItems((prevSelected) =>
      prevSelected.includes(itemId)
        ? prevSelected.filter((id) => id !== itemId)
        : [...prevSelected, itemId]
    );
  };

  // Handle delete action
  const handleDelete = () => {
    if (selectedItems.length === 0) {
      alert('No items selected');
      return;
    }

    // Confirmation dialog
    const confirmDeletion = window.confirm(
      'Are you sure you want to delete the selected items? This action cannot be undone.'
    );

    if (confirmDeletion) {
      onDelete(selectedItems); // Pass selected items to the parent component
      onClose(); // Close the dialog after deletion
    }
  };

  return (
    <dialog open className="delete-dialog">
      <h2>Select items to delete</h2>
      <div className="delete-items-table">
        <table>
          <thead>
            <tr>
              <th>Select</th>
              <th>Item Name</th>
              <th>Item ID</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.item_id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedItems.includes(item.item_id)}
                    onChange={() => handleCheckboxChange(item.item_id)}
                  />
                </td>
                <td>{item.item_name}</td>
                <td>{item.item_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="delete-dialog-buttons">
        <button onClick={handleDelete}>Confirm Deletion</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    </dialog>
  );
};

export default DeleteItems;
