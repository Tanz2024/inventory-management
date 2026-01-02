require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');  // For PDF parsing
const { createWorker } = require('tesseract.js');  // For OCR
const axios = require('axios');
const moment = require('moment-timezone');
// ---------------------------------------------------------------------
// 1) App Initialization
// ---------------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 5000;
console.log("Hi");

// Middleware
app.use(cookieParser());
app.use(express.json());

// ---------------------------------------------------------------------
// 2) CORS Setup
// ---------------------------------------------------------------------
const corsOptions = {
  // origin: 'https://inventory-e9c9f.web.app',
  origin: 'http://localhost:3000', 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    ],
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));


// ---------------------------------------------------------------------
// 3) Async Handler Wrapper
// ---------------------------------------------------------------------
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ---------------------------------------------------------------------
// 4) JWT Secret & Database Connection
// ---------------------------------------------------------------------
const JWT_SECRET = process.env.JWT_SECRET;

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// ---------------------------------------------------------------------
// 5) Authentication Middleware
// ---------------------------------------------------------------------
const authenticateJWT = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Forbidden' });
    req.user = user;
    next();
  });
};


const authenticateAdmin = (req, res, next) => {
  authenticateJWT(req, res, () => {
    if (req.user.role_id !== 1) return res.status(403).json({ message: 'Forbidden' });
    next();
  });
};

// ---------------------------------------------------------------------
// 6) Multer Setup for File Upload
// ---------------------------------------------------------------------
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, './uploads'); // Save files to 'uploads' folder
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`); // Unique filename
    },
  }),
});


// ---------------------------------------------------------------------
// 7) Authentication Routes
// ---------------------------------------------------------------------
app.get('/authenticate', (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ message: 'Not authenticated' });

  try {
    const { user_id, username, role_id } = jwt.verify(token, JWT_SECRET);
    res.json({ user_id, username, role_id });
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
});

app.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ message: 'Username and password are required.' });

  const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  if (result.rows.length === 0) return res.status(400).json({ message: 'User not found' });

  const user = result.rows[0];
  if (!await bcrypt.compare(password, user.password_hash)) return res.status(400).json({ message: 'Invalid credentials' });

  const token = jwt.sign({ user_id: user.user_id, username: user.username, role_id: user.role_id }, JWT_SECRET, { expiresIn: '1h' });
  const isProduction = process.env.NODE_ENV === 'production';

  res.cookie('token', token, {
    httpOnly: true,
    sameSite: isProduction ? 'None' : 'Lax',
    secure: isProduction,
    maxAge: 3600000,
  });
  res.json({ message: 'Login successful', role_id: user.role_id, user_id: user.user_id, redirect: user.role_id === 1 ? '/admin-dashboard' : '/user-dashboard' });
}));

app.post('/logout', (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: isProduction ? 'None' : 'Lax',
    secure: isProduction,
  });
  res.json({ message: 'Logged out successfully' });
});

// ---------------------------------------------------------------------
// 8) Admin Dashboard / Inventory Endpoints
// ---------------------------------------------------------------------

// Add a new remark option
app.post('/dropdown-options/remarks', async (req, res) => {
  const { option } = req.body;
  if (!option) {
    return res.status(400).json({ message: 'Option is required' });
  }
  try {
    // Check for a duplicate (case-insensitive)
    const existing = await pool.query(
      'SELECT option FROM remarks_options WHERE LOWER(option) = LOWER($1)',
      [option]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({
        message: `A remark with a similar name already exists: "${existing.rows[0].option}"`,
        existingOptions: existing.rows.map(row => row.option),
      });
    }

    const result = await pool.query(
      'INSERT INTO remarks_options (option) VALUES ($1) RETURNING id, option',
      [option]
    );
    const newRemark = result.rows[0];

    // Log the addition in history (for "add", new_value is the inserted remark)
    await pool.query(
      'INSERT INTO remarks_history (action_type, remark_id, new_value) VALUES ($1, $2, $3)',
      ['add', newRemark.id, newRemark.option]
    );

    res.status(201).json({ option: newRemark.option });
  } catch (error) {
    console.error('Error adding remark option:', error);
    res.status(500).json({ message: 'Error adding remark option' });
  }
});

// Rename a remark option
app.patch('/dropdown-options/remarks/rename', async (req, res) => {
  const { oldOption, newOption } = req.body;
  if (!oldOption || !newOption) {
    return res.status(400).json({ message: 'Both oldOption and newOption are required.' });
  }
  try {
    // Check if newOption already exists (case-insensitive)
    const duplicateCheck = await pool.query(
      'SELECT option FROM remarks_options WHERE LOWER(option) = LOWER($1)',
      [newOption]
    );
    if (duplicateCheck.rows.length > 0) {
      return res.status(400).json({
        message: `A remark with a similar name already exists: "${duplicateCheck.rows[0].option}"`,
        existingOptions: duplicateCheck.rows.map(row => row.option),
      });
    }

    const result = await pool.query(
      'UPDATE remarks_options SET option = $1 WHERE option = $2 RETURNING id, option',
      [newOption, oldOption]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Old remark option not found' });
    }

    const updatedRemark = result.rows[0];

    // Log the rename in history with old and new values
    await pool.query(
      'INSERT INTO remarks_history (action_type, remark_id, old_value, new_value) VALUES ($1, $2, $3, $4)',
      ['rename', updatedRemark.id, oldOption, newOption]
    );

    res.json({ message: 'Remark option renamed successfully.' });
  } catch (error) {
    console.error('Error renaming remark option:', error);
    res.status(500).json({ message: 'Error renaming remark option' });
  }
});

// Delete a remark option using URL parameter
app.delete('/dropdown-options/remarks/:option', async (req, res) => {
  const option = req.params.option;
  if (!option) {
    return res.status(400).json({ message: 'Option is required for deletion' });
  }
  try {
    const result = await pool.query(
      'DELETE FROM remarks_options WHERE option = $1 RETURNING id, option',
      [option]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Remark option not found' });
    }

    const deletedRemark = result.rows[0];

    // Log the deletion in history:
    // Set remark_id to null, store the deleted remark name in old_value,
    // and record the action as "delete" in new_value.
    await pool.query(
      'INSERT INTO remarks_history (action_type, remark_id, old_value, new_value) VALUES ($1, $2, $3, $4)',
      ['delete', null, deletedRemark.option, 'delete']
    );

    res.json({ message: 'Remark option deleted successfully' });
  } catch (error) {
    console.error('Error deleting remark option:', error);
    res.status(500).json({ message: 'Error deleting remark option' });
  }
});


// Fetch all remark options
app.get('/dropdown-options/remarks', async (req, res) => {
  try {
    const result = await pool.query('SELECT option FROM remarks_options ORDER BY option ASC');
    res.status(200).json({ remarks: result.rows.map(row => row.option) });
  } catch (error) {
    console.error('Error fetching remark options:', error);
    res.status(500).json({ message: 'Error fetching remark options' });
  }
});

// Fetch remarks history
app.get('/dropdown-options/remarks/history', async (req, res) => {
  try {
    const history = await pool.query(
      'SELECT action_type, old_value, new_value, created_at FROM remarks_history ORDER BY created_at DESC'
    );
    res.json({
      history: history.rows.map(entry => ({
        ...entry,
        created_at: new Date(entry.created_at).toLocaleString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }),
      })),
    });
  } catch (error) {
    console.error('Error fetching remark history:', error);
    res.status(500).json({ message: 'Error fetching remark history' });
  }
});


// --- SITE ENDPOINTS ---

// Add a new site option (with duplicate check)
app.post('/dropdown-options/sites', async (req, res) => {
  const { option } = req.body;
  if (!option) return res.status(400).json({ message: 'Option is required.' });

  try {
    // Check for duplicate site name (case-insensitive)
    const existing = await pool.query(
      'SELECT option FROM site_options WHERE LOWER(option) = LOWER($1)',
      [option]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({
        message: `A site with a similar name already exists: "${existing.rows[0].option}"`,
        existingOptions: existing.rows.map(row => row.option),
      });
    }

    const result = await pool.query(
      'INSERT INTO site_options (option) VALUES ($1) RETURNING id, option',
      [option]
    );

    // Log the addition in history
    await pool.query(
      'INSERT INTO site_history (action_type, site_id, new_value) VALUES ($1, $2, $3)',
      ['add', result.rows[0].id, result.rows[0].option]
    );

    res.status(201).json({ option: result.rows[0].option });
  } catch (error) {
    console.error('Error adding site option:', error);
    res.status(500).json({ message: 'Error adding site option' });
  }
});

// Rename a site option
app.patch('/dropdown-options/sites/rename', async (req, res) => {
  const { oldOption, newOption } = req.body;
  if (!oldOption || !newOption) {
    return res.status(400).json({ message: 'Both oldOption and newOption are required.' });
  }

  try {
    // Check for duplicate new name
    const duplicateCheck = await pool.query(
      'SELECT option FROM site_options WHERE LOWER(option) = LOWER($1)',
      [newOption]
    );
    if (duplicateCheck.rows.length > 0) {
      return res.status(400).json({
        message: `A site with a similar name already exists: "${duplicateCheck.rows[0].option}"`,
        existingOptions: duplicateCheck.rows.map(row => row.option),
      });
    }

    const existing = await pool.query('SELECT id FROM site_options WHERE option = $1', [oldOption]);
    if (existing.rowCount === 0)
      return res.status(404).json({ message: `Site "${oldOption}" not found.` });

    const siteId = existing.rows[0].id;

    // Log rename BEFORE updating
    await pool.query(
      'INSERT INTO site_history (action_type, site_id, old_value, new_value) VALUES ($1, $2, $3, $4)',
      ['rename', siteId, oldOption, newOption]
    );

    // Now update the site name
    await pool.query('UPDATE site_options SET option = $1 WHERE id = $2', [newOption, siteId]);

    res.json({ message: `Site renamed from "${oldOption}" to "${newOption}" successfully.` });
  } catch (error) {
    console.error('Error renaming site:', error);
    res.status(500).json({ message: 'Error renaming site option' });
  }
});
// Delete a site option
app.delete('/dropdown-options/sites', async (req, res) => {
  const { option } = req.body;
  if (!option) return res.status(400).json({ message: 'Option is required for deletion.' });
  try {
    const result = await pool.query(
      'DELETE FROM site_options WHERE option = $1 RETURNING id, option',
      [option]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Site option not found.' });
    }
    const deletedSite = result.rows[0];

    await pool.query(
      'INSERT INTO site_history (action_type, site_id, old_value, new_value) VALUES ($1, $2, $3, $4)',
      ['delete', null, deletedSite.option, 'delete']
    );

    res.json({ message: 'Site option deleted successfully' });
  } catch (error) {
    console.error('Error deleting site option:', error);
    res.status(500).json({ message: 'Error deleting site option' });
  }
});

// Fetch all site options
app.get('/dropdown-options/sites', async (req, res) => {
  try {
    const result = await pool.query('SELECT option FROM site_options ORDER BY option ASC');
    res.status(200).json({ sites: result.rows.map(row => row.option) });
  } catch (error) {
    console.error('Error fetching site options:', error);
    res.status(500).json({ message: 'Error fetching site options' });
  }
});

// Fetch site history
app.get('/dropdown-options/sites/history', async (req, res) => {
  try {
    const history = await pool.query(
      'SELECT action_type, old_value, new_value, created_at FROM site_history ORDER BY created_at DESC'
    );
    res.json({
      history: history.rows.map(entry => ({
        ...entry,
        created_at: new Date(entry.created_at).toLocaleString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }),
      })),
    });
  } catch (error) {
    console.error('Error fetching site history:', error);
    res.status(500).json({ message: 'Error fetching site history' });
  }
});



app.get(
  '/admin-dashboard/items',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT *
        FROM items
        WHERE archived_at IS NULL
        ORDER BY starred DESC, item_id ASC
      `);
      res.json({ items: result.rows });
    } catch (error) {
      console.error('Error fetching items:', error);
      res.status(500).json({ message: 'Error fetching items' });
    }
  })
);



