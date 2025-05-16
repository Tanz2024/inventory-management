import React, { useState, useEffect } from 'react';
import './PendingTransactions.css';

/**
 * Parses strings like "24 hour" or "1 week" into seconds.
 * Returns null if input is "none" => No Auto-Approve.
 */
const parseExpiryInterval = (input) => {
  if (input === 'none') return null;
  const match = input.match(/(\d+)\s*(second|seconds|minute|minutes|hour|hours|day|days|week|weeks)/i);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case 'second':
    case 'seconds':
      return value;
    case 'minute':
    case 'minutes':
      return value * 60;
    case 'hour':
    case 'hours':
      return value * 3600;
    case 'day':
    case 'days':
      return value * 86400;
    case 'week':
    case 'weeks':
      return value * 604800;
    default:
      return null;
  }
};

/**
 * Highlights matching text in 'text' based on 'query'.
 * Wraps matches in <span class="search-highlight"> for styling.
 */
const highlightMatch = (text, query) => {
  if (!query.trim()) return text;
  const regex = new RegExp(`(${query})`, 'gi');
  return text.replace(regex, '<span class="search-highlight">$1</span>');
};

const PendingTransactions = () => {
  // State: pending transactions from the server
  const [pendingTransactions, setPendingTransactions] = useState([]);
  // Auto-approve interval from the server
  const [expiryInterval, setExpiryInterval] = useState('');
  const [expiryIntervalSeconds, setExpiryIntervalSeconds] = useState(null);
  // Filters
  const [filterThreshold, setFilterThreshold] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  // For the live countdown
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Common headers for fetch calls
  const commonHeaders = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': '1'
  };

  // Fetch pending transactions
  const fetchPendingTransactions = async () => {
    try {
      const response = await fetch('https://e89d-211-25-11-204.ngrok-free.app/pending-transactions', {
        method: 'GET',
        credentials: 'include',
        headers: commonHeaders,
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setPendingTransactions(data.pendingTransactions);
    } catch (error) {
      console.error('Error fetching pending transactions:', error);
    }
  };

  // Update currentTime every second for the live countdown
  useEffect(() => {
    const countdownTimer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(countdownTimer);
  }, []);

  // On mount: fetch auto-approve interval and pending transactions, and set up auto-refresh
  useEffect(() => {
    const initializeData = async () => {
      try {
        // Fetch the server's current auto-approve interval
        const intervalRes = await fetch('https://e89d-211-25-11-204.ngrok-free.app/get-transaction-expiry', {
          credentials: 'include',
          headers: commonHeaders,
        });
        if (!intervalRes.ok) {
          throw new Error(`Error fetching interval: ${intervalRes.status}`);
        }
        const intervalData = await intervalRes.json();
        // e.g. intervalData.expiry might be 'none', '24 hour', etc.
        setExpiryInterval(intervalData.expiry);
        setExpiryIntervalSeconds(parseExpiryInterval(intervalData.expiry));
      } catch (err) {
        console.error('Error retrieving auto-approve interval:', err);
      }
      // Fetch pending transactions once after initializing
      fetchPendingTransactions();
    };

    initializeData();

    // Then auto-refresh pending transactions every 5 seconds
    const refreshTimer = setInterval(() => {
      fetchPendingTransactions();
    }, 5000);

    return () => clearInterval(refreshTimer);
  }, []);

  // Calculate how many seconds remain until auto-approval for a given transaction timestamp
  const getTimeRemaining = (timestamp) => {
    if (expiryIntervalSeconds === null) {
      // "No Auto-Approve"
      return Infinity;
    }
    const created = new Date(timestamp).getTime();
    const cutoff = created + expiryIntervalSeconds * 1000;
    return Math.floor((cutoff - currentTime) / 1000);
  };

  // Format seconds into HH:MM:SS, or display "Expired"/"No Limit"
  const formatTime = (sec) => {
    if (sec === Infinity) return 'No Limit';
    if (sec < 0) return 'Expired';
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  };

  // Predefined expiry options for auto-approve
  const expiryOptions = [
    { label: 'No Auto-Approve', value: 'none' },
    { label: '24 Hours', value: '24 hour' },
    { label: '48 Hours', value: '48 hour' },
    { label: '72 Hours', value: '72 hour' },
    { label: '1 Week', value: '1 week' },
  ];

  // Filter pending transactions by time threshold
  const filterByThreshold = (tx) => {
    const remainingSeconds = getTimeRemaining(tx.timestamp);
    if (filterThreshold === 'all') return true;
    if (filterThreshold === '1h') return remainingSeconds <= 3600 && remainingSeconds >= 0;
    if (filterThreshold === '4h') return remainingSeconds <= 14400 && remainingSeconds >= 0;
    if (filterThreshold === '24h') return remainingSeconds <= 86400 && remainingSeconds >= 0;
    return true;
  };

  // Filter transactions by search query (matches item name or category)
  const filterBySearch = (tx) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      tx.item_name.toLowerCase().includes(query) ||
      tx.category.toLowerCase().includes(query)
    );
  };

  // Combined filters for pending transactions
  const filteredTransactions = pendingTransactions
    .filter(filterByThreshold)
    .filter(filterBySearch);

  // For highlighting matched text in the table, returns an object for dangerouslySetInnerHTML
  const createHighlightedHTML = (text) => {
    const safeText = text || '';
    return { __html: highlightMatch(safeText, searchQuery) };
  };

  // Approve a transaction manually
  const handleApprove = async (transactionId) => {
    if (!window.confirm('Approve this transaction?')) return;
    try {
      const response = await fetch(`https://e89d-211-25-11-204.ngrok-free.app/approve-transaction/${transactionId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: commonHeaders,
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      alert('Transaction approved successfully.');
      fetchPendingTransactions();
    } catch (error) {
      console.error('Error approving transaction:', error);
      alert('Failed to approve transaction.');
    }
  };

  // Cancel a transaction
  const handleCancel = async (transactionId) => {
    if (!window.confirm('Cancel this transaction?')) return;
    try {
      const response = await fetch(`https://e89d-211-25-11-204.ngrok-free.app/cancel-transaction/${transactionId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: commonHeaders,
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      alert('Transaction canceled successfully.');
      fetchPendingTransactions();
    } catch (error) {
      console.error('Error canceling transaction:', error);
      alert('Failed to cancel transaction.');
    }
  };

  // Set auto-approve interval on the server
  const handleSetExpiryInterval = async (newInterval) => {
    const parsedSeconds = parseExpiryInterval(newInterval);
    try {
      const response = await fetch('https://e89d-211-25-11-204.ngrok-free.app/set-transaction-expiry', {
        method: 'POST',
        credentials: 'include',
        headers: commonHeaders,
        body: JSON.stringify({ expiry: newInterval }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message);
      }
      alert(data.message);
      setExpiryInterval(newInterval);
      setExpiryIntervalSeconds(parsedSeconds);
      // Immediately re-fetch in case older items got auto-approved
      fetchPendingTransactions();
    } catch (error) {
      console.error('Error setting auto-approve interval:', error);
      alert('Failed to set auto-approve interval.');
    }
  };

  return (
    <div className="pending-transactions-container">
      <h1 className="pending-transactions-title">Pending Transactions</h1>

      {/* Controls Row */}
      <div className="controls-row">
        {/* Auto-Approve Interval */}
        <div className="control-group">
          <label htmlFor="expiry-select">Auto-Approve Interval:</label>
          <select
            id="expiry-select"
            value={expiryInterval}
            onChange={(e) => handleSetExpiryInterval(e.target.value)}
          >
            {expiryOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Time Filter */}
        <div className="control-group">
          <label htmlFor="filter-threshold">Time Filter:</label>
          <select
            id="filter-threshold"
            value={filterThreshold}
            onChange={(e) => setFilterThreshold(e.target.value)}
          >
            <option value="all">All</option>
            <option value="1h">Expiring in 1 Hour</option>
            <option value="4h">Expiring in 4 Hours</option>
            <option value="24h">Expiring in 24 Hours</option>
          </select>
        </div>

        {/* Search */}
        <div className="control-group">
          <label htmlFor="search-input">Search:</label>
          <input
            id="search-input"
            type="text"
            placeholder="Item name or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Transactions Table */}
      <table className="transactions-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Category</th>
            <th>Item Name</th>
            <th>Model</th>
            <th>Unique ID</th>
            <th>Type</th>
            <th>Qty Change</th>
            <th>Timestamp</th>
            <th>Remarks</th>
            <th>Status</th>
            <th>Time Left</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredTransactions.length === 0 ? (
            <tr>
              <td colSpan="12" className="no-transactions-message">
                No pending transactions found.
              </td>
            </tr>
          ) : (
            filteredTransactions.map((tx) => {
              const remainingSeconds = getTimeRemaining(tx.timestamp);
              // Highlight if less than 60 seconds left (and not already auto-approved)
              const isExpiring = remainingSeconds < 60 && remainingSeconds >= 0;
              return (
                <tr key={tx.transaction_id}>
                  <td dangerouslySetInnerHTML={{ __html: highlightMatch(String(tx.item_id), searchQuery) }} />
                  <td dangerouslySetInnerHTML={{ __html: highlightMatch(tx.category, searchQuery) }} />
                  <td dangerouslySetInnerHTML={{ __html: highlightMatch(tx.item_name, searchQuery) }} />
                  <td dangerouslySetInnerHTML={{ __html: highlightMatch(tx.model, searchQuery) }} />
                  <td dangerouslySetInnerHTML={{ __html: highlightMatch(tx.item_unique_id, searchQuery) }} />
                  <td dangerouslySetInnerHTML={{ __html: highlightMatch(tx.transaction_type, searchQuery) }} />
                  <td>{tx.quantity_change}</td>
                  <td>{new Date(tx.timestamp).toLocaleString()}</td>
                  <td dangerouslySetInnerHTML={{ __html: highlightMatch(tx.remarks, searchQuery) }} />
                  <td dangerouslySetInnerHTML={{ __html: highlightMatch(tx.status, searchQuery) }} />
                  <td className={isExpiring ? 'time-expiring' : ''}>
                    {formatTime(remainingSeconds)}
                  </td>
                  <td>
                    <button
                      className="approve-button"
                      onClick={() => handleApprove(tx.transaction_id)}
                    >
                      Approve
                    </button>
                    <button
                      className="cancel-button"
                      onClick={() => handleCancel(tx.transaction_id)}
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};

export default PendingTransactions;
