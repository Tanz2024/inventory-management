import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import generateReportPDF from './GenerateReport';
import './Reportview.css';

/* ------------------ Utility Functions ------------------ */

// Highlights parts of a text matching the search term.
function highlightText(text = '', searchTerm = '') {
  if (!searchTerm) return text;
  const regex = new RegExp(`(${searchTerm})`, 'gi');
  return text.split(regex).map((part, idx) =>
    regex.test(part) ? (
      <span key={idx} className="highlight">
        {part}
      </span>
    ) : (
      part
    )
  );
}

// Converts a date string to a local date in 'YYYY-MM-DD' format.
function formatLocalDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-CA');
}

// Formats a key‑in date into a custom string (e.g. "6 thursday june 2025").
function formatKeyInDateCustom(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const day = date.getDate();
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const month = date.toLocaleDateString('en-US', { month: 'long' }).toLowerCase();
  const year = date.getFullYear();
  return `${day} ${weekday} ${month} ${year}`;
}

// Helper to check if a date value is valid.
function isValidDate(d) {
  const date = new Date(d);
  return date instanceof Date && !isNaN(date);
}

// For log display, use the log’s key‑in date if valid; otherwise, fallback to the timestamp.
function getLogDate(log) {
  if (log.key_in_date && isValidDate(log.key_in_date)) {
    return new Date(log.key_in_date);
  }
  return new Date(log.timestamp);
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
      {/* Admin & Recipient */}
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

      {/* Date Range Filters */}
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

      {/* Key‑in Date Filter */}
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
// This component renders logs for a given item and supports sorting as well as editing/deleting logs.
function ItemLogs({
  item,
  logs,
  changedBySearch,
  siteSearch,
  remarksSearch,
  globalCollapse,
  updateLog,
  deleteLog,
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

  const sortedLogs = useMemo(() => {
    const filtered = logs.filter((log) => log.item_id === item.item_id);
    return filtered.sort((a, b) => {
      let aValue, bValue;
      switch (sortConfig.column) {
        case 'timestamp':
          aValue = new Date(a.timestamp).getTime();
          bValue = new Date(b.timestamp).getTime();
          break;
        case 'audit_date':
          aValue = new Date(item.audit_date || 0).getTime();
          bValue = new Date(item.audit_date || 0).getTime();
          break;
        case 'updated_by':
          aValue = (a.updated_by || '').toLowerCase();
          bValue = (b.updated_by || '').toLowerCase();
          break;
        case 'qty_in':
          aValue = a.quantity_change > 0 ? a.quantity_change : 0;
          bValue = b.quantity_change > 0 ? b.quantity_change : 0;
          break;
        case 'qty_out':
          aValue = a.quantity_change < 0 ? a.quantity_change : 0;
          bValue = b.quantity_change < 0 ? b.quantity_change : 0;
          break;
        case 'site_name':
          aValue = (a.site_name || '').toLowerCase();
          bValue = (b.site_name || '').toLowerCase();
          break;
        case 'remarks':
          aValue = (a.remarks || '').toLowerCase();
          bValue = (b.remarks || '').toLowerCase();
          break;
        default:
          aValue = new Date(a.timestamp).getTime();
          bValue = new Date(b.timestamp).getTime();
          break;
      }
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [logs, item.item_id, sortConfig, item.audit_date]);

  // Compute running stock for each log.
  let cumulativeChange = 0;
  const logsWithStock = [...sortedLogs].reverse().map((log) => {
    const qtyChange = parseInt(log.quantity_change, 10) || 0;
    const runningStock = Math.max(item.quantity - cumulativeChange, 0);
    cumulativeChange += qtyChange;
    return {
      ...log,
      runningStock,
      changeType: qtyChange > 0 ? 'in' : (qtyChange < 0 ? 'out' : 'no change'),
    };
  }).reverse();
  
  // Handlers for editing logs
  const handleEdit = (index, log) => {
    setEditedLogs((prev) => ({ ...prev, [index]: { ...log } }));
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
            quantity_change: currentEdit.quantity_change,
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
    } catch (err) {
      console.error('Save failed:', err);
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
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  return (
    <div className="item-card">
      <div className="item-card-header">
        <h3>
          {item.item_name} (Current Stock: {Math.max(item.quantity, 0)})
        </h3>
        <button className="collapse-button" onClick={() => setCollapsed((prev) => !prev)}>
          {collapsed ? 'Show Logs' : 'Hide Logs'}
        </button>
      </div>
      {!collapsed && (
        <table className="item-logs-table">
          <thead>
            <tr>
              <th onClick={() => handleSortToggle('timestamp')}>
                Timestamp {sortConfig.column === 'timestamp' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSortToggle('audit_date')}>
                Key‑in Date {sortConfig.column === 'audit_date' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSortToggle('updated_by')}>
                Changed By {sortConfig.column === 'updated_by' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSortToggle('qty_in')}>
                Qty In {sortConfig.column === 'qty_in' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSortToggle('qty_out')}>
                Qty Out {sortConfig.column === 'qty_out' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th>Stock</th>
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
                <td colSpan="9" style={{ textAlign: 'center' }}>
                  No logs found
                </td>
              </tr>
            ) : (
              logsWithStock.map((log, idx) => {
                const logDate = getLogDate(log);
                const qtyChange = parseInt(log.quantity_change, 10) || 0;
                const logDateStr = new Date(log.timestamp).toLocaleString();
                const isEditing = Object.prototype.hasOwnProperty.call(editedLogs, idx);
                const currentEdit = editedLogs[idx] || {};
                const changedByHighlighted = highlightText(log.updated_by || '', changedBySearch);
                const siteHighlighted = highlightText(log.site_name || '', siteSearch);
                const remarksHighlighted = highlightText(log.remarks || '', remarksSearch);

                return (
                  <tr key={idx} className={qtyChange > 0 ? 'row-positive' : qtyChange < 0 ? 'row-negative' : ''}>
                    <td>{logDateStr}</td>
                    <td>
                      {isEditing ? (
                        <input
                          type="date"
                          value={currentEdit.key_in_date || log.key_in_date || ''}
                          onChange={(e) => handleInputChange(idx, 'key_in_date', e.target.value)}
                        />
                      ) : (
                        formatKeyInDateCustom(log.key_in_date)
                      )}
                    </td>
                    <td>{changedByHighlighted}</td>
                    <td>
                      {isEditing && qtyChange > 0 ? (
                        <input
                          type="number"
                          value={currentEdit.quantity_change || ''}
                          onChange={(e) => handleInputChange(idx, 'quantity_change', e.target.value)}
                        />
                      ) : (
                        qtyChange > 0 && `+${qtyChange}`
                      )}
                    </td>
                    <td>
                      {isEditing && qtyChange < 0 ? (
                        <input
                          type="number"
                          value={currentEdit.quantity_change || ''}
                          onChange={(e) => handleInputChange(idx, 'quantity_change', e.target.value)}
                        />
                      ) : (
                        qtyChange < 0 && qtyChange
                      )}
                    </td>
                    <td>{log.runningStock}</td>
                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          value={currentEdit.site_name || ''}
                          onChange={(e) => handleInputChange(idx, 'site_name', e.target.value)}
                        />
                      ) : (
                        siteHighlighted
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          value={currentEdit.remarks || ''}
                          onChange={(e) => handleInputChange(idx, 'remarks', e.target.value)}
                        />
                      ) : (
                        remarksHighlighted
                      )}
                    </td>
                    <td>
                      {isEditing ? (
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

/* ------------------ Main ReportView Component ------------------ */

export default function ReportView() {
  const navigate = useNavigate();

  // ------------------ Form States ------------------
  const [adminName, setAdminName] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [keyInDate, setKeyInDate] = useState('');
  const [reportType, setReportType] = useState('all'); // "all" or "specific"
  const [selectedItems, setSelectedItems] = useState([]);
  const [filterByLocation, setFilterByLocation] = useState(false);
  const [location, setLocation] = useState('');
  const [changedBySearch, setChangedBySearch] = useState('');
  const [siteSearch, setSiteSearch] = useState('');
  const [remarksSearch, setRemarksSearch] = useState('');

  // ------------------ Data States ------------------
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

  // Fetch items from the server.
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

  // Fetch logs from the server.
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

  // ------------------ Filtering Logs ------------------
  // If a keyInDate is provided, override the start/end range to that day.
  const handleFetchLogs = async () => {
    const allLogs = await fetchLogsRaw();
    if (!allLogs.length && !error) {
      setLogs([]);
      return;
    }

    let startObj, endObj;
    if (keyInDate) {
      const d = new Date(keyInDate);
      startObj = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
      endObj = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    } else if (!startDate && !endDate) {
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
      const locLower = location.toLowerCase();
      workingItems = workingItems.filter(
        (it) => it.location && it.location.toLowerCase() === locLower
      );
    }
    const itemIdsToInclude =
      reportType === 'all' ? workingItems.map((it) => it.item_id) : selectedItems;

      const filteredLogs = allLogs.filter((log) => {
        const logDate = new Date(log.timestamp);
        const inDateRange =
          (!startObj || logDate >= startObj) && (!endObj || logDate <= endObj);
        const inSelectedItems = itemIdsToInclude.includes(log.item_id);
      
        let matchesLocation = true;
        if (filterByLocation && location) {
          const logItem = items.find((i) => i.item_id === log.item_id);
          matchesLocation =
            logItem &&
            logItem.location &&
            logItem.location.toLowerCase() === location.toLowerCase();
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
      
        const hasQuantityChange = parseInt(log.quantity_change, 10) !== 0;
        
        return (
          hasQuantityChange &&
          inDateRange &&
          inSelectedItems &&
          matchesLocation &&
          matchesChangedBy &&
          matchesSite &&
          matchesRemarks
        );
      });
      
    setLogs(filteredLogs);
  };

  // ------------------ Updating Logs ------------------
  const updateLog = (updatedLog) => {
    setLogs((prevLogs) =>
      prevLogs.map((log) =>
        log.id.toString() === updatedLog.id.toString() && log.source === updatedLog.source
          ? updatedLog
          : log
      )
    );
  };

  const deleteLog = (id) => {
    setLogs((prevLogs) => prevLogs.filter((log) => log.id !== id));
  };

  // ------------------ Export PDF ------------------
  const handleExportPDF = () => {
    let startObj, endObj;
    if (keyInDate) {
      const d = new Date(keyInDate);
      startObj = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
      endObj = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    } else if (!startDate && !endDate) {
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
      const locLower = location.toLowerCase();
      workingItems = workingItems.filter(
        (it) => it.location && it.location.toLowerCase() === locLower
      );
    }
    const finalSelectedIds =
      reportType === 'all' ? workingItems.map((it) => it.item_id) : selectedItems;
    const showKeyInDateColumn = logs.some((log) => {
      const qtyChange = parseInt(log.quantity_change, 10) || 0;
      return qtyChange !== 0 && log.key_in_date_old && log.key_in_date_old !== log.key_in_date;
    });
    const config = {
      adminName,
      recipientName,
      startDate: startObj,
      endDate: endObj,
      reportType,
      selectedItems: items
        .filter((it) => finalSelectedIds.includes(it.item_id))
        .map((it) => ({ ...it })),
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

  // Clear all filter fields.
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

  // Compute unique locations for the location filter dropdown.
  const uniqueLocations = useMemo(() => {
    return Array.from(
      new Set(
        items.map((it) => it.location).filter(Boolean).map((loc) => loc.toLowerCase())
      )
    ).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    return filterByLocation && location
      ? items.filter(
          (it) => it.location && it.location.toLowerCase() === location.toLowerCase()
        )
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
            updateLog={updateLog}
            deleteLog={deleteLog}
          />
        ))}
      </div>
      <div className="export-section">
        <button className="export-button" onClick={handleExportPDF}>
          Export PDF
        </button>
      </div>
    </div>
  );
}
