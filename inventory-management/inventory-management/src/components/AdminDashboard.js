import React, { useState, useEffect } from 'react';
import './AdminDashboard.css'
import AddItems from './AddItems';  // Import the AddItem dialog
import DeleteItems from './DeleteItems';  // Import the new DeleteItems component
import generateReportPDF from './GenerateReport';
import { FaChevronDown } from 'react-icons/fa';

const AdminDashboard = ({ onLogout, userId, username, dashboardLocation }) => {
  // Main state variables
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [inputValue, setInputValue] = useState({});
  const [remarks, setRemarks] = useState({});
  const [prices, setPrices] = useState({});
  const [confirmed, setConfirmed] = useState({});

  // Dialogs and report state
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [openReportDropdown, setOpenReportDropdown] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: '', direction: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);

  // Report configuration.
  const [reportConfig, setReportConfig] = useState({
    siteName: '',
    adminName: '',
    recipientName: '',
    startDate: new Date(),
    endDate: new Date(),
    inventoryList: 'all',
    reportType: 'all',
    selectedItems: [],
    includePrice: true,
    filterByLocation: dashboardLocation ? true : false,
    location: dashboardLocation || '',
  });
  const [showSpecificItems, setShowSpecificItems] = useState(true);

  // --- Debounce Search Query ---
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // --- Show Specific Items selection when report type is 'specific' ---
  useEffect(() => {
    if (reportConfig.reportType === 'specific') {
      setShowSpecificItems(true);
    }
  }, [reportConfig.reportType]);

  // --- Persistence Helpers ---
  const persistPrices = (pricesObj) => {
    localStorage.setItem('persistedPrices', JSON.stringify(pricesObj));
  };
  const persistConfirmed = (confirmedObj) => {
    localStorage.setItem('confirmedPrices', JSON.stringify(confirmedObj));
  };

  // --- Initialization Helpers ---
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
    const fetchedIds = fetchedItems.map((item) => item.item_id.toString());
    Object.keys(parsed).forEach((key) => {
      if (!fetchedIds.includes(key)) delete parsed[key];
    });
    const initial = fetchedItems.reduce((acc, item) => {
      acc[item.item_id] =
        parsed.hasOwnProperty(item.item_id) && parsed[item.item_id] !== undefined
          ? parsed[item.item_id]
          : item.price !== undefined && item.price !== null
          ? item.price
          : 0;
      return acc;
    }, {});
    persistPrices(initial);
    setPrices(initial);
  };

  // --- Data Fetching ---
  useEffect(() => {
    const storedConfirmed = localStorage.getItem('confirmedPrices');
    if (storedConfirmed) {
      setConfirmed(JSON.parse(storedConfirmed));
    }
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
        if (response.ok) {
          const data = await response.json();
          const fetchedItems = data.items || [];
          setItems(fetchedItems);
          setInputValues(fetchedItems);
          setRemarksValues(fetchedItems);
          setPricesValues(fetchedItems);
        } else {
          setError('Failed to load items. Please check your connection or contact support.');
        }
      } catch (err) {
        console.error('Error fetching items:', err);
        setError('An error occurred while fetching the items.');
      }
    };
    fetchItems();
  }, [onLogout]);

  // --- Filtering Items ---
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

  // --- Compute Unique Locations ---
  const uniqueLocations = Array.from(new Set(items.map((item) => item.location).filter(Boolean)));

  // --- Handlers for Quantity, Remarks, and Price Updates ---
  const handleQuantityChange = (itemId, change) => {
    setInputValue((prev) => ({ ...prev, [itemId]: (prev[itemId] || 0) + change }));
  };
  const handleInputChange = (itemId, newQuantity) => {
    if (isNaN(newQuantity) || newQuantity < 0) return;
    setInputValue((prev) => ({ ...prev, [itemId]: newQuantity }));
  };
  const handleRemarksChange = (itemId, newRemarks) => {
    setRemarks((prev) => ({ ...prev, [itemId]: newRemarks }));
  };
  const handlePriceChange = (itemId, newPrice) => {
    if (userId !== 2) return;
    if (isNaN(newPrice) || newPrice < 0) return;
    setPrices((prev) => {
      const updated = { ...prev, [itemId]: newPrice };
      persistPrices(updated);
      return updated;
    });
  };

  // --- Confirm update for a single item ---
  const handleConfirm = async (itemId) => {
    const quantityChangeRaw = inputValue[itemId] || 0;
    const quantityChange = parseInt(quantityChangeRaw, 10);
    if (isNaN(quantityChange)) {
      alert('Quantity change must be an integer.');
      return;
    }
    const updatedRemarks = remarks[itemId] || '';
    const submittedPrice = prices[itemId] ? parseFloat(prices[itemId]) : null;
    if (!updatedRemarks) {
      alert('No remarks provided. Update skipped.');
      return;
    }
    const payload = { remarks: updatedRemarks, quantityChange };
    if (userId === 2 && submittedPrice !== null) {
      payload.price = submittedPrice;
    }
    try {
      const response = await fetch(`http://localhost:5000/admin-dashboard/items/${itemId}/update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (response.status === 401) {
        alert('Session expired. Logging out...');
        onLogout();
        return;
      }
      if (response.ok) {
        const result = await response.json();
        const updatedItem = result.item;
        setItems((prev) =>
          prev.map((item) => (item.item_id === itemId ? updatedItem : item))
        );
        setInputValue((prev) => ({ ...prev, [itemId]: 0 }));
        setConfirmed((prev) => {
          const newConfirmed = { ...prev, [itemId]: true };
          persistConfirmed(newConfirmed);
          return newConfirmed;
        });
        alert(`Item ${itemId} updated successfully.`);
      } else {
        const errorData = await response.json();
        alert('Failed to update item: ' + errorData.message);
      }
    } catch (err) {
      console.error('Error updating item:', err);
      alert('An error occurred while updating the item.');
    }
  };

  // --- Confirm All Updates ---
  const handleConfirmAll = async () => {
    const updates = items.map(async (item) => {
      const itemId = item.item_id;
      const quantityChangeRaw = inputValue[itemId] || 0;
      const quantityChange = parseInt(quantityChangeRaw, 10);
      if (quantityChange === 0) return null;
      const updatedRemarks = remarks[itemId] || '';
      if (!updatedRemarks) return { itemId, error: 'No remarks provided' };
      const submittedPrice = prices[itemId] ? parseFloat(prices[itemId]) : null;
      const payload = { remarks: updatedRemarks, quantityChange };
      if (userId === 2 && submittedPrice !== null) payload.price = submittedPrice;
      try {
        const response = await fetch(`http://localhost:5000/admin-dashboard/items/${itemId}/update`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
        if (response.status === 401) {
          onLogout();
          return { itemId, error: 'Unauthorized' };
        }
        if (response.ok) {
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
        } else {
          const errorData = await response.json();
          return { itemId, error: errorData.message };
        }
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

  const handleEdit = (itemId) => {
    setConfirmed((prev) => {
      const newConfirmed = { ...prev, [itemId]: false };
      persistConfirmed(newConfirmed);
      return newConfirmed;
    });
  };

  // --- Report Generation Handler ---
  const handleGenerateReport = async () => {
    const selectedIds =
      reportConfig.reportType === 'all'
        ? items.map((item) => item.item_id)
        : reportConfig.selectedItems;
    let reportData = items.filter((item) => selectedIds.includes(item.item_id));
    if (reportConfig.filterByLocation && reportConfig.location) {
      reportData = reportData.filter(
        (item) =>
          item.location &&
          item.location.toLowerCase() === reportConfig.location.toLowerCase()
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
      if (response.ok) {
        const data = await response.json();
        const logsData = data.logs.filter((log) => {
          const logDate = new Date(log.timestamp);
          const matchesDate =
            logDate >= reportConfig.startDate && logDate <= reportConfig.endDate;
          const matchesItem = selectedIds.includes(log.item_id);
          let matchesLocation = true;
          if (reportConfig.filterByLocation && reportConfig.location) {
            const item = items.find((i) => i.item_id === log.item_id);
            matchesLocation =
              item &&
              item.location &&
              item.location.toLowerCase() === reportConfig.location.toLowerCase();
          }
          return matchesDate && matchesItem && matchesLocation;
        });

        const aggregatedQuantities = logsData.reduce((acc, log) => {
          if (log.quantity_change > 0) {
            acc.quantityIn = (acc.quantityIn || 0) + log.quantity_change;
          } else if (log.quantity_change < 0) {
            acc.quantityOut = (acc.quantityOut || 0) + Math.abs(log.quantity_change);
          }
          return acc;
        }, {});

        const reportConfigData = {
          adminName: username,
          siteName: reportConfig.siteName,
          recipientName: reportConfig.recipientName,
          startDate: reportConfig.startDate,
          endDate: reportConfig.endDate,
          inventoryList: reportConfig.inventoryList,
          selectedItems: reportData.map((item) => ({
            ...item,
            price: prices[item.item_id],
          })),
          logs: logsData,
          aggregatedQuantities,
          includePrice: reportConfig.includePrice,
        };
        generateReportPDF(reportConfigData);
        setOpenReportDropdown(false);
      } else {
        alert('Failed to fetch logs for report.');
      }
    } catch (err) {
      console.error('Error fetching logs for report:', err);
      alert('An error occurred while fetching logs for the report.');
    }
  };

  const handleClearReportForm = () => {
    setReportConfig({
      siteName: '',
      adminName: '',
      recipientName: '',
      startDate: new Date(),
      endDate: new Date(),
      inventoryList: 'all',
      reportType: 'all',
      selectedItems: [],
      includePrice: true,
      filterByLocation: dashboardLocation ? true : false,
      location: dashboardLocation || '',
    });
  };

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
      const response = await fetch('http://localhost:5000/admin-dashboard/items', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ itemIds: selectedItemIds }),
      });
      if (response.status === 401) {
        onLogout();
        return;
      }
      if (response.ok) {
        alert('Items deleted successfully');
        setItems((prev) =>
          prev.filter((item) => !selectedItemIds.includes(item.item_id))
        );
      } else {
        alert('Failed to delete items');
      }
    } catch (err) {
      console.error('Error deleting items:', err);
      alert('An error occurred while deleting the items.');
    }
  };

  // --- Sorting Handler ---
  const handleSort = (key) => {
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

  // Helper to highlight matching search text
  const highlightText = (text, query) => {
    if (!query) return text;
    const regex = new RegExp(`(${query})`, 'gi');
    return text.split(regex).map((part, index) =>
      regex.test(part) ? <span key={index} className="highlight">{part}</span> : part
    );
  };

  return (
    <div className="admin-dashboard-container">
      <div className="header-container">
        <h2 className="header-admin-dashboard">{username} Dashboard</h2>
        {userId === 2 && (
          <div className="action-buttons">
            <button className="add-item-button" onClick={handleOpenAddDialog}>+</button>
            <button className="delete-item-button" onClick={() => setOpenDeleteDialog(true)}>-</button>
            <button
              className="generate-report-button"
              onClick={() => setOpenReportDropdown(!openReportDropdown)}
            >
              <FaChevronDown /> Generate Report
            </button>
          </div>
        )}
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
      </div>

      <div className="search-container">
        <input
          type="text"
          className="search-input"
          placeholder="Search items..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {openReportDropdown && (
        <div className="report-dropdown">
          <div className="report-dropdown-header">
            <h3>Generate Report</h3>
          </div>
          <form onSubmit={(e) => e.preventDefault()} className="report-form">
            <div className="name-fields">
              <div className="form-group">
                <label htmlFor="siteName">Site Name</label>
                <input
                  type="text"
                  id="siteName"
                  name="siteName"
                  placeholder="Enter Site Name"
                  value={reportConfig.siteName}
                  onChange={(e) =>
                    setReportConfig({ ...reportConfig, siteName: e.target.value })
                  }
                  required
                />
              </div>
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
                      setReportConfig({ ...reportConfig, reportType: 'all', selectedItems: [] })
                    }
                  />
                  All Items
                </label>
                <label onClick={() => setShowSpecificItems(true)}>
                  <input
                    type="radio"
                    value="specific"
                    checked={reportConfig.reportType === 'specific'}
                    onChange={() =>
                      setReportConfig({ ...reportConfig, reportType: 'specific' })
                    }
                  />
                  Specific Items
                </label>
              </div>
            </div>

            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={reportConfig.includePrice}
                  onChange={(e) =>
                    setReportConfig({ ...reportConfig, includePrice: e.target.checked })
                  }
                />
                Include Price
              </label>
            </div>

            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={reportConfig.filterByLocation}
                  onChange={(e) =>
                    setReportConfig({ ...reportConfig, filterByLocation: e.target.checked })
                  }
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
                        setReportConfig((prevConfig) => {
                          const alreadySelected = prevConfig.selectedItems.includes(item.item_id);
                          return {
                            ...prevConfig,
                            selectedItems: alreadySelected
                              ? prevConfig.selectedItems.filter((id) => id !== item.item_id)
                              : [...prevConfig.selectedItems, item.item_id],
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
              <button type="button" onClick={handleGenerateReport} className="btn-generate">
                Generate Report
              </button>
              <button type="button" onClick={() => setOpenReportDropdown(false)} className="btn-close">
                Close
              </button>
              <button type="button" onClick={handleClearReportForm} className="btn-clear">
                Clear
              </button>
            </div>
          </form>
        </div>
      )}

      {error && <p className="error-message">{error}</p>}
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
              'price',
              'remarks',
              'quantity changed',
              'confirmation',
            ].map((column) => (
              <th key={column} className="dashboard-C" onClick={() => handleSort(column)}>
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
              <td className="dashboard-D">{item.item_id}</td>
              <td className="dashboard-D">{highlightText(item.category, debouncedSearchQuery)}</td>
              <td className="dashboard-D">{highlightText(item.item_name, debouncedSearchQuery)}</td>
              <td className="dashboard-D">{item.model ? highlightText(item.model, debouncedSearchQuery) : ''}</td>
              <td className="dashboard-D">{item.item_unique_id ? highlightText(item.item_unique_id, debouncedSearchQuery) : ''}</td>
              <td className="dashboard-D">{item.quantity}</td>
              <td className="dashboard-D">{item.reserved_quantity}</td>
              <td className="dashboard-D">{item.location}</td>
              <td className="dashboard-D">
                <input
                  type="text"
                  value={prices[item.item_id] !== undefined ? `RM ${prices[item.item_id]}` : ''}
                  onChange={(e) => {
                    let inputVal = e.target.value;
                    if (inputVal.toUpperCase().startsWith('RM ')) {
                      inputVal = inputVal.slice(3);
                    }
                    const newPrice = parseFloat(inputVal) || 0;
                    handlePriceChange(item.item_id, newPrice);
                  }}
                  className="price-input"
                  disabled={userId !== 2}
                />
              </td>
              <td className="dashboard-D">
                <input
                  type="text"
                  value={remarks[item.item_id] || ''}
                  onChange={(e) => handleRemarksChange(item.item_id, e.target.value)}
                  placeholder="Remarks"
                  className="remarks-input"
                />
              </td>
              <td>
                <div className="quantity-container">
                  <button onClick={() => handleQuantityChange(item.item_id, -1)}>-</button>
                  <input
                    type="number"
                    value={inputValue[item.item_id] || 0}
                    onChange={(e) => handleInputChange(item.item_id, parseInt(e.target.value) || 0)}
                    className="quantity-input"
                  />
                  <button onClick={() => handleQuantityChange(item.item_id, 1)}>+</button>
                </div>
              </td>
              <td>
                <button className="confirmButton" onClick={() => handleConfirm(item.item_id)}>
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
