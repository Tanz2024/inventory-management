import React, { useState } from 'react';
import './AddItems.css';

const predefinedCategories = [
  "Electrical Enclosures & Power Distribution",
  "Industrial Networking & Communication Devices",
  "Environmental & Industrial Sensors",
  "Testing & Calibration Equipment",
  "Industrial Pumps & Actuators",
  "Electrical & Mechanical Accessories",
  "SCADA & Power Quality Monitoring",
  "Documentation & Miscellaneous"
];

const AddItems = ({ onClose, onAddItem }) => {
  const [itemName, setItemName] = useState('');
  const [category, setCategory] = useState('');
  const [model, setModel] = useState('');
  const [quantity, setQuantity] = useState('');
  const [location, setLocation] = useState('');
  const [unique, setUnique] = useState('');
  const [price, setPrice] = useState('');
  const [categories, setCategories] = useState(predefinedCategories);
  const [customCategory, setCustomCategory] = useState('');
  const [useCustomCategory, setUseCustomCategory] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const selectedCategory = useCustomCategory ? customCategory : category;

    // Validate form fields
    if (!itemName || !selectedCategory || !model || !unique || !quantity || !location || !price) {
      alert('All fields are required');
      return;
    }

    // Add new category to list if using a custom category
    if (useCustomCategory && !categories.includes(customCategory)) {
      setCategories([...categories, customCategory]);
    }

    // Send data to the server
    try {
      const response = await fetch('http://localhost:5000/admin-dashboard/items/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          item_name: itemName,
          category: selectedCategory,
          model,
          unique,
          quantity,
          location,
          price
        }),
      });

      if (response.ok) {
        const result = await response.json();
        onAddItem(result.item); // Update parent component
        onClose();
        alert('Item added successfully');

        // Reset form fields
        setItemName('');
        setCategory('');
        setModel('');
        setUnique('');
        setQuantity('');
        setLocation('');
        setPrice('');
        setCustomCategory('');
        setUseCustomCategory(false);
      } else {
        const errorData = await response.json();
        alert(`Failed to add item: ${errorData.message}`);
      }
    } catch (error) {
      console.error('Error adding item:', error);
      alert('An error occurred while adding the item.');
    }
  };

  return (
    <div className="add-item-dialog">
      <div className="dialog-content">
        <h2>Add New Item</h2>
        <form onSubmit={handleSubmit}>
          <label>
            Item Name:
            <input type="text" value={itemName} onChange={(e) => setItemName(e.target.value)} required />
          </label>

          <label>
            Category:
            <div>
              <select 
                value={category} 
                onChange={(e) => {
                  setCategory(e.target.value);
                  setUseCustomCategory(false);
                }} 
                required={!useCustomCategory}
                disabled={useCustomCategory}
              >
                <option value="">Select a Category</option>
                {categories.map((cat, index) => (
                  <option key={index} value={cat}>{cat}</option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Or enter a new category"
                value={customCategory}
                onChange={(e) => {
                  setCustomCategory(e.target.value);
                  setUseCustomCategory(true);
                  setCategory('');
                }}
                className="custom-category-input"
              />
            </div>
          </label>

          <label>
            Model:
            <input type="text" value={model} onChange={(e) => setModel(e.target.value)} required />
          </label>

          <label>
            Unique ID:
            <input type="text" value={unique} onChange={(e) => setUnique(e.target.value)} required />
          </label>

          <label>
            Quantity:
            <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
          </label>

          <label>
            Location:
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} required />
          </label>

          <label>
            Price (RM):
            <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
          </label>

          <div className="buttons">
            <button type="submit">Add Item</button>
            <button type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddItems;
