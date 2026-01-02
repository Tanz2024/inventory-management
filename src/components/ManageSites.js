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

  // Fetch sites from backend
  const fetchSites = async () => {
    try {
      const response = await fetch('http://localhost:5000/dropdown-options/sites', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setOriginalSites(data.sites);
        setLocalSites(data.sites);
        if (typeof onUpdate === 'function') onUpdate(data.sites);
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
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ option: trimmed }),
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
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ option: siteName }),
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
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ oldOption: oldName, newOption: newName }),
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
    <div className="manage-sites-dialog">
      <div className="dialog-content">
        <header className="dialog-header">
          <h2 className="dialog-title">Manage Site Options</h2>
          <div className="total-sites-label">
            <strong>Total Sites: {localSites.length}</strong>
          </div>
        </header>

        <div className="add-site-container">
          <input
            type="text"
            className="new-site-input"
            placeholder="Add new site option"
            value={newSite}
            onChange={(e) => setNewSite(e.target.value)}
          />
          <button className="primary add-button" onClick={handleAddSite}>Add</button>
        </div>

        <div className="sites-list-container">
          <h3>Sites</h3>
          <input
            type="text"
            placeholder="Search site options..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          {filteredSites.length > 0 ? (
            <ul className="sites-list">
              {filteredSites.map((site) => (
                <li key={site} className="site-item">
                  {editingSite === site ? (
                    <div className="rename-container">
                      <input
                        type="text"
                        value={renameInput}
                        onChange={(e) => setRenameInput(e.target.value)}
                        className="rename-input"
                      />
                      <button
                        className="primary confirm-rename-button"
                        onClick={() => handleRenameSiteLocal(site)}
                      >
                        Confirm
                      </button>
                      <button
                        className="secondary cancel-rename-button"
                        onClick={cancelEditing}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="site-name">{site}</div>
                      <div className="actions-row">
                        <button
                          className="rename-icon"
                          onClick={() => startEditing(site)}
                          title="Rename"
                        >
                          ✎
                        </button>
                        <button
                          className="delete-icon"
                          onClick={() => handleDeleteSiteLocal(site)}
                          title="Delete"
                        >
                          &#x2715;
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="no-match">No matching site options.</p>
          )}
        </div>

        <div className="buttons-row">
          <button className="primary" onClick={handleClose}>Close</button>
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

