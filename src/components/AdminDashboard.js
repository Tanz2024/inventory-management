import React, { useState, useEffect } from 'react';
import { FaChevronDown } from 'react-icons/fa';
import AddItems from './AddItems';
import DeleteItems from './DeleteItems';
import './AdminDashboard.css';

const AdminDashboard = ({ onLogout, userId, username, dashboardLocation }) => {
  // -----------------------------------------------------------------------
  // State Variables
  // -----------------------------------------------------------------------
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  // Searching & Debouncing
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);

  // Dialog states
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);

  // For item editing (quantity, remarks, price, site name, unit)
  const [inputValue, setInputValue] = useState({});
  const [remarks, setRemarks] = useState({});
  const [prices, setPrices] = useState({});
  const [siteNames, setSiteNames] = useState({});
  const [units, setUnits] = useState({});
  const [confirmed, setConfirmed] = useState({});

  // Track edit mode for each field of an item
  const [editMode, setEditMode] = useState({});

  // Sorting
  const [sortConfig, setSortConfig] = useState({ key: '', direction: '' });

  // -----------------------------------------------------------------------
  // Fetch Items
  // -----------------------------------------------------------------------
  const fetchItems = async () => {
    try {
      const response = await fetch('https://3f42-211-25-11-204.ngrok-free.app/admin-dashboard/items', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'ngrok-skip-browser-warning': '1',
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        setError('Failed to fetch items');
        return;
      }
      const data = await response.json();
      const fetchedItems = data.items || [];
      setItems(fetchedItems);

      // Initialize local states for each item
      initializeStates(fetchedItems);
    } catch (err) {
      console.error('Error fetching items:', err);
      setError('An error occurred while fetching the items.');
    }
  };

  useEffect(() => {
    fetchItems();
    // Optionally re-fetch items on onLogout changes
  }, [onLogout]);

  // Debounce the search query
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // -----------------------------------------------------------------------
  // Initialize Local States (quantity, remarks, prices, site name, unit)
  // -----------------------------------------------------------------------
  const initializeStates = (fetchedItems) => {
    setInputValues(fetchedItems);
    setRemarksValues(fetchedItems);
    setPricesValues(fetchedItems);
    setSiteNamesValues(fetchedItems);
    setUnitsValues(fetchedItems);
  };

  const setInputValues = (fetchedItems) => {
    const initial = fetchedItems.reduce((acc, item) => {
      acc[item.item_id] = 0;
      return acc;
    }, {});
    setInputValue(initial);
  };

  const setRemarksValues = (fetchedItems) => {
    const initial = fetchedItems.reduce((acc, item) => {
      // For admin, default remarks = 'admin', otherwise use existing remarks
      acc[item.item_id] = userId === 2 ? 'admin' : item.remarks || '';
      return acc;
    }, {});
    setRemarks(initial);
  };

  const persistPrices = (pricesObj) => {
    localStorage.setItem('persistedPrices', JSON.stringify(pricesObj));
  };

  const setPricesValues = (fetchedItems) => {
    const persisted = localStorage.getItem('persistedPrices');
    let parsed = persisted ? JSON.parse(persisted) : {};

    // Clean up stale entries
    const fetchedIds = fetchedItems.map((it) => it.item_id.toString());
    Object.keys(parsed).forEach((key) => {
      if (!fetchedIds.includes(key)) delete parsed[key];
    });

    const initial = fetchedItems.reduce((acc, item) => {
      acc[item.item_id] =
        parsed.hasOwnProperty(item.item_id) && parsed[item.item_id] !== undefined
          ? parsed[item.item_id]
          : item.price ?? 0;
      return acc;
    }, {});
    persistPrices(initial);
    setPrices(initial);
  };

  const setSiteNamesValues = (fetchedItems) => {
    const initial = fetchedItems.reduce((acc, item) => {
      acc[item.item_id] = item.site_name || '';
      return acc;
    }, {});
    setSiteNames(initial);
  };

  const setUnitsValues = (fetchedItems) => {
    const initial = fetchedItems.reduce((acc, item) => {
      acc[item.item_id] = item.unit || '';
      return acc;
    }, {});
    setUnits(initial);
  };

  // Persist confirmed updates locally
  const persistConfirmed = (confirmedObj) => {
    localStorage.setItem('confirmedPrices', JSON.stringify(confirmedObj));
  };

  useEffect(() => {
    const storedConfirmed = localStorage.getItem('confirmedPrices');
    if (storedConfirmed) {
      setConfirmed(JSON.parse(storedConfirmed));
    }
  }, []);

  // -----------------------------------------------------------------------
  // Searching & Filtering
  // -----------------------------------------------------------------------
  const filteredItems = items.filter((item) => {
    if (!debouncedSearchQuery) return true;
    const q = debouncedSearchQuery.toLowerCase();
    return (
      item.item_name.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      (item.model && item.model.toLowerCase().includes(q)) ||
      (item.item_unique_id && item.item_unique_id.toLowerCase().includes(q))
    );
  });

  // -----------------------------------------------------------------------
  // Sorting
  // -----------------------------------------------------------------------
  const handleSort = (key) => {
    // Skip sorting for certain columns if needed
    if (['remarks', 'quantity changed', 'confirmation'].includes(key)) return;

    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });

    const sorted = [...items].sort((a, b) => {
      if (a[key] < b[key]) return direction === 'ascending' ? -1 : 1;
      if (a[key] > b[key]) return direction === 'ascending' ? 1 : -1;
      return 0;
    });
    setItems(sorted);
  };

  // -----------------------------------------------------------------------
  // Stepper & Confirm Logic
  // -----------------------------------------------------------------------
  const handleQuantityDecrement = (itemId) => {
    setInputValue((prev) => ({ ...prev, [itemId]: (prev[itemId] || 0) - 1 }));
  };

  const handleQuantityIncrement = (itemId) => {
    setInputValue((prev) => ({ ...prev, [itemId]: (prev[itemId] || 0) + 1 }));
  };

  const handleInputChange = (itemId, newQuantity) => {
    if (isNaN(newQuantity)) return;
    setInputValue((prev) => ({ ...prev, [itemId]: newQuantity }));
  };

  const handleRemarksChange = (itemId, newRemarks) => {
    setRemarks((prev) => ({ ...prev, [itemId]: newRemarks }));
  };

  const handlePriceChange = (itemId, newPrice) => {
    if (userId !== 2) return; // Only admin can edit price
    if (isNaN(newPrice)) return;
    setPrices((prev) => {
      const updated = { ...prev, [itemId]: newPrice };
      persistPrices(updated);
      return updated;
    });
  };

  const handleSiteNameChange = (itemId, newSiteName) => {
    setSiteNames((prev) => ({ ...prev, [itemId]: newSiteName }));
  };

  const handleUnitChange = (itemId, newUnit) => {
    if (userId !== 2) return; // Only admin can edit unit
    setUnits((prev) => ({ ...prev, [itemId]: newUnit }));
  };

  const toggleEditMode = (itemId, field) => {
    setEditMode((prev) => {
      const current = prev[itemId] || {
        remarks: false,
        price: false,
        siteName: false,
        unit: false,
      };
      return { ...prev, [itemId]: { ...current, [field]: !current[field] } };
    });
  };

 // -----------------------------------------------------------------------
