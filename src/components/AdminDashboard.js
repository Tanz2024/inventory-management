import React, { useState, useEffect, useRef } from 'react';
import { FaChevronDown, FaChevronUp, FaStar } from 'react-icons/fa';
import AddItems from './AddItems';
import DeleteItems from './DeleteItems';
import ManageSite from './ManageSites';
import ManageRemarks from './ManageRemarks';
import './AdminDashboard.css';

const AdminDashboard = ({ onLogout, userId, username, dashboardLocation }) => {
  // ------------------------------ Columns Config ------------------------------
  const columns = [
    { key: "display_order", label: "No.", sortable: true },
    { key: "item_unique_id", label: "Unique ID", sortable: true },
    { key: "category", label: "Category", sortable: true },
    { key: "item_name", label: "Item Name", sortable: true },
    { key: "model", label: "Model", sortable: true },
    { key: "site_name", label: "Site Name", sortable: true },
    { key: "unit", label: "Unit", sortable: true },
    { key: "location", label: "Location", sortable: true },
    { key: "quantity", label: "Quantity", sortable: true },
    { key: "price", label: "Price", sortable: true },
    { key: "reserved_quantity", label: "Reservation", sortable: true },
    { key: "remarks", label: "Remarks", sortable: true },
    { key: "audit_date", label: "Key‑in Date", sortable: true, adminOnly: true },
  ];

  // Set default visible columns (hide adminOnly for non-admin users)
  const initialVisible = {};
  columns.forEach(col => {
    initialVisible[col.key] = col.adminOnly && userId !== 2 ? false : true;
  });
  const [visibleColumns, setVisibleColumns] = useState(initialVisible);
  const handleResetColumns = () => setVisibleColumns(initialVisible);

  // ------------------------------ State Declarations ------------------------------
  const [showColumnDropdown, setShowColumnDropdown] = useState(false);
  const dropdownRef = useRef(null);
  const toggleColumnDropdown = () => setShowColumnDropdown(prev => !prev);

  // fullEditMode: when true, the row is in edit mode.
  const [fullEditMode, setFullEditMode] = useState({});

  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  // Search and filter
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);
  const [modelFilter, setModelFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Dialog controls
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [openManageRemarks, setOpenManageRemarks] = useState(false);
  const [openManageSites, setOpenManageSites] = useState(false);

  // Other fields
  const [inputValue, setInputValue] = useState({});
  const [remarks, setRemarks] = useState({});
  const [prices, setPrices] = useState({});
  const [siteNames, setSiteNames] = useState({});
  const [units, setUnits] = useState({});
  const [uniqueIds, setUniqueIds] = useState({});
  const [quantityValue, setQuantityValue] = useState({});
  const [auditDates, setAuditDates] = useState({});

  // Editable fields for admin
  const [editableItemNames, setEditableItemNames] = useState({});
  const [editableCategories, setEditableCategories] = useState({});
  const [editableModels, setEditableModels] = useState({});
  const [editableLocations, setEditableLocations] = useState({});

  const [editAll, setEditAll] = useState(false);
  const [rowStatus, setRowStatus] = useState({});

  const [remarksOptions, setRemarksOptions] = useState([]);
  const [siteNamesOptions, setSiteNamesOptions] = useState([]);

  // ------------------------------ Notification ------------------------------
  const [notification, setNotification] = useState(null);
  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // ------------------------------ useEffect for Mobile Dropdown ------------------------------
  useEffect(() => {
    if ("ontouchstart" in window) {
      const handleTouchOutside = (event) => {
        if (Object.values(fullEditMode).includes(true)) return;
        if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
          setShowColumnDropdown(false);
        }
      };
      document.addEventListener("touchstart", handleTouchOutside);
      return () => document.removeEventListener("touchstart", handleTouchOutside);
    }
  }, [fullEditMode]);

  // ------------------------------ Helper Functions ------------------------------
  const convertToMYTDisplay = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' });
  };

  const formatForInput = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toISOString().slice(0, 16);
  };

  // ------------------------------ Fetch Dropdown Options ------------------------------
  useEffect(() => {
    fetchRemarksOptions();
    fetchSiteOptions();
  
    const handleDropdownUpdate = (e) => {
      const { type } = e.detail;
      if (type === 'site') {
        fetchSiteOptions();
      } else if (type === 'remark') {
        fetchRemarksOptions();
      }
    };
  
    window.addEventListener('dropdownOptionsUpdated', handleDropdownUpdate);
    return () => window.removeEventListener('dropdownOptionsUpdated', handleDropdownUpdate);
  }, []);
  
  const fetchRemarksOptions = async () => {
    try {
      const response = await fetch('http://localhost:5000/dropdown-options/remarks', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.remarks)) {
          setRemarksOptions(data.remarks);
          localStorage.setItem('remarksOptions', JSON.stringify(data.remarks));
        }
      } else {
        console.error('Failed to fetch remarks options');
      }
    } catch (error) {
      console.error('Error fetching remarks options:', error);
    }
  };
  
  const fetchSiteOptions = async () => {
    try {
      const response = await fetch('http://localhost:5000/dropdown-options/sites', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.sites)) {
          setSiteNamesOptions(data.sites);
          localStorage.setItem('siteNames', JSON.stringify(data.sites));
        }
      } else {
        console.error('Failed to fetch site options');
      }
    } catch (error) {
      console.error('Error fetching site options:', error);
    }
  };
  
  // ------------------------------ Data Fetching & Initialization ------------------------------
  const fetchItems = async () => {
    try {
      const response = await fetch('http://localhost:5000/admin-dashboard/items', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'ngrok-skip-browser-warning': '1',
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        setError('Failed to fetch items');
        return;
      }
      const data = await response.json();
      const fetchedItems = data.items || [];
      setItems(fetchedItems);
      initializeStates(fetchedItems);
    } catch (err) {
      console.error('Error fetching items:', err);
      setError('An error occurred while fetching the items.');
    }
  };

  useEffect(() => {
    fetchItems();
  }, [onLogout]);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const initializeStates = (fetchedItems) => {
    const initInput = {};
    const initRemarks = {};
    const initPrices = {};
    const initSiteNames = {};
    const initUnits = {};
    const initQuantity = {};
    const initUniqueIds = {};
    const initAuditDates = {};
    const initItemNames = {};
    const initCategories = {};
    const initModels = {};
    const initLocations = {};
    const initRowStatus = {};
    const initFullEditMode = {};

    const storedQuantities = JSON.parse(localStorage.getItem("userQuantities") || "{}");

    fetchedItems.forEach(item => {
      initInput[item.item_id] = "";
      initRemarks[item.item_id] = item.remarks || '';
      initPrices[item.item_id] = item.price ?? 0;
      initSiteNames[item.item_id] = item.site_name || '';
      initUnits[item.item_id] = item.unit || '';
      initQuantity[item.item_id] = item.quantity;

      initUniqueIds[item.item_id] = item.item_unique_id || '';
      initAuditDates[item.item_id] = item.audit_date || '';
      initItemNames[item.item_id] = item.item_name || '';
      initCategories[item.item_id] = item.category || '';
      initModels[item.item_id] = item.model || '';
      initLocations[item.item_id] = item.location || '';
      initRowStatus[item.item_id] = 'default';
      initFullEditMode[item.item_id] = false;
    });
    setInputValue(initInput);
    setRemarks(initRemarks);
    setPrices(initPrices);
    setSiteNames(initSiteNames);
    setUnits(initUnits);
    setQuantityValue(initQuantity);
    setUniqueIds(initUniqueIds);
    setAuditDates(initAuditDates);
    setEditableItemNames(initItemNames);
    setEditableCategories(initCategories);
    setEditableModels(initModels);
    setEditableLocations(initLocations);
    setRowStatus(initRowStatus);
    setFullEditMode(initFullEditMode);
    setEditAll(false);
  };

  // ------------------------------ Dropdown Options for Filtering ------------------------------
  const uniqueModels = Array.from(new Set(items.map(item => item.model).filter(Boolean)));
  const uniqueCategories = Array.from(new Set(items.map(item => item.category).filter(Boolean)));
  const uniqueLocations = Array.from(new Set(items.map(item => item.location).filter(Boolean)));

  const filteredItems = items.filter(item => {
    if (modelFilter && item.model !== modelFilter) return false;
    if (categoryFilter && item.category !== categoryFilter) return false;
    if (!debouncedSearchQuery) return true;
    const q = debouncedSearchQuery.toLowerCase();
    return (
      item.item_name.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      (item.model && item.model.toLowerCase().includes(q)) ||
      (item.item_unique_id && item.item_unique_id.toLowerCase().includes(q))
    );
  });

  const sortedItems = [...filteredItems].sort((a, b) => a.display_order - b.display_order);

  const [sortConfig, setSortConfig] = useState({ key: '', direction: '' });
  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
    const sorted = [...items].sort((a, b) => {
      const aVal = a[key] || a.display_order;
      const bVal = b[key] || b.display_order;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return direction === 'ascending' ? aVal - bVal : bVal - aVal;
      } else {
        const aStr = aVal?.toString().toLowerCase() || '';
        const bStr = bVal?.toString().toLowerCase() || '';
        if (aStr < bStr) return direction === 'ascending' ? -1 : 1;
        if (aStr > bStr) return direction === 'ascending' ? 1 : -1;
        return 0;
      }
    });
    setItems(sorted);
  };

  // ------------------------------ Handle Star Toggle ------------------------------
  const handleToggleStar = async (itemId) => {
    try {
      const response = await fetch(`http://localhost:5000/admin-dashboard/items/${itemId}/update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ starred: !items.find(it => it.item_id === itemId).starred })
      });
      if (!response.ok) {
        const errorData = await response.json();
        alert(`Failed to update star: ${errorData.message}`);
        return;
      }
      showNotification("Star updated successfully.", "green");
      fetchItems();
    } catch (err) {
      console.error('Error updating star:', err);
      alert('An error occurred while updating the star.');
    }
  };

  // ------------------------------ Editable Functions for Dropdowns ------------------------------
  const handleSiteNameChange = (itemId, newSiteName) => {
    setSiteNames(prev => ({ ...prev, [itemId]: newSiteName }));
    const updatedSites = Object.values(siteNames);
    localStorage.setItem('siteNames', JSON.stringify(updatedSites));
  };

  const handlePriceChange = (itemId, newPrice) => {
    if (userId !== 2) return;
    if (isNaN(newPrice)) return;
    setPrices(prev => ({ ...prev, [itemId]: newPrice }));
  };

  const handleRemarksChange = (itemId, newRemarks) => {
    setRemarks(prev => {
      const updated = { ...prev, [itemId]: newRemarks };
      localStorage.setItem('itemRemarks', JSON.stringify(updated));
      return updated;
    });
  };

  const handleAuditDateChange = (itemId, newDate) => {
    if (userId !== 2) return;
    if (!newDate) return;
    setAuditDates(prev => ({ ...prev, [itemId]: new Date(newDate).toISOString() }));
  };

  const handleUnitChange = (itemId, newUnit) => {
    if (userId !== 2) return;
    setUnits(prev => ({ ...prev, [itemId]: newUnit }));
  };

  // ------------------------------ Unified Quantity Management ------------------------------
  const quanitty = (itemId, delta) => {
    setQuantityValue(prev => {
      const current = parseInt(prev[itemId]) || 0;
      const newQuantity = current + delta;
      if (newQuantity < 0) return prev;
      if (userId !== 2) {
        const storedQuantities = JSON.parse(localStorage.getItem("userQuantities") || "{}");
        storedQuantities[itemId] = newQuantity;
        localStorage.setItem("userQuantities", JSON.stringify(storedQuantities));
      }
      return { ...prev, [itemId]: newQuantity };
    });
  };

  // ------------------------------ Editable Field Handlers ------------------------------
  const handleCategoryChange = (itemId, newCategory) => {
    setEditableCategories(prev => ({ ...prev, [itemId]: newCategory }));
  };

  const handleItemNameChange = (itemId, newName) => {
    setEditableItemNames(prev => ({ ...prev, [itemId]: newName }));
  };

  const handleModelChange = (itemId, newModel) => {
    setEditableModels(prev => ({ ...prev, [itemId]: newModel }));
  };

  const handleLocationChange = (itemId, newLocation) => {
    setEditableLocations(prev => ({ ...prev, [itemId]: newLocation }));
  };

  // ------------------------------ Action Buttons ------------------------------
  // Enable full edit mode for admin
  const enableFullEditMode = (itemId) => {
    setFullEditMode(prev => ({ ...prev, [itemId]: true }));
    setRowStatus(prev => ({ ...prev, [itemId]: "editing" }));
  };

  // For non-admin quantity update
  const handleConfirm = async (itemId) => {
    const item = items.find(it => it.item_id === itemId);
    if (!item) return;
    const oldQuantity = item.quantity;
    const newQuantity = quantityValue[itemId];
    if (oldQuantity === newQuantity)
      return showNotification('No change', 'info');
  
    const diff = newQuantity - oldQuantity;
    const diffValue = Math.abs(diff);
    const changeText = diff > 0 ? `${diffValue} added` : `${diffValue} removed`;
    const notifType = diff > 0 ? 'green' : 'red';
  
    const payload = { newQuantity };
    if (userId === 2) {
      Object.assign(payload, {
        item_unique_id: uniqueIds[itemId],
        category: editableCategories[itemId],
        item_name: editableItemNames[itemId],
        model: editableModels[itemId],
        site_name: siteNames[itemId],
        unit: units[itemId],
        location: editableLocations[itemId],
        price: prices[itemId],
        remarks: remarks[itemId],
        audit_date: auditDates[itemId]
      });
    } else {
      Object.assign(payload, {
        site_name: siteNames[itemId],
        remarks: remarks[itemId]
      });
    }
  
    try {
      const response = await fetch(`http://localhost:5000/admin-dashboard/items/${itemId}/update`, {
        method: 'PATCH',
        headers: { 'ngrok-skip-browser-warning': '1', 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errorData = await response.json();
        alert(`Failed to update item: ${errorData.message}`);
        return;
      }
      const result = await response.json();
      setItems(prev => prev.map(it => (it.item_id === itemId ? result.item : it)));
      const message = `${userId === 2 ? "Admin" : "User"} updated "${result.item.item_name}" (Site: ${siteNames[itemId]}, Remarks: ${remarks[itemId]}): quantity changed from ${oldQuantity} to ${newQuantity} (${changeText})`;
      showNotification(message, notifType);
    } catch (err) {
      console.error(err);
      showNotification('Error updating quantity — please try again', 'red');
    }
  };
  const handleSaveFullEdit = async (itemId) => {
    const oldItem = items.find(it => it.item_id === itemId);
    const payload = {
      item_unique_id: uniqueIds[itemId],
      unit: units[itemId],
      price: prices[itemId],
      audit_date: auditDates[itemId] || null,
      remarks: remarks[itemId],
      site_name: siteNames[itemId],
      item_name: editableItemNames[itemId],
      category: editableCategories[itemId],
      model: editableModels[itemId],
      location: editableLocations[itemId],
      newQuantity: quantityValue[itemId]
    };
  
    if (payload.item_unique_id) {
      const duplicate = items.find(it => it.item_id !== itemId && it.item_unique_id === payload.item_unique_id);
      if (duplicate) {
        alert('Error: Duplicate Unique ID detected. Please use a different Unique ID.');
        return;
      }
    }
  
    try {
      const response = await fetch(`http://localhost:5000/admin-dashboard/items/${itemId}/update`, {
        method: 'PATCH',
        headers: {
          'ngrok-skip-browser-warning': '1',
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errorData = await response.json();
        alert(`Failed to update item: ${errorData.message}`);
        return;
      }
      const result = await response.json();
      setItems(prev => prev.map(it => (it.item_id === itemId ? result.item : it)));
      // Update the quantity state for admin to reflect the exact new value
      setQuantityValue(prev => ({ ...prev, [itemId]: result.item.quantity }));
      setUniqueIds(prev => ({ ...prev, [itemId]: result.item.item_unique_id }));
      setUnits(prev => ({ ...prev, [itemId]: result.item.unit }));
      setPrices(prev => ({ ...prev, [itemId]: result.item.price }));
      setAuditDates(prev => ({ ...prev, [itemId]: result.item.audit_date }));
      setRemarks(prev => ({ ...prev, [itemId]: result.item.remarks }));
      setSiteNames(prev => ({ ...prev, [itemId]: result.item.site_name }));
      setEditableItemNames(prev => ({ ...prev, [itemId]: result.item.item_name }));
      setEditableCategories(prev => ({ ...prev, [itemId]: result.item.category }));
      setEditableModels(prev => ({ ...prev, [itemId]: result.item.model }));
      setEditableLocations(prev => ({ ...prev, [itemId]: result.item.location }));
      setFullEditMode(prev => ({ ...prev, [itemId]: false }));
      setRowStatus(prev => ({ ...prev, [itemId]: "saved" }));
  
      const oldQuantity = oldItem.quantity;
      const newQuantity = result.item.quantity;
      const diff = newQuantity - oldQuantity;
      const diffValue = Math.abs(diff);
      const changeText = diff > 0 ? `${diffValue} added` : `${diffValue} removed`;
      const notifType = diff > 0 ? 'green' : (diff < 0 ? 'red' : 'info');
      const message = `Admin updated "${result.item.item_name}" (Site: ${result.item.site_name}, Remarks: ${result.item.remarks}): quantity changed from ${oldQuantity} to ${newQuantity} (${changeText})`;
      showNotification(message, notifType);
    } catch (err) {
      console.error('Error updating item in full edit mode:', err);
      alert('An error occurred while updating the item.');
    }
  };
  
  const cancelFullEditMode = (itemId) => {
    setFullEditMode(prev => ({ ...prev, [itemId]: false }));
    const item = items.find(it => it.item_id === itemId);
    if (item) {
      setUniqueIds(prev => ({ ...prev, [itemId]: item.item_unique_id || '' }));
      setUnits(prev => ({ ...prev, [itemId]: item.unit || '' }));
      setPrices(prev => ({ ...prev, [itemId]: item.price ?? 0 }));
      setAuditDates(prev => ({ ...prev, [itemId]: item.audit_date || '' }));
      setRemarks(prev => ({ ...prev, [itemId]: item.remarks || '' }));
      setSiteNames(prev => ({ ...prev, [itemId]: item.site_name || '' }));
      setEditableItemNames(prev => ({ ...prev, [itemId]: item.item_name || '' }));
      setEditableCategories(prev => ({ ...prev, [itemId]: item.category || '' }));
      setEditableModels(prev => ({ ...prev, [itemId]: item.model || '' }));
      setEditableLocations(prev => ({ ...prev, [itemId]: item.location || '' }));
      setRowStatus(prev => ({ ...prev, [itemId]: "default" }));
      setQuantityValue(prev => ({ ...prev, [item.item_id]: item.quantity }));
    }
  };

  const handleEditAll = () => {
    const newFullEditMode = {};
    const newRowStatus = {};
    items.forEach(item => {
      newFullEditMode[item.item_id] = true;
      newRowStatus[item.item_id] = "editing";
    });
    setFullEditMode(newFullEditMode);
    setRowStatus(newRowStatus);
    setEditAll(true);
  };

  const handleCancelEditAll = () => {
    const newFullEditMode = {};
    const newRowStatus = {};
    items.forEach(item => {
      newFullEditMode[item.item_id] = false;
      newRowStatus[item.item_id] = "default";
    });
    setFullEditMode(newFullEditMode);
    setRowStatus(newRowStatus);
    setEditAll(false);
  };

  // ------------------------------ Highlight Search Text ------------------------------
  const highlightSearchText = (text, query) => {
    if (!query) return text;
    const regex = new RegExp(`(${query})`, 'gi');
    return text.split(regex).map((part, index) =>
      regex.test(part) ? <span key={index} className="highlight">{part}</span> : part
    );
  };

  // ------------------------------ Report ------------------------------
  const handleOpenReportTab = () => {
    window.open('/report-view', '_blank');
  };

  // ------------------------------ Dialog Handlers ------------------------------
  const handleOpenAddDialog = () => setOpenAddDialog(true);
  const handleCloseAddDialog = () => setOpenAddDialog(false);

  const handleAddItem = (newItem) => {
    setItems(prev => [...prev, newItem]);
    setRemarks(prev => ({ ...prev, [newItem.item_id]: newItem.remarks || '' }));
    setQuantityValue(prev => ({ ...prev, [newItem.item_id]: newItem.quantity }));
    setUniqueIds(prev => ({ ...prev, [newItem.item_id]: newItem.item_unique_id || '' }));
    setAuditDates(prev => ({ ...prev, [newItem.item_id]: newItem.audit_date || '' }));
    setPrices(prev => ({ ...prev, [newItem.item_id]: newItem.price }));
    setUnits(prev => ({ ...prev, [newItem.item_id]: newItem.unit || '' }));
    setSiteNames(prev => ({ ...prev, [newItem.item_id]: newItem.site_name || '' }));
    setEditableItemNames(prev => ({ ...prev, [newItem.item_id]: newItem.item_name || '' }));
    setEditableCategories(prev => ({ ...prev, [newItem.item_id]: newItem.category || '' }));
    setEditableModels(prev => ({ ...prev, [newItem.item_id]: newItem.model || '' }));
    setEditableLocations(prev => ({ ...prev, [newItem.item_id]: newItem.location || '' }));
  };

  const handleDeleteItems = async (selectedItemIds) => {
    if (!selectedItemIds || !Array.isArray(selectedItemIds) || selectedItemIds.length === 0) {
      alert('No items selected for deletion.');
      return;
    }
    const numericIds = selectedItemIds.map(id => Number(id));
    try {
      const response = await fetch('http://localhost:5000/admin-dashboard/items/archive', {
        method: 'PATCH',
        headers: {
          'ngrok-skip-browser-warning': '1',
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ itemIds: numericIds })
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to archive items:', errorText);
        alert('Failed to archive items');
        return;
      }
      const data = await response.json();
      alert(data.message || 'Items archived successfully');
      setItems(prev => prev.filter(it => !numericIds.includes(it.item_id)));
    } catch (err) {
      console.error('Error archiving items:', err);
      alert('An error occurred while archiving the items.');
    }
  };

  const handleConfirmAll = async () => {
    try {
      const updatePromises = items.map(item => {
        const payload = { newQuantity: quantityValue[item.item_id] };
        if (userId === 2) {
          Object.assign(payload, {
            item_unique_id: uniqueIds[item.item_id],
            category: editableCategories[item.item_id],
            item_name: editableItemNames[item.item_id],
            model: editableModels[item.item_id],
            site_name: siteNames[item.item_id],
            unit: units[item.item_id],
            location: editableLocations[item.item_id],
            price: prices[item.item_id],
            remarks: remarks[item.item_id],
            audit_date: auditDates[item.item_id] || null
          });
        }
        return fetch(`http://localhost:5000/admin-dashboard/items/${item.item_id}/update`, {
          method: 'PATCH',
          headers: { 'ngrok-skip-browser-warning': '1', 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        })
          .then(async res => {
            if (!res.ok) {
              const err = await res.json();
              throw new Error(`Item ${item.item_id} failed: ${err.message}`);
            }
            return res.json();
          });
      });

      const results = await Promise.all(updatePromises);
      setItems(results.map(r => r.item));
      showNotification("All items confirmed successfully.", "green");
    } catch (err) {
      console.error("Error confirming all items:", err);
      alert(err.message || "An error occurred while confirming all items.");
    }
  };

  const columnWidths = {
    display_order: '4%',
    item_unique_id: '5%',
    category: '25%',
    item_name: '15%',
    model: '8%',
    location: '8%',
    site_name: '8%',
    quantity: '7%',
    price: '7%',
    unit: '5%',
    reserved_quantity: '8%',
    remarks: '6%',
    audit_date: '10%',
    actions: '5%',
  };

  // ------------------------------ Render Component ------------------------------
  return (
    <div className="admin-dashboard-container">
      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}

      {openAddDialog && (
        <AddItems open={openAddDialog} onClose={handleCloseAddDialog} onAddItem={handleAddItem} />
      )}

      {openDeleteDialog && (
        <DeleteItems
          open={openDeleteDialog}
          items={items}
          onDelete={handleDeleteItems}
          onClose={() => setOpenDeleteDialog(false)}
        />
      )}

      {openManageRemarks && (
        <ManageRemarks
          open={openManageRemarks}
          onClose={() => setOpenManageRemarks(false)}
          onUpdate={newOptions => setRemarksOptions(newOptions)}
        />
      )}

      {openManageSites && (
        <ManageSite
          open={openManageSites}
          onClose={() => setOpenManageSites(false)}
          onUpdate={newOptions => setSiteNamesOptions(newOptions)}
        />
      )}

      <div className="search-container">
        <input
          type="text"
          className="search-input"
          placeholder="Search items..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        {userId === 2 && (
          <div className="top-buttons">
            <button className="btn" onClick={handleOpenAddDialog}>Add Item</button>
            <button className="btn" onClick={() => setOpenDeleteDialog(true)}>Delete Item</button>
            <button className="btn" onClick={handleOpenReportTab}>Generate Report</button>
            <button className="btn" onClick={() => setOpenManageRemarks(true)}>Manage Remarks</button>
            <button className="btn" onClick={() => setOpenManageSites(true)}>Manage Sites</button>
          </div>
        )}
      </div>

      <div className="dropdown-toggle">
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
          <option value="">Filter With Categories</option>
          {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={modelFilter} onChange={e => setModelFilter(e.target.value)}>
          <option value="">Filter With Models</option>
          {uniqueModels.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      <datalist id="categoryOptions">
        {uniqueCategories.map((cat, index) => (
          <option key={index} value={cat} />
        ))}
      </datalist>
      <datalist id="locationOptions">
        {uniqueLocations.map((loc, index) => (
          <option key={index} value={loc} />
        ))}
      </datalist>

      {error && <p className="error-message">{error}</p>}

      <div className="table-container">
        <table className="admin-dashboard-table">
          <thead>
            <tr>
              {columns.map(col => (
                (!col.adminOnly || userId === 2) && visibleColumns[col.key] && (
                  <th
                    key={col.key}
                    style={{ width: columnWidths[col.key], cursor: col.sortable ? 'pointer' : 'default' }}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    {col.label}
                    {sortConfig.key === col.key &&
                      (sortConfig.direction === 'ascending' ? <FaChevronUp /> : <FaChevronDown />)}
                  </th>
                )
              ))}
              <th style={{ width: columnWidths.actions }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedItems.map(item => {
              const rowClasses = [
                item.starred ? 'starred-row' : '',
                rowStatus[item.item_id] === "editing" ? "editing-row" : "",
                rowStatus[item.item_id] === "saved" ? "saved-row" : ""
              ].filter(Boolean).join(" ");
              return (
                <tr key={item.item_id} className={rowClasses}>
                  {visibleColumns.display_order && (
                    <td style={{ width: columnWidths.display_order }}>
                      {item.display_order}
                      <button className="star-button" onClick={() => handleToggleStar(item.item_id)}>
                        <FaStar color={item.starred ? '#f1c40f' : '#ccc'} />
                      </button>
                    </td>
                  )}
                  {visibleColumns.item_unique_id && (
                    <td style={{ width: columnWidths.item_unique_id }}>
                      {userId === 2 && fullEditMode[item.item_id] ? (
                        <input
                          type="text"
                          value={uniqueIds[item.item_id] || ''}
                          onChange={e => setUniqueIds(prev => ({ ...prev, [item.item_id]: e.target.value }))}
                        />
                      ) : (
                        <span>{uniqueIds[item.item_id]}</span>
                      )}
                    </td>
                  )}
                  {visibleColumns.category && (
                    <td style={{ width: columnWidths.category }}>
                      {userId === 2 && fullEditMode[item.item_id] ? (
                        <select
                          value={editableCategories[item.item_id] || ''}
                          onChange={e => handleCategoryChange(item.item_id, e.target.value)}
                        >
                          {uniqueCategories.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <span>{editableCategories[item.item_id]}</span>
                      )}
                    </td>
                  )}
                  {visibleColumns.item_name && (
                    <td style={{ width: columnWidths.item_name }}>
                      {userId === 2 && fullEditMode[item.item_id] ? (
                        <input
                          type="text"
                          value={editableItemNames[item.item_id] || ''}
                          onChange={e => handleItemNameChange(item.item_id, e.target.value)}
                        />
                      ) : (
                        highlightSearchText(item.item_name, debouncedSearchQuery)
                      )}
                    </td>
                  )}
                  {visibleColumns.model && (
                    <td style={{ width: columnWidths.model }}>
                      {userId === 2 && fullEditMode[item.item_id] ? (
                        <input
                          type="text"
                          value={editableModels[item.item_id] || ''}
                          onChange={e => handleModelChange(item.item_id, e.target.value)}
                        />
                      ) : (
                        <span>{item.model}</span>
                      )}
                    </td>
                  )}
                  {visibleColumns.site_name && (
                    <td style={{ width: columnWidths.site_name }}>
                      {(userId !== 2) || (userId === 2 && fullEditMode[item.item_id]) ? (
                        <select
                          value={siteNames[item.item_id] || ''}
                          onChange={e => handleSiteNameChange(item.item_id, e.target.value)}
                        >
                          {siteNamesOptions.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <span>{siteNames[item.item_id]}</span>
                      )}
                    </td>
                  )}
                  {visibleColumns.unit && (
                    <td style={{ width: columnWidths.unit }}>
                      {userId === 2 && fullEditMode[item.item_id] ? (
                        <input
                          type="text"
                          value={units[item.item_id] || ''}
                          onChange={e => handleUnitChange(item.item_id, e.target.value)}
                          placeholder="Unit"
                        />
                      ) : (
                        <span>{units[item.item_id]}</span>
                      )}
                    </td>
                  )}
                  {visibleColumns.location && (
                    <td style={{ width: columnWidths.location }}>
                      {userId === 2 && fullEditMode[item.item_id] ? (
                        <select
                          value={editableLocations[item.item_id] || ''}
                          onChange={e => handleLocationChange(item.item_id, e.target.value)}
                        >
                          {uniqueLocations.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <span>{editableLocations[item.item_id]}</span>
                      )}
                    </td>
                  )}
                  <td style={{ width: columnWidths.quantity }}>
                    <div className="quantity-edit">
                      <button onClick={() => quanitty(item.item_id, -1)}>-</button>
                      <input
                        type="number"
                        value={quantityValue[item.item_id] || ''}
                        onChange={e => {
                          const newValue = e.target.value === "" ? 0 : Number(e.target.value);
                          setQuantityValue(prev => ({ ...prev, [item.item_id]: newValue }));
                        }}
                      />
                      <button onClick={() => quanitty(item.item_id, 1)}>+</button>
                    </div>
                  </td>
                  {visibleColumns.price && (
                    <td style={{ width: columnWidths.price }}>
                      {userId === 2 && fullEditMode[item.item_id] ? (
                        <input
                          type="text"
                          value={prices[item.item_id] !== undefined ? `RM ${prices[item.item_id]}` : ''}
                          onChange={e => {
                            let val = e.target.value;
                            if (val.toUpperCase().startsWith('RM ')) val = val.slice(3);
                            handlePriceChange(item.item_id, parseFloat(val) || 0);
                          }}
                          className="price-input"
                        />
                      ) : (
                        <span>{prices[item.item_id] !== undefined ? `RM ${prices[item.item_id]}` : ''}</span>
                      )}
                    </td>
                  )}
                  {visibleColumns.reserved_quantity && (
                    <td style={{ width: columnWidths.reserved_quantity }}>
                      {item.reserved_quantity}
                    </td>
                  )}
                  {visibleColumns.remarks && (
                    <td style={{ width: columnWidths.remarks }}>
                      {(userId !== 2) || (userId === 2 && fullEditMode[item.item_id]) ? (
                        <select
                          value={remarks[item.item_id] || ''}
                          onChange={e => handleRemarksChange(item.item_id, e.target.value)}
                        >
                          {remarksOptions.length > 0
                            ? remarksOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)
                            : <option value="">No options</option>}
                        </select>
                      ) : (
                        <span>{remarks[item.item_id]}</span>
                      )}
                    </td>
                  )}
                  {userId === 2 && visibleColumns.audit_date && (
                    <td style={{ width: columnWidths.audit_date }}>
                      {fullEditMode[item.item_id] ? (
                        <input
                          type="datetime-local"
                          value={formatForInput(auditDates[item.item_id])}
                          onChange={e => handleAuditDateChange(item.item_id, e.target.value)}
                        />
                      ) : (
                        <span>{convertToMYTDisplay(auditDates[item.item_id])}</span>
                      )}
                    </td>
                  )}
                  <td style={{ width: columnWidths.actions }}>
                    {userId === 2 ? (
                      fullEditMode[item.item_id] ? (
                        <div className="action-buttons">
                          <button onClick={() => handleSaveFullEdit(item.item_id)} className="action-button">Save</button>
                          <button onClick={() => cancelFullEditMode(item.item_id)} className="action-button">Cancel</button>
                        </div>
                      ) : (
                        <div className="action-buttons">
                          <button onClick={() => enableFullEditMode(item.item_id)} className="action-button">Edit</button>
                        </div>
                      )
                    ) : (
                      <div className="action-buttons">
                        <button onClick={() => handleConfirm(item.item_id)} className="action-button">Save</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bulk-actions">
        <button className="bulk-btn" onClick={handleConfirmAll}>Confirm All Updates</button>
        {editAll ? (
          <button className="bulk-btn" onClick={handleCancelEditAll}>Cancel Edit All</button>
        ) : (
          <button className="bulk-btn" onClick={handleEditAll}>Edit All</button>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
