import React, { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import './ManageRemarks.css';

const ManageRemarks = ({ onClose, onUpdate }) => {
  const [remarks, setRemarks] = useState([]);
  const [editMode, setEditMode] = useState({});
  const [renameValue, setRenameValue] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [newRemark, setNewRemark] = useState('');
  const [loading, setLoading] = useState(false);

  // Helper: Common headers for fetch calls
  const commonHeaders = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': '1'
  };

  // Fetch remarks from the backend
  const refreshRemarks = async () => {
    try {
      const response = await fetch('http://localhost:5000/dropdown-options/remarks', {
        method: 'GET',
        credentials: 'include',
        headers: commonHeaders
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
    const fetchData = async () => {
      setLoading(true);
      await refreshRemarks();
      setLoading(false);
    };
    fetchData();
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
        credentials: 'include',
        headers: commonHeaders,
        body: JSON.stringify({ option: trimmed })
      });
      const data = await resp.json();
      if (!resp.ok) {
        if (data.existingOptions) {
          alert(`Cannot add: "${trimmed}" already exists as: ${data.existingOptions.join(', ')}`);
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

  // Delete a remark option
  const handleDeleteRemark = async (remarkName) => {
    if (!window.confirm(`Are you sure you want to delete "${remarkName}"?`)) return;
    try {
      const resp = await fetch(
        `http://localhost:5000/dropdown-options/remarks/${encodeURIComponent(remarkName)}`,
        {
          method: 'DELETE',
          credentials: 'include',
          headers: commonHeaders
        }
      );
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
        credentials: 'include',
        headers: commonHeaders,
        body: JSON.stringify({ oldOption: oldName, newOption: newName })
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
    <div className="MR-overlay">
      <div className="MR-popup-dialog">
        <h2 className="MR-dialog-title">Manage Remarks</h2>
  
        <div className="MR-dialog-content">
  
          <div className="add-remark-container">
            <input
              type="text"
              placeholder="Enter new remark"
              value={newRemark}
              onChange={(e) => setNewRemark(e.target.value)}
            />
            <button className="btn-primary" onClick={handleAddRemark}>Add Remark</button>
          </div>
  
          <input
            type="text"
            placeholder="Search remarks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
            <div className="total-remarks-label">
            <strong>Total Remarks: {remarks.length}</strong>
          </div>
          {filteredRemarks.length > 0 ? (
            <ul className="remarks-list">
              {filteredRemarks.map((remark) => (
                <li key={remark} className="remark-item">
                  {!editMode[remark] ? (
                    <div className="remark-name">{remark}</div>
                  ) : (
                    <div className="remark-edit-row">
                      <input
                        type="text"
                        value={renameValue[remark] || remark}
                        onChange={(e) => handleRenameChange(remark, e.target.value)}
                      />
                      <button className="btn-primary" onClick={() => handleConfirmRename(remark)}>Save</button>
                      <button className="btn-secondary" onClick={() => handleCancelRename(remark)}>Cancel</button>
                    </div>
                  )}
                  {!editMode[remark] && (
                    <div className="remark-actions">
                      <button className="btn-primary" onClick={() => toggleRenameMode(remark)}>Rename</button>
                      <button className="btn-secondary" onClick={() => handleDeleteRemark(remark)}>Delete</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>No matching remarks found.</p>
          )}
        </div>
  
        <div className="dialog-actions">
          <button className="btn-primary" onClick={handleClose}>Close</button>
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
