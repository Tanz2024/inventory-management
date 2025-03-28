import React, { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import './ManageRemarks.css';

const ManageRemarks = ({ onClose, onUpdate }) => {
  const [remarks, setRemarks] = useState([]);
  const [editMode, setEditMode] = useState({});
  const [renameValue, setRenameValue] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [newRemark, setNewRemark] = useState('');

  // Fetch remarks from the backend
  const refreshRemarks = async () => {
    try {
      const response = await fetch('http://localhost:5000/dropdown-options/remarks', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setRemarks(data.remarks);
        if (typeof onUpdate === 'function') onUpdate(data.remarks);
      } else {
        console.error('Failed to fetch remarks');
      }
    } catch (error) {
      console.error('Error fetching remarks:', error);
    }
  };

  useEffect(() => {
    refreshRemarks();
  }, []);

  const filteredRemarks = useMemo(() => {
    if (!searchQuery.trim()) return remarks;
    const tokens = searchQuery.trim().toLowerCase().split(/\s+/);
    return remarks.filter(r => tokens.every(t => r.toLowerCase().includes(t)));
  }, [searchQuery, remarks]);

  // Add a new remark with duplicate check
  const handleAddRemark = async () => {
    const trimmed = newRemark.trim();
    if (!trimmed) return;

    try {
      const resp = await fetch('http://localhost:5000/dropdown-options/remarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ option: trimmed }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        if (data.existingOptions) {
          alert(
            `Cannot add: "${trimmed}" already exists as: ${data.existingOptions.join(', ')}.`
          );
        } else {
          alert(`Failed to add remark: ${data.message}`);
        }
        return;
      }
      alert(`Remark "${trimmed}" added successfully.`);
      setNewRemark('');
      await refreshRemarks();
    } catch (error) {
      console.error('Error adding remark:', error);
      alert('An error occurred while adding the remark.');
    }
  };

  const handleDeleteRemark = async (remarkName) => {
    if (!window.confirm(`Are you sure you want to delete "${remarkName}"?`)) return;
    try {
      const resp = await fetch(`http://localhost:5000/dropdown-options/remarks/${encodeURIComponent(remarkName)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      const data = await resp.json();
      if (!resp.ok) {
        alert(`Failed to delete remark: ${data.message}`);
        return;
      }
      alert(`Remark "${remarkName}" deleted successfully.`);
      await refreshRemarks();
    } catch (error) {
      console.error('Error deleting remark:', error);
      alert('An error occurred while deleting the remark.');
    }
  };

  // Rename a remark option with duplicate check
  const handleConfirmRename = async (oldName) => {
    const newName = renameValue[oldName]?.trim();
    if (!newName || newName === oldName) {
      toggleRenameMode(oldName);
      return;
    }
    try {
      const resp = await fetch('http://localhost:5000/dropdown-options/remarks/rename', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ oldOption: oldName, newOption: newName }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        if (data.existingOptions) {
          alert(`Cannot rename: A remark similar to "${newName}" exists: ${data.existingOptions.join(', ')}`);
        } else {
          alert(`Failed to rename: ${data.message}`);
        }
        return;
      }
      alert(`Remark renamed from "${oldName}" to "${newName}" successfully.`);
      toggleRenameMode(oldName);
      await refreshRemarks();
    } catch (error) {
      console.error('Error renaming remark:', error);
      alert('An error occurred while renaming the remark.');
    }
  };

  const toggleRenameMode = (remarkName) => {
    setEditMode(prev => ({ ...prev, [remarkName]: !prev[remarkName] }));
    setRenameValue(prev => ({ ...prev, [remarkName]: remarkName }));
  };

  const handleRenameChange = (remarkName, newName) => {
    setRenameValue(prev => ({ ...prev, [remarkName]: newName }));
  };

  const handleCancelRename = (remarkName) => {
    toggleRenameMode(remarkName);
    setRenameValue(prev => ({ ...prev, [remarkName]: remarkName }));
  };

  const handleClose = () => {
    if (typeof onUpdate === 'function') onUpdate(remarks);
    onClose();
  };

  return (
    <div className="manage-sites-dialog">
      <div className="dialog-content">
        <header className="dialog-header">
          <h2 className="dialog-title">Manage Remark Options</h2>
          <div className="total-sites-label">
            <strong>Total Remarks: {remarks.length}</strong>
          </div>
        </header>

        <div className="add-site-container">
          <input
            type="text"
            className="new-site-input"
            placeholder="Add new remark option"
            value={newRemark}
            onChange={(e) => setNewRemark(e.target.value)}
          />
          <button className="primary add-button" onClick={handleAddRemark}>Add</button>
        </div>

        <div className="sites-list-container">
          <h3>Remarks</h3>
          <input
            type="text"
            placeholder="Search remark options..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />

          {filteredRemarks.length > 0 ? (
            <ul className="sites-list">
              {filteredRemarks.map((remark) => (
                <li key={remark} className="site-item">
                  {!editMode[remark] ? (
                    <div className="site-name">{remark}</div>
                  ) : (
                    <div className="rename-row">
                      <input
                        type="text"
                        className="rename-input"
                        value={renameValue[remark] || remark}
                        onChange={(e) => handleRenameChange(remark, e.target.value)}
                      />
                      <button className="rename-save-btn" onClick={() => handleConfirmRename(remark)}>Save</button>
                      <button className="rename-cancel-btn" onClick={() => handleCancelRename(remark)}>Cancel</button>
                    </div>
                  )}
                  {!editMode[remark] && (
                    <div className="actions-row">
                      <button className="rename-icon" onClick={() => toggleRenameMode(remark)} title="Rename">
                        ✎
                      </button>
                      <button className="delete-icon" onClick={() => handleDeleteRemark(remark)} title="Delete">
                        &#x2715;
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="no-match">No matching remark options.</p>
          )}
        </div>

        <div className="buttons-row">
          <button className="primary" onClick={handleClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

ManageRemarks.propTypes = {
  onClose: PropTypes.func.isRequired,
  onUpdate: PropTypes.func,
};

export default ManageRemarks;