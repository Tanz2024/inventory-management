import React, { useEffect, useMemo, useState } from 'react';
import './LogsPage.css';

const LogsPage = () => {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState({
    key: 'timestamp',
    direction: 'descending',
  });

  const [rangePreset, setRangePreset] = useState('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [siteFilter, setSiteFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:5000/logs', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        setError('Failed to fetch logs.');
        return;
      }
      const data = await response.json();
      setLogs(data.logs || []);
      setError('');
    } catch (err) {
      console.error('Error fetching logs:', err);
      setError('An error occurred while fetching the logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const sites = useMemo(() => {
    const uniqueSites = new Set();
    logs.forEach((log) => {
      if (log.site_name) {
        uniqueSites.add(log.site_name);
      }
    });
    return Array.from(uniqueSites).sort();
  }, [logs]);

  const getDateRange = () => {
    if (rangePreset === 'custom') {
      if (!customStart || !customEnd) {
        return null;
      }
      const start = new Date(customStart);
      const end = new Date(customEnd);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return null;
      }
      end.setHours(23, 59, 59, 999);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }

    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    if (rangePreset === 'today') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }

    if (rangePreset === '7d' || rangePreset === '30d') {
      const days = rangePreset === '7d' ? 7 : 30;
      const start = new Date(now);
      start.setDate(start.getDate() - (days - 1));
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }

    return null;
  };

  const formatTimestamp = (value) => {
    if (!value) {
      return 'N/A';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'N/A';
    }
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const formatDateStamp = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'all';
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getExportRange = () => {
    const range = getDateRange();
    if (!range) {
      return 'all';
    }
    return `${formatDateStamp(range.start)}_to_${formatDateStamp(range.end)}`;
  };

  const getChangeTypeLabel = (value) => {
    if (!value) {
      return 'Unknown';
    }
    const normalized = value.toLowerCase();
    if (normalized.includes('reserve')) {
      return 'Reserve';
    }
    if (normalized.includes('release')) {
      return 'Release';
    }
    if (normalized.includes('add')) {
      return 'Add';
    }
    if (normalized.includes('remove') || normalized.includes('subtract')) {
      return 'Remove';
    }
    if (normalized.includes('update') || normalized.includes('edit')) {
      return 'Edit';
    }
    return value;
  };

  const getPillClass = (value, type) => {
    const normalized = String(value || '').toLowerCase();
    if (type === 'status') {
      if (normalized.includes('approved')) return 'pill pill-approved';
      if (normalized.includes('pending')) return 'pill pill-pending';
      if (normalized.includes('rejected')) return 'pill pill-rejected';
      return 'pill pill-muted';
    }

    if (normalized.includes('reserve')) return 'pill pill-reserve';
    if (normalized.includes('release')) return 'pill pill-release';
    if (normalized.includes('add')) return 'pill pill-add';
    if (normalized.includes('remove') || normalized.includes('subtract')) return 'pill pill-remove';
    if (normalized.includes('update') || normalized.includes('edit')) return 'pill pill-edit';
    return 'pill pill-muted';
  };

  const getCurrentStock = (log) => {
    const candidates = [
      log.current_stock,
      log.stock_after,
      log.quantity_after,
      log.updated_stock,
      log.remaining_stock,
    ];
    const value = candidates.find((entry) => entry !== undefined && entry !== null && entry !== '');
    if (value === undefined) {
      return 'N/A';
    }
    return value;
  };

  const matchesChangeType = (value, filterValue) => {
    if (filterValue === 'all') {
      return true;
    }
    const normalized = String(value || '').toLowerCase();
    if (filterValue === 'edit') {
      return normalized.includes('edit') || normalized.includes('update');
    }
    return normalized.includes(filterValue);
  };

  const filteredLogs = useMemo(() => {
    const range = getDateRange();
    const query = searchQuery.trim().toLowerCase();

    return logs.filter((log) => {
      if (range && log.timestamp) {
        const timestamp = new Date(log.timestamp);
        if (Number.isNaN(timestamp.getTime())) {
          return false;
        }
        if (timestamp < range.start || timestamp > range.end) {
          return false;
        }
      }

      if (siteFilter !== 'all' && log.site_name !== siteFilter) {
        return false;
      }

      if (!matchesChangeType(log.transaction_type, typeFilter)) {
        return false;
      }

      if (statusFilter !== 'all') {
        const statusValue = String(log.status || '').toLowerCase();
        if (!statusValue || statusValue !== statusFilter) {
          return false;
        }
      }

      if (query) {
        const searchTarget = [
          log.item_name,
          log.item_id,
          log.item_unique_id,
          log.updated_by,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!searchTarget.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [
    logs,
    rangePreset,
    customStart,
    customEnd,
    siteFilter,
    typeFilter,
    statusFilter,
    searchQuery,
  ]);

  const getSortValue = (log, key) => {
    if (key === 'timestamp') {
      return new Date(log.timestamp || 0).getTime();
    }
    if (key === 'quantity_change') {
      const value = Number(log.quantity_change);
      return Number.isNaN(value) ? -Infinity : value;
    }
    if (key === 'current_stock') {
      const value = Number(getCurrentStock(log));
      return Number.isNaN(value) ? -Infinity : value;
    }
    const rawValue = log[key];
    if (rawValue === null || rawValue === undefined) {
      return '';
    }
    return String(rawValue).toLowerCase();
  };

  const sortedLogs = useMemo(() => {
    if (!sortConfig.key) {
      return filteredLogs;
    }

    return [...filteredLogs].sort((a, b) => {
      const aValue = getSortValue(a, sortConfig.key);
      const bValue = getSortValue(b, sortConfig.key);

      if (aValue < bValue) {
        return sortConfig.direction === 'ascending' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'ascending' ? 1 : -1;
      }
      return 0;
    });
  }, [filteredLogs, sortConfig]);

  const handleSort = (key) => {
    if (!key) {
      return;
    }
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key) => {
    if (sortConfig.key !== key) {
      return '';
    }
    return sortConfig.direction === 'ascending' ? ' ^' : ' v';
  };

  const columns = [
    { key: 'timestamp', label: 'Timestamp' },
    { key: 'item_id', label: 'Item' },
    { key: 'item_name', label: 'Item Name' },
    { key: 'quantity_change', label: 'Qty Change' },
    { key: 'current_stock', label: 'Current Stock' },
    { key: 'site_name', label: 'Site' },
    { key: 'status', label: 'Status' },
    { key: 'updated_by', label: 'Updated By' },
    { key: 'remarks', label: 'Remarks' },
  ];

  const escapeCsvValue = (value) => {
    if (value === null || value === undefined) {
      return '';
    }
    const stringValue = String(value);
    if (/[",\n]/.test(stringValue)) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  const exportLogsToCsv = () => {
    if (!sortedLogs.length) {
      return;
    }

    const headerRow = columns.map((col) => escapeCsvValue(col.label));
    const dataRows = sortedLogs.map((log) => {
      const rowValues = [
        formatTimestamp(log.timestamp),
        getChangeTypeLabel(log.transaction_type),
        log.item_id || 'N/A',
        log.item_name || 'N/A',
        log.item_unique_id || 'N/A',
        Number.isNaN(Number(log.quantity_change))
          ? 'N/A'
          : Number(log.quantity_change),
        getCurrentStock(log),
        log.site_name || 'N/A',
        log.status || 'N/A',
        log.updated_by || 'N/A',
        log.remarks || 'N/A',
      ];

      return rowValues.map((value) => escapeCsvValue(value));
    });

    const csvContent = [
      '\ufeff' + headerRow.join(','),
      ...dataRows.map((row) => row.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `transaction_logs_${getExportRange()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="logs-page-container">
      <div className="logs-header-row">
        <div className="logs-header-text">
          <h2 className="logs-title">Transaction Logs</h2>
          <p className="logs-subtitle">
            Complete history of inventory changes, approvals, and stock movements.
          </p>
        </div>
        <div className="logs-header-actions">
          <button type="button" className="export-logs-btn" onClick={exportLogsToCsv}>
            Export (Excel)
          </button>
        </div>
      </div>

      {error && <p className="error-message">{error}</p>}

      <div className="logs-filters">
        <div className="logs-filter logs-filter-range">
          <span className="logs-filter-label">Date Range</span>
          <div className="logs-filter-inline">
            <button
              type="button"
              className={`filter-pill ${rangePreset === 'today' ? 'active' : ''}`}
              onClick={() => setRangePreset('today')}
            >
              Today
            </button>
            <button
              type="button"
              className={`filter-pill ${rangePreset === '7d' ? 'active' : ''}`}
              onClick={() => setRangePreset('7d')}
            >
              7 days
            </button>
            <button
              type="button"
              className={`filter-pill ${rangePreset === '30d' ? 'active' : ''}`}
              onClick={() => setRangePreset('30d')}
            >
              30 days
            </button>
            <button
              type="button"
              className={`filter-pill ${rangePreset === 'custom' ? 'active' : ''}`}
              onClick={() => setRangePreset('custom')}
            >
              Custom
            </button>
          </div>
          {rangePreset === 'custom' && (
            <div className="logs-filter-inline logs-filter-custom">
              <input
                type="date"
                value={customStart}
                onChange={(event) => setCustomStart(event.target.value)}
              />
              <span className="logs-filter-separator">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(event) => setCustomEnd(event.target.value)}
              />
            </div>
          )}
        </div>

        <div className="logs-filter">
          <span className="logs-filter-label">Site</span>
          <select value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)}>
            <option value="all">All Sites</option>
            {sites.map((site) => (
              <option key={site} value={site}>
                {site}
              </option>
            ))}
          </select>
        </div>

        <div className="logs-filter">
          <span className="logs-filter-label">Change Type</span>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">All Types</option>
            <option value="add">Add</option>
            <option value="remove">Remove</option>
            <option value="reserve">Reserve</option>
            <option value="release">Release</option>
            <option value="edit">Edit</option>
          </select>
        </div>

        <div className="logs-filter">
          <span className="logs-filter-label">Status</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        <div className="logs-filter logs-filter-search">
          <span className="logs-filter-label">Search</span>
          <input
            type="search"
            placeholder="Item name, ID, or user"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
      </div>

      <div className="logs-table-card">
        <div className="logs-table-container">
          <table className="logs-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key} onClick={() => handleSort(col.key)}>
                    {col.label}
                    {getSortIndicator(col.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 6 }).map((_, rowIndex) => (
                  <tr key={`skeleton-${rowIndex}`} className="logs-skeleton-row">
                    {columns.map((col) => (
                      <td key={`skeleton-${rowIndex}-${col.key}`}>
                        <div className="logs-skeleton" />
                      </td>
                    ))}
                  </tr>
                ))}

              {!loading && sortedLogs.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="logs-empty-state">
                    No transactions found for the selected period.
                  </td>
                </tr>
              )}

              {!loading &&
                sortedLogs.map((log) => {
                  const qtyValue = Number(log.quantity_change);
                  const qtyDisplay = Number.isNaN(qtyValue)
                    ? 'N/A'
                    : qtyValue > 0
                    ? `+${qtyValue}`
                    : `${qtyValue}`;
                  const qtyClass = Number.isNaN(qtyValue)
                    ? ''
                    : qtyValue > 0
                    ? 'qty-positive'
                    : qtyValue < 0
                    ? 'qty-negative'
                    : '';

                  return (
                    <tr key={log.transaction_id || `${log.item_id}-${log.timestamp}`}>
                      <td>{formatTimestamp(log.timestamp)}</td>
                      <td>{log.item_id || 'N/A'}</td>
                      <td className="logs-item-cell">
                        <div className="logs-item-name">{log.item_name || 'N/A'}</div>
                      </td>
                      <td>
                        <span className={`qty-change ${qtyClass}`}>{qtyDisplay}</span>
                      </td>
                      <td>{getCurrentStock(log)}</td>
                      <td>{log.site_name || 'N/A'}</td>
                      <td>
                        <span className={getPillClass(log.status, 'status')}>
                          {log.status || 'N/A'}
                        </span>
                      </td>
                      <td>{log.updated_by || 'N/A'}</td>
                      <td>{log.remarks || 'N/A'}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default LogsPage;