// Confirm Single Update
// -----------------------------------------------------------------------
const handleConfirm = async (itemId) => {
  const quantityChangeRaw = inputValue[itemId] || 0;
  const quantityChange = parseInt(quantityChangeRaw, 10);
  if (isNaN(quantityChange)) {
    alert('Quantity change must be an integer.');
    return;
  }

  const updatedRemarks = remarks[itemId] || '';
  if (!updatedRemarks) {
    alert('No remarks provided. Update skipped.');
    return;
  }

  const submittedPrice = prices[itemId] ? parseFloat(prices[itemId]) : null;
  const updatedSiteName = siteNames[itemId] || '';
  // Ensure unit is sent even if it's empty string; you can adjust this logic if you want a default value.
  const updatedUnit = units[itemId] !== undefined ? units[itemId] : '';

  const payload = {
    remarks: updatedRemarks,
    quantityChange,
    site_name: updatedSiteName,
    unit: updatedUnit,
  };

  if (userId === 2 && submittedPrice !== null) {
    payload.price = submittedPrice;
  }

  try {
    const response = await fetch(
      `https://3f42-211-25-11-204.ngrok-free.app/admin-dashboard/items/${itemId}/update`,
      {
        method: 'PATCH',
        headers: {
          'ngrok-skip-browser-warning': '1',
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      alert(`Failed to update item: ${errorData.message}`);
      return;
    }

    const result = await response.json();

    // Update local state for the item, ensuring unit is updated as well.
    setItems((prev) =>
      prev.map((it) => (it.item_id === itemId ? result.item : it))
    );

    // Reset quantity input and mark as confirmed
    setInputValue((prev) => ({ ...prev, [itemId]: 0 }));
    setConfirmed((prev) => {
      const newConfirmed = { ...prev, [itemId]: true };
      persistConfirmed(newConfirmed);
      return newConfirmed;
    });

    alert(`Item ${itemId} updated successfully.`);
  } catch (err) {
    console.error('Error updating item:', err);
    alert('An error occurred while updating the item.');
  }
};

// -----------------------------------------------------------------------
// Confirm All Updates
// -----------------------------------------------------------------------
const handleConfirmAll = async () => {
  const updates = items.map(async (item) => {
    const itemId = item.item_id;
    const quantityChangeRaw = inputValue[itemId] || 0;
    const quantityChange = parseInt(quantityChangeRaw, 10);

    const updatedRemarks = remarks[itemId] || '';
    const submittedPrice = prices[itemId] ? parseFloat(prices[itemId]) : null;
    const updatedSiteName = siteNames[itemId] || '';
    // Ensure unit is included; if no update provided, it becomes an empty string.
    const updatedUnit = units[itemId] !== undefined ? units[itemId] : '';

    // Only update if at least one field is modified or quantity change exists.
    // Note: If only the unit is modified (and it's not an empty string), then proceed.
    if (
      quantityChange === 0 &&
      !updatedRemarks &&
      !updatedSiteName &&
      (updatedUnit === '' || updatedUnit === item.unit) &&
      submittedPrice === null
    ) {
      return null;
    }

    const payload = {
      remarks: updatedRemarks,
      quantityChange,
      site_name: updatedSiteName,
      unit: updatedUnit,
    };

    if (userId === 2 && submittedPrice !== null) {
      payload.price = submittedPrice;
    }

    try {
      const response = await fetch(
        `https://3f42-211-25-11-204.ngrok-free.app/admin-dashboard/items/${itemId}/update`,
        {
          method: 'PATCH',
          headers: {
            'ngrok-skip-browser-warning': '1',
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        return { itemId, error: errorData.message };
      }
      const result = await response.json();
      setItems((prev) =>
        prev.map((it) => (it.item_id === itemId ? result.item : it))
      );
      setInputValue((prev) => ({ ...prev, [itemId]: 0 }));
      setConfirmed((prev) => {
        const newConfirmed = { ...prev, [itemId]: true };
        persistConfirmed(newConfirmed);
        return newConfirmed;
      });
      return { itemId, success: true };
    } catch (err) {
      return { itemId, error: err.message };
    }
  });

  const results = await Promise.all(updates);
  const errors = results.filter((res) => res && res.error);
  if (errors.length > 0) {
    alert(
      'Some items failed to update: ' +
        errors.map((e) => `Item ${e.itemId}: ${e.error}`).join('; ')
    );
  } else {
    alert('All applicable items updated successfully.');
  }
};


  // -----------------------------------------------------------------------
  // Highlight Matching Search Text
  // -----------------------------------------------------------------------
  const highlightText = (text, query) => {
    if (!query) return text;
    const regex = new RegExp(`(${query})`, 'gi');
    return text.split(regex).map((part, index) =>
      regex.test(part) ? (
        <span key={index} className="highlight">
          {part}
        </span>
      ) : (
        part
      )
    );
  };

  // -----------------------------------------------------------------------
  // "Generate Report" -> open /report-view in new tab
  // -----------------------------------------------------------------------
  const handleOpenReportTab = () => {
    window.open('/report-view', '_blank');
  };

  // -----------------------------------------------------------------------
  // Add & Delete Items
  // -----------------------------------------------------------------------
  const handleOpenAddDialog = () => setOpenAddDialog(true);
  const handleCloseAddDialog = () => setOpenAddDialog(false);

  const handleAddItem = (newItem) => {
    setItems((prev) => [...prev, newItem]);
    // Also initialize remarks, etc.
    setRemarks((prev) => ({
      ...prev,
      [newItem.item_id]: userId === 2 ? 'admin' : newItem.remarks || '',
    }));
  };

  const handleDeleteItems = async (selectedItemIds) => {
    if (!selectedItemIds || !Array.isArray(selectedItemIds) || selectedItemIds.length === 0) {
      alert('No items selected for deletion.');
      return;
    }
    const numericIds = selectedItemIds.map((id) => Number(id));

    try {
      const response = await fetch(
        'https://3f42-211-25-11-204.ngrok-free.app/admin-dashboard/items/archive',
        {
          method: 'PATCH',
          headers: {
            'ngrok-skip-browser-warning': '1',
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ itemIds: numericIds }),
        }
      );
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to archive items:', errorText);
        alert('Failed to archive items');
        return;
      }
      const data = await response.json();
      alert(data.message || 'Items archived successfully');
      setItems((prev) => prev.filter((it) => !numericIds.includes(it.item_id)));
    } catch (err) {
      console.error('Error archiving items:', err);
      alert('An error occurred while archiving the items.');
    }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="admin-dashboard-container">
      <div className="header-container">
        <h2 className="header-admin-dashboard">Dashboard</h2>
        {userId === 2 && (
          <div className="action-buttons">
            <button className="add-item-button" onClick={handleOpenAddDialog}>
              +
            </button>
            <button
              className="delete-item-button"
              onClick={() => setOpenDeleteDialog(true)}
            >
              -
            </button>
            <button className="generate-report-button" onClick={handleOpenReportTab}>
              <FaChevronDown /> Generate Report
            </button>
          </div>
        )}
      </div>

      {/* Add Items Dialog */}
      {openAddDialog && (
        <AddItems open={openAddDialog} onClose={handleCloseAddDialog} onAddItem={handleAddItem} />
      )}

      {/* Delete Items Dialog */}
      {openDeleteDialog && (
        <DeleteItems
          open={openDeleteDialog}
          items={items}
          onDelete={handleDeleteItems}
          onClose={() => setOpenDeleteDialog(false)}
        />
      )}

      {/* Search Field */}
      <div className="search-container">
        <input
          type="text"
          className="search-input"
          placeholder="Search items..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {error && <p className="error-message">{error}</p>}

      {/* Items Table */}
      <div className="table-container">
        <table className="admin-dashboard-table">
          <thead>
            <tr>
              {[
                'item_id',
                'category',
                'item_name',
                'model',
                'unique id',
                'quantity',
                'reservation',
                'location',
                'site_name',
                'unit',
                'price',
                'remarks',
                'quantity changed',
                'confirmation',
              ].map((column) => (
                <th key={column} onClick={() => handleSort(column)}>
                  {column.replace('_', ' ')}
                  {sortConfig.key === column &&
                    (sortConfig.direction === 'ascending' ? ' ↑' : ' ↓')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => (
              <tr key={item.item_id}>
                <td>{item.item_id}</td>
                <td>{highlightText(item.category, debouncedSearchQuery)}</td>
                <td>{highlightText(item.item_name, debouncedSearchQuery)}</td>
                <td>{item.model ? highlightText(item.model, debouncedSearchQuery) : ''}</td>
                <td>
                  {item.item_unique_id
                    ? highlightText(item.item_unique_id, debouncedSearchQuery)
                    : ''}
                </td>
                <td>{item.quantity}</td>
                <td>{item.reserved_quantity}</td>
                <td>{item.location}</td>
                {/* Site Name */}
                <td>
                  {editMode[item.item_id]?.siteName ? (
                    <>
                      <input
                        type="text"
                        value={siteNames[item.item_id] || ''}
                        onChange={(e) =>
                          handleSiteNameChange(item.item_id, e.target.value)
                        }
                        placeholder="Site Name"
                        className="site-name-input"
                      />
                      <button
                        onClick={() => toggleEditMode(item.item_id, 'siteName')}
                        className="save-button"
                      >
                        Save
                      </button>
                    </>
                  ) : (
                    <>
                      <span>{siteNames[item.item_id] || ''}</span>
                      <button
                        onClick={() => toggleEditMode(item.item_id, 'siteName')}
                        className="edit-button"
                      >
                        Edit
                      </button>
                    </>
                  )}
                </td>
                {/* Unit */}
                <td>
                  {userId === 2 ? (
                    editMode[item.item_id]?.unit ? (
                      <>
                        <input
                          type="text"
                          value={units[item.item_id] || ''}
                          onChange={(e) =>
                            handleUnitChange(item.item_id, e.target.value)
                          }
                          placeholder="Unit"
                          className="unit-input"
                        />
                        <button
                          onClick={() => toggleEditMode(item.item_id, 'unit')}
                          className="save-button"
                        >
                          Save
                        </button>
                      </>
                    ) : (
                      <>
                        <span>{units[item.item_id] || ''}</span>
                        <button
                          onClick={() => toggleEditMode(item.item_id, 'unit')}
                          className="edit-button"
                        >
                          Edit
                        </button>
                      </>
                    )
                  ) : (
                    <span>{units[item.item_id] || ''}</span>
                  )}
                </td>
                {/* Price */}
                <td>
                  {userId === 2 ? (
                    editMode[item.item_id]?.price ? (
                      <>
                        <input
                          type="text"
                          value={
                            prices[item.item_id] !== undefined
                              ? `RM ${prices[item.item_id]}`
                              : ''
                          }
                          onChange={(e) => {
                            let val = e.target.value;
                            if (val.toUpperCase().startsWith('RM ')) {
                              val = val.slice(3);
                            }
                            const newPrice = parseFloat(val) || 0;
                            handlePriceChange(item.item_id, newPrice);
                          }}
                          className="price-input"
                        />
                        <button
                          onClick={() => toggleEditMode(item.item_id, 'price')}
                          className="save-button"
                        >
                          Save
                        </button>
                      </>
                    ) : (
                      <>
                        <span>
                          {prices[item.item_id] !== undefined
                            ? `RM ${prices[item.item_id]}`
                            : ''}
                        </span>
                        <button
                          onClick={() => toggleEditMode(item.item_id, 'price')}
                          className="edit-button"
                        >
                          Edit
                        </button>
                      </>
                    )
                  ) : (
                    <span>
                      {prices[item.item_id] !== undefined
                        ? `RM ${prices[item.item_id]}`
                        : ''}
                    </span>
                  )}
                </td>
                {/* Remarks */}
                <td>
                  {editMode[item.item_id]?.remarks ? (
                    <>
                      <input
                        type="text"
                        value={remarks[item.item_id] || ''}
                        onChange={(e) =>
                          handleRemarksChange(item.item_id, e.target.value)
                        }
                        placeholder="Remarks"
                        className="remarks-input"
                      />
                      <button
                        onClick={() => toggleEditMode(item.item_id, 'remarks')}
                        className="save-button"
                      >
                        Save
                      </button>
                    </>
                  ) : (
                    <>
                      <span>{remarks[item.item_id] || ''}</span>
                      <button
                        onClick={() => toggleEditMode(item.item_id, 'remarks')}
                        className="edit-button"
                      >
                        Edit
                      </button>
                    </>
                  )}
                </td>
                {/* Quantity Changed */}
                <td>
                  <div className="stepper-container">
                    <button
                      type="button"
                      className="stepper-btn decrement"
                      onClick={() => handleQuantityDecrement(item.item_id)}
                    >
                      -
                    </button>
                    <input
                      type="number"
                      className="stepper-input"
                      value={inputValue[item.item_id] || 0}
                      onChange={(e) =>
                        handleInputChange(
                          item.item_id,
                          parseInt(e.target.value) || 0
                        )
                      }
                    />
                    <button
                      type="button"
                      className="stepper-btn increment"
                      onClick={() => handleQuantityIncrement(item.item_id)}
                    >
                      +
                    </button>
                  </div>
                </td>
                {/* Confirmation */}
                <td>
                  <button
                    className="confirmButton"
                    onClick={() => handleConfirm(item.item_id)}
                  >
                    Confirm
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bulk Actions */}
      <div className="bulk-actions">
        <button className="confirm-all-button" onClick={handleConfirmAll}>
          Confirm All Updates
        </button>
      </div>
    </div>
  );
};

export default AdminDashboard;
