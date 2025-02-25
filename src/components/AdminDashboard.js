import React, { useState, useEffect } from 'react';
import './AdminDashboard.css';
import AddItems from './AddItems';       // Dialog for adding items
import DeleteItems from './DeleteItems'; // Dialog for deleting items
import generateReportPDF from './GenerateReport';
import { FaChevronDown } from 'react-icons/fa';

const AdminDashboard = ({ onLogout, userId, username, dashboardLocation }) => {
  // -----------------------------------------------------------------------
  // State Variables
  // -----------------------------------------------------------------------
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [inputValue, setInputValue] = useState({});
  const [remarks, setRemarks] = useState({});
  const [prices, setPrices] = useState({});
  const [siteNames, setSiteNames] = useState({});
  const [confirmed, setConfirmed] = useState({});

  // New state: track edit mode for fields (remarks, price, siteName) per item
  const [editMode, setEditMode] = useState({});

  // Dialog & Report states
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [openReportDropdown, setOpenReportDropdown] = useState(false);

  // Sorting & Searching
  const [sortConfig, setSortConfig] = useState({ key: '', direction: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);

  // Report configuration
  const [reportConfig, setReportConfig] = useState({
    adminName: '',
    recipientName: '',
    startDate: new Date(),
    endDate: new Date(),
    reportType: 'all', // "all" or "specific"
    selectedItems: [],
    includePrice: true,
    filterByLocation: !!dashboardLocation,
    location: dashboardLocation || '',
  });
  const [showSpecificItems, setShowSpecificItems] = useState(true);

  // -----------------------------------------------------------------------
  // Toggle Edit Mode Handler
  // -----------------------------------------------------------------------
  const toggleEditMode = (itemId, field) => {
    setEditMode((prev) => {
      const current = prev[itemId] || { remarks: false, price: false, siteName: false };
      return { ...prev, [itemId]: { ...current, [field]: !current[field] } };
    });
  };

  // -----------------------------------------------------------------------
  // Debounce Search Query (Improves Performance)
  // -----------------------------------------------------------------------
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  useEffect(() => {
    if (reportConfig.reportType === 'specific') {
      setShowSpecificItems(true);
    }
  }, [reportConfig.reportType]);

  // -----------------------------------------------------------------------
  // Local Persistence (Prices, Confirmed)
  // -----------------------------------------------------------------------
  const persistPrices = (pricesObj) => {
    localStorage.setItem('persistedPrices', JSON.stringify(pricesObj));
  };
  const persistConfirmed = (confirmedObj) => {
    localStorage.setItem('confirmedPrices', JSON.stringify(confirmedObj));
  };

  const fetchItems = async () => {
    try {
      const response = await fetch('http://localhost:5000/admin-dashboard/items', {
        method: 'GET',
        credentials: 'include',
      });
      if (response.status === 401) {
        onLogout();
        return;
      }
      if (!response.ok) {
        setError('Failed to load items. Please check your connection or contact support.');
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

  // -----------------------------------------------------------------------
  // Initialize Input / Remarks / Prices / Site Names
  // -----------------------------------------------------------------------
  const initializeStates = (fetchedItems) => {
    setInputValues(fetchedItems);
    setRemarksValues(fetchedItems);
    setPricesValues(fetchedItems);
    setSiteNamesValues(fetchedItems);
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
    const persisted = localStorage.getItem('persistedPrices');
    let parsed = persisted ? JSON.parse(persisted) : {};

    // Clean out old IDs not present in the current fetched items
    const fetchedIds = fetchedItems.map((item) => item.item_id.toString());
    Object.keys(parsed).forEach((key) => {
      if (!fetchedIds.includes(key)) delete parsed[key];
    });

    const initial = fetchedItems.reduce((acc, item) => {
      acc[item.item_id] =
        parsed.hasOwnProperty(item.item_id) && parsed[item.item_id] !== undefined
          ? parsed[item.item_id]
          : item.price !== null && item.price !== undefined
          ? item.price
          : 0;
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

  // -----------------------------------------------------------------------
  // On Mount, Load Confirmed State & Fetch Items
  // -----------------------------------------------------------------------
  useEffect(() => {
    const storedConfirmed = localStorage.getItem('confirmedPrices');
    if (storedConfirmed) {
      setConfirmed(JSON.parse(storedConfirmed));
    }

    // Initial fetch
    fetchItems();

    // Optional: Refresh items every 30 seconds
    const intervalId = setInterval(() => {
      fetchItems();
    }, 30000);

    return () => clearInterval(intervalId);
  }, [onLogout]);

  // -----------------------------------------------------------------------
  // Searching & Filtering
  // -----------------------------------------------------------------------
  const filteredItems = items.filter((item) => {
    if (!debouncedSearchQuery) return true;
    const query = debouncedSearchQuery.toLowerCase();
    return (
      item.item_name.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query) ||
      (item.model && item.model.toLowerCase().includes(query)) ||
      (item.item_unique_id && item.item_unique_id.toLowerCase().includes(query))
    );
  });

  const uniqueLocations = Array.from(new Set(items.map((it) => it.location).filter(Boolean)));

  // -----------------------------------------------------------------------
  // Stepper Handlers: Quantity, Remarks, Price, Site
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

  // -----------------------------------------------------------------------
  // Confirm Single Item
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
    const payload = { remarks: updatedRemarks, quantityChange };

    // Only admin can set price
    if (userId === 2 && submittedPrice !== null) {
      payload.price = submittedPrice;
    }

    // Optional site name (now also mentioned in logs as update)
    if (siteNames[itemId] !== undefined) {
      payload.site_name = siteNames[itemId];
    }

    try {
      const response = await fetch(
        `http://localhost:5000/admin-dashboard/items/${itemId}/update`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        }
      );
      if (response.status === 401) {
        alert('Session expired. Logging out...');
        onLogout();
        return;
      }
      if (!response.ok) {
        const errorData = await response.json();
        alert('Failed to update item: ' + errorData.message);
        return;
      }

      const result = await response.json();
      setItems((prev) => prev.map((it) => (it.item_id === itemId ? result.item : it)));
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
      if (quantityChange === 0) return null; // Skip if no change

      const updatedRemarks = remarks[itemId] || '';
      if (!updatedRemarks) return { itemId, error: 'No remarks provided' };

      const submittedPrice = prices[itemId] ? parseFloat(prices[item.item_id]) : null;
      const payload = { remarks: updatedRemarks, quantityChange };

      // Only admin can set price
      if (userId === 2 && submittedPrice !== null) {
        payload.price = submittedPrice;
      }
      // Optional site name (also mentioned in logs)
      if (siteNames[itemId] !== undefined) {
        payload.site_name = siteNames[itemId];
      }

      try {
        const response = await fetch(
          `http://localhost:5000/admin-dashboard/items/${itemId}/update`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
          }
        );
        if (response.status === 401) {
          onLogout();
          return { itemId, error: 'Unauthorized' };
        }
        if (!response.ok) {
          const errorData = await response.json();
          return { itemId, error: errorData.message };
        }

        const result = await response.json();
        setItems((prev) => prev.map((it) => (it.item_id === itemId ? result.item : it)));
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
  // Sorting
  // -----------------------------------------------------------------------
  const handleSort = (key) => {
    // Skip sorting for certain columns
    if (['remarks', 'quantity changed', 'confirmation'].includes(key)) return;

    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });

    const sortedItems = [...items].sort((a, b) => {
      if (a[key] < b[key]) return direction === 'ascending' ? -1 : 1;
      if (a[key] > b[key]) return direction === 'ascending' ? 1 : -1;
      return 0;
    });
    setItems(sortedItems);
  };

  // -----------------------------------------------------------------------
  // Generate Report
  // -----------------------------------------------------------------------
  const handleGenerateReport = async () => {
    // Determine which items to include based on report type
    const selectedIds =
      reportConfig.reportType === 'all'
        ? items.map((it) => it.item_id)
        : reportConfig.selectedItems;
  
    let reportData = items.filter((it) => selectedIds.includes(it.item_id));
  
    let locationFilter = null;
    let showLocation = false;
    if (reportConfig.filterByLocation && reportConfig.location) {
      locationFilter = reportConfig.location.toLowerCase();
      showLocation = true;
      reportData = reportData.filter(
        (it) => it.location && it.location.toLowerCase() === locationFilter
      );
    }
  
    try {
      const response = await fetch('http://localhost:5000/logs', {
        method: 'GET',
        credentials: 'include',
      });
      if (response.status === 401) {
        onLogout();
        return;
      }
      if (!response.ok) {
        alert('Failed to fetch logs for report.');
        return;
      }
      const data = await response.json();
  
      // Adjust the date boundaries to include the full days.
      const start = new Date(reportConfig.startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(reportConfig.endDate);
      end.setHours(23, 59, 59, 999);
  
      // Filter logs: ensure log.timestamp is within [start, end] range,
      // belongs to one of the selected items, and (if set) matches the location.
      const logsData = data.logs.filter((log) => {
        const logDate = new Date(log.timestamp);
        const inDateRange = logDate >= start && logDate <= end;
        const inSelectedItems = selectedIds.includes(log.item_id);
        let matchesLocation = true;
        if (locationFilter) {
          const foundItem = items.find((i) => i.item_id === log.item_id);
          matchesLocation =
            foundItem &&
            foundItem.location &&
            foundItem.location.toLowerCase() === locationFilter;
        }
        return inDateRange && inSelectedItems && matchesLocation;
      });
  
      // Optionally, aggregate summary quantities (if needed)
      const aggregatedQuantities = logsData.reduce(
        (acc, log) => {
          if (log.quantity_change > 0) {
            acc.quantityIn += log.quantity_change;
          } else if (log.quantity_change < 0) {
            acc.quantityOut += Math.abs(log.quantity_change);
          }
          return acc;
        },
        { quantityIn: 0, quantityOut: 0 }
      );
  
      const reportConfigData = {
        adminName: reportConfig.adminName,
        recipientName: reportConfig.recipientName,
        // Use the adjusted date objects here
        startDate: start,
        endDate: end,
        reportType: reportConfig.reportType,
        selectedItems: reportData.map((it) => ({
          ...it,
          price: prices[it.item_id],
          site_name: siteNames[it.item_id] // Now including site name in the report data
        })),
        logs: logsData,
        aggregatedQuantities,
        includePrice: reportConfig.includePrice,
        locationFilter,
        showLocation,
        showSite: false,
      };
  
      // Generate the PDF report
      generateReportPDF(reportConfigData);
      setOpenReportDropdown(false);
    } catch (err) {
      console.error('Error fetching logs for report:', err);
      alert('An error occurred while fetching logs for the report.');
    }
  };
  

  // -----------------------------------------------------------------------
  // Clear Report Form
  // -----------------------------------------------------------------------
  const handleClearReportForm = () => {
    setReportConfig({
      adminName: '',
      recipientName: '',
      startDate: new Date(),
      endDate: new Date(),
      reportType: 'all',
      selectedItems: [],
      includePrice: true,
      filterByLocation: !!dashboardLocation,
      location: dashboardLocation || '',
    });
  };

  // -----------------------------------------------------------------------
  // Add & Delete Items
  // -----------------------------------------------------------------------
  const handleOpenAddDialog = () => setOpenAddDialog(true);
  const handleCloseAddDialog = () => setOpenAddDialog(false);

  const handleAddItem = (newItem) => {
    setItems((prev) => [...prev, newItem]);
    setRemarks((prev) => ({
      ...prev,
      [newItem.item_id]: userId === 2 ? 'admin' : newItem.remarks || '',
    }));
  };

  const handleDeleteItems = async (selectedItemIds) => {
    try {
      const response = await fetch('http://localhost:5000admin-dashboard/items', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ itemIds: selectedItemIds }),
      });
      if (response.status === 401) {
        onLogout();
        return;
      }
      if (!response.ok) {
        alert('Failed to delete items');
        return;
      }

      alert('Items deleted successfully');
      setItems((prev) => prev.filter((it) => !selectedItemIds.includes(it.item_id)));
    } catch (err) {
      console.error('Error deleting items:', err);
      alert('An error occurred while deleting the items.');
    }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="admin-dashboard-container">
      {/* Header Section */}
      <div className="header-container">
        <h2 className="header-admin-dashboard">{username} Dashboard</h2>
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
            <button
              className="generate-report-button"
              onClick={() => setOpenReportDropdown(!openReportDropdown)}
            >
              <FaChevronDown /> Generate Report
            </button>
          </div>
        )}
      </div>

      {/* Add Item Dialog */}
      {openAddDialog && (
        <AddItems open={openAddDialog} onClose={handleCloseAddDialog} onAddItem={handleAddItem} />
      )}

      {/* Delete Item Dialog */}
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

      {/* Report Dropdown */}
      {openReportDropdown && (
        <div className="report-dropdown">
          <div className="report-dropdown-header">
            <h3>Generate Report</h3>
          </div>
          <form onSubmit={(e) => e.preventDefault()} className="report-form">
            <div className="name-fields">
              <div className="form-group">
                <label htmlFor="adminName">Admin Name</label>
                <input
                  type="text"
                  id="adminName"
                  name="adminName"
                  placeholder="Enter Admin Name"
                  value={reportConfig.adminName}
                  onChange={(e) =>
                    setReportConfig({ ...reportConfig, adminName: e.target.value })
                  }
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="recipientName">Recipient Name</label>
                <input
                  type="text"
                  id="recipientName"
                  name="recipientName"
                  placeholder="Enter Recipient Name"
                  value={reportConfig.recipientName}
                  onChange={(e) =>
                    setReportConfig({ ...reportConfig, recipientName: e.target.value })
                  }
                  required
                />
              </div>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="startDate">Start Date</label>
                <input
                  type="date"
                  id="startDate"
                  name="startDate"
                  value={reportConfig.startDate.toISOString().split('T')[0]}
                  onChange={(e) =>
                    setReportConfig({ ...reportConfig, startDate: new Date(e.target.value) })
                  }
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="endDate">End Date</label>
                <input
                  type="date"
                  id="endDate"
                  name="endDate"
                  value={reportConfig.endDate.toISOString().split('T')[0]}
                  onChange={(e) =>
                    setReportConfig({ ...reportConfig, endDate: new Date(e.target.value) })
                  }
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Report Type</label>
              <div className="radio-group">
                <label>
                  <input
                    type="radio"
                    value="all"
                    checked={reportConfig.reportType === 'all'}
                    onChange={() =>
                      setReportConfig({
                        ...reportConfig,
                        reportType: 'all',
                        selectedItems: [],
                      })
                    }
                  />
                  All Items
                </label>
                <label
                  onClick={() => {
                    if (reportConfig.filterByLocation) {
                      alert('Turn off "Filter by Location" to select Specific Items.');
                      return;
                    }
                    setShowSpecificItems(true);
                    setReportConfig({ ...reportConfig, reportType: 'specific' });
                  }}
                >
                  <input
                    type="radio"
                    value="specific"
                    checked={reportConfig.reportType === 'specific'}
                    onChange={() => {}}
                  />
                  Specific Items
                </label>
              </div>
            </div>

            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={reportConfig.filterByLocation}
                  onChange={(e) => {
                    const isChecked = e.target.checked;
                    if (isChecked) {
                      // Turn on location filter => automatically switch to "All Items"
                      setReportConfig({
                        ...reportConfig,
                        filterByLocation: true,
                        reportType: 'all',
                        selectedItems: [],
                      });
                    } else {
                      // Turn off location filter
                      setReportConfig({ ...reportConfig, filterByLocation: false });
                    }
                  }}
                />
                Filter by Location
              </label>
            </div>

            {reportConfig.filterByLocation && (
              <div className="form-group">
                <label htmlFor="location">Location</label>
                <select
                  id="location"
                  name="location"
                  value={reportConfig.location}
                  onChange={(e) =>
                    setReportConfig({ ...reportConfig, location: e.target.value })
                  }
                  disabled={Boolean(dashboardLocation)}
                >
                  {uniqueLocations.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {reportConfig.reportType === 'specific' && showSpecificItems && (
              <div className="form-group specific-item-option">
                <label>Select Items for Report</label>
                <div className="items-list">
                  {items.map((item) => (
                    <span
                      key={item.item_id}
                      className={`item-tag ${
                        reportConfig.selectedItems.includes(item.item_id) ? 'selected' : ''
                      }`}
                      onClick={() => {
                        setReportConfig((prev) => {
                          const alreadySelected = prev.selectedItems.includes(item.item_id);
                          return {
                            ...prev,
                            selectedItems: alreadySelected
                              ? prev.selectedItems.filter((id) => id !== item.item_id)
                              : [...prev.selectedItems, item.item_id],
                          };
                        });
                      }}
                    >
                      {item.item_name}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  className="close-specific"
                  onClick={() => setShowSpecificItems(false)}
                >
                  Close Selection
                </button>
              </div>
            )}

            <div className="form-actions">
              <button
                type="button"
                onClick={handleGenerateReport}
                className="btn-generate"
              >
                Generate Report
              </button>
              <button
                type="button"
                onClick={() => setOpenReportDropdown(false)}
                className="btn-close"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleClearReportForm}
                className="btn-clear"
              >
                Clear
              </button>
            </div>
          </form>
        </div>
      )}

      {error && <p className="error-message">{error}</p>}

      {/* Items Table */}
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
              <td>
                {userId === 2 ? (
                  editMode[item.item_id]?.price ? (
                    <>
                      <input
                        type="text"
                        value={
                          prices[item.item_id] !== undefined ? `RM ${prices[item.item_id]}` : ''
                        }
                        onChange={(e) => {
                          let val = e.target.value.toUpperCase().startsWith('RM ')
                            ? e.target.value.slice(3)
                            : e.target.value;
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
                        {prices[item.item_id] !== undefined ? `RM ${prices[item.item_id]}` : ''}
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
              <td>
                {/* Horizontal Stepper */}
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
                      handleInputChange(item.item_id, parseInt(e.target.value) || 0)
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

      <div className="bulk-actions">
        <button className="confirm-all-button" onClick={handleConfirmAll}>
          Confirm All Updates
        </button>
      </div>
    </div>
  );
};

export default AdminDashboard;