app.get(
  '/admin-dashboard/items/archive',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT * FROM items WHERE archived_at IS NOT NULL ORDER BY archived_at DESC`
    );
    res.json({ items: result.rows });
  })
);
app.post(
  '/admin-dashboard/items',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const {
      category,
      item_name,
      model,
      item_unique_id,
      quantity,
      price,
      remarks,
      site_name,
      location,
      unit,
      date // <-- New: Key in Date from the client
    } = req.body;

    if (!item_name || !category) {
      return res
        .status(400)
        .json({ message: 'item_name and category are required.' });
    }

    // 1) If item_unique_id is provided, ensure it's not duplicated
    if (item_unique_id) {
      const { rows: dupRows } = await pool.query(
        `SELECT item_id FROM items
         WHERE item_unique_id = $1
           AND archived_at IS NULL`,
        [item_unique_id]
      );
      if (dupRows.length > 0) {
        return res.status(400).json({
          message: 'Duplicate Unique ID detected. Please use a different Unique ID.'
        });
      }
    }

    // 2) Optional: find next display_order if you use it
    const { rows: maxRows } = await pool.query(`
      SELECT COALESCE(MAX(display_order), 0) AS max_order
      FROM items
      WHERE archived_at IS NULL
    `);
    const nextOrder = parseInt(maxRows[0].max_order, 10) + 1;

    // 3) Insert new item, including the new "audit_date" field
    const insertQuery = `
      INSERT INTO items
        (category, item_name, model, item_unique_id, quantity, price,
         remarks, site_name, location, unit, display_order, audit_date,
         archived_at, reserved_quantity, updated_at)
      VALUES
        ($1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, $12,
         NULL, 0, NOW())
      RETURNING *;
    `;
    const values = [
      category,
      item_name,
      model || null,
      item_unique_id || null,
      quantity || 0,
      price || 0,
      remarks || '',
      site_name || '',
      location || '',
      unit || '',
      nextOrder,
      date || null  // <-- New: Insert provided date into audit_date column
    ];

    const { rows } = await pool.query(insertQuery, values);
    const newItem = rows[0];

    // 4) Log a transaction (optional)
    await pool.query(
      `
        INSERT INTO inventory_transactions
          (item_id, category, user_id, item_name, model, item_unique_id,
           transaction_type, quantity_change, remarks, status, timestamp,
           price_update, site_name, unit, change_summary)
        VALUES
          ($1, $2, $3, $4, $5, $6,
           'Add Item', $7, $8, 'Approved', NOW(),
           $9, $10, $11, $12)
      `,
      [
        newItem.item_id,           // auto-generated by Postgres
        newItem.category,
        req.user.user_id,
        newItem.item_name,
        newItem.model,
        newItem.item_unique_id,
        newItem.quantity,
        newItem.remarks || '',
        newItem.price || 0,
        newItem.site_name || '',
        newItem.unit || '',
        `New item added: ${newItem.item_name}, category: ${newItem.category}.`
      ]
    );

    res.status(201).json({
      message: 'Item added successfully',
      item: newItem
    });
  })
);

app.patch(
  '/admin-dashboard/items/archive',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const { itemIds } = req.body;
    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ message: 'No items selected for archiving' });
    }

    // Archive the selected items (set archived_at, updated_at, and remove display_order)
    const archiveResult = await pool.query(
      `
      UPDATE items
      SET archived_at = NOW(),
          updated_at = NOW(),
          display_order = NULL
      WHERE item_id = ANY($1::int[])
        AND archived_at IS NULL
      RETURNING item_id, item_name, quantity, category, model, item_unique_id, quantity
      `,
      [itemIds]
    );

    // Log each archive transaction
    for (const item of archiveResult.rows) {
      await pool.query(
        `
        INSERT INTO inventory_transactions
          (item_id, category, user_id, item_name, model, item_unique_id,
           transaction_type, quantity_change, remarks, status, timestamp, change_summary)
        VALUES
          ($1, $2, $3, $4, $5, $6, 'Archive Item', -($7::integer),
           'Item archived', 'Approved', NOW(), 'Item archived from admin dashboard.')
        `,
        [
          item.item_id,
          item.category,
          req.user.user_id,
          item.item_name,
          item.model,
          item.item_unique_id,
          item.quantity || 0,
        ]
      );
    }

    // Automatically resequence display_order for active (non-archived) items
    await resequenceDisplayOrder();

    const archivedCount = archiveResult.rowCount;
    let message = `${archivedCount} item(s) archived successfully.`;
    if (archivedCount < itemIds.length) {
      message += ' The remaining items may already be archived or do not exist.';
    }

    // Mask the item_id in the response (if needed)
    const maskedItems = archiveResult.rows.map(item => ({
      ...item,
      item_id: '*****'
    }));

    return res.status(200).json({
      message,
      archivedItems: maskedItems,
    });
  })
);
async function resequenceDisplayOrder() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Retrieve active items ordered by starred status (starred items first), then by display_order, then item_id.
    const { rows } = await client.query(`
      SELECT item_id FROM items
      WHERE archived_at IS NULL
      ORDER BY (CASE WHEN starred THEN 0 ELSE 1 END), display_order, item_id
    `);
    // Update display_order sequentially
    for (let i = 0; i < rows.length; i++) {
      const id = rows[i].item_id;
      await client.query(
        'UPDATE items SET display_order = $1 WHERE item_id = $2',
        [i + 1, id]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to resequence display_order:', err);
  } finally {
    client.release();
  }
}


app.delete(
  '/admin-dashboard/items/permanent',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const { itemIds } = req.body;
    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res
        .status(400)
        .json({ error: 'No items selected for permanent deletion' });
    }

    // Backup category, name, and model in `inventory_transactions`
    await pool.query(`
      UPDATE inventory_transactions it
      SET 
        category = i.category,
        item_name = i.item_name,
        model = i.model
      FROM items i
      WHERE it.item_id = i.item_id AND it.item_id = ANY($1::int[]);
    `, [itemIds]);

    // Check if items are archived first
    const archivedCheck = await pool.query(
      `SELECT item_id FROM items
       WHERE item_id = ANY($1::int[]) AND archived_at IS NOT NULL`,
      [itemIds]
    );
    if (archivedCheck.rowCount === 0) {
      return res
        .status(400)
        .json({ error: 'No archived items found to permanently delete' });
    }

    // Physically remove them
    const deleteQuery = `
      DELETE FROM items
      WHERE item_id = ANY($1::int[]) AND archived_at IS NOT NULL
      RETURNING item_id, item_name, category, model, item_unique_id;
    `;
    const deleteResult = await pool.query(deleteQuery, [itemIds]);

    // Log permanent deletion for each deleted item
    for (const item of deleteResult.rows) {
      await pool.query(
        `INSERT INTO inventory_transactions
          (item_id, category, user_id, item_name, model, item_unique_id,
           transaction_type, quantity_change, remarks, status, timestamp, change_summary)
         VALUES
          ($1, $2, $3, $4, $5, $6, 'Permanent Delete', 0,
           'Item permanently deleted from archive', 'Approved', NOW(),
           'Item permanently deleted.')`,
        [
          item.item_id,
          item.category,
          req.user.user_id,
          item.item_name,
          item.model,
          item.item_unique_id
        ]
      );
    }

    res.status(200).json({
      message: `${deleteResult.rowCount} archived item(s) permanently deleted`,
      deletedItems: deleteResult.rows,
    });
  })
);
const formatMYT = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' });
};
app.patch(
  '/admin-dashboard/items/:itemId/update',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const { itemId } = req.params;
    const {
      price,
      remarks,
      quantityChange,
      newQuantity,
      site_name,
      unit,
      item_unique_id,
      audit_date,
      starred,
      item_name,    // new field
      model,       // new field
      category,    // new field
      location     // new field for location update
    } = req.body;

    // 1) Only admins can update the price
    if (req.body.hasOwnProperty('price') && price !== undefined && req.user.role_id !== 1) {
      return res.status(400).json({ message: 'Non-admin users cannot update price.' });
    }

    // 2) Fetch the current item
    const { rows: itemRows } = await pool.query('SELECT * FROM items WHERE item_id = $1', [itemId]);
    if (itemRows.length === 0) {
      return res.status(404).json({ message: 'Item not found.' });
    }
    const currentItem = itemRows[0];

    // 3) Decide final values (if no new value provided, keep the old)
    const updatedSiteName = req.body.hasOwnProperty('site_name')
      ? site_name
      : currentItem.site_name;
    const updatedRemarks = req.body.hasOwnProperty('remarks')
      ? remarks
      : currentItem.remarks;
    let updatedQuantity = currentItem.quantity;
    let updatedPrice = currentItem.price;
    let updatedUnit = req.body.hasOwnProperty('unit') ? unit : currentItem.unit;
    let updatedUniqueId = currentItem.item_unique_id;
    let updatedAuditDate = currentItem.audit_date;
    let updatedStarred = currentItem.starred;
    // NEW fields
    let updatedItemName = currentItem.item_name;
    let updatedModel = currentItem.model;
    let updatedCategory = currentItem.category;
    let updatedLocation = currentItem.location;
    
    // 4) Flags to detect changes
    let isUniqueIdUpdated = false;
    let isQuantityUpdated = false;
    let isPriceUpdated = false;
    let isSiteUpdated = false;
    let isRemarksUpdated = false;
    let isUnitUpdated = false;
    let isAuditDateUpdated = false;
    let isStarredUpdated = false;
    let isItemNameUpdated = false;
    let isModelUpdated = false;
    let isCategoryUpdated = false;
    let isLocationUpdated = false; // NEW flag

    // 5) Array to collect textual logs
    const changeLogs = [];

    // --- Unique ID Update ---
    if (req.body.hasOwnProperty('item_unique_id')) {
      if (item_unique_id !== currentItem.item_unique_id) {
        // Check for duplicates
        const { rows: duplicates } = await pool.query(
          'SELECT * FROM items WHERE item_unique_id = $1 AND item_id <> $2',
          [item_unique_id, itemId]
        );
        if (duplicates.length > 0) {
          return res.status(400).json({ message: 'Duplicate Unique ID detected.' });
        }
        updatedUniqueId = item_unique_id;
        isUniqueIdUpdated = true;
        changeLogs.push(`Unique ID updated from "${currentItem.item_unique_id || 'N/A'}" to "${updatedUniqueId}"`);
      }
    }

    // --- Quantity Updates (newQuantity or quantityChange) ---
    const summaryDate = formatMYT(updatedAuditDate) || new Date().toLocaleString('en-MY');

    if (req.body.hasOwnProperty('newQuantity')) {
      const parsedNewQty = parseInt(newQuantity, 10);
      if (isNaN(parsedNewQty)) {
        return res.status(400).json({ message: 'Invalid new quantity value.' });
      }
      if (parsedNewQty < 0) {
        return res.status(400).json({ message: 'Quantity cannot be negative.' });
      }
      updatedQuantity = parsedNewQty;
      if (updatedQuantity !== currentItem.quantity) {
        isQuantityUpdated = true;
        changeLogs.push(`Quantity updated from ${currentItem.quantity} to ${updatedQuantity} on ${summaryDate}`);
      }
    } else if (req.body.hasOwnProperty('quantityChange')) {
      const parsedChange = parseInt(quantityChange, 10);
      if (isNaN(parsedChange)) {
        return res.status(400).json({ message: 'Invalid quantity change.' });
      }
      if (parsedChange !== 0) {
        updatedQuantity = currentItem.quantity + parsedChange;
        if (updatedQuantity < 0) {
          return res.status(400).json({ message: 'Insufficient stock.' });
        }
        isQuantityUpdated = true;
        changeLogs.push(`Quantity changed from ${currentItem.quantity} to ${updatedQuantity} (Change: ${parsedChange}) on ${summaryDate}`);
      }
    }
    

    // --- Price Update ---
    if (req.body.hasOwnProperty('price')) {
      const parsedPrice = parseFloat(price);
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ message: 'Invalid price value.' });
      }
      if (parsedPrice !== parseFloat(currentItem.price)) {
        updatedPrice = parsedPrice;
        isPriceUpdated = true;
        changeLogs.push(`Price updated from ${currentItem.price} to ${updatedPrice}`);
      }
    }

    // --- Site Name Update ---
    if (req.body.hasOwnProperty('site_name') && site_name !== currentItem.site_name) {
      isSiteUpdated = true;
      changeLogs.push(`Site name updated from "${currentItem.site_name}" to "${updatedSiteName}"`);
    }

    // --- Remarks Update ---
    if (req.body.hasOwnProperty('remarks') && remarks !== currentItem.remarks) {
      isRemarksUpdated = true;
      changeLogs.push(`Remarks updated from "${currentItem.remarks || 'N/A'}" to "${remarks}"`);
    }

    // --- Unit Update ---
    if (req.body.hasOwnProperty('unit') && unit !== currentItem.unit) {
      isUnitUpdated = true;
      changeLogs.push(`Unit updated from "${currentItem.unit}" to "${updatedUnit}"`);
    }

    // --- Audit Date Update ---
// --- Audit Date Update ---
if (req.body.hasOwnProperty('audit_date')) {
  // Convert empty string into null so Postgres won’t choke
  const newDateValue = audit_date === "" ? null : audit_date;

  if (newDateValue !== currentItem.audit_date) {
    isAuditDateUpdated = true;
    const formattedOld = formatMYT(currentItem.audit_date);
    const formattedNew = formatMYT(newDateValue);
    changeLogs.push(`Audit date updated from "${formattedOld}" to "${formattedNew}"`);
    updatedAuditDate = newDateValue;
  }
}


    // --- Starred Update ---
    if (req.body.hasOwnProperty('starred') && starred !== currentItem.starred) {
      isStarredUpdated = true;
      updatedStarred = starred;
      changeLogs.push(`Starred status updated from "${currentItem.starred}" to "${updatedStarred}"`);
    }

    // --- Item Name Update with Duplicate Check ---
    if (req.body.hasOwnProperty('item_name')) {
      if (item_name !== currentItem.item_name) {
        const { rows: duplicateNames } = await pool.query(
          'SELECT * FROM items WHERE item_name = $1 AND item_id <> $2',
          [item_name, itemId]
        );
        if (duplicateNames.length > 0) {
          return res.status(400).json({ message: 'Duplicate Item Name detected.' });
        }
        updatedItemName = item_name;
        isItemNameUpdated = true;
        changeLogs.push(`Item name updated from "${currentItem.item_name}" to "${updatedItemName}"`);
      }
    }

    // --- Model Update ---
    if (req.body.hasOwnProperty('model') && model !== currentItem.model) {
      updatedModel = model;
      isModelUpdated = true;
      changeLogs.push(`Model updated from "${currentItem.model}" to "${updatedModel}"`);
    }

    // --- Category Update ---
    if (req.body.hasOwnProperty('category') && category !== currentItem.category) {
      updatedCategory = category;
      isCategoryUpdated = true;
      changeLogs.push(`Category updated from "${currentItem.category}" to "${updatedCategory}"`);
    }

    // --- Location Update ---
    if (req.body.hasOwnProperty('location') && location !== currentItem.location) {
      updatedLocation = location;
      isLocationUpdated = true;
      changeLogs.push(`Location updated from "${currentItem.location}" to "${updatedLocation}"`);
    }

    // If no changes, return early
    if (
      !isQuantityUpdated &&
      !isPriceUpdated &&
      !isSiteUpdated &&
      !isRemarksUpdated &&
      !isUnitUpdated &&
      !isUniqueIdUpdated &&
      !isAuditDateUpdated &&
      !isStarredUpdated &&
      !isItemNameUpdated &&
      !isModelUpdated &&
      !isCategoryUpdated &&
      !isLocationUpdated
    ) {
      return res.json({ message: 'No changes detected.', item: currentItem });
    }

    const changeSummary = changeLogs.join('. ');
    const changesCount = [
      isQuantityUpdated, isPriceUpdated, isSiteUpdated, isRemarksUpdated,
      isUnitUpdated, isUniqueIdUpdated, isAuditDateUpdated, isStarredUpdated,
      isItemNameUpdated, isModelUpdated, isCategoryUpdated, isLocationUpdated
    ].filter(Boolean).length;

    let transactionType;
    if (changesCount > 1) {
      transactionType = 'Combined Update';
    } else if (isQuantityUpdated) {
      transactionType = req.body.hasOwnProperty('newQuantity')
        ? 'Quantity Value Update'
        : parseInt(quantityChange, 10) > 0
        ? 'Add'
        : 'Subtract';
    } else if (isPriceUpdated) {
      transactionType = 'Price Update';
    } else if (isSiteUpdated) {
      transactionType = 'Site Update';
    } else if (isRemarksUpdated) {
      transactionType = 'Remarks Update';
    } else if (isUnitUpdated) {
      transactionType = 'Unit Update';
    } else if (isUniqueIdUpdated) {
      transactionType = 'Unique ID Update';
    } else if (isAuditDateUpdated) {
      transactionType = 'Audit Date Update';
    } else if (isStarredUpdated) {
      transactionType = 'Starred Update';
    } else if (isLocationUpdated) {
      transactionType = 'Location Update';
    } else if (isItemNameUpdated || isModelUpdated || isCategoryUpdated) {
      transactionType = 'Description Update';
    } else {
      transactionType = 'Inventory Update';
    }

    const updateQuery = `
      UPDATE items
      SET
        remarks = $1,
        quantity = $2,
        price = $3,
        site_name = $4,
        unit = $5,
        item_unique_id = $6,
        audit_date = $7,
        starred = $8,
        item_name = $9,
        model = $10,
        category = $11,
        location = $12,
        updated_at = NOW()
      WHERE item_id = $13
      RETURNING *;
    `;
    const { rows: updatedRows } = await pool.query(updateQuery, [
      updatedRemarks,
      updatedQuantity,
      updatedPrice,
      updatedSiteName,
      updatedUnit,
      updatedUniqueId,
      updatedAuditDate,
      updatedStarred,
      updatedItemName,
      updatedModel,
      updatedCategory,
      updatedLocation,
      itemId
    ]);
    const updatedItem = updatedRows[0];

    await pool.query(`
      INSERT INTO inventory_transactions
        (item_id, user_id, transaction_type, quantity_change, timestamp,
         key_in_date, key_in_date_old, remarks, status, price_update,
         site_name, unit, change_summary)
      VALUES
        ($1, $2, $3, $4, NOW(), $5, $6, $7, 'Approved', $8, $9, $10, $11)
    `, [
      itemId,
      req.user.user_id,
      transactionType,
      isQuantityUpdated
        ? (req.body.hasOwnProperty('newQuantity') ? updatedQuantity - currentItem.quantity : parseInt(quantityChange, 10))
        : 0,
      updatedAuditDate,
      isAuditDateUpdated ? currentItem.audit_date : null,
      updatedRemarks,
      isPriceUpdated ? updatedPrice : null,
      updatedSiteName,
      updatedUnit,
      changeSummary
    ]);

    // Automatically resequence display_order for all active items
    await resequenceDisplayOrder();

    return res.json({
      message: 'Item updated successfully.',
      item: updatedItem,
      changeSummary
    });
  })
);


// Reserve an item: update stock, log transaction, and create a reservation record
app.patch(
  '/admin-dashboard/items/:itemId/reserve',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const { itemId } = req.params;
    const { quantityToReserve, remarks } = req.body; // quantityToReserve can now be positive or negative
    const userId = req.user.user_id;
    const status = userId === 2 ? "Approved" : "Pending";

    // Validate that quantityToReserve is an integer (allowing negative numbers)
    if (!Number.isInteger(quantityToReserve)) {
      return res
        .status(400)
        .json({ message: 'Quantity to reserve must be an integer.' });
    }

    try {
      // Begin transaction
      await pool.query('BEGIN');

      // Lock and fetch the current item data
      const itemResult = await pool.query(
        'SELECT * FROM items WHERE item_id = $1 FOR UPDATE',
        [itemId]
      );
      if (itemResult.rowCount === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ message: 'Item not found.' });
      }
      const currentItem = itemResult.rows[0];

      // If quantityToReserve is positive, ensure there is enough stock.
      // If negative, ensure there is enough reserved stock to reduce.
      if (quantityToReserve > 0 && currentItem.quantity < quantityToReserve) {
        await pool.query('ROLLBACK');
        return res
          .status(400)
          .json({ message: 'Not enough stock available to reserve.' });
      }
      if (quantityToReserve < 0 && currentItem.reserved_quantity < Math.abs(quantityToReserve)) {
        await pool.query('ROLLBACK');
        return res
          .status(400)
          .json({ message: 'Not enough reserved stock available to release.' });
      }

    
      const newQuantity = currentItem.quantity - quantityToReserve;
      const newReservedQuantity = currentItem.reserved_quantity + quantityToReserve;

      // Update the item in the database
      const updateResult = await pool.query(
        'UPDATE items SET quantity = $1, reserved_quantity = $2, updated_at = NOW() WHERE item_id = $3 RETURNING *',
        [newQuantity, newReservedQuantity, itemId]
      );
      const updatedItem = updateResult.rows[0];

      // Determine transaction type based on quantity sign
      const transactionType = quantityToReserve >= 0 ? 'Reserve' : 'Reserve Reduction';

      // Log the transaction for the reserve operation
      const logResult = await pool.query(
        `INSERT INTO inventory_transactions 
           (item_id, category, user_id, item_name, model, item_unique_id, transaction_type, quantity_change, remarks, status, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
         RETURNING *`,
        [
          itemId,
          currentItem.category,
          userId,
          currentItem.item_name,
          currentItem.model,
          currentItem.item_unique_id,
          transactionType,
          quantityToReserve,
          remarks,
          status,
        ]
      );
      const logEntry = logResult.rows[0];

      // Create a reservation record.
      // For positive adjustments, this creates a new reservation.
      // For negative adjustments, it records the reduction.
      const reservationResult = await pool.query(
        `INSERT INTO reservations 
           (item_id, item_name, model, item_unique_id, category, reserved_quantity, status, reservation_status, reserved_at, remarks)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'In Progress', NOW(), $8)
         RETURNING *`,
        [
          itemId,
          currentItem.item_name,
          currentItem.model,
          currentItem.item_unique_id,
          currentItem.category,
          quantityToReserve,
          status,
          remarks || '',
        ]
      );
      const reservationEntry = reservationResult.rows[0];

      // Commit the transaction
      await pool.query('COMMIT');

      res.json({
        message: 'Reservation operation completed successfully.',
        item: updatedItem,
        reservation: reservationEntry,
        log: logEntry,
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      console.error('Error during item reservation operation:', error);
      res
        .status(500)
        .json({ message: 'An error occurred while processing the reservation operation.' });
    }
  })
);


// Get all reservations with status "In Progress"
app.get(
  '/admin-dashboard/items/reservations',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT * FROM reservations WHERE reservation_status = 'In Progress'"
      );
      res.json({ items: result.rows });
    } catch (error) {
      console.error('Error fetching reservations:', error);
      res.status(500).json({
        message: 'An error occurred while fetching the reservations.',
      });
    }
  })
);

app.patch(
  '/admin-dashboard/items/:reservationId/complete',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const { reservationId } = req.params;
    const { by } = req.body;
    const userId = req.user.user_id;
    const status = userId === 2 ? "Approved" : "Pending";

    try {
      console.log(`🔍 Processing reservation completion for ID: ${reservationId}`);

      await pool.query('BEGIN');

      // Update reservation status
      const resUpdate = await pool.query(
        `UPDATE reservations 
         SET reservation_status = $1, updated_at = NOW()
         WHERE reservation_id = $2
         RETURNING *`,
        ['Completed', reservationId]
      );

      if (resUpdate.rowCount === 0) {
        console.error(`❌ ERROR: Reservation ID ${reservationId} not found.`);
        await pool.query('ROLLBACK');
        return res.status(404).json({ message: 'Reservation not found' });
      }

      const updatedReservation = resUpdate.rows[0];
      console.log(`✅ Reservation ${reservationId} marked as Completed.`);

      if (!updatedReservation.item_id) {
        console.error(`❌ ERROR: Reservation ${reservationId} has no valid item_id.`);
        await pool.query('ROLLBACK');
        return res.status(500).json({ message: 'Invalid reservation data - missing item_id' });
      }

      // Fetch item details
      const itemRes = await pool.query(
        `SELECT item_id, item_name, category, model, reserved_quantity, item_unique_id 
         FROM items 
         WHERE item_id = $1 FOR UPDATE`,
        [updatedReservation.item_id]
      );

      if (itemRes.rowCount === 0) {
        console.error(`❌ ERROR: Item ID ${updatedReservation.item_id} not found.`);
        await pool.query('ROLLBACK');
        return res.status(404).json({ message: 'Item not found' });
      }

      const itemDetails = itemRes.rows[0];

      // Ensure reserved_quantity is valid
      const currentReserved = itemDetails.reserved_quantity || 0;
      const reservationReserved = updatedReservation.reserved_quantity || 0;
      const newReservedQuantity = currentReserved - reservationReserved;

      console.log(`📊 Adjusting reserved quantity: ${currentReserved} - ${reservationReserved} = ${newReservedQuantity}`);

      // Log transaction
      const transResult = await pool.query(
        `INSERT INTO inventory_transactions 
           (item_id, user_id, transaction_type, quantity_change, remarks, status, timestamp, model, item_name, category, item_unique_id)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9, $10)
         RETURNING *`,
        [
          updatedReservation.item_id,
          userId,
          'Reserve Complete',
          reservationReserved,
          by || 'Reservation completed',
          status,
          itemDetails.model,
          itemDetails.item_name,
          itemDetails.category,
          itemDetails.item_unique_id,
        ]
      );

      console.log(`✅ Transaction logged for Item ID ${updatedReservation.item_id}`);

      // Update item's reserved quantity
      const itemUpdate = await pool.query(
        `UPDATE items 
         SET reserved_quantity = $1, updated_at = NOW()
         WHERE item_id = $2
         RETURNING *`,
        [newReservedQuantity, updatedReservation.item_id]
      );

      if (itemUpdate.rowCount === 0) {
        console.error(`❌ ERROR: Failed to update reserved quantity for Item ID ${updatedReservation.item_id}`);
        await pool.query('ROLLBACK');
        return res.status(404).json({ message: 'Failed to update item reserved quantity' });
      }

      await pool.query('COMMIT');

      res.json({
        message: 'Reservation completed successfully and transaction logged.',
        reservation: updatedReservation,
        transaction: transResult.rows[0],
        updatedItem: itemUpdate.rows[0],
      });

      console.log(`✅ Reservation ${reservationId} successfully completed.`);
    } catch (error) {
      await pool.query('ROLLBACK');
      console.error('🚨 ERROR Completing Reservation:', error);
      res.status(500).json({ message: 'An error occurred while completing the reservation.' });
    }
  })
);



// Cancel a reservation: update reservation status to Canceled, restore item quantity, and log a cancellation transaction
app.patch(
  '/admin-dashboard/items/:reservationId/cancel',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const { reservationId } = req.params;
    const { by } = req.body;
    const userId = req.user.user_id;
    const status = userId === 2 ? "Approved" : "Pending";

    try {
      await pool.query('BEGIN');

      // Lock and fetch the reservation record
      const reservationResult = await pool.query(
        'SELECT item_id, reserved_quantity FROM reservations WHERE reservation_id = $1 FOR UPDATE',
        [reservationId]
      );
      if (reservationResult.rowCount === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ message: 'Reservation not found' });
      }
      const { item_id, reserved_quantity } = reservationResult.rows[0];

      // Lock and fetch the associated item record
      const itemResult = await pool.query(
        'SELECT quantity, reserved_quantity, item_name, category, model, item_unique_id FROM items WHERE item_id = $1 FOR UPDATE',
        [item_id]
      );
      if (itemResult.rowCount === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ message: 'Item not found' });
      }
      const {
        quantity,
        reserved_quantity: currentReservedQuantity,
        item_name,
        category,
        model,
        item_unique_id,
      } = itemResult.rows[0];

      // Calculate updated stock values
      const updatedReservedQuantity = currentReservedQuantity - reserved_quantity;
      const updatedQuantity = quantity + reserved_quantity;

      // Update the item record
      const updateItem = await pool.query(
        'UPDATE items SET reserved_quantity = $1, quantity = $2, updated_at = NOW() WHERE item_id = $3 RETURNING *',
        [updatedReservedQuantity, updatedQuantity, item_id]
      );
      if (updateItem.rowCount === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ message: 'Failed to update item stock' });
      }
      const updatedItem = updateItem.rows[0];

      // Log the "Reserve Cancel" transaction
      const transactionResult = await pool.query(
        `INSERT INTO inventory_transactions 
           (item_id, user_id, transaction_type, quantity_change, remarks, status, timestamp, model, item_name, category, item_unique_id)
         VALUES ($1, $2, 'Reserve Cancel', $3, $4, $5, NOW(), $6, $7, $8, $9)
         RETURNING *`,
        [
          item_id,
          userId,
          reserved_quantity,
          by || 'Reservation canceled',
          status,
          model,
          item_name,
          category,
          item_unique_id,
        ]
      );
      const transactionEntry = transactionResult.rows[0];

      // Update the reservation status to Canceled
      const updateReservation = await pool.query(
        'UPDATE reservations SET reservation_status = $1, updated_at = NOW() WHERE reservation_id = $2 RETURNING *',
        ['Canceled', reservationId]
      );
      if (updateReservation.rowCount === 0) {
        await pool.query('ROLLBACK');
        return res
          .status(404)
          .json({ message: 'Failed to update reservation status' });
      }
      const updatedReservation = updateReservation.rows[0];

      await pool.query('COMMIT');

      res.json({
        message: 'Reservation canceled successfully, transaction logged.',
        item: updatedItem,
        reservation: updatedReservation,
        transaction: transactionEntry,
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      console.error('Error canceling reservation:', error);
      res.status(500).json({
        message: 'An error occurred while canceling the reservation.',
      });
    }
  })
);
app.patch(
  '/admin-dashboard/items/fix-item-ids',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    await resequenceDisplayOrder();
    res.status(200).json({ message: 'Display order updated successfully.' });
  })
);
// ---------------------------------------------------------------------
// 10) Logs & Pending Transactions
// ---------------------------------------------------------------------
app.get(
  '/logs',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const query = `
      SELECT * FROM (
        -- 1) Inventory Transactions
        SELECT
          it.transaction_id AS id,
          'transaction' AS source,
          it.transaction_id,
          it.item_id,
          COALESCE(it.category, i.category) AS category,
          COALESCE(it.item_name, i.item_name) AS item_name,
          COALESCE(it.model, i.model) AS model,
          i.item_unique_id,
          COALESCE(it.site_name, 'N/A') AS site_name,
          u.username AS updated_by,
          it.transaction_type,
          it.quantity_change,
          it.unit,
          COALESCE(it.price_update::text, 'N/A') AS price_update,
          it.timestamp,
          it.key_in_date,
          COALESCE(it.remarks, 'N/A') AS remarks,
          it.status,
          COALESCE(it.change_summary, 'N/A') AS change_summary

        FROM inventory_transactions it
        LEFT JOIN items i ON it.item_id = i.item_id
        LEFT JOIN users u ON it.user_id = u.user_id

        UNION ALL

        -- 2) Site History
        SELECT
          sh.id AS id,  -- ✅ FIXED HERE
          'site_history' AS source,
          NULL AS transaction_id,
          NULL AS item_id,
          NULL AS category,
          NULL AS item_name,
          NULL AS model,
          NULL AS item_unique_id,
          sh.new_value AS site_name,
          NULL AS updated_by,
          'Site update' AS transaction_type,
          0 AS quantity_change,
          NULL AS unit,
          'N/A' AS price_update,
          sh.created_at AS timestamp,
          NULL AS key_in_date,
          NULL AS remarks,
          'N/A' AS status,
          CONCAT(
            'Site update: ',
            sh.old_value, ' -> ', sh.new_value,
            ' on ', TO_CHAR(sh.created_at, 'DD-Mon-YYYY HH24:MI')
          ) AS change_summary
        FROM site_history sh

        UNION ALL

        -- 3) Remarks History
        SELECT
          rh.id AS id,  -- ✅ FIXED HERE TOO
          'remarks_history' AS source,
          NULL AS transaction_id,
          NULL AS item_id,
          NULL AS category,
          NULL AS item_name,
          NULL AS model,
          NULL AS item_unique_id,
          NULL AS site_name,
          NULL AS updated_by,
          'Remarks update' AS transaction_type,
          0 AS quantity_change,
          NULL AS unit,
          'N/A' AS price_update,
          rh.created_at AS timestamp,
          NULL AS key_in_date,
          rh.new_value AS remarks,
          'N/A' AS status,
          CONCAT(
            'Remarks update: ',
            rh.old_value, ' -> ', rh.new_value,
            ' on ', TO_CHAR(rh.created_at, 'DD-Mon-YYYY HH24:MI')
          ) AS change_summary
        FROM remarks_history rh
      ) AS combined_logs
      ORDER BY timestamp DESC;
    `;

    const { rows } = await pool.query(query);
    res.json({ logs: rows });
  })
);
app.put('/logs/:source/:id', authenticateJWT, asyncHandler(async (req, res) => {
  const { source, id } = req.params;
  let { updated_by, quantity_change, site_name, remarks, key_in_date } = req.body;

  console.log('Incoming request:', { source, id, updated_by, quantity_change, site_name, remarks, key_in_date });

  // Convert empty date to null and quantity_change to a number
  key_in_date = key_in_date === '' ? null : key_in_date;
  quantity_change = Number(quantity_change);

  let query, values;

  if (source === 'transaction') {
    // Ensure updated_by is set
    if (!updated_by && req.user && req.user.username) {
      updated_by = req.user.username;
      console.log('Falling back to JWT username:', updated_by);
    }
    if (!updated_by) {
      console.error('Error: updated_by is required but not provided.');
      return res.status(400).json({ error: 'updated_by is required' });
    }

    // Fetch user_id from users table
    console.log('Looking up user for username:', updated_by);
    const userResult = await pool.query(
      'SELECT user_id FROM users WHERE username = $1',
      [updated_by]
    );
    console.log('User lookup result:', userResult.rows);
    if (userResult.rows.length === 0) {
      console.error('Error: Username not found in users table for:', updated_by);
      return res.status(400).json({ error: 'Username not found in users table' });
    }
    const user_id = userResult.rows[0].user_id;
    console.log('Found user_id:', user_id);

    // Fetch the original transaction to get the old quantity_change
    const origResult = await pool.query(
      'SELECT * FROM inventory_transactions WHERE transaction_id = $1',
      [id]
    );
    console.log('Original transaction lookup result:', origResult.rows);
    if (origResult.rows.length === 0) {
      console.error('Error: Original transaction not found for id:', id);
      return res.status(404).json({ error: 'Original transaction not found' });
    }
    const originalLog = origResult.rows[0];
    const oldChange = Number(originalLog.quantity_change);
    console.log('Old quantity_change:', oldChange);

    // Update the transaction record using the retrieved user_id
    query = `
      UPDATE inventory_transactions
      SET user_id = $1,
          quantity_change = $2,
          site_name = $3,
          remarks = $4,
          key_in_date = $5
      WHERE transaction_id = $6
      RETURNING *;
    `;
    values = [user_id, quantity_change, site_name, remarks, key_in_date, id];
    console.log('Executing transaction update with values:', values);
    const { rows } = await pool.query(query, values);
    if (rows.length === 0) {
      console.error('Error: No rows returned after update for id:', id);
      return res.status(500).json({ error: 'Failed to update transaction' });
    }
    const updatedLog = rows[0];
    const newChange = Number(updatedLog.quantity_change);
    console.log('Updated transaction record:', updatedLog, 'New quantity_change:', newChange);

    // Update the items table using the differential change.
    const diff = newChange - oldChange;
    console.log('Updating items table with differential change:', diff, 'for item_id:', originalLog.item_id);
    await pool.query(
      'UPDATE items SET quantity = quantity + $1 WHERE item_id = $2',
      [diff, originalLog.item_id]
    );

    // Set id field and attach metadata for client
    updatedLog.id = updatedLog.transaction_id.toString();
    updatedLog.updated_by = updated_by;
    updatedLog.source = source;
    console.log('Final updated log:', updatedLog);
    return res.json({ log: updatedLog });
  } else if (source === 'site_history') {
    query = `
      UPDATE site_history
      SET new_value = $1
      WHERE id = $2
      RETURNING *;
    `;
    values = [site_name, id];
  } else if (source === 'remarks_history') {
    query = `
      UPDATE remarks_history
      SET new_value = $1
      WHERE id = $2
      RETURNING *;
    `;
    values = [remarks, id];
  } else {
    console.error('Error: Invalid source type:', source);
    return res.status(400).json({ error: 'Invalid source type' });
  }

  // For non-transaction sources, simply update and return.
  const { rows } = await pool.query(query, values);
  if (rows.length === 0) {
    console.error('Error: No rows returned for non-transaction update for id:', id);
    return res.status(500).json({ error: 'Failed to update record' });
  }
  const updatedLog = rows[0];
  if (source !== 'transaction') {
    updatedLog.id = updatedLog.id.toString();
    updatedLog.source = source;
  }
  console.log('Final updated log for non-transaction source:', updatedLog);
  res.json({ log: updatedLog });
}));

app.delete('/logs/:source/:id', authenticateJWT, asyncHandler(async (req, res) => {
  const { source, id } = req.params;
  let query;

  switch (source) {
    case 'transaction':
      query = 'DELETE FROM inventory_transactions WHERE transaction_id = $1';
      break;
    case 'site_history':
      query = 'DELETE FROM site_history WHERE id = $1'; // ✅ fixed column name
      break;
    case 'remarks_history':
      query = 'DELETE FROM remarks_history WHERE id = $1'; // ✅ fixed column name
      break;
    default:
      return res.status(400).json({ error: 'Invalid source type' });
  }

  await pool.query(query, [id]);
  res.sendStatus(204);
}));


let transactionExpiryInterval = '24 hour'; // Default to 24 hours

// GET the current transaction expiry interval
app.get(
  '/get-transaction-expiry',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    res.json({ expiry: transactionExpiryInterval });
  })
);

// POST to set transaction expiry (e.g., "none", "24 hour", "1 week")
app.post(
  '/set-transaction-expiry',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const { expiry } = req.body;
    if (!expiry) {
      return res.status(400).json({ message: 'Expiry interval is required.' });
    }
    // If admin wants to disable auto-approval
    if (expiry.toLowerCase() === 'none') {
      transactionExpiryInterval = 'none';
      return res.json({ message: 'Auto-approval disabled (No Auto-Approve).' });
    }
    // Otherwise, set the interval
    transactionExpiryInterval = expiry;
    res.json({ message: `Transaction auto-approve interval set to ${expiry}.` });
  })
);

// GET pending transactions with auto-approval
app.get(
  '/pending-transactions',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    // Only auto-approve if transactionExpiryInterval != 'none'
    if (transactionExpiryInterval !== 'none') {
      // 1) Find all old pending transactions
      const oldTx = await pool.query(`
        SELECT transaction_id, item_id, transaction_type, quantity_change
        FROM inventory_transactions
        WHERE status = 'Pending'
          AND timestamp < NOW() - INTERVAL '${transactionExpiryInterval}'
      `);

      // 2) For each, update item inventory and approve the transaction
      for (const row of oldTx.rows) {
        // Update inventory if needed
        if (row.transaction_type === 'IN') {
          await pool.query(
            'UPDATE items SET quantity = quantity + $1 WHERE item_id = $2',
            [row.quantity_change, row.item_id]
          );
        } else if (row.transaction_type === 'OUT') {
          await pool.query(
            'UPDATE items SET quantity = quantity - $1 WHERE item_id = $2',
            [row.quantity_change, row.item_id]
          );
        }
        // Approve the transaction
        await pool.query(
          `
            UPDATE inventory_transactions
            SET status = 'Approved'
            WHERE transaction_id = $1
          `,
          [row.transaction_id]
        );
      }
    }

    // Optional: Pagination & Sorting
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const sortField = req.query.sortField || 'timestamp';
    const sortOrder = req.query.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const offset = (page - 1) * pageSize;

    // Return what's still Pending
    const query = `
      SELECT
        it.transaction_id,
        it.item_id,
        i.category,
        i.item_name,
        i.model,
        i.item_unique_id,
        it.user_id,
        it.transaction_type,
        it.quantity_change,
        it.timestamp,
        it.remarks,
        it.status
      FROM inventory_transactions it
      JOIN items i ON it.item_id = i.item_id
      WHERE it.status = 'Pending'
      ORDER BY ${sortField} ${sortOrder}
      LIMIT $1 OFFSET $2
    `;
    const { rows } = await pool.query(query, [pageSize, offset]);
    res.json({ pendingTransactions: rows });
  })
);

// Approve a transaction manually
app.patch(
  '/approve-transaction/:transactionId',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const { transactionId } = req.params;

    // Find the transaction
    const txQuery = `
      SELECT item_id, quantity_change, transaction_type
      FROM inventory_transactions
      WHERE transaction_id = $1 AND status = 'Pending'
    `;
    const txResult = await pool.query(txQuery, [transactionId]);
    if (txResult.rowCount === 0) {
      return res.status(404).json({ message: 'Transaction not found or already processed.' });
    }

    const { item_id, quantity_change, transaction_type } = txResult.rows[0];

    // Update inventory
    if (transaction_type === 'IN') {
      await pool.query(
        'UPDATE items SET quantity = quantity + $1 WHERE item_id = $2',
        [quantity_change, item_id]
      );
    } else if (transaction_type === 'OUT') {
      await pool.query(
        'UPDATE items SET quantity = quantity - $1 WHERE item_id = $2',
        [quantity_change, item_id]
      );
    }

    // Approve
    const result = await pool.query(
      `
        UPDATE inventory_transactions
        SET status = 'Approved'
        WHERE transaction_id = $1 AND status = 'Pending'
        RETURNING *
      `,
      [transactionId]
    );

    res.json({
      message: 'Transaction approved and inventory updated.',
      transaction: result.rows[0],
    });
  })
);

// Cancel a transaction with logging
app.patch(
  '/cancel-transaction/:transactionId',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const { transactionId } = req.params;

    // Find the transaction
    const txQuery = `
      SELECT *
      FROM inventory_transactions
      WHERE transaction_id = $1 AND status = 'Pending'
    `;
    const txResult = await pool.query(txQuery, [transactionId]);
    if (txResult.rowCount === 0) {
      return res.status(404).json({ message: 'Transaction not found or already processed.' });
    }

    // Log cancellation (assumes a "transaction_history" table exists)
    await pool.query(
      `
        INSERT INTO transaction_history (transaction_id, action_type, details, timestamp)
        VALUES ($1, 'Cancel', $2, NOW())
      `,
      [transactionId, `Transaction ${transactionId} cancelled by admin`]
    );

    // Cancel
    const result = await pool.query(
      `
        UPDATE inventory_transactions
        SET status = 'Cancelled'
        WHERE transaction_id = $1 AND status = 'Pending'
        RETURNING *
      `,
      [transactionId]
    );

    res.json({
      message: 'Transaction cancelled successfully and logged.',
      transaction: result.rows[0],
    });
  })
);
// ---------------------------------------------------------------------
// 11) File Upload & OCR Placeholder
// ---------------------------------------------------------------------
app.post(
  '/api/uploadFiles',
  upload.array('files'),
  asyncHandler(async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: 'No files uploaded.' });
      }
      const siteName = req.body.siteName || null;
      for (const file of req.files) {
        const fileName = file.originalname;
        const fileData = fs.readFileSync(file.path);
        const fileType = path.extname(file.originalname).toLowerCase();
        const status = 'Pending';

    

        await pool.query(
          `INSERT INTO uploaded_files
            (file_name, file_data, file_type, status, site_name, uploaded_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          [fileName, fileData, fileType, status, siteName]
        );
      }
      res.json({
        message: 'Files uploaded (with optional OCR) and saved to database successfully.',
      });
    } catch (error) {
      console.error('Error during file upload:', error);
      res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
  })
);

