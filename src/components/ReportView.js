import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import generateReportPDF from './GenerateReport';
import './ReportView.css';

/**
 * highlightText:
 * Splits 'text' by any occurrences of 'searchTerm' (case-insensitive)
 * and wraps matches in a <span> with class "highlight" for yellow highlighting.
 */
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

export default function ReportView() {
  const navigate = useNavigate();

  // ------------------ Form Fields ------------------
  const [adminName, setAdminName] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reportType, setReportType] = useState('all'); // "all" or "specific"
  const [selectedItems, setSelectedItems] = useState([]);
  const [filterByLocation, setFilterByLocation] = useState(false);
  const [location, setLocation] = useState('');

  // Additional search fields
  const [changedBySearch, setChangedBySearch] = useState('');
  const [siteSearch, setSiteSearch] = useState('');
  const [remarksSearch, setRemarksSearch] = useState('');

  // ------------------ Data from Server ------------------
  const [items, setItems] = useState([]);
  const [logs, setLogs] = useState([]);

  // ------------------ UI States ------------------
  const [error, setError] = useState(null);
  const [showFilters, setShowFilters] = useState(true);
  const [globalCollapse, setGlobalCollapse] = useState(false); // Global collapse/expand state

  // ------------------ Lifecycle ------------------
  useEffect(() => {
    fetchItems();
  }, []);

  // 1) Fetch Items from server
  const fetchItems = async () => {
    try {
      setError(null);
      const response = await fetch('http://localhost:5000/admin-dashboard/items', {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch items');
      }
      const data = await response.json();
      setItems(data.items || []);
    } catch (err) {
      console.error('Error fetching items:', err);
      setError(err.message || 'An error occurred while fetching items.');
    }
  };

  // 2) Fetch All Logs from Server
  const fetchLogsRaw = async () => {
    try {
      setError(null);
      const response = await fetch('http://localhost:5000/logs', {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch logs');
      }
      const data = await response.json();
      return data.logs || [];
    } catch (err) {
      console.error('Error fetching logs:', err);
      setError(err.message || 'An error occurred while fetching logs.');
      return [];
    }
  };

  // 3) Filter Logs based on form inputs
  const handleFetchLogs = async () => {
    const allLogs = await fetchLogsRaw();
    if (!allLogs.length && !error) {
      setLogs([]);
      return;
    }

    // Default "Today's Logs" if no dates are selected.
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
      const locLower = location.toLowerCase();
      workingItems = workingItems.filter(
        (it) => it.location && it.location.toLowerCase() === locLower
      );
    }

    const itemIdsToInclude =
      reportType === 'all'
        ? workingItems.map((it) => it.item_id)
        : selectedItems;

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

      let matchesChangedBy = changedBySearch
        ? (log.updated_by || '').toLowerCase().includes(changedBySearch.toLowerCase())
        : true;
      let matchesSite = siteSearch
        ? (log.site_name || '').toLowerCase().includes(siteSearch.toLowerCase())
        : true;
      let matchesRemarks = remarksSearch
        ? (log.remarks || '').toLowerCase().includes(remarksSearch.toLowerCase())
        : true;

      return (
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

  // 4) Export PDF with current filter settings
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
      const locLower = location.toLowerCase();
      workingItems = workingItems.filter(
        (it) => it.location && it.location.toLowerCase() === locLower
      );
    }
    const finalSelectedIds =
      reportType === 'all'
        ? workingItems.map((it) => it.item_id)
        : selectedItems;

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
    };

    generateReportPDF(config);
  };

  // 5) Navigate back
  const handleBack = () => {
    navigate('/admin-dashboard');
  };

  const handleReportTypeChange = (newType) => {
    if (newType === 'specific') {
      setFilterByLocation(false);
      setLocation('');
    }
    setReportType(newType);
  };

  const handleFilterByLocationChange = (checked) => {
    if (checked) {
      setReportType('all');
      setSelectedItems([]);
    }
    setFilterByLocation(checked);
    if (!checked) {
      setLocation('');
    }
  };

  const handleClearAllFields = () => {
    setAdminName('');
    setRecipientName('');
    setStartDate('');
    setEndDate('');
    setReportType('all');
    setSelectedItems([]);
    setFilterByLocation(false);
    setLocation('');
    setChangedBySearch('');
    setSiteSearch('');
    setRemarksSearch('');
    setLogs([]);
  };

  const uniqueLocations = Array.from(
    new Set(
      items
        .map((it) => it.location)
        .filter(Boolean)
        .map((loc) => loc.toLowerCase())
    )
  ).sort();

  const filteredItems = filterByLocation && location
    ? items.filter(
        (it) => it.location && it.location.toLowerCase() === location.toLowerCase()
      )
    : items;

  const displayItems =
    reportType === 'specific'
      ? filteredItems.filter((it) => selectedItems.includes(it.item_id))
      : filteredItems;

  return (
    <div className="report-container">
      {/* Header with Back Button */}
      <div className="report-header">
        <button className="back-button" onClick={handleBack}>
          ←
        </button>
        <h1>Inventory Management Report</h1>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Toggle Filters */}
      <button
        className="toggle-filters-button"
        onClick={() => setShowFilters((prev) => !prev)}
      >
        {showFilters ? 'Hide Filters' : 'Show Filters'}
      </button>

      {/* Filters Form */}
      {showFilters && (
        <div className="report-form">
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
          <div className="filters-row">
            <div className="filter-group">
              <label htmlFor="startDate">Start Date:</label>
              <input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="filter-group">
              <label htmlFor="endDate">End Date:</label>
              <input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="filters-row">
            <div className="filter-group">
              <label htmlFor="reportType">Report Type:</label>
              <select
                id="reportType"
                value={reportType}
                onChange={(e) => handleReportTypeChange(e.target.value)}
              >
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
                    className={
                      selectedItems.includes(it.item_id)
                        ? 'item-tag selected'
                        : 'item-tag'
                    }
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
          <div className="filters-row">
            <div className="filter-group">
              <label>
                <input
                  type="checkbox"
                  checked={filterByLocation}
                  onChange={(e) => handleFilterByLocationChange(e.target.checked)}
                />
                Filter by Location
              </label>
              {filterByLocation && (
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                >
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
      )}

      {/* Global Collapse/Expand Button placed below the filters */}
      <div className="global-collapse-container">
        <button
          className="collapse-button"
          onClick={() => setGlobalCollapse((prev) => !prev)}
        >
          {globalCollapse ? 'Expand All Logs' : 'Collapse All Logs'}
        </button>
      </div>

      {/* Display Logs by Filtered Items */}
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
          />
        ))}
      </div>

      {/* Export PDF Button */}
      <div className="export-section">
        <button className="export-button" onClick={handleExportPDF}>
          Export PDF
        </button>
      </div>
    </div>
  );
}

