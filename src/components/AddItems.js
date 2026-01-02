import React, { useState, useEffect } from 'react';
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

const predefinedLocations = [
  "Aisle 1",
  "Aisle 2",
  "Aisle 3",
  "Aisle 4",
  "Grey Cupboard"
];

const AddItems = ({ onClose, onAddItem }) => {
  // Basic item fields
  const [itemName, setItemName] = useState('');
  const [category, setCategory] = useState('');
  const [model, setModel] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unique, setUnique] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('');
  const [date, setDate] = useState(''); // "Key in Date" used in payload

  // Dropdown options
  const [categories, setCategories] = useState(predefinedCategories);
  const [locations, setLocations] = useState(predefinedLocations);
  const [siteOptions, setSiteOptions] = useState([]);
  const [remarkOptions, setRemarkOptions] = useState([]);

  // Current selections
  const [location, setLocation] = useState('');
  const [site, setSite] = useState('');
  const [remark, setRemark] = useState('');

  // State to handle toggling custom input for each field
  const [showCategoryInput, setShowCategoryInput] = useState(false);
  const [newCategory, setNewCategory] = useState('');

  const [showLocationInput, setShowLocationInput] = useState(false);
  const [newLocation, setNewLocation] = useState('');

  const [showSiteInput, setShowSiteInput] = useState(false);
  const [newSite, setNewSite] = useState('');

  const [showRemarkInput, setShowRemarkInput] = useState(false);
  const [newRemark, setNewRemark] = useState('');
  useEffect(() => {
    const fetchSiteOptions = async () => {
      try {
        const response = await fetch('http://localhost:5000/dropdown-options/sites', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include'
        });
        if (response.ok) {
          const data = await response.json();
          setSiteOptions(data.sites || []);
        }
      } catch (error) {
        console.error('Error fetching site options:', error);
      }
    };
  
    // Initial fetch
    fetchSiteOptions();
  
    // Listen to custom event
    const handleUpdate = (e) => {
      if (e.detail?.type === 'site') {
        fetchSiteOptions();
      }
    };
  
    window.addEventListener('dropdownOptionsUpdated', handleUpdate);
    return () => window.removeEventListener('dropdownOptionsUpdated', handleUpdate);
  }, []);
  useEffect(() => {
    const fetchRemarkOptions = async () => {
      try {
        const response = await fetch('http://localhost:5000/dropdown-options/remarks', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include'
        });
        if (response.ok) {
          const data = await response.json();
          setRemarkOptions(data.remarks || []);
        }
      } catch (error) {
        console.error('Error fetching remark options:', error);
      }
    };
  
    // Initial fetch
    fetchRemarkOptions();
  
    // Listen to custom event
    const handleUpdate = (e) => {
      if (e.detail?.type === 'remark') {
        fetchRemarkOptions();
      }
    };
  
    window.addEventListener('dropdownOptionsUpdated', handleUpdate);
    return () => window.removeEventListener('dropdownOptionsUpdated', handleUpdate);
  }, []);
    
  // Check if the Unique ID already exists
  const checkDuplicateUniqueId = async (uniqueId) => {
    try {
      const response = await fetch('http://localhost:5000/admin-dashboard/items', {
        method: 'GET',
        headers: {
          
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        const items = data.items || [];
        return items.some(item => item.item_unique_id === uniqueId);
      }
    } catch (error) {
      console.error('Error checking unique id duplicate:', error);
    }
    return false;
  };

  // --- Handlers for adding new custom values ---

  // Category (local only)
  const handleAddCategory = () => {
    if (!newCategory.trim()) {
      alert('Please enter a category name.');
      return;
    }
    // Add to local array if not already present
    if (!categories.includes(newCategory.trim())) {
      setCategories(prev => [...prev, newCategory.trim()]);
    }
    // Select it immediately
    setCategory(newCategory.trim());
    // Reset
    setNewCategory('');
    setShowCategoryInput(false);
  };

  // Location (local only)
  const handleAddLocation = () => {
    if (!newLocation.trim()) {
      alert('Please enter a location.');
      return;
    }
    if (!locations.includes(newLocation.trim())) {
      setLocations(prev => [...prev, newLocation.trim()]);
    }
    setLocation(newLocation.trim());
    setNewLocation('');
    setShowLocationInput(false);
  };

  // Generic helper to refresh options
const refreshOptions = async (url, setter) => {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    if (response.ok) {
      const data = await response.json();
      setter(data?.sites || data?.remarks || []);
    }
  } catch (error) {
    console.error('Error refreshing options:', error);
  }
};

// ✅ Site (POST to backend then refresh dropdown)
const handleAddSite = async () => {
  const siteToAdd = newSite.trim();
  if (!siteToAdd) {
    alert('Please enter a site name.');
    return;
  }

  if (!siteOptions.includes(siteToAdd)) {
    try {
      const response = await fetch('http://localhost:5000/dropdown-options/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ option: siteToAdd }),
      });

      if (!response.ok) {
        const errData = await response.json();
        alert(`Failed to add new site: ${errData.message}`);
        return;
      }

      await refreshOptions('http://localhost:5000/dropdown-options/sites', setSiteOptions);
    } catch (error) {
      console.error('Error adding new site:', error);
      alert('An error occurred while adding the new site.');
      return;
    }
  }

  setSite(siteToAdd);
  setNewSite('');
  setShowSiteInput(false);
};