app.get(
  '/api/fileHistory',
  asyncHandler(async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, file_name, file_type, status, site_name AS "siteName", uploaded_at
         FROM uploaded_files
         ORDER BY uploaded_at DESC`
      );
      res.json({ files: result.rows });
    } catch (error) {
      console.error('Error fetching file history:', error);
      res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
  })
);

app.get(
  '/api/filePreview/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT file_data, file_type FROM uploaded_files WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'File not found' });
    }
    const { file_data, file_type } = result.rows[0];
    let mimeType = 'application/octet-stream';
    if (file_type === '.pdf') {
      mimeType = 'application/pdf';
    } else if (['.png', '.jpg', '.jpeg', '.gif'].includes(file_type)) {
      mimeType = `image/${file_type.slice(1)}`;
    }
    res.setHeader('Content-Type', mimeType);
    res.send(file_data);
  })
);

app.delete(
  '/api/deleteFile/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM uploaded_files WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ message: 'File not found or already deleted.' });
    }
    res.json({
      message: 'File deleted successfully.',
      file: result.rows[0],
    });
  })
);

app.put(
  '/api/updateFile/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { file_name, status, site_name } = req.body;
    if (!file_name || !status) {
      return res
        .status(400)
        .json({ message: 'file_name and status are required.' });
    }
    const siteNameValue = site_name || null;
    const result = await pool.query(
      `UPDATE uploaded_files
       SET file_name = $1,
           status = $2,
           site_name = $3,
           uploaded_at = NOW()
       WHERE id = $4
       RETURNING id, file_name, file_type, status, site_name AS "siteName", uploaded_at`,
      [file_name, status, siteNameValue, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'File not found.' });
    }
    res.json({
      message: 'File updated successfully.',
      file: result.rows[0],
    });
  })
);

// ---------------------------------------------------------------------
// 12) Inventory Update Endpoints (Delivery/GoodsReceived)
// ---------------------------------------------------------------------
app.post(
  '/delivery/update-inventory',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) {
      return res
        .status(400)
        .json({ message: 'Invalid payload: items array required.' });
    }
    for (const { itemId, qty } of items) {
      const { rows } = await pool.query(
        'SELECT quantity FROM items WHERE item_id = $1',
        [itemId]
      );
      if (rows.length === 0) {
        return res
          .status(404)
          .json({ message: `Item with id ${itemId} not found.` });
      }
      const currentQuantity = rows[0].quantity;
      const newQuantity = currentQuantity - Number(qty);
      if (newQuantity < 0) {
        return res.status(400).json({
          message: `Insufficient quantity for item with id ${itemId}.`,
        });
      }
      await pool.query(
        'UPDATE items SET quantity = $1, updated_at = NOW() WHERE item_id = $2',
        [newQuantity, itemId]
      );
    }
    res.json({ message: 'Inventory updated successfully.' });
  })
);

app.post(
  '/goodsreceived/update-inventory',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) {
      return res
        .status(400)
        .json({ message: 'Invalid payload: items array required.' });
    }
    for (const { itemId, qty } of items) {
      const { rows } = await pool.query(
        'SELECT quantity FROM items WHERE item_id = $1',
        [itemId]
      );
      if (rows.length === 0) {
        return res
          .status(404)
          .json({ message: `Item with id ${itemId} not found.` });
      }
      const currentQuantity = rows[0].quantity;
      const newQuantity = currentQuantity + Number(qty);
      await pool.query(
        'UPDATE items SET quantity = $1, updated_at = NOW() WHERE item_id = $2',
        [newQuantity, itemId]
      );
    }
    res.json({
      message: 'Inventory updated successfully after goods received.',
    });
  })
);


app.post('/upload', upload.array('files'), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).send('No files uploaded.');
  }

  try {
    const summaries = await Promise.all(
      req.files.map(async (file) => {
        const filePath = file.path;
        const fileExtension = path.extname(file.originalname).toLowerCase();
        let wordsArray;

        if (fileExtension === '.pdf') {
          const pdfBuffer = fs.readFileSync(filePath);
          const pdfData = await pdfParse(pdfBuffer);
          wordsArray = pdfData.text.split(/\s+/);
        } else {
          wordsArray = await performOCR(filePath); // Assume performOCR is defined elsewhere
        }

        const gptRequestBody = JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'user',
              content: `(This is my OCR results: ${wordsArray}) Extract System Devices, ID, and Qty. (System Devices must be only words, ID must have 5 characters only, Qty just numbers.) Return results in JSON format: [{"system_devices": "Device1", "id": "deviceId", "qty": qty}]`
            },
          ],
          temperature: 0.7,
          max_tokens: 600,
        });



        const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, // Ensure this is a valid API key
            'Content-Type': 'application/json',
          },
          body: gptRequestBody,
        });

        if (!gptResponse.ok) {
          const errorDetails = await gptResponse.text();
          console.error('GPT API response:', errorDetails);
          throw new Error(`GPT API error: ${gptResponse.statusText}`);
        }

        const gptData = await gptResponse.json();

        return {
          gptSummary: gptData.choices[0].message.content.trim(),
        };
      })
    );

    res.json({ summaries });
  } catch (error) {
    console.error('Error during OCR/GPT process:', error);
    res.status(500).send('Error processing the files.');
  }
});
// ---------------------------------------------------------------------
// 13) Start the Server
// ---------------------------------------------------------------------
app.listen(PORT, '0.0.0.0', () =>
  console.log(`Server running on port ${PORT}`)
);