/**
 * ItemLogs:
 * - Collapsible logs table per item.
 * - Color-coded rows for inbound/outbound transactions.
 * - Uses highlightText for search term highlighting.
 * - Displays a "Stock" column showing running stock after each transaction.
 */
function ItemLogs({ item, logs, changedBySearch, siteSearch, remarksSearch, globalCollapse }) {
  const [sortDirection, setSortDirection] = useState('desc');
  const [collapsed, setCollapsed] = useState(false);

  // Sync local collapsed state with globalCollapse when it changes.
  useEffect(() => {
    setCollapsed(globalCollapse);
  }, [globalCollapse]);

  const sortedLogs = logs
    .filter((log) => log.item_id === item.item_id)
    .sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
    });

  let cumulativeChange = 0;
  const logsWithStock = sortedLogs.map((log) => {
    const qtyChange = parseInt(log.quantity_change, 10) || 0;
    cumulativeChange += qtyChange;
    const runningStock = Math.max(item.quantity - cumulativeChange, 0);
    return { ...log, runningStock };
  });

  const handleSortToggle = () => {
    setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  };

  return (
    <div className="item-card">
      <div className="item-card-header">
        <h3>
          {item.item_name} (Current Stock: {Math.max(item.quantity, 0)})
        </h3>
        <button
          className="collapse-button"
          onClick={() => setCollapsed((prev) => !prev)}
        >
          {collapsed ? 'Show Logs' : 'Hide Logs'}
        </button>
      </div>
      {!collapsed && (
        <table className="item-logs-table">
          <thead>
            <tr>
              <th onClick={handleSortToggle}>
                Date &amp; Time {sortDirection === 'asc' ? '▲' : '▼'}
              </th>
              <th>Changed By</th>
              <th>Qty In</th>
              <th>Qty Out</th>
              <th>Stock</th>
              <th>Site</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {logsWithStock.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center' }}>
                  No logs found
                </td>
              </tr>
            ) : (
              logsWithStock.map((log, idx) => {
                const qtyChange = parseInt(log.quantity_change, 10) || 0;
                const dateString = new Date(log.timestamp).toLocaleString();
                const changedByHighlighted = highlightText(log.updated_by || '', changedBySearch);
                const siteHighlighted = highlightText(log.site_name || '', siteSearch);
                const remarksHighlighted = highlightText(log.remarks || '', remarksSearch);
                const rowClass =
                  qtyChange > 0
                    ? 'row-positive'
                    : qtyChange < 0
                    ? 'row-negative'
                    : '';
                return (
                  <tr key={idx} className={rowClass}>
                    <td>{dateString}</td>
                    <td>{changedByHighlighted}</td>
                    <td>{qtyChange > 0 ? `+${qtyChange}` : ''}</td>
                    <td>{qtyChange < 0 ? qtyChange : ''}</td>
                    <td>{log.runningStock}</td>
                    <td>{siteHighlighted}</td>
                    <td>{remarksHighlighted}</td>
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
