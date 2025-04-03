import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import generateReportPDF from './GenerateReport';
import './ReportView.css';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

/* ------------------ Utility Functions ------------------ */
function highlightText(text = '', searchTerm = '') {
  if (!searchTerm) return text;
  const regex = new RegExp(`(${searchTerm})`, 'gi');
  return text.split(regex).map((part, idx) =>
    regex.test(part) ? <span key={idx} className="highlight">{part}</span> : part
  );
}

function formatKeyInDateCustom(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const day = date.getDate();
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const month = date.toLocaleDateString('en-US', { month: 'long' }).toLowerCase();
  const year = date.getFullYear();
  return `${day} ${weekday} ${month} ${year}`;
}

function isValidDate(d) {
  const date = new Date(d);
  return date instanceof Date && !isNaN(date);
}

/* ------------------ FilterForm Component ------------------ */
function FilterForm({
  adminName,
  setAdminName,
  recipientName,
  setRecipientName,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  keyInDate,
  setKeyInDate,
  reportType,
  setReportType,
  selectedItems,
  setSelectedItems,
  filterByLocation,
  setFilterByLocation,
  location,
  setLocation,
  changedBySearch,
  setChangedBySearch,
  siteSearch,
  setSiteSearch,
  remarksSearch,
  setRemarksSearch,
  uniqueLocations,
  items,
  handleFetchLogs,
  handleClearAllFields,
}) {
  const handleReportTypeChange = (e) => {
    const newType = e.target.value;
    if (newType === 'specific') {
      setFilterByLocation(false);
      setLocation('');
    }
    setReportType(newType);
  };

  return (
    <div className="report-form">
      {/* Admin & Recipient Filters */}
      <div className="filters-row">
        <div className="filter-group">
          <label htmlFor="adminName">Admin Name:</label>
          <input
            id="adminName"
            type="text"
            placeholder="Enter Admin Name"
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label htmlFor="recipientName">Recipient Name:</label>
          <input
            id="recipientName"
            type="text"
            placeholder="Enter Recipient Name"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
          />
        </div>
      </div>
      {/* Date Filters */}
      <div className="filters-row">
        <div className="filter-group">
          <label htmlFor="startDate">Log Start Date:</label>
          <input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label htmlFor="endDate">Log End Date:</label>
          <input
            id="endDate"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>
      {/* Single Key‑in Date */}
      <div className="filters-row">
        <div className="filter-group">
          <label htmlFor="keyInDate">Key‑in Date:</label>
          <input
            id="keyInDate"
            type="date"
            value={keyInDate}
            onChange={(e) => setKeyInDate(e.target.value)}
          />
        </div>
      </div>
      {/* Report Type & Specific Items */}
      <div className="filters-row">
        <div className="filter-group">
          <label htmlFor="reportType">Report Type:</label>
          <select id="reportType" value={reportType} onChange={handleReportTypeChange}>
            <option value="all">All Items</option>
            <option value="specific">Specific Items</option>
          </select>
        </div>
      </div>
      {reportType === 'specific' && (
        <div className="filter-group">
          <label>Select Items:</label>
          <div className="items-list">
            {items.map((it) => (
              <span
                key={it.item_id}
                className={selectedItems.includes(it.item_id) ? 'item-tag selected' : 'item-tag'}
                onClick={() =>
                  setSelectedItems((prev) =>
                    prev.includes(it.item_id)
                      ? prev.filter((id) => id !== it.item_id)
                      : [...prev, it.item_id]
                  )
                }
              >
                {it.item_name}
              </span>
            ))}
          </div>
        </div>
      )}
      {/* Filter by Location */}
      <div className="filters-row">
        <div className="filter-group">
          <label>
            <input
              type="checkbox"
              checked={filterByLocation}
              onChange={(e) => {
                setFilterByLocation(e.target.checked);
                if (!e.target.checked) setLocation('');
              }}
            />
            Filter by Location
          </label>
          {filterByLocation && (
            <select value={location} onChange={(e) => setLocation(e.target.value)}>
              <option value="">--Select--</option>
              {uniqueLocations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      {/* Additional Search Fields */}
      <div className="filters-row">
        <div className="filter-group">
          <label htmlFor="changedBy">Search Changed By:</label>
          <input
            id="changedBy"
            type="text"
            placeholder="e.g. admin"
            value={changedBySearch}
            onChange={(e) => setChangedBySearch(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label htmlFor="siteSearch">Search Site:</label>
          <input
            id="siteSearch"
            type="text"
            placeholder="e.g. AEON"
            value={siteSearch}
            onChange={(e) => setSiteSearch(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label htmlFor="remarksSearch">Search Remarks:</label>
          <input
            id="remarksSearch"
            type="text"
            placeholder="Any remark text"
            value={remarksSearch}
            onChange={(e) => setRemarksSearch(e.target.value)}
          />
        </div>
      </div>
      {/* Action Buttons */}
      <div className="filter-actions">
        <button onClick={handleFetchLogs} className="apply-button">
          Refresh Logs
        </button>
        <button
          onClick={() => {
            setChangedBySearch('');
            setSiteSearch('');
            setRemarksSearch('');
          }}
          className="clear-button"
        >
          Clear Searches
        </button>
        <button onClick={handleClearAllFields} className="clear-button">
          Clear All Fields
        </button>
      </div>
    </div>
  );
}

/* ------------------ ItemLogs Component ------------------ */
function ItemLogs({
  item,
  logs,
  changedBySearch,
  siteSearch,
  remarksSearch,
  globalCollapse,
  startDate,
  endDate,
  keyInDate,
  updateLog,
  deleteLog,
  refreshItems,
}) {
  const [sortConfig, setSortConfig] = useState({ column: 'timestamp', direction: 'desc' });
  const [collapsed, setCollapsed] = useState(false);
  const [editedLogs, setEditedLogs] = useState({});

  useEffect(() => {
    setCollapsed(globalCollapse);
  }, [globalCollapse]);

  const handleSortToggle = (column) => {
    setSortConfig((prev) =>
      prev.column === column
        ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' }
    );
  };

  // Compute logs with "Previous Stock" and "Current Stock"
  const logsWithStock = useMemo(() => {
    const itemLogs = logs
      .filter((log) => log.item_id === item.item_id)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)); // Oldest first

    if (itemLogs.length === 0) return [];

    const totalChange = itemLogs.reduce(
      (sum, log) => sum + (Number(log.quantity_change) || 0),
      0
    );

    const initialStock = item.quantity - totalChange;
    let running = initialStock;

    // Create a virtual starting log (non-editable)
    const virtualStartingLog = {
      timestamp: itemLogs[0]?.timestamp || new Date().toISOString(),
      quantity_change: 0,
      stockBefore: initialStock,
      stockAfter: initialStock,
      updated_by: 'System',
      remarks: 'Initial stock before logs',
      site_name: item.site_name || '',
      key_in_date: '',
      source: 'virtual',
      id: `start-${item.item_id}`,
    };

    const logsCalculated = itemLogs.map((log) => {
      const stockBefore = running;
      running += Number(log.quantity_change) || 0;
      const stockAfter = running;
      return { ...log, stockBefore, stockAfter };
    });

    return [virtualStartingLog, ...logsCalculated];
  }, [logs, item.item_id, item.quantity, item.site_name]);

  // Handle editing for logs (non-virtual only)
  const handleEdit = (index, log) => {
    if (log.source === 'virtual') return; // Skip virtual log
    setEditedLogs((prev) => ({
      ...prev,
      [index]: {
        ...log,
        qtyIn: log.quantity_change > 0 ? log.quantity_change.toString() : '',
        qtyOut: log.quantity_change < 0 ? Math.abs(log.quantity_change).toString() : '',
        updated_by: log.updated_by,
        site_name: log.site_name,
        remarks: log.remarks,
      }
    }));
  };

  const cancelEdit = (index) => {
    setEditedLogs((prev) => {
      const newState = { ...prev };
      delete newState[index];
      return newState;
    });
  };

  const handleInputChange = (index, field, value) => {
    setEditedLogs((prev) => ({
      ...prev,
      [index]: { ...prev[index], [field]: value },
    }));
  };

  const handleSaveEdit = async (index) => {
    const currentEdit = editedLogs[index];
    if (!currentEdit || !currentEdit.source || !currentEdit.id) {
      console.error('Missing source or id in edited log:', currentEdit);
      return;
    }
    let newQtyChange;
    // Determine new quantity_change based on Qty In/Out inputs
    if (currentEdit.qtyIn !== undefined && currentEdit.qtyIn !== '') {
      let val = parseInt(currentEdit.qtyIn, 10);
      newQtyChange = val < 0 ? -Math.abs(val) : Math.abs(val);
    } else if (currentEdit.qtyOut !== undefined && currentEdit.qtyOut !== '') {
      let val = parseInt(currentEdit.qtyOut, 10);
      if (currentEdit.quantity_change < 0 && val > 0) {
        newQtyChange = Math.abs(val);
      } else {
        newQtyChange = -Math.abs(val);
      }
    } else {
      newQtyChange = currentEdit.quantity_change;
    }

    // If required fields are missing, show a toast notification and exit
    if (!currentEdit.site_name || currentEdit.site_name.trim() === '') {
      toast.error("Site not available. Please add it first.");
      return;
    }
    if (!currentEdit.remarks || currentEdit.remarks.trim() === '') {
      toast.error("Remarks not available. Please add them first.");
      return;
    }

    try {
      const response = await fetch(
        `http://localhost:5000/logs/${currentEdit.source}/${currentEdit.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            updated_by: currentEdit.updated_by,
            key_in_date: currentEdit.key_in_date,
            quantity_change: newQtyChange,
            site_name: currentEdit.site_name,
            remarks: currentEdit.remarks,
          }),
        }
      );
      if (!response.ok) {
        throw new Error('Failed to save log');
      }
      const data = await response.json();
      updateLog(data.log);
      cancelEdit(index);
      await refreshItems();
      toast.success("Log updated successfully.");
    } catch (err) {
      console.error('Save failed:', err);
      toast.error("Failed to save changes. Please try again.");
    }
  };

  const handleDelete = async (log) => {
    if (!log || !log.source || !log.id) {
      console.error('Missing source or id in log:', log);
      return;
    }
    if (!window.confirm('Are you sure you want to delete this log?')) return;
    try {
      const response = await fetch(`http://localhost:5000/logs/${log.source}/${log.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Delete failed');
      deleteLog(log.id);
      await refreshItems();
      toast.success("Log deleted successfully.");
    } catch (err) {
      console.error('Delete failed:', err);
      toast.error("Failed to delete log. Please try again.");
    }
  };

  return (
    <div className="item-card">
      <div className="item-card-header">
        <h3>
          {item.item_name} (Current Stock: {item.quantity})
        </h3>
        <button className="collapse-button" onClick={() => setCollapsed((prev) => !prev)}>
          {collapsed ? 'Show Logs' : 'Hide Logs'}
        </button>
      </div>
      {!collapsed && (
        <table className="item-logs-table">
          <thead>
            <tr>
              <th onClick={() => handleSortToggle('audit_date')}>
                Date &amp; Time {sortConfig.column === 'audit_date' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSortToggle('updated_by')}>
                Changed By {sortConfig.column === 'updated_by' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th>Qty In</th>
              <th>Qty Out</th>
              <th onClick={() => handleSortToggle('stockBefore')}>
                Previous Stock {sortConfig.column === 'stockBefore' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSortToggle('stockAfter')}>
                Current Stock {sortConfig.column === 'stockAfter' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSortToggle('site_name')}>
                Site {sortConfig.column === 'site_name' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSortToggle('remarks')}>
                Remarks {sortConfig.column === 'remarks' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {logsWithStock.length === 0 ? (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center' }}>No logs found</td>
              </tr>
            ) : (
              logsWithStock.map((log, idx) => {
                const logDate = new Date(log.timestamp);
                const logISO = logDate.toLocaleDateString('en-CA');
                const startISO = startDate ? new Date(startDate).toLocaleDateString('en-CA') : null;
                const endISO = endDate ? new Date(endDate).toLocaleDateString('en-CA') : null;
                if ((startISO && logISO < startISO) || (endISO && logISO > endISO)) return null;
                const isEditing = Object.prototype.hasOwnProperty.call(editedLogs, idx);
                const currentEdit = editedLogs[idx] || {};

                return (
                  <tr
                    key={idx}
                    className={
                      log.source === 'virtual'
                        ? 'initial-stock-row'
                        : Number(log.quantity_change) > 0
                        ? 'row-positive'
                        : Number(log.quantity_change) < 0
                        ? 'row-negative'
                        : ''
                    }
                  >
                    <td>
                      {isEditing ? (
                        <input
                          type="datetime-local"
                          value={currentEdit.key_in_date || ''}
                          onChange={(e) => handleInputChange(idx, 'key_in_date', e.target.value)}
                        />
                      ) : (
                        formatKeyInDateCustom(log.key_in_date)
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          value={currentEdit.updated_by || log.updated_by}
                          onChange={(e) => handleInputChange(idx, 'updated_by', e.target.value)}
                        />
                      ) : (
                        log.updated_by === 'System' ? 'n/a' : highlightText(log.updated_by || '', changedBySearch)
                      )}
                    </td>
                    <td>
                      {isEditing && log.quantity_change >= 0 ? (
                        <input
                          type="number"
                          value={currentEdit.qtyIn !== undefined ? currentEdit.qtyIn : (log.quantity_change > 0 ? log.quantity_change : '')}
                          onChange={(e) => handleInputChange(idx, 'qtyIn', e.target.value)}
                        />
                      ) : (
                        log.quantity_change > 0 && `+${log.quantity_change}`
                      )}
                    </td>
                    <td>
                      {isEditing && log.quantity_change < 0 ? (
                        <input
                          type="number"
                          value={currentEdit.qtyOut !== undefined ? currentEdit.qtyOut : (log.quantity_change < 0 ? Math.abs(log.quantity_change) : '')}
                          onChange={(e) => handleInputChange(idx, 'qtyOut', e.target.value)}
                        />
                      ) : (
                        log.quantity_change < 0 && `-${Math.abs(log.quantity_change)}`
                      )}
                    </td>
                    <td>{log.stockBefore !== undefined ? log.stockBefore : 'N/A'}</td>
                    <td>{log.stockAfter !== undefined ? log.stockAfter : 'N/A'}</td>
                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          value={currentEdit.site_name || log.site_name}
                          onChange={(e) => handleInputChange(idx, 'site_name', e.target.value)}
                        />
                      ) : (
                        log.source === 'virtual'
                          ? ''
                          : ((log.site_name === 'System' || !log.site_name) ? 'n/a' : highlightText(log.site_name || '', siteSearch))
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          value={currentEdit.remarks || log.remarks}
                          onChange={(e) => handleInputChange(idx, 'remarks', e.target.value)}
                        />
                      ) : (
                        highlightText(log.remarks || '', remarksSearch)
                      )}
                    </td>
                    <td>
                      {log.source === 'virtual' ? (
                        'N/A'
                      ) : isEditing ? (
                        <>
                          <button onClick={() => handleSaveEdit(idx)}>Save</button>
                          <button onClick={() => cancelEdit(idx)}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => handleEdit(idx, log)}>Edit</button>
                          <button onClick={() => handleDelete(log)}>Delete</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ------------------ ReportView Component ------------------ */
export default function ReportView() {
  const navigate = useNavigate();
  const [adminName, setAdminName] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [keyInDate, setKeyInDate] = useState('');
  const [reportType, setReportType] = useState('all');
  const [selectedItems, setSelectedItems] = useState([]);
  const [filterByLocation, setFilterByLocation] = useState(false);
  const [location, setLocation] = useState('');
  const [changedBySearch, setChangedBySearch] = useState('');
  const [siteSearch, setSiteSearch] = useState('');
  const [remarksSearch, setRemarksSearch] = useState('');
  const [items, setItems] = useState([]);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);
  const [showFilters, setShowFilters] = useState(true);
  const [globalCollapse, setGlobalCollapse] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      setError(null);
      setLoadingItems(true);
      const response = await fetch('http://localhost:5000/admin-dashboard/items', {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
      });
      if (!response.ok) throw new Error('Failed to fetch items');
      const data = await response.json();
      setItems(data.items || []);
    } catch (err) {
      console.error('Error fetching items:', err);
      setError(err.message || 'An error occurred while fetching items.');
    } finally {
      setLoadingItems(false);
    }
  };

  const fetchLogsRaw = async () => {
    try {
      setError(null);
      setLoadingLogs(true);
      const response = await fetch('http://localhost:5000/logs', {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
      });
      if (!response.ok) throw new Error('Failed to fetch logs');
      const data = await response.json();
      return data.logs || [];
    } catch (err) {
      console.error('Error fetching logs:', err);
      setError(err.message || 'An error occurred while fetching logs.');
      return [];
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleFetchLogs = async () => {
    const allLogs = await fetchLogsRaw();
    if (!allLogs.length && !error) {
      setLogs([]);
      return;
    }
    let startObj, endObj;
    if (!startDate && !endDate) {
      const now = new Date();
      startObj = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      endObj = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else {
      startObj = startDate ? new Date(startDate) : null;
      endObj = endDate ? new Date(endDate) : null;
      if (startObj) startObj.setHours(0, 0, 0, 0);
      if (endObj) endObj.setHours(23, 59, 59, 999);
    }

    let workingItems = [...items];
    if (filterByLocation && location) {
      workingItems = workingItems.filter(
        (it) => it.location && it.location.toLowerCase() === location.toLowerCase()
      );
    }
    const itemIdsToInclude = reportType === 'all' ? workingItems.map((it) => it.item_id) : selectedItems;

    const filteredLogs = allLogs.filter((log) => {
      const hasQuantityChange = Number(log.quantity_change) !== 0;
      const hasKeyInDate = isValidDate(log.key_in_date);
      if (!hasQuantityChange || !hasKeyInDate) return false;

      const logDate = new Date(log.timestamp);
      const inDateRange = (!startObj || logDate >= startObj) && (!endObj || logDate <= endObj);
      const inSelectedItems = itemIdsToInclude.includes(log.item_id);

      let matchesLocation = true;
      if (filterByLocation && location) {
        const logItem = items.find((i) => i.item_id === log.item_id);
        matchesLocation = logItem && logItem.location && logItem.location.toLowerCase() === location.toLowerCase();
      }

      const matchesChangedBy = changedBySearch
        ? (log.updated_by || '').toLowerCase().includes(changedBySearch.toLowerCase())
        : true;
      const matchesSite = siteSearch
        ? (log.site_name || '').toLowerCase().includes(siteSearch.toLowerCase())
        : true;
      const matchesRemarks = remarksSearch
        ? (log.remarks || '').toLowerCase().includes(remarksSearch.toLowerCase())
        : true;

      return inDateRange && inSelectedItems && matchesLocation && matchesChangedBy && matchesSite && matchesRemarks;
    });

    setLogs(filteredLogs);
  };

  const updateLog = (updatedLog) => {
    setLogs((prevLogs) =>
      prevLogs.map((log) =>
        log.id.toString() === updatedLog.id.toString() && log.source === updatedLog.source ? updatedLog : log
      )
    );
  };

  const deleteLog = (id) => {
    setLogs((prevLogs) => prevLogs.filter((log) => log.id !== id));
  };

  const handleExportPDF = () => {
    let startObj, endObj;
    if (!startDate && !endDate) {
      const now = new Date();
      startObj = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      endObj = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else {
      startObj = startDate ? new Date(startDate) : null;
      endObj = endDate ? new Date(endDate) : null;
      if (startObj) startObj.setHours(0, 0, 0, 0);
      if (endObj) endObj.setHours(23, 59, 59, 999);
    }
    let workingItems = [...items];
    if (filterByLocation && location) {
      workingItems = workingItems.filter((it) => it.location && it.location.toLowerCase() === location.toLowerCase());
    }
    const finalSelectedIds = reportType === 'all' ? workingItems.map((it) => it.item_id) : selectedItems;
    const showKeyInDateColumn = logs.some((log) => {
      const qtyChange = Number(log.quantity_change) || 0;
      return qtyChange !== 0 && log.key_in_date_old && log.key_in_date_old !== log.key_in_date;
    });
    const config = {
      adminName,
      recipientName,
      startDate: startObj,
      endDate: endObj,
      reportType,
      selectedItems: items.filter((it) => finalSelectedIds.includes(it.item_id)).map((it) => ({ ...it })),
      logs,
      includePrice: true,
      locationFilter: filterByLocation ? location.toLowerCase() : null,
      showLocation: filterByLocation,
      showSite: false,
      showKeyInDate: showKeyInDateColumn,
    };
    generateReportPDF(config);
  };

  const handleBack = () => {
    navigate('/admin-dashboard');
  };

  const handleClearAllFields = () => {
    setAdminName('');
    setRecipientName('');
    setStartDate('');
    setEndDate('');
    setKeyInDate('');
    setReportType('all');
    setSelectedItems([]);
    setFilterByLocation(false);
    setLocation('');
    setChangedBySearch('');
    setSiteSearch('');
    setRemarksSearch('');
    setLogs([]);
  };

  const uniqueLocations = useMemo(() => {
    return Array.from(
      new Set(items.map((it) => it.location).filter(Boolean).map((loc) => loc.toLowerCase()))
    ).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    return filterByLocation && location
      ? items.filter((it) => it.location && it.location.toLowerCase() === location.toLowerCase())
      : items;
  }, [items, filterByLocation, location]);

  const displayItems = useMemo(() => {
    return reportType === 'specific'
      ? filteredItems.filter((it) => selectedItems.includes(it.item_id))
      : filteredItems;
  }, [filteredItems, reportType, selectedItems]);

  return (
    <div className="report-container">
      <div className="report-header">
        <h1>Inventory Management Report</h1>
      </div>
      {error && <div className="error-message">{error}</div>}
      <button className="toggle-filters-button" onClick={() => setShowFilters((prev) => !prev)}>
        {showFilters ? 'Hide Filters' : 'Show Filters'}
      </button>
      {showFilters && (
        <FilterForm
          adminName={adminName}
          setAdminName={setAdminName}
          recipientName={recipientName}
          setRecipientName={setRecipientName}
          startDate={startDate}
          setStartDate={setStartDate}
          endDate={endDate}
          setEndDate={setEndDate}
          keyInDate={keyInDate}
          setKeyInDate={setKeyInDate}
          reportType={reportType}
          setReportType={setReportType}
          selectedItems={selectedItems}
          setSelectedItems={setSelectedItems}
          filterByLocation={filterByLocation}
          setFilterByLocation={setFilterByLocation}
          location={location}
          setLocation={setLocation}
          changedBySearch={changedBySearch}
          setChangedBySearch={setChangedBySearch}
          siteSearch={siteSearch}
          setSiteSearch={setSiteSearch}
          remarksSearch={remarksSearch}
          setRemarksSearch={setRemarksSearch}
          uniqueLocations={uniqueLocations}
          items={items}
          handleFetchLogs={handleFetchLogs}
          handleClearAllFields={handleClearAllFields}
        />
      )}
      <div className="global-collapse-container">
        <button className="collapse-button" onClick={() => setGlobalCollapse((prev) => !prev)}>
          {globalCollapse ? 'Expand All Logs' : 'Collapse All Logs'}
        </button>
      </div>
      {loadingItems && <p>Loading items...</p>}
      {loadingLogs && <p>Loading logs...</p>}
      <div className="items-section">
        {displayItems.map((item) => (
          <ItemLogs
            key={item.item_id}
            item={item}
            logs={logs}
            changedBySearch={changedBySearch}
            siteSearch={siteSearch}
            remarksSearch={remarksSearch}
            globalCollapse={globalCollapse}
            startDate={startDate}
            endDate={endDate}
            keyInDate={keyInDate}
            updateLog={updateLog}
            deleteLog={deleteLog}
            refreshItems={fetchItems}
          />
        ))}
      </div>
      <div className="export-section">
        <button className="export-button" onClick={handleExportPDF}>
          Export PDF
        </button>
      </div>
      {/* ToastContainer renders the toasts */}
      <ToastContainer />
    </div>
  );
}
