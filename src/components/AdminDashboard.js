import React, { useState, useEffect } from 'react';
import { FaChevronDown, FaStar } from 'react-icons/fa';
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

  // Editable field states
  const [inputValue, setInputValue] = useState({}); // For quantity change stepper
  const [remarks, setRemarks] = useState({});
  const [prices, setPrices] = useState({});
  const [siteNames, setSiteNames] = useState({});
  const [units, setUnits] = useState({});
  const [uniqueIds, setUniqueIds] = useState({}); // For Unique IDs
  const [quantityValue, setQuantityValue] = useState({}); // For persisted quantity value
  // New state: Audit Date for manual date/time entry
  const [auditDates, setAuditDates] = useState({});

  const [confirmed, setConfirmed] = useState({});
  const [editMode, setEditMode] = useState({}); // Track edit mode for each field
  const [sortConfig, setSortConfig] = useState({ key: '', direction: '' });

  // Starred state comes directly from the backend property "starred"
  const [starred, setStarred] = useState({});

  // -----------------------------------------------------------------------
  // Helper Functions for Malaysia Time Conversion
  // -----------------------------------------------------------------------
  const convertToMYTDisplay = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' });
  };

  const formatForInput = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    // Format the date as "YYYY-MM-DDTHH:mm" in MYT
    const options = { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false };
    const parts = new Intl.DateTimeFormat('en-GB', options).formatToParts(date);
    const day = parts.find(p => p.type === 'day').value;
    const month = parts.find(p => p.type === 'month').value;
    const year = parts.find(p => p.type === 'year').value;
    const hour = parts.find(p => p.type === 'hour').value;
    const minute = parts.find(p => p.type === 'minute').value;
    return `${year}-${month}-${day}T${hour}:${minute}`;
  };

  // -----------------------------------------------------------------------
  // Fetch Items & Initialize Local States
  // -----------------------------------------------------------------------
  const fetchItems = async () => {
    try {
      const response = await fetch('http://localhost:5000/admin-dashboard/items', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'ngrok-skip-browser-warning': '1',
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        setError('Failed to fetch items');
        return;
      }
      const data = await response.json();
      const fetchedItems = data.items || [];
      setItems(fetchedItems);
      initializeStates(fetchedItems);
    } catch (err) {
      console.error('Error fetching items:', err);
      setError('An error occurred while fetching the items.');
    }
  };

  useEffect(() => {
    fetchItems();
  }, [onLogout]);

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const initializeStates = (fetchedItems) => {
    setInputValues(fetchedItems);
    setRemarksValues(fetchedItems);
    setPricesValues(fetchedItems);
    setSiteNamesValues(fetchedItems);
    setUnitsValues(fetchedItems);
    setQuantityValues(fetchedItems);
    setUniqueIdsValues(fetchedItems);
    setAuditDatesValues(fetchedItems); // Initialize audit dates
    // Read the starred value from each fetched item (persisted on backend)
    const initStarred = fetchedItems.reduce((acc, item) => {
      acc[item.item_id] = item.starred || false;
      return acc;
    }, {});
    setStarred(initStarred);
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
      acc[item.item_id] = userId === 2 ? 'admin' : item.remarks || '';
      return acc;
    }, {});
    setRemarks(initial);
  };

  const setPricesValues = (fetchedItems) => {
    const initial = fetchedItems.reduce((acc, item) => {
      acc[item.item_id] = item.price ?? 0;
      return acc;
    }, {});
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

  const setQuantityValues = (fetchedItems) => {
    const initial = fetchedItems.reduce((acc, item) => {
      acc[item.item_id] = item.quantity;
      return acc;
    }, {});
    setQuantityValue(initial);
  };

  const setUniqueIdsValues = (fetchedItems) => {
    const initial = fetchedItems.reduce((acc, item) => {
      acc[item.item_id] = item.item_unique_id || '';
      return acc;
    }, {});
    setUniqueIds(initial);
  };

  // Initialize audit dates; backend returns audit_date (if any)
  const setAuditDatesValues = (fetchedItems) => {
    const initial = fetchedItems.reduce((acc, item) => {
      acc[item.item_id] = item.audit_date || '';
      return acc;
    }, {});
    setAuditDates(initial);
  };

  const persistConfirmed = (confirmedObj) => {
    localStorage.setItem('confirmedPrices', JSON.stringify(confirmedObj));
  };

  useEffect(() => {
    // Fetch starred status from localStorage
    const storedStarred = localStorage.getItem('starredItems');
    if (storedStarred) {
      setStarred(JSON.parse(storedStarred));
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
  // Sorting: starred items always come first
  // -----------------------------------------------------------------------
  const sortedItems = [...filteredItems].sort((a, b) => {
    if (starred[a.item_id] && !starred[b.item_id]) return -1;
    if (!starred[a.item_id] && starred[b.item_id]) return 1;
    return a.item_id - b.item_id;
  });

  // -----------------------------------------------------------------------
  // Handle Star Toggle – Persist Starred Status
  // -----------------------------------------------------------------------
  const handleToggleStar = async (itemId) => {
    const newStarred = !starred[itemId];
    setStarred((prev) => {
      const updatedStarred = { ...prev, [itemId]: newStarred };
      localStorage.setItem('starredItems', JSON.stringify(updatedStarred));
      return updatedStarred;
    });

    // Update the backend
    try {
      const response = await fetch(`http://localhost:5000/admin-dashboard/items/${itemId}/update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ starred: newStarred })
      });
      if (!response.ok) {
        const errorData = await response.json();
        alert(`Failed to update star: ${errorData.message}`);
        setStarred((prev) => ({ ...prev, [itemId]: !newStarred }));
      }
    } catch (err) {
      console.error('Error updating star:', err);
      alert('An error occurred while updating the star.');
      setStarred((prev) => ({ ...prev, [itemId]: !newStarred }));
    }
  };

  // -----------------------------------------------------------------------
  // Other Handlers (Sorting, Editing, Quantity Stepper, Save, Confirm, etc.)
  // -----------------------------------------------------------------------
  const handleSort = (key) => {
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
    if (userId !== 2) return;
    if (isNaN(newPrice)) return;
    setPrices((prev) => ({ ...prev, [itemId]: newPrice }));
  };

  const handleSiteNameChange = (itemId, newSiteName) => {
    setSiteNames((prev) => ({ ...prev, [itemId]: newSiteName }));
  };

  const handleUnitChange = (itemId, newUnit) => {
    if (userId !== 2) return;
    setUnits((prev) => ({ ...prev, [itemId]: newUnit }));
  };

  const handleUniqueIdChange = (itemId, newUniqueId) => {
    setUniqueIds((prev) => ({ ...prev, [itemId]: newUniqueId }));
  };

  // New: Handle audit date changes
  const handleAuditDateChange = (itemId, newDate) => {
    setAuditDates((prev) => ({ ...prev, [itemId]: newDate }));
  };

  const toggleEditMode = (itemId, field) => {
    setEditMode((prev) => {
      const current = prev[itemId] || {
        remarks: false,
        price: false,
        siteName: false,
        unit: false,
        quantity: false,
        uniqueId: false,
        auditDate: false, // new field for audit date
      };
      return { ...prev, [itemId]: { ...current, [field]: !current[field] } };
    });
  };

  const handleSaveField = async (itemId, field, value) => {
    if (field === 'item_unique_id') {
      const duplicate = items.find(
        (it) => it.item_id !== itemId && it.item_unique_id === value
      );
      if (duplicate) {
        alert("Error: Duplicate Unique ID detected. Please use a different Unique ID.");
        return;
      }
    }
    const payload = { [field]: value };
    try {
      const response = await fetch(`http://localhost:5000/admin-dashboard/items/${itemId}/update`, {
        method: 'PATCH',
        headers: {
          'ngrok-skip-browser-warning': '1',
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errorData = await response.json();
        alert(`Failed to update ${field}: ${errorData.message}`);
        return;
      }
      const result = await response.json();
      setItems((prev) =>
        prev.map((it) => (it.item_id === itemId ? result.item : it))
      );
      if (field === 'remarks') {
        setRemarks((prev) => ({ ...prev, [itemId]: result.item.remarks }));
      } else if (field === 'price') {
        setPrices((prev) => ({ ...prev, [itemId]: result.item.price }));
      } else if (field === 'site_name') {
        setSiteNames((prev) => ({ ...prev, [itemId]: result.item.site_name }));
      } else if (field === 'unit') {
        setUnits((prev) => ({ ...prev, [itemId]: result.item.unit }));
      } else if (field === 'item_unique_id') {
        setUniqueIds((prev) => ({ ...prev, [itemId]: result.item.item_unique_id }));
      } else if (field === 'audit_date') {
        setAuditDates((prev) => ({ ...prev, [itemId]: result.item.audit_date }));
      }
      toggleEditMode(
        itemId,
        field === 'site_name'
          ? 'siteName'
          : field === 'item_unique_id'
          ? 'uniqueId'
          : field === 'audit_date'
          ? 'auditDate'
          : field
      );
      alert(`${field.charAt(0).toUpperCase() + field.slice(1)} updated successfully.`);
    } catch (err) {
      console.error(`Error updating ${field}:`, err);
      alert(`An error occurred while updating ${field}.`);
    }
  };

  const handleSaveQuantity = async (itemId) => {
    const newQty = parseInt(quantityValue[itemId], 10);
    if (isNaN(newQty)) {
      alert("Invalid quantity value.");
      return;
    }
    const payload = { newQuantity: newQty };
    try {
      const response = await fetch(`http://localhost:5000/admin-dashboard/items/${itemId}/update`, {
        method: 'PATCH',
        headers: {
          'ngrok-skip-browser-warning': '1',
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errorData = await response.json();
        alert(`Failed to update quantity: ${errorData.message}`);
        return;
      }
      const result = await response.json();
      setItems((prev) =>
        prev.map((item) =>
          item.item_id === itemId ? { ...item, quantity: result.item.quantity } : item
        )
      );
      setQuantityValue((prev) => ({ ...prev, [itemId]: result.item.quantity }));
      toggleEditMode(itemId, 'quantity');
      alert("Quantity updated successfully.");
    } catch (err) {
      console.error("Error updating quantity:", err);
      alert("An error occurred while updating the quantity.");
    }
  };

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
        `http://localhost:5000/admin-dashboard/items/${itemId}/update`,
        {
          method: 'PATCH',
          headers: {
            'ngrok-skip-browser-warning': '1',
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify(payload)
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        alert(`Failed to update item: ${errorData.message}`);
        return;
      }
      const result = await response.json();
      setItems((prev) =>
        prev.map((it) => (it.item_id === itemId ? result.item : it))
      );
      setRemarks((prev) => ({ ...prev, [itemId]: result.item.remarks }));
      setPrices((prev) => ({ ...prev, [itemId]: result.item.price }));
      setSiteNames((prev) => ({ ...prev, [itemId]: result.item.site_name }));
      setUnits((prev) => ({ ...prev, [itemId]: result.item.unit }));
      setUniqueIds((prev) => ({ ...prev, [itemId]: result.item.item_unique_id }));
      setQuantityValue((prev) => ({ ...prev, [itemId]: result.item.quantity }));
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

  const handleConfirmAll = async () => {
    const updates = items.map(async (item) => {
      const itemId = item.item_id;
      const quantityChangeRaw = inputValue[itemId] || 0;
      const quantityChange = parseInt(quantityChangeRaw, 10);
      const updatedRemarks = remarks[itemId] || '';
      const submittedPrice = prices[itemId] ? parseFloat(prices[item.item_id]) : null;
      const updatedSiteName = siteNames[itemId] || '';
      const updatedUnit = units[itemId] !== undefined ? units[itemId] : '';
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
          `http://localhost:5000/admin-dashboard/items/${itemId}/update`,
          {
            method: 'PATCH',
            headers: {
              'ngrok-skip-browser-warning': '1',
              'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(payload)
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
        setRemarks((prev) => ({ ...prev, [itemId]: result.item.remarks }));
        setPrices((prev) => ({ ...prev, [itemId]: result.item.price }));
        setSiteNames((prev) => ({ ...prev, [itemId]: result.item.site_name }));
        setUnits((prev) => ({ ...prev, [itemId]: result.item.unit }));
        setUniqueIds((prev) => ({ ...prev, [itemId]: result.item.item_unique_id }));
        setQuantityValue((prev) => ({ ...prev, [itemId]: result.item.quantity }));
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
  // Fix Item IDs – Trigger a manual reordering to reassign item_id values
  // -----------------------------------------------------------------------
  const handleFixItemIds = async () => {
    try {
      const response = await fetch('http://localhost:5000/admin-dashboard/items/fix-item-ids', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': '1'
        }
      });
      const data = await response.json();
      if (response.ok) {
        alert(data.message);
        // Re-fetch items so that item IDs (and their corresponding starred states) are updated
        fetchItems();
      } else {
        alert(`Failed to fix item IDs: ${data.error}`);
      }
    } catch (error) {
      console.error('Error fixing item IDs:', error);
      alert('An error occurred while fixing the item IDs.');
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
  // "Generate Report" -> Open report view in new tab
  // -----------------------------------------------------------------------
  const handleOpenReportTab = () => {
    window.open('/report-view', '_blank');
  };

  // -----------------------------------------------------------------------
  // Add & Delete Items Dialogs
  // -----------------------------------------------------------------------
  const handleOpenAddDialog = () => setOpenAddDialog(true);
  const handleCloseAddDialog = () => setOpenAddDialog(false);

  const handleAddItem = (newItem) => {
    setItems((prev) => [...prev, newItem]);
    setRemarks((prev) => ({
      ...prev,
      [newItem.item_id]: userId === 2 ? 'admin' : newItem.remarks || '',
    }));
    setQuantityValue((prev) => ({
      ...prev,
      [newItem.item_id]: newItem.quantity,
    }));
    setUniqueIds((prev) => ({
      ...prev,
      [newItem.item_id]: newItem.item_unique_id || '',
    }));
    setAuditDates((prev) => ({
      ...prev,
      [newItem.item_id]: newItem.audit_date || '',
    }));
    // Persist starred state from backend for the new item
    setStarred((prev) => ({ ...prev, [newItem.item_id]: newItem.starred || false }));
  };

  const handleDeleteItems = async (selectedItemIds) => {
    if (!selectedItemIds || !Array.isArray(selectedItemIds) || selectedItemIds.length === 0) {
      alert('No items selected for deletion.');
      return;
    }
    const numericIds = selectedItemIds.map((id) => Number(id));
    try {
      const response = await fetch(
        'http://localhost:5000/admin-dashboard/items/archive',
        {
          method: 'PATCH',
          headers: {
            'ngrok-skip-browser-warning': '1',
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({ itemIds: numericIds })
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
  // Render Component
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
            <button className="delete-item-button" onClick={() => setOpenDeleteDialog(true)}>
              -
            </button>
            <button className="generate-report-button" onClick={handleOpenReportTab}>
              <FaChevronDown /> Generate Report
            </button>
            <button className="fix-itemids-button" onClick={handleFixItemIds}>
              Fix Item IDs
            </button>
          </div>
        )}
      </div>

      {openAddDialog && (
        <AddItems open={openAddDialog} onClose={handleCloseAddDialog} onAddItem={handleAddItem} />
      )}

      {openDeleteDialog && (
        <DeleteItems
          open={openDeleteDialog}
          items={items}
          onDelete={handleDeleteItems}
          onClose={() => setOpenDeleteDialog(false)}
        />
      )}

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

      <div className="table-container">
        <table className="admin-dashboard-table">
          <thead>
            <tr>
              <th>Item ID</th>
              <th>Category</th>
              <th>Item Name</th>
              <th>Model</th>
              <th>Unique ID</th>
              <th>Quantity</th>
              <th>Reservation</th>
              <th>Location</th>
              <th>Site Name</th>
              <th>Unit</th>
              <th>Price</th>
              <th>Remarks</th>
              <th>Date/Time (MYT)</th>
              <th>Quantity Changed</th>
              <th>Confirmation</th>
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((item) => (
              <tr key={item.item_id} className={starred[item.item_id] ? 'starred-row' : ''}>
                <td>
                  {item.item_id}{' '}
                  <button className="star-button" onClick={() => handleToggleStar(item.item_id)}>
                    <FaStar className="star-icon" color={starred[item.item_id] ? '#f1c40f' : '#ccc'} />
                  </button>
                </td>
                <td>{highlightText(item.category, debouncedSearchQuery)}</td>
                <td>{highlightText(item.item_name, debouncedSearchQuery)}</td>
                <td>{item.model ? highlightText(item.model, debouncedSearchQuery) : ''}</td>
                <td>
                  {userId === 2 ? (
                    editMode[item.item_id]?.uniqueId ? (
                      <>
                        <input
                          type="text"
                          value={uniqueIds[item.item_id] || ''}
                          onChange={(e) => handleUniqueIdChange(item.item_id, e.target.value)}
                          placeholder="Unique ID"
                          className="unique-id-input"
                        />
                        <button className="save-button" onClick={() => handleSaveField(item.item_id, 'item_unique_id', uniqueIds[item.item_id])}>
                          Save
                        </button>
                      </>
                    ) : (
                      <>
                        <span>{uniqueIds[item.item_id] || ''}</span>
                        <button onClick={() => toggleEditMode(item.item_id, 'uniqueId')}>Edit</button>
                      </>
                    )
                  ) : (
                    <span>{uniqueIds[item.item_id] || ''}</span>
                  )}
                </td>
                <td>
                  {editMode[item.item_id]?.quantity ? (
                    <>
                      <input
                        type="number"
                        value={quantityValue[item.item_id] || 0}
                        onChange={(e) =>
                          setQuantityValue((prev) => ({ ...prev, [item.item_id]: e.target.value }))
                        }
                      />
                      <button className="save-button" onClick={() => handleSaveQuantity(item.item_id)}>Save</button>
                    </>
                  ) : (
                    <>
                      <span>{quantityValue[item.item_id]}</span>
                      <button onClick={() => toggleEditMode(item.item_id, 'quantity')}>Edit</button>
                    </>
                  )}
                </td>
                <td>{item.reserved_quantity}</td>
                <td>{item.location}</td>
                <td>
                  {editMode[item.item_id]?.siteName ? (
                    <>
                      <input
                        type="text"
                        value={siteNames[item.item_id] || ''}
                        onChange={(e) => handleSiteNameChange(item.item_id, e.target.value)}
                        placeholder="Site Name"
                        className="site-name-input"
                      />
                      <button className="save-button" onClick={() => handleSaveField(item.item_id, 'site_name', siteNames[item.item_id])}>Save</button>
                    </>
                  ) : (
                    <>
                      <span>{siteNames[item.item_id] || ''}</span>
                      <button onClick={() => toggleEditMode(item.item_id, 'siteName')}>Edit</button>
                    </>
                  )}
                </td>
                <td>
                  {userId === 2 ? (
                    editMode[item.item_id]?.unit ? (
                      <>
                        <input
                          type="text"
                          value={units[item.item_id] || ''}
                          onChange={(e) => handleUnitChange(item.item_id, e.target.value)}
                          placeholder="Unit"
                          className="unit-input"
                        />
                        <button className="save-button" onClick={() => handleSaveField(item.item_id, 'unit', units[item.item_id])}>Save</button>
                      </>
                    ) : (
                      <>
                        <span>{units[item.item_id] || ''}</span>
                        <button onClick={() => toggleEditMode(item.item_id, 'unit')}>Edit</button>
                      </>
                    )
                  ) : (
                    <span>{units[item.item_id] || ''}</span>
                  )}
                </td>
                <td>
                  {userId === 2 ? (
                    editMode[item.item_id]?.price ? (
                      <>
                        <input
                          type="text"
                          value={prices[item.item_id] !== undefined ? `RM ${prices[item.item_id]}` : ''}
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
                        <button className="save-button" onClick={() => handleSaveField(item.item_id, 'price', prices[item.item_id])}>Save</button>
                      </>
                    ) : (
                      <>
                        <span>{prices[item.item_id] !== undefined ? `RM ${prices[item.item_id]}` : ''}</span>
                        <button onClick={() => toggleEditMode(item.item_id, 'price')}>Edit</button>
                      </>
                    )
                  ) : (
                    <span>{prices[item.item_id] !== undefined ? `RM ${prices[item.item_id]}` : ''}</span>
                  )}
                </td>
                <td>
                  {editMode[item.item_id]?.remarks ? (
                    <>
                      <input
                        type="text"
                        value={remarks[item.item_id] || ''}
                        onChange={(e) => handleRemarksChange(item.item_id, e.target.value)}
                        placeholder="Remarks"
                        className="remarks-input"
                      />
                      <button className="save-button" onClick={() => handleSaveField(item.item_id, 'remarks', remarks[item.item_id])}>Save</button>
                    </>
                  ) : (
                    <>
                      <span>{remarks[item.item_id] || ''}</span>
                      <button onClick={() => toggleEditMode(item.item_id, 'remarks')}>Edit</button>
                    </>
                  )}
                </td>
                {/* New Date/Time (MYT) Column */}
                <td>
                  {userId === 2 ? (
                    editMode[item.item_id]?.auditDate ? (
                      <>
                        <input
                          type="datetime-local"
                          value={formatForInput(auditDates[item.item_id])}
                          onChange={(e) => handleAuditDateChange(item.item_id, e.target.value)}
                        />
                        <button className="save-button" onClick={() => handleSaveField(item.item_id, 'audit_date', auditDates[item.item_id])}>
                          Save
                        </button>
                      </>
                    ) : (
                      <>
                        <span>{convertToMYTDisplay(auditDates[item.item_id])}</span>
                        <button onClick={() => toggleEditMode(item.item_id, 'auditDate')}>Edit</button>
                      </>
                    )
                  ) : (
                    <span>{convertToMYTDisplay(auditDates[item.item_id])}</span>
                  )}
                </td>
                <td>
                  <div className="stepper-container">
                    <button type="button" className="stepper-btn decrement" onClick={() => handleQuantityDecrement(item.item_id)}>-</button>
                    <input
                      type="number"
                      className="stepper-input"
                      value={inputValue[item.item_id] || 0}
                      onChange={(e) => handleInputChange(item.item_id, parseInt(e.target.value) || 0)}
                    />
                    <button type="button" className="stepper-btn increment" onClick={() => handleQuantityIncrement(item.item_id)}>+</button>
                  </div>
                </td>
                <td>
                  <button className="confirmButton" onClick={() => handleConfirm(item.item_id)}>Confirm</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bulk-actions">
        <button className="confirm-all-button" onClick={handleConfirmAll}>Confirm All Updates</button>
      </div>
    </div>
  );
};

export default AdminDashboard;
