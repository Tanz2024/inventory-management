import React, { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import './ManageSites.css';

const ManageSites = ({ onClose, onUpdate }) => {
  const [originalSites, setOriginalSites] = useState([]);
  const [localSites, setLocalSites] = useState([]);
  const [newSite, setNewSite] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  // For renaming: which site is in edit mode and its new value
  const [editingSite, setEditingSite] = useState(null);
  const [renameInput, setRenameInput] = useState('');

  // Common headers for all fetch calls
  const commonHeaders = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': '1'
  };

  // Fetch sites from backend
  const fetchSites = async () => {
    try {
      const response = await fetch('http://localhost:5000/dropdown-options/sites', {
        method: 'GET',
        headers: commonHeaders,
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setOriginalSites(data.sites);
        setLocalSites(data.sites);
        if (typeof onUpdate === 'function') onUpdate(data.sites);
      } else {
        console.error('Failed to fetch site options');
      }
    } catch (error) {
      console.error('Error fetching site options:', error);
    }
  };

  useEffect(() => {
    fetchSites();
  }, []);

  const filteredSites = useMemo(() => {
    if (!searchQuery.trim()) return localSites;
    return localSites.filter(site =>
      site.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, localSites]);

  // Add a new site with duplicate check
  const handleAddSite = async () => {
    const trimmed = newSite.trim();
    if (!trimmed) {
      alert('Site name cannot be empty.');
      return;
    }
    try {
      const resp = await fetch('http://localhost:5000/dropdown-options/sites', {
        method: 'POST',
        headers: commonHeaders,
        credentials: 'include',
        body: JSON.stringify({ option: trimmed })
      });
      const data = await resp.json();
      if (!resp.ok) {
        if (data.existingOptions) {
          alert(`Cannot add: "${trimmed}" already exists as: ${data.existingOptions.join(', ')}`);
        } else {
          alert(data.message);
        }
        return;
      }
      alert(`Site "${trimmed}" added successfully.`);
      setNewSite('');
      await fetchSites();
    } catch (error) {
      console.error('Error adding site:', error);
      alert(`Error adding site: ${error.message}`);
    }
  };

  // Delete a site option
  const handleDeleteSiteLocal = async (siteName) => {
    if (!window.confirm(`Are you sure you want to delete "${siteName}"?`)) return;
    try {
      const resp = await fetch('http://localhost:5000/dropdown-options/sites', {
        method: 'DELETE',
        headers: commonHeaders,
        credentials: 'include',
        body: JSON.stringify({ option: siteName })
      });
      const data = await resp.json();
      if (!resp.ok) {
        alert(data.message);
        return;
      }
      alert(`Site "${siteName}" deleted successfully.`);
      await fetchSites();
    } catch (error) {
      console.error('Error deleting site:', error);
      alert(`Error deleting site: ${error.message}`);
    }
  };

  // Start editing a site's name
  const startEditing = (site) => {
    setEditingSite(site);
    setRenameInput(site);
  };

  // Cancel rename editing
  const cancelEditing = () => {
    setEditingSite(null);
    setRenameInput('');
  };

  // Confirm rename changes and call the backend
  const handleRenameSiteLocal = async (oldName) => {
    const newName = renameInput.trim();
    if (!newName || newName === oldName) {
      cancelEditing();
      return;
    }
    try {
      const resp = await fetch('http://localhost:5000/dropdown-options/sites/rename', {
        method: 'PATCH',
        headers: commonHeaders,
        credentials: 'include',
        body: JSON.stringify({ oldOption: oldName, newOption: newName })
      });
      const data = await resp.json();
      if (!resp.ok) {
        if (data.existingOptions) {
          alert(`Cannot rename: "${newName}" already exists as: ${data.existingOptions.join(', ')}`);
        } else {
          alert(data.message);
        }
        return;
      }
      alert(`Site "${oldName}" renamed to "${newName}" successfully.`);
      cancelEditing();
      await fetchSites();
    } catch (error) {
      console.error('Error renaming site:', error);
      alert(`Error renaming site: ${error.message}`);
    }
  };

  const handleClose = () => {
    if (typeof onUpdate === 'function') onUpdate(localSites);
    onClose();
  };

  return (
    <div className="MS-overlay">
      <div className="MS-popup-dialog">
        <header className="MS-dialog-header">
          <h2 className="MS-dialog-title">Manage Site Options</h2>

        </header>
  
        {/* <div className="MS-add-container">
          <input
            type="text"
            className="MS-new-input"
            placeholder="Add new site option"
            value={newSite}
            onChange={(e) => setNewSite(e.target.value)}
          />
          <button className="MS-btn-primary" onClick={handleAddSite}>Add New Site</button>
        </div> */}
  
        <div className="MS-dialog-content">
  {/* <h3>Sites</h3> */}
  <input
    type="text"
    placeholder="Search site name..."
    value={searchQuery}
    onChange={(e) => setSearchQuery(e.target.value)}
    className="MS-search-input"
  />

  {/* Adding new site */}
  <div className="MS-add-site-container">
    
    <input
      type="text"
      placeholder="Add new site"
      value={newSite}
      onChange={(e) => setNewSite(e.target.value)}
      className="MS-new-site-input"
    />
    <button className="MS-btn-primary" onClick={handleAddSite}>Add Site</button>
  </div>

  {/* Site list rendering */}
  <div className="MS-total-label">
            <strong>Total Sites: {localSites.length}</strong>
          </div>
  {filteredSites.length > 0 ? (
    <div className="MS-sites-list">
      {filteredSites.map((site) => (
        <div key={site} className="MS-row">
          {/* If editing a site */}
          {editingSite === site ? (
            <div className="MS-edit-row">
              <input
                type="text"
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                className="MS-rename-input"
              />
              <button
                className="MS-btn-primary"
                onClick={() => handleRenameSiteLocal(site)}
              >
                Save
              </button>
              <button
                className="MS-btn-secondary"
                onClick={cancelEditing}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="MS-row-content">
              <div className="MS-item-name">{site}</div>
              <div className="MS-actions">
                <button
                  className="MS-btn-primary"
                  onClick={() => startEditing(site)}
                  title="Rename"
                >
                  Rename
                </button>
                <button
                  className="MS-btn-secondary"
                  onClick={() => handleDeleteSiteLocal(site)}
                  title="Delete"
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  ) : (
    <p className="MS-no-results">No matching site options.</p>
  )}

  <div className="MS-dialog-actions">
    <button className="MS-btn-primary" onClick={handleClose}>Close</button>
  </div>
</div>
      </div>
    </div>
  );
  
};

ManageSites.propTypes = {
  onClose: PropTypes.func.isRequired,
  onUpdate: PropTypes.func.isRequired,
};

export default ManageSites;
