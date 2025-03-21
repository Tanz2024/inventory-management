import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import generateReportPDF from './GenerateReport';
import './ReportView.css';

/* ------------------ Utility Functions ------------------ */
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

function maybeHighlight(content, condition) {
  return condition ? <span className="highlight">{content}</span> : content;
}

function convertToMYTDisplay(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' });
}

function formatLocalDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-CA');
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

      {/* Log Date Range */}
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
}) {
  const [sortConfig, setSortConfig] = useState({ column: 'timestamp', direction: 'desc' });
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(globalCollapse);
  }, [globalCollapse]);

  const handleSortToggle = (column) => {
    setSortConfig((prev) => {
      if (prev.column === column) {
        return { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      } else {
        return { column, direction: 'asc' };
      }
    });
  };

  // 1) Filter to logs for this item, then sort
  const sortedLogs = useMemo(() => {
    const filtered = logs.filter((log) => log.item_id === item.item_id);
    const sorted = filtered.sort((a, b) => {
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
    return sorted;
  }, [logs, item.item_id, sortConfig, item.audit_date]);

  // 2) Compute running stock cumulatively
  let cumulativeChange = 0;
  const logsWithStock = sortedLogs.map((log) => {
    const qtyChange = parseInt(log.quantity_change, 10) || 0;
    cumulativeChange += qtyChange;
    return {
      ...log,
      runningStock: Math.max(item.quantity - cumulativeChange, 0),
    };
  });

  // 3) Utility for highlight
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

  // 4) Convert timestamp for display (with full date & time)
  function convertToMYTDisplay(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' });
  }

  // New function: Format key‑in date into custom format like "6 thursday june 2025"
  function formatKeyInDateCustom(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const day = date.getDate();
    const weekday = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const month = date.toLocaleDateString('en-US', { month: 'long' }).toLowerCase();
    const year = date.getFullYear();
    return `${day} ${weekday} ${month} ${year}`;
  }

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
                Timestamp{' '}
                {sortConfig.column === 'timestamp' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSortToggle('audit_date')}>
                Date &amp; Time{' '}
                {sortConfig.column === 'audit_date' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSortToggle('updated_by')}>
                Changed By{' '}
                {sortConfig.column === 'updated_by' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
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
            </tr>
          </thead>
          <tbody>
            {logsWithStock.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center' }}>
                  No logs found
                </td>
              </tr>
            ) : (
              logsWithStock.map((log, idx) => {
                // 1) Basic info
                const qtyChange = parseInt(log.quantity_change, 10) || 0;
                const logDate = new Date(log.timestamp);
                const logDateStr = logDate.toLocaleString();

                // 2) Check if key‑in date changed
                const dateChanged = log.key_in_date_old && log.key_in_date_old !== log.key_in_date;

                // 3) Skip rows that have NEITHER quantity change nor date change
                if (qtyChange === 0 && !dateChanged) {
                  return null;
                }

                // 4) Check if within start/end date range
                let showLog = true;
                if (startDate) {
                  const startISO = new Date(startDate).toLocaleDateString('en-CA');
                  const logISO = logDate.toLocaleDateString('en-CA');
                  if (logISO < startISO) showLog = false;
                }
                if (endDate) {
                  const endISO = new Date(endDate).toLocaleDateString('en-CA');
                  const logISO = logDate.toLocaleDateString('en-CA');
                  if (logISO > endISO) showLog = false;
                }
                if (!showLog) return null;

                // 5) Highlight fields if they match searches
                const changedByHighlighted = highlightText(log.updated_by || '', changedBySearch);
                const siteHighlighted = highlightText(log.site_name || '', siteSearch);
                const remarksHighlighted = highlightText(log.remarks || '', remarksSearch);

                // 6) If both quantity and date changed, render the "old/new" row pattern
                if (qtyChange !== 0 && dateChanged) {
                  return (
                    <React.Fragment key={idx}>
                      <tr className={qtyChange > 0 ? 'row-positive' : qtyChange < 0 ? 'row-negative' : ''}>
                        <td>{logDateStr}</td>
                        <td>{formatKeyInDateCustom(log.key_in_date_old)}</td>
                        <td>{changedByHighlighted}</td>
                        <td>{qtyChange > 0 ? `+${qtyChange}` : ''}</td>
                        <td>{qtyChange < 0 ? qtyChange : ''}</td>
                        <td>{log.runningStock}</td>
                        <td>{siteHighlighted}</td>
                        <td>{remarksHighlighted}</td>
                      </tr>
                      <tr className="sub-row" key={`${idx}-new`}>
                        <td colSpan="8">
                          New Date &amp; Time: {formatKeyInDateCustom(log.key_in_date)}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                } else {
                  // 7) Single row otherwise
                  return (
                    <tr
                      key={idx}
                      className={qtyChange > 0 ? 'row-positive' : qtyChange < 0 ? 'row-negative' : ''}
                    >
                      <td>{logDateStr}</td>
                      <td>{formatKeyInDateCustom(log.key_in_date)}</td>
                      <td>{changedByHighlighted}</td>
                      <td>{qtyChange > 0 ? `+${qtyChange}` : ''}</td>
                      <td>{qtyChange < 0 ? qtyChange : ''}</td>
                      <td>{log.runningStock}</td>
                      <td>{siteHighlighted}</td>
                      <td>{remarksHighlighted}</td>
                    </tr>
                  );
                }
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

  // ------------------ Form Fields ------------------
  const [adminName, setAdminName] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [keyInDate, setKeyInDate] = useState('');
  const [reportType, setReportType] = useState('all'); // "all" or "specific"
  const [selectedItems, setSelectedItems] = useState([]);
  const [filterByLocation, setFilterByLocation] = useState(false);
  const [location, setLocation] = useState('');

  // ------------------ Additional Search Fields ------------------
  const [changedBySearch, setChangedBySearch] = useState('');
  const [siteSearch, setSiteSearch] = useState('');
  const [remarksSearch, setRemarksSearch] = useState('');

  // ------------------ Data from Server ------------------
  const [items, setItems] = useState([]);
  const [logs, setLogs] = useState([]);

  // ------------------ UI States ------------------
  const [error, setError] = useState(null);
  const [showFilters, setShowFilters] = useState(true);
  const [globalCollapse, setGlobalCollapse] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    fetchItems();
  }, []);

  // 1) Fetch Items from Server
  const fetchItems = async () => {
    try {
      setError(null);
      setLoadingItems(true);
      const response = await fetch('http://localhost:5000/admin-dashboard/items', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': '1',
        },
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

  // 2) Fetch All Logs from Server
  const fetchLogsRaw = async () => {
    try {
      setError(null);
      setLoadingLogs(true);
      const response = await fetch('http://localhost:5000/logs', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': '1',
        },
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

  // 3) Filter Logs Based on Form Inputs.
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

      let matchesKeyInDate = true;
      if (keyInDate) {
        const logItem = items.find((i) => i.item_id === log.item_id);
        if (logItem && logItem.audit_date) {
          const auditLocal = formatLocalDate(logItem.audit_date);
          matchesKeyInDate = auditLocal === keyInDate;
        } else {
          matchesKeyInDate = false;
        }
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

      return (
        inDateRange &&
        inSelectedItems &&
        matchesLocation &&
        matchesKeyInDate &&
        matchesChangedBy &&
        matchesSite &&
        matchesRemarks
      );
    });

    setLogs(filteredLogs);
  };

  // 4) Export PDF with Current Filter Settings.
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
      reportType === 'all' ? workingItems.map((it) => it.item_id) : selectedItems;

    // Determine if any log has BOTH a quantity change and a key‑in date change
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
      showKeyInDate: showKeyInDateColumn, // Only show key‑in date column if there's a combined change
    };

    generateReportPDF(config);
  };

  // 5) Navigate Back
  const handleBack = () => {
    navigate('/admin-dashboard');
  };

  // Clear all filter fields
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

  // Compute unique locations for the filter dropdown
  const uniqueLocations = useMemo(() => {
    return Array.from(
      new Set(
        items
          .map((it) => it.location)
          .filter(Boolean)
          .map((loc) => loc.toLowerCase())
      )
    ).sort();
  }, [items]);

  // Filter items by location (if needed)
  const filteredItems = useMemo(() => {
    return filterByLocation && location
      ? items.filter(
          (it) => it.location && it.location.toLowerCase() === location.toLowerCase()
        )
      : items;
  }, [items, filterByLocation, location]);

  // If "specific" report, only show selected items
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
