
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
    { key: "item_id", label: "Item ID", sortable: true },
    { key: "category", label: "Category", sortable: true },
    { key: "item_name", label: "Item Name", sortable: true },
    { key: "model", label: "Model", sortable: true },
    { key: "item_unique_id", label: "Unique ID", sortable: true },
    { key: "quantity", label: "Quantity", sortable: true },
    { key: "reserved_quantity", label: "Reservation", sortable: true },
    { key: "location", label: "Location", sortable: true },
    { key: "site_name", label: "Site Name", sortable: true },
    { key: "unit", label: "Unit", sortable: true },
    { key: "price", label: "Price", sortable: true },
    { key: "remarks", label: "Remarks", sortable: true },
    { key: "audit_date", label: "Key-in Date", sortable: true, adminOnly: true },
    { key: "quantity_changed", label: "Quantity Changed", sortable: false },
    { key: "confirmation", label: "Confirmation", sortable: false }
  ];

  // Set initial visibility: non-admin users do not see adminOnly columns by default.
  const initialVisible = {};
  columns.forEach(col => {
    if (col.adminOnly && userId !== 2) {
      initialVisible[col.key] = false;
    } else {
      initialVisible[col.key] = true;
    }
  });
  const [visibleColumns, setVisibleColumns] = useState(initialVisible);

  const handleResetColumns = () => {
    setVisibleColumns(initialVisible);
  };

  // ------------------------------ Dropdown State ------------------------------
  const [showColumnDropdown, setShowColumnDropdown] = useState(false);
  const dropdownRef = useRef(null);
  const toggleColumnDropdown = () => setShowColumnDropdown(prev => !prev);

  // Close the dropdown if clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowColumnDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ------------------------------ Other States ------------------------------
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  // Searching & Debouncing
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);

  // Dialog states
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [openManageRemarks, setOpenManageRemarks] = useState(false);
  const [openManageSites, setOpenManageSites] = useState(false);

  // Editable field states
  const [inputValue, setInputValue] = useState({});
  const [remarks, setRemarks] = useState({});
  const [prices, setPrices] = useState({});
  const [siteNames, setSiteNames] = useState({});
  const [units, setUnits] = useState({});
  const [uniqueIds, setUniqueIds] = useState({});
  const [quantityValue, setQuantityValue] = useState({});

  // Audit Date (Key-in Date) - only for admin
  const [auditDates, setAuditDates] = useState({});

  const [confirmed, setConfirmed] = useState({});
  const [editMode, setEditMode] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: '', direction: '' });
  const [starred, setStarred] = useState({});

  // Options for remarks and site names
  const [remarksOptions, setRemarksOptions] = useState([]);
  const [siteNamesOptions, setSiteNamesOptions] = useState([]);

  // ------------------------------ Helper Functions ------------------------------
  const convertToMYTDisplay = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' });
  };

  const formatForInput = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const options = {
      timeZone: 'Asia/Kuala_Lumpur',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    };
    const parts = new Intl.DateTimeFormat('en-GB', options).formatToParts(date);
    const day = parts.find((p) => p.type === 'day').value;
    const month = parts.find((p) => p.type === 'month').value;
    const year = parts.find((p) => p.type === 'year').value;
    const hour = parts.find((p) => p.type === 'hour').value;
    const minute = parts.find((p) => p.type === 'minute').value;
    return `${year}-${month}-${day}T${hour}:${minute}`;
  };

  // ------------------------------ Fetch & Initialize Data ------------------------------
  const fetchItems = async () => {
    try {
      const response = await fetch('https://1a11-211-25-11-204.ngrok-free.app/admin-dashboard/items', {
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
    setInputValues(fetchedItems);
    setRemarksValues(fetchedItems);
    setPricesValues(fetchedItems);
    setSiteNamesValues(fetchedItems);
    setUnitsValues(fetchedItems);
    setQuantityValues(fetchedItems);
    setUniqueIdsValues(fetchedItems);
    setAuditDatesValues(fetchedItems);
    const initStarred = fetchedItems.reduce((acc, item) => {
      acc[item.item_id] = item.starred || false;
      return acc;
    }, {});
    setStarred(initStarred);
  };

  const setInputValues = (fetchedItems) => {
    const initial = fetchedItems.reduce((acc, item) => {
      acc[item.item_id] = 0;
      return acc;
    }, {});
    setInputValue(initial);
  };

  const setRemarksValues = (fetchedItems) => {
    const initial = fetchedItems.reduce((acc, item) => {
      acc[item.item_id] = item.remarks || '';
      return acc;
    }, {});
    setRemarks(initial);
  };

  const setPricesValues = (fetchedItems) => {
    const initial = fetchedItems.reduce((acc, item) => {
      acc[item.item_id] = item.price ?? 0;
      return acc;
    }, {});
    setPrices(initial);
  };

  const setSiteNamesValues = (fetchedItems) => {
    const initial = fetchedItems.reduce((acc, item) => {
      acc[item.item_id] = item.site_name || '';
      return acc;
    }, {});
    setSiteNames(initial);
  };

  const setUnitsValues = (fetchedItems) => {
    const initial = fetchedItems.reduce((acc, item) => {
      acc[item.item_id] = item.unit || '';
      return acc;
    }, {});
    setUnits(initial);
  };

  const setQuantityValues = (fetchedItems) => {
    const initial = fetchedItems.reduce((acc, item) => {
      acc[item.item_id] = item.quantity;
      return acc;
    }, {});
    setQuantityValue(initial);
  };

  const setUniqueIdsValues = (fetchedItems) => {
    const initial = fetchedItems.reduce((acc, item) => {
      acc[item.item_id] = item.item_unique_id || '';
      return acc;
    }, {});
    setUniqueIds(initial);
  };

  const setAuditDatesValues = (fetchedItems) => {
    const initial = fetchedItems.reduce((acc, item) => {
      acc[item.item_id] = item.audit_date || '';
      return acc;
    }, {});
    setAuditDates(initial);
  };

  const persistConfirmed = (confirmedObj) => {
    localStorage.setItem('confirmedPrices', JSON.stringify(confirmedObj));
  };

  // ------------------------------ Searching & Filtering ------------------------------
  const filteredItems = items.filter(item => {
    if (!debouncedSearchQuery) return true;
    const q = debouncedSearchQuery.toLowerCase();
    return (
      item.item_name.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      (item.model && item.model.toLowerCase().includes(q)) ||
      (item.item_unique_id && item.item_unique_id.toLowerCase().includes(q))
    );
  });

  // ------------------------------ Handle Star Toggle ------------------------------
  const handleToggleStar = async itemId => {
    const newStarred = !starred[itemId];
    try {
      const response = await fetch(
        `https://1a11-211-25-11-204.ngrok-free.app/admin-dashboard/items/${itemId}/update`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ starred: newStarred })
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        alert(`Failed to update star: ${errorData.message}`);
        return;
      }
      fetchItems();
    } catch (err) {
      console.error('Error updating star:', err);
      alert('An error occurred while updating the star.');
    }
  };

  // ------------------------------ Sorting ------------------------------
  const handleSort = key => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
    const sorted = [...items].sort((a, b) => {
      const aStar = starred[a.item_id];
      const bStar = starred[b.item_id];
      if (aStar && !bStar) return -1;
      if (!aStar && bStar) return 1;

      const aVal = a[key];
      const bVal = b[key];

      if (key === 'location') {
        const aMatchesDash = aVal === dashboardLocation;
        const bMatchesDash = bVal === dashboardLocation;
        if (aMatchesDash && !bMatchesDash) return direction === 'ascending' ? -1 : 1;
        if (!aMatchesDash && bMatchesDash) return direction === 'ascending' ? 1 : -1;
      }

      const aNum = parseFloat(aVal);
      const bNum = parseFloat(bVal);
      const aIsNumber = !isNaN(aNum);
      const bIsNumber = !isNaN(bNum);
      if (aIsNumber && bIsNumber) {
        if (aNum < bNum) return direction === 'ascending' ? -1 : 1;
        if (aNum > bNum) return direction === 'ascending' ? 1 : -1;
        return 0;
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

  // ------------------------------ Stepper & Input Handlers ------------------------------
  const handleQuantityDecrement = itemId => {
    setInputValue(prev => ({ ...prev, [itemId]: (prev[itemId] || 0) - 1 }));
  };

  const handleQuantityIncrement = itemId => {
    setInputValue(prev => ({ ...prev, [itemId]: (prev[itemId] || 0) + 1 }));
  };

  const handleInputChange = (itemId, newQuantity) => {
    if (isNaN(newQuantity)) return;
    setInputValue(prev => ({ ...prev, [itemId]: newQuantity }));
  };

  const handleRemarksChange = (itemId, newRemarks) => {
    setRemarks(prev => {
      const updated = { ...prev, [itemId]: newRemarks };
      localStorage.setItem('itemRemarks', JSON.stringify(updated));
      return updated;
    });
  };

  const handlePriceChange = (itemId, newPrice) => {
    if (userId !== 2) return;
    if (isNaN(newPrice)) return;
    setPrices(prev => ({ ...prev, [itemId]: newPrice }));
  };

  const handleSiteNameChange = (itemId, newSiteName) => {
    setSiteNames(prev => ({ ...prev, [itemId]: newSiteName }));
    const updatedSites = Object.values(siteNames);
    localStorage.setItem('siteNames', JSON.stringify(updatedSites));
  };

  const handleUnitChange = (itemId, newUnit) => {
    if (userId !== 2) return;
    setUnits(prev => ({ ...prev, [itemId]: newUnit }));
  };

  const handleUniqueIdChange = (itemId, newUniqueId) => {
    setUniqueIds(prev => ({ ...prev, [itemId]: newUniqueId }));
  };

  const handleAuditDateChange = (itemId, newDate) => {
    if (userId !== 2) return;
    if (!newDate) return;
    const localDate = new Date(newDate);
    const utcDate = new Date(localDate.getTime() - localDate.getTimezoneOffset() * 60000);
    setAuditDates(prev => ({ ...prev, [itemId]: utcDate.toISOString() }));
  };

  // ------------------------------ Toggle & Save Edits ------------------------------
  const toggleEditMode = (itemId, field) => {
    setEditMode(prev => {
      const current = prev[itemId] || {};
      return { ...prev, [itemId]: { ...current, [field]: !current[field] } };
    });
  };

  const handleSaveField = async (itemId, field, value) => {
    if (field === 'item_unique_id') {
      const duplicate = items.find(it => it.item_id !== itemId && it.item_unique_id === value);
      if (duplicate) {
        alert('Error: Duplicate Unique ID detected. Please use a different Unique ID.');
        return;
      }
    }
    const payload = { [field]: value };
    try {
      const response = await fetch(
        `https://1a11-211-25-11-204.ngrok-free.app/admin-dashboard/items/${itemId}/update`,
        {
          method: 'PATCH',
          headers: {
            'ngrok-skip-browser-warning': '1',
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify(payload)
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        alert(`Failed to update ${field}: ${errorData.message}`);
        return;
      }
      const result = await response.json();
      setItems(prev => prev.map(it => (it.item_id === itemId ? result.item : it)));
      if (field === 'remarks') {
        setRemarks(prev => ({ ...prev, [itemId]: result.item.remarks }));
      } else if (field === 'price') {
        setPrices(prev => ({ ...prev, [itemId]: result.item.price }));
      } else if (field === 'site_name') {
        setSiteNames(prev => ({ ...prev, [itemId]: result.item.site_name }));
      } else if (field === 'unit') {
        setUnits(prev => ({ ...prev, [itemId]: result.item.unit }));
      } else if (field === 'item_unique_id') {
        setUniqueIds(prev => ({ ...prev, [itemId]: result.item.item_unique_id }));
      } else if (field === 'audit_date') {
        setAuditDates(prev => ({ ...prev, [itemId]: result.item.audit_date }));
      }
      toggleEditMode(
        itemId,
        field === 'site_name'
          ? 'siteName'
          : field === 'item_unique_id'
          ? 'uniqueId'
          : field === 'audit_date'
          ? 'auditDate'
          : field
      );
      alert(`${field.charAt(0).toUpperCase() + field.slice(1)} updated successfully.`);
    } catch (err) {
      console.error(`Error updating ${field}:`, err);
      alert(`An error occurred while updating ${field}.`);
    }
  };

  const handleSaveQuantity = async (itemId) => {
    if (userId !== 2) return;
    const newQty = parseInt(quantityValue[itemId], 10);
    if (isNaN(newQty)) {
      alert('Invalid quantity value.');
      return;
    }
    const payload = { newQuantity: newQty };
    try {
      const response = await fetch(
        `https://1a11-211-25-11-204.ngrok-free.app/admin-dashboard/items/${itemId}/update`,
        {
          method: 'PATCH',
          headers: {
            'ngrok-skip-browser-warning': '1',
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify(payload)
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        alert(`Failed to update quantity: ${errorData.message}`);
        return;
      }
      const result = await response.json();
      setItems(prev => prev.map(item => (item.item_id === itemId ? { ...item, quantity: result.item.quantity } : item)));
      setQuantityValue(prev => ({ ...prev, [itemId]: result.item.quantity }));
      toggleEditMode(itemId, 'quantity');
      alert('Quantity updated successfully.');
    } catch (err) {
      console.error('Error updating quantity:', err);
      alert('An error occurred while updating the quantity.');
    }
  };

  // ------------------------------ Confirm Updates ------------------------------
  const handleConfirm = async (itemId) => {
    const quantityChangeRaw = inputValue[itemId] || 0;
    const quantityChange = parseInt(quantityChangeRaw, 10);
    if (isNaN(quantityChange)) {
      alert('Quantity change must be an integer.');
      return;
    }
    const updatedRemarks = remarks[itemId] || '';
    if (!updatedRemarks) {
      alert('No remarks provided. Update skipped.');
      return;
    }
    const submittedPrice = prices[itemId] ? parseFloat(prices[itemId]) : null;
    const updatedSiteName = siteNames[itemId] || '';
    const updatedUnit = units[itemId] !== undefined ? units[itemId] : '';

    const payload = {
      remarks: updatedRemarks,
      quantityChange,
      site_name: updatedSiteName,
      unit: updatedUnit
    };
    if (userId === 2 && submittedPrice !== null) {
      payload.price = submittedPrice;
    }

    try {
      const response = await fetch(
        `https://1a11-211-25-11-204.ngrok-free.app/admin-dashboard/items/${itemId}/update`,
        {
          method: 'PATCH',
          headers: {
            'ngrok-skip-browser-warning': '1',
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify(payload)
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        alert(`Failed to update item: ${errorData.message}`);
        return;
      }
      const result = await response.json();
      setItems(prev => prev.map(it => (it.item_id === itemId ? result.item : it)));
      setRemarks(prev => ({ ...prev, [itemId]: result.item.remarks }));
      setPrices(prev => ({ ...prev, [itemId]: result.item.price }));
      setSiteNames(prev => ({ ...prev, [itemId]: result.item.site_name }));
      setUnits(prev => ({ ...prev, [itemId]: result.item.unit }));
      setUniqueIds(prev => ({ ...prev, [itemId]: result.item.item_unique_id }));
      setQuantityValue(prev => ({ ...prev, [itemId]: result.item.quantity }));
      setInputValue(prev => ({ ...prev, [itemId]: 0 }));
      setConfirmed(prev => {
        const newConfirmed = { ...prev, [itemId]: true };
        persistConfirmed(newConfirmed);
        return newConfirmed;
      });
      alert(`Item ${itemId} updated successfully.`);
    } catch (err) {
      console.error('Error updating item:', err);
      alert('An error occurred while updating the item.');
    }
  };

  const handleConfirmAll = async () => {
    const updates = items.map(async item => {
      const itemId = item.item_id;
      const quantityChangeRaw = inputValue[itemId] || 0;
      const quantityChange = parseInt(quantityChangeRaw, 10);
      const updatedRemarks = remarks[itemId] || '';
      const submittedPrice = prices[item.item_id] ? parseFloat(prices[item.item_id]) : null;
      const updatedSiteName = siteNames[itemId] || '';
      const updatedUnit = units[itemId] !== undefined ? units[itemId] : '';

      if (
        quantityChange === 0 &&
        !updatedRemarks &&
        !updatedSiteName &&
        (updatedUnit === '' || updatedUnit === item.unit) &&
        submittedPrice === null
      ) {
        return null;
      }

      const payload = {
        remarks: updatedRemarks,
        quantityChange,
        site_name: updatedSiteName,
        unit: updatedUnit
      };
      if (userId === 2 && submittedPrice !== null) {
        payload.price = submittedPrice;
      }

      try {
        const response = await fetch(
          `https://1a11-211-25-11-204.ngrok-free.app/admin-dashboard/items/${itemId}/update`,
          {
            method: 'PATCH',
            headers: {
              'ngrok-skip-browser-warning': '1',
              'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(payload)
          }
        );
        if (!response.ok) {
          const errorData = await response.json();
          return { itemId, error: errorData.message };
        }
        const result = await response.json();
        setItems(prev => prev.map(it => (it.item_id === itemId ? result.item : it)));
        setInputValue(prev => ({ ...prev, [itemId]: 0 }));
        setRemarks(prev => ({ ...prev, [itemId]: result.item.remarks }));
        setPrices(prev => ({ ...prev, [itemId]: result.item.price }));
        setSiteNames(prev => ({ ...prev, [itemId]: result.item.site_name }));
        setUnits(prev => ({ ...prev, [itemId]: result.item.unit }));
        setUniqueIds(prev => ({ ...prev, [itemId]: result.item.item_unique_id }));
        setQuantityValue(prev => ({ ...prev, [itemId]: result.item.quantity }));
        setConfirmed(prev => {
          const newConfirmed = { ...prev, [itemId]: true };
          persistConfirmed(newConfirmed);
          return newConfirmed;
        });
        return { itemId, success: true };
      } catch (err) {
        return { itemId, error: err.message };
      }
    });

    const results = await Promise.all(updates);
    const errors = results.filter(res => res && res.error);
    if (errors.length > 0) {
      alert('Some items failed to update: ' + errors.map(e => `Item ${e.itemId}: ${e.error}`).join('; '));
    } else {
      alert('All applicable items updated successfully.');
    }
  };

  // ------------------------------ Fix Item IDs ------------------------------
  const handleFixItemIds = async () => {
    try {
      const response = await fetch('https://1a11-211-25-11-204.ngrok-free.app/admin-dashboard/items/fix-item-ids', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': '1'
        }
      });
      const data = await response.json();
      if (response.ok) {
        alert(data.message);
        fetchItems();
      } else {
        alert(`Failed to fix item IDs: ${data.error}`);
      }
    } catch (error) {
      console.error('Error fixing item IDs:', error);
      alert('An error occurred while fixing the item IDs.');
    }
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

  const handleAddItem = newItem => {
    setItems(prev => [...prev, newItem]);
    setRemarks(prev => ({ ...prev, [newItem.item_id]: newItem.remarks || '' }));
    setQuantityValue(prev => ({ ...prev, [newItem.item_id]: newItem.quantity }));
    setUniqueIds(prev => ({ ...prev, [newItem.item_id]: newItem.item_unique_id || '' }));
    setAuditDates(prev => ({ ...prev, [newItem.item_id]: newItem.audit_date || '' }));
    setStarred(prev => ({ ...prev, [newItem.item_id]: newItem.starred || false }));
  };

  const handleDeleteItems = async selectedItemIds => {
    if (!selectedItemIds || !Array.isArray(selectedItemIds) || selectedItemIds.length === 0) {
      alert('No items selected for deletion.');
      return;
    }
    const numericIds = selectedItemIds.map(id => Number(id));
    try {
      const response = await fetch('https://1a11-211-25-11-204.ngrok-free.app/admin-dashboard/items/archive', {
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

  // ------------------------------ Fetch Dropdown Options ------------------------------
  useEffect(() => {
    fetchRemarksOptions();
    fetchSiteOptions();
  }, []);

  const fetchRemarksOptions = async () => {
    try {
      const response = await fetch('https://1a11-211-25-11-204.ngrok-free.app/dropdown-options/remarks', {
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
      const response = await fetch('https://1a11-211-25-11-204.ngrok-free.app/dropdown-options/sites', {
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

  // ------------------------------ Render Component ------------------------------
  return (
    <div className="admin-dashboard-container">
      <div className="header-container">
        <h2 className="header-admin-dashboard">Dashboard</h2>
        {userId === 2 && (
          <div className="action-buttons">
            <button className="add-item-button" onClick={handleOpenAddDialog}>+</button>
            <button className="delete-item-button" onClick={() => setOpenDeleteDialog(true)}>-</button>
            <button className="generate-report-button" onClick={handleOpenReportTab}>
              <FaChevronDown /> Generate Report
            </button>
            <button className="manage-remarks-button" onClick={() => setOpenManageRemarks(true)}>
              Manage Remarks
            </button>
            <button className="manage-sites-button" onClick={() => setOpenManageSites(true)}>
              Manage Sites
            </button>
            <button className="fix-itemids-button" onClick={handleFixItemIds}>
              Fix Item IDs
            </button>
          </div>
        )}
      </div>

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
      </div>

      {/* Dropdown for Column Filter */}
      <div className="dropdown-container" ref={dropdownRef}>
        <button className="dropdown-toggle" onClick={toggleColumnDropdown}>
          Filter Columns {showColumnDropdown ? <FaChevronUp /> : <FaChevronDown />}
        </button>
        {showColumnDropdown && (
          <div className="dropdown-menu">
            {columns.map(col => {
              if (col.adminOnly && userId !== 2) return null;
              return (
                <div key={col.key} className="dropdown-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={visibleColumns[col.key]}
                      onChange={() =>
                        setVisibleColumns(prev => ({ ...prev, [col.key]: !prev[col.key] }))
                      }
                    />
                    {col.label}
                  </label>
                </div>
              );
            })}
            <button className="reset-columns-button" onClick={handleResetColumns}>
              Reset to Default
            </button>
          </div>
        )}
      </div>

      {error && <p className="error-message">{error}</p>}

      <div className="table-container">
        <table className="admin-dashboard-table">
          <thead>
            <tr>
              {columns.map(col => {
                if (col.adminOnly && userId !== 2) return null;
                if (!visibleColumns[col.key]) return null;
                return (
                  <th
                    key={col.key}
                    style={{ cursor: col.sortable ? 'pointer' : 'default' }}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    {col.label}{' '}
                    {sortConfig.key === col.key &&
                      (sortConfig.direction === 'ascending' ? <FaChevronUp /> : <FaChevronDown />)}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredItems.map(item => (
              <tr key={item.item_id} className={starred[item.item_id] ? 'starred-row' : ''}>
                {visibleColumns.item_id && (
                  <td>
                    {item.item_id}{' '}
                    <button className="star-button" onClick={() => handleToggleStar(item.item_id)}>
                      <FaStar className="star-icon" color={starred[item.item_id] ? '#f1c40f' : '#ccc'} />
                    </button>
                  </td>
                )}
                {visibleColumns.category && <td>{highlightSearchText(item.category, debouncedSearchQuery)}</td>}
                {visibleColumns.item_name && <td>{highlightSearchText(item.item_name, debouncedSearchQuery)}</td>}
                {visibleColumns.model && <td>{item.model ? highlightSearchText(item.model, debouncedSearchQuery) : ''}</td>}
                {visibleColumns.item_unique_id && (
                  <td>
                    {userId === 2 ? (
                      editMode[item.item_id]?.uniqueId ? (
                        <>
                          <input
                            type="text"
                            value={uniqueIds[item.item_id] || ''}
                            onChange={e => handleUniqueIdChange(item.item_id, e.target.value)}
                            placeholder="Unique ID"
                            className="unique-id-input"
                          />
                          <button className="save-button" onClick={() => handleSaveField(item.item_id, 'item_unique_id', uniqueIds[item.item_id])}>
                            Save
                          </button>
                        </>
                      ) : (
                        <>
                          <span>{uniqueIds[item.item_id] || ''}</span>
                          <button onClick={() => toggleEditMode(item.item_id, 'uniqueId')}>Edit</button>
                        </>
                      )
                    ) : (
                      <span>{uniqueIds[item.item_id] || ''}</span>
                    )}
                  </td>
                )}
                {visibleColumns.quantity && (
                  <td>
                    {userId === 2 ? (
                      editMode[item.item_id]?.quantity ? (
                        <>
                          <input
                            type="number"
                            value={quantityValue[item.item_id] || 0}
                            onChange={e => setQuantityValue(prev => ({ ...prev, [item.item_id]: e.target.value }))}
                          />
                          <button className="save-button" onClick={() => handleSaveQuantity(item.item_id)}>
                            Save
                          </button>
                        </>
                      ) : (
                        <>
                          <span>{quantityValue[item.item_id]}</span>
                          <button onClick={() => toggleEditMode(item.item_id, 'quantity')}>Edit</button>
                        </>
                      )
                    ) : (
                      <span>{quantityValue[item.item_id]}</span>
                    )}
                  </td>
                )}
                {visibleColumns.reserved_quantity && <td>{item.reserved_quantity}</td>}
                {visibleColumns.location && <td>{item.location}</td>}
                {visibleColumns.site_name && (
                  <td>
                    <select value={siteNames[item.item_id] || ''} onChange={e => handleSiteNameChange(item.item_id, e.target.value)}>
                      {siteNamesOptions.length > 0 ? (
                        siteNamesOptions.map(opt => (
                          <option value={opt} key={opt}>{opt}</option>
                        ))
                      ) : (
                        <option value="">No options</option>
                      )}
                    </select>
                  </td>
                )}
                {visibleColumns.unit && (
                  <td>
                    {userId === 2 ? (
                      editMode[item.item_id]?.unit ? (
                        <>
                          <input
                            type="text"
                            value={units[item.item_id] || ''}
                            onChange={e => handleUnitChange(item.item_id, e.target.value)}
                            placeholder="Unit"
                            className="unit-input"
                          />
                          <button className="save-button" onClick={() => handleSaveField(item.item_id, 'unit', units[item.item_id])}>
                            Save
                          </button>
                        </>
                      ) : (
                        <>
                          <span>{units[item.item_id] || ''}</span>
                          <button onClick={() => toggleEditMode(item.item_id, 'unit')}>Edit</button>
                        </>
                      )
                    ) : (
                      <span>{units[item.item_id] || ''}</span>
                    )}
                  </td>
                )}
                {visibleColumns.price && (
                  <td>
                    {userId === 2 ? (
                      editMode[item.item_id]?.price ? (
                        <>
                          <input
                            type="text"
                            value={prices[item.item_id] !== undefined ? `RM ${prices[item.item_id]}` : ''}
                            onChange={e => {
                              let val = e.target.value;
                              if (val.toUpperCase().startsWith('RM ')) {
                                val = val.slice(3);
                              }
                              const newPrice = parseFloat(val) || 0;
                              handlePriceChange(item.item_id, newPrice);
                            }}
                            className="price-input"
                          />
                          <button className="save-button" onClick={() => handleSaveField(item.item_id, 'price', prices[item.item_id])}>
                            Save
                          </button>
                        </>
                      ) : (
                        <>
                          <span>{prices[item.item_id] !== undefined ? `RM ${prices[item.item_id]}` : ''}</span>
                          <button onClick={() => toggleEditMode(item.item_id, 'price')}>Edit</button>
                        </>
                      )
                    ) : (
                      <span>{prices[item.item_id] !== undefined ? `RM ${prices[item.item_id]}` : ''}</span>
                    )}
                  </td>
                )}
                {visibleColumns.remarks && (
                  <td>
                    <select value={remarks[item.item_id] || ''} onChange={e => handleRemarksChange(item.item_id, e.target.value)}>
                      {remarksOptions.length > 0 ? (
                        remarksOptions.map(opt => (
                          <option value={opt} key={opt}>{opt}</option>
                        ))
                      ) : (
                        <option value="">No options</option>
                      )}
                    </select>
                  </td>
                )}
                {userId === 2 && visibleColumns.audit_date && (
                  <td>
                    {editMode[item.item_id]?.auditDate ? (
                      <>
                        <input
                          type="datetime-local"
                          value={formatForInput(auditDates[item.item_id])}
                          onChange={e => handleAuditDateChange(item.item_id, e.target.value)}
                          placeholder="Key-in Date"
                        />
                        <button className="save-button" onClick={() => handleSaveField(item.item_id, 'audit_date', auditDates[item.item_id])}>
                          Save
                        </button>
                      </>
                    ) : (
                      <>
                        <span>{convertToMYTDisplay(auditDates[item.item_id])}</span>
                        <button onClick={() => toggleEditMode(item.item_id, 'auditDate')}>Edit</button>
                      </>
                    )}
                  </td>
                )}
                {visibleColumns.quantity_changed && (
                  <td>
                    <div className="stepper-container">
                      <button type="button" className="stepper-btn decrement" onClick={() => handleQuantityDecrement(item.item_id)}>
                        -
                      </button>
                      <input
                        type="number"
                        className="stepper-input"
                        value={inputValue[item.item_id] || 0}
                        onChange={e => handleInputChange(item.item_id, parseInt(e.target.value) || 0)}
                      />
                      <button type="button" className="stepper-btn increment" onClick={() => handleQuantityIncrement(item.item_id)}>
                        +
                      </button>
                    </div>
                  </td>
                )}
                {visibleColumns.confirmation && (
                  <td>
                    <button className="confirmButton" onClick={() => handleConfirm(item.item_id)}>
                      Confirm
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bulk-actions">
        <button className="confirm-all-button" onClick={handleConfirmAll}>
          Confirm All Updates
        </button>
      </div>
    </div>
  );
};

export default AdminDashboard;