// ✅ Remark (POST to backend then refresh dropdown)
const handleAddRemark = async () => {
  const remarkToAdd = newRemark.trim();
  if (!remarkToAdd) {
    alert('Please enter a remark.');
    return;
  }

  if (!remarkOptions.includes(remarkToAdd)) {
    try {
      const response = await fetch('http://localhost:5000/dropdown-options/remarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ option: remarkToAdd }),
      });

      if (!response.ok) {
        const errData = await response.json();
        alert(`Failed to add new remark: ${errData.message}`);
        return;
      }

      await refreshOptions('http://localhost:5000/dropdown-options/remarks', setRemarkOptions);
    } catch (error) {
      console.error('Error adding new remark:', error);
      alert('An error occurred while adding the new remark.');
      return;
    }
  }

  setRemark(remarkToAdd);
  setNewRemark('');
  setShowRemarkInput(false);
};

  

  // --- Form submission ---
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate required fields
    if (
      ![itemName, category, model, unique, quantity, date, price, unit, location].every(Boolean)
    ) {
      alert('All fields except Site and Remark are required.');
      return;
    }

    // Check for duplicate Unique ID
    const duplicateExists = await checkDuplicateUniqueId(unique);
    if (duplicateExists) {
      alert('The Unique ID already exists. Please choose a different Unique ID.');
      return;
    }

    // Build the payload
    const payload = {
      item_name: itemName.trim(),
      category: category.trim(),
      model: model.trim(),
      item_unique_id: unique.trim(),
      quantity: parseInt(quantity, 10),
      date, // "Key in Date"
      price: parseFloat(price),
      unit: unit.trim(),
      location: location.trim(),
      site: site.trim() || '',    // optional
      remark: remark.trim() || '' // optional
    };

    try {
      const response = await fetch('http://localhost:5000/admin-dashboard/items', {
        method: 'POST',
        headers: {
          
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const err = await response.json();
        alert(`Failed to add item: ${err.message}`);
        return;
      }

      const { item } = await response.json();
      // If backend doesn't return price, ensure we keep the submitted price
      const newItem = { ...item, price: item.price ?? payload.price };

      onAddItem(newItem);
      alert('Item added successfully');
      onClose();

      // Reset form fields
      setItemName('');
      setCategory('');
      setModel('');
      setUnique('');
      setQuantity('');
      setPrice('');
      setUnit('');
      setDate('');
      setLocation('');
      setSite('');
      setRemark('');
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
          {/* Item Name */}
          <label>
            Item Name:
            <input
              type="text"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              required
            />
          </label>

          {/* Category */}
          <label>
            Category:
            {!showCategoryInput ? (
              <select
                className="dialog-select"
                value={category}
                onChange={(e) => {
                  if (e.target.value === 'ADD_NEW_CATEGORY') {
                    setShowCategoryInput(true);
                  } else {
                    setCategory(e.target.value);
                  }
                }}
                required
              >
                <option value="">Select a Category</option>
                {categories.map((cat, idx) => (
                  <option key={idx} value={cat}>
                    {cat}
                  </option>
                ))}
                <option value="ADD_NEW_CATEGORY">Add New Category...</option>
              </select>
            ) : (
              <div className="custom-input-wrap">
                <input
                  type="text"
                  placeholder="Enter new category"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="dialog-input"
                />
                <button type="button" onClick={handleAddCategory} className="confirm-btn">
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCategoryInput(false);
                    setNewCategory('');
                  }}
                  className="cancel-btn"
                >
                  Cancel
                </button>
              </div>
            )}
          </label>

          {/* Model */}
          <label>
            Model:
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              required
            />
          </label>

          {/* Unique ID */}
          <label>
            Unique ID:
            <input
              type="text"
              value={unique}
              onChange={(e) => setUnique(e.target.value)}
              required
            />
          </label>

          {/* Quantity */}
          <label>
            Quantity:
            <input
              type="number"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </label>

          {/* Unit */}
          <label>
            Unit:
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              required
              pattern="^[A-Za-z\s]+$"
              title="Unit should only contain letters and spaces"
            />
          </label>

          {/* Price */}
          <label>
            Price (RM):
            <input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </label>

          {/* Key in Date */}
          <label>
            Key in Date:
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>

          {/* Location */}
          <label>
            Location:
            {!showLocationInput ? (
              <select
                className="dialog-select"
                value={location}
                onChange={(e) => {
                  if (e.target.value === 'ADD_NEW_LOCATION') {
                    setShowLocationInput(true);
                  } else {
                    setLocation(e.target.value);
                  }
                }}
                required
              >
                <option value="">Select a Location</option>
                {locations.map((loc, idx) => (
                  <option key={idx} value={loc}>
                    {loc}
                  </option>
                ))}
                <option value="ADD_NEW_LOCATION">Add New Location...</option>
              </select>
            ) : (
              <div className="custom-input-wrap">
                <input
                  type="text"
                  placeholder="Enter new location"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  className="dialog-input"
                />
                <button type="button" onClick={handleAddLocation} className="confirm-btn">
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowLocationInput(false);
                    setNewLocation('');
                  }}
                  className="cancel-btn"
                >
                  Cancel
                </button>
              </div>
            )}
          </label>

          {/* Site (optional) */}
          <label>
            Site:
            {!showSiteInput ? (
              <select
                className="dialog-select"
                value={site}
                onChange={(e) => {
                  if (e.target.value === 'ADD_NEW_SITE') {
                    setShowSiteInput(true);
                  } else {
                    setSite(e.target.value);
                  }
                }}
              >
                <option value="">Select a Site (optional)</option>
                {siteOptions.map((s, idx) => (
                  <option key={idx} value={s}>
                    {s}
                  </option>
                ))}
                <option value="ADD_NEW_SITE">Add New Site...</option>
              </select>
            ) : (
              <div className="custom-input-wrap">
                <input
                  type="text"
                  placeholder="Enter new site"
                  value={newSite}
                  onChange={(e) => setNewSite(e.target.value)}
                  className="dialog-input"
                />
                <button type="button" onClick={handleAddSite} className="confirm-btn">
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSiteInput(false);
                    setNewSite('');
                  }}
                  className="cancel-btn"
                >
                  Cancel
                </button>
              </div>
            )}
          </label>

          {/* Remark (optional) */}
          <label>
            Remark:
            {!showRemarkInput ? (
              <select
                className="dialog-select"
                value={remark}
                onChange={(e) => {
                  if (e.target.value === 'ADD_NEW_REMARK') {
                    setShowRemarkInput(true);
                  } else {
                    setRemark(e.target.value);
                  }
                }}
              >
                <option value="">Select a Remark (optional)</option>
                {remarkOptions.map((rmk, idx) => (
                  <option key={idx} value={rmk}>
                    {rmk}
                  </option>
                ))}
                <option value="ADD_NEW_REMARK">Add New Remark...</option>
              </select>
            ) : (
              <div className="custom-input-wrap">
                <input
                  type="text"
                  placeholder="Enter new remark"
                  value={newRemark}
                  onChange={(e) => setNewRemark(e.target.value)}
                  className="dialog-input"
                />
                <button type="button" onClick={handleAddRemark} className="confirm-btn">
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowRemarkInput(false);
                    setNewRemark('');
                  }}
                  className="cancel-btn"
                >
                  Cancel
                </button>
              </div>
            )}
          </label>

          <div className="buttons">
            <button type="submit" className="primary">
              Add Item
            </button>
            <button type="button" className="secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddItems;

