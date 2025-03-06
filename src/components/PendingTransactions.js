import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './PendingTransactions.css'; // Import the CSS file

const PendingTransactions = () => {
  const [pendingTransactions, setPendingTransactions] = useState([]);

  useEffect(() => {
    fetchPendingTransactions();
  }, []);

  const fetchPendingTransactions = async () => {
    try {
      const response = await fetch('http://localhost:5000/pending-transactions', {
        method: 'GET',
        credentials: 'include', // Pass cookies for authentication
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': '1'
        },
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

  const handleApprove = async (transactionId) => {
    const confirmed = window.confirm('Are you sure you want to approve this transaction?');
    if (!confirmed) return;

    try {
      const response = await fetch(`http://localhost:5000/approve-transaction/${transactionId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': '1'
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      alert('Transaction approved successfully.');
      fetchPendingTransactions(); // Refresh the list after approval
    } catch (error) {
      console.error('Error approving transaction:', error);
      alert('Failed to approve transaction.');
    }
  };

  const handleCancel = async (transactionId) => {
    const confirmed = window.confirm('Are you sure you want to cancel this transaction?');
    if (!confirmed) return;

    try {
      const response = await fetch(`http://localhost:5000/cancel-transaction/${transactionId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': '1'
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      alert('Transaction canceled successfully.');
      fetchPendingTransactions(); // Refresh the list after cancellation
    } catch (error) {
      console.error('Error canceling transaction:', error);
      alert('Failed to cancel transaction.');
    }
  };

  return (
    <div className="pending-transactions-container">
      <h1 className="pending-transactions-title">Pending Transactions</h1>
      <table className="transactions-table">
        <thead>
          <tr>
            <th>Item ID</th>
            <th>Category</th>
            <th>Item Name</th>
            <th>Model</th>
            <th>Unique Id</th>
            <th>Transaction Type</th>
            <th>Quantity Change</th>
            <th>Timestamp</th>
            <th>Remarks</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {pendingTransactions.length === 0 ? (
            <tr>
              <td colSpan="11" className="no-transactions-message">
                No pending transactions
              </td>
            </tr>
          ) : (
            pendingTransactions.map((transaction) => (
              <tr key={transaction.transaction_id}>
                <td>{transaction.item_id}</td>
                <td>{transaction.category}</td>
                <td>{transaction.item_name}</td>
                <td>{transaction.model}</td>
                <td>{transaction.item_unique_id}</td>
                <td>{transaction.transaction_type}</td>
                <td>{transaction.quantity_change}</td>
                <td>{new Date(transaction.timestamp).toLocaleString()}</td>
                <td>{transaction.remarks}</td>
                <td>{transaction.status}</td>
                <td>
                  <button
                    className="approve-button"
                    onClick={() => handleApprove(transaction.transaction_id)}
                  >
                    Approve
                  </button>
                  <button
                    className="cancel-button"
                    onClick={() => handleCancel(transaction.transaction_id)}
                  >
                    Cancel
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default PendingTransactions;
