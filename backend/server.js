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
const PORT = process.env.PORT;
console.log("Hi");

// Middleware
app.use(cookieParser());
app.use(express.json());

// ---------------------------------------------------------------------
// 2) CORS Setup
// ---------------------------------------------------------------------
const corsOptions = {
  origin: 'http://localhost:3000', 
  // origin: ' https://inventory-e9c9f.web.app', // your frontend origin
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'ngrok-skip-browser-warning'
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

  res.cookie('token', token, { httpOnly: true, sameSite: 'None', secure: true, maxAge: 3600000 });
  res.json({ message: 'Login successful', role_id: user.role_id, user_id: user.user_id, redirect: user.role_id === 1 ? '/admin-dashboard' : '/user-dashboard' });
}));

app.post('/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, sameSite: 'Strict', secure: true });
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
      unit
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

    // 3) Insert new item, omitting "item_id"
    const insertQuery = `
      INSERT INTO items
        (category, item_name, model, item_unique_id, quantity, price,
         remarks, site_name, location, unit, display_order,
         archived_at, reserved_quantity, updated_at)
      VALUES
        ($1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11,
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
      nextOrder
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

    // Archive the selected items (set archived_at and remove display_order)
    const archiveResult = await pool.query(
      `
      UPDATE items
      SET archived_at = NOW(),
          updated_at = NOW(),
          display_order = NULL
      WHERE item_id = ANY($1::int[])
        AND archived_at IS NULL
      RETURNING item_id, item_name, quantity, category, model, item_unique_id
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
           'Item archived', 'Approved', NOW(),
           'Item archived from admin dashboard.')
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

    // Automatically resequence the display_order for active (non-archived) items
    await pool.query(`
      WITH ordered AS (
        SELECT item_id,
               ROW_NUMBER() OVER (ORDER BY display_order) AS new_order
        FROM items
        WHERE archived_at IS NULL
      )
      UPDATE items
      SET display_order = ordered.new_order
      FROM ordered
      WHERE items.item_id = ordered.item_id;
    `);

    const archivedCount = archiveResult.rowCount;
    let message = `${archivedCount} item(s) archived successfully.`;
    if (archivedCount < itemIds.length) {
      message += ' The remaining items may already be archived or do not exist.';
    }

    // 1) Mask the item_id in the response
    const maskedItems = archiveResult.rows.map((item) => ({
      ...item,
      item_id: '*****', // or null, or any placeholder you want
    }));

    return res.status(200).json({
      message,
      archivedItems: maskedItems, // 2) Return masked items
    });
  })
);

app.patch(
  '/admin-dashboard/items/restore',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const { itemIds } = req.body;
    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ error: 'No items selected for restore' });
    }

    // Select only the items that are actually archived
    const itemsToRestore = await pool.query(
      `
      SELECT item_id
      FROM items
      WHERE item_id = ANY($1::int[])
        AND archived_at IS NOT NULL
      `,
      [itemIds]
    );

    if (itemsToRestore.rowCount === 0) {
      return res.status(404).json({
        error: 'No archived items found or items already active',
      });
    }

    // Get the current highest display_order among active items
    const { rows: maxRows } = await pool.query(
      `
      SELECT COALESCE(MAX(display_order), 0) AS max_display
      FROM items
      WHERE archived_at IS NULL
      `
    );
    let currentMaxDisplay = parseInt(maxRows[0].max_display, 10);

    let restoreResult = { rows: [] };

    // For each archived item, update it as active and assign a new display_order
    for (const itemId of itemIds) {
      currentMaxDisplay++;
      const partialResult = await pool.query(
        `
        UPDATE items
        SET archived_at = NULL,
            updated_at = NOW(),
            display_order = $2
        WHERE item_id = $1
          AND archived_at IS NOT NULL
        RETURNING item_id, item_name, quantity, category, model, item_unique_id, display_order
        `,
        [itemId, currentMaxDisplay]
      );
      restoreResult.rows.push(...partialResult.rows);
    }

    // Log each restore transaction
    for (const item of restoreResult.rows) {
      await pool.query(
        `
        INSERT INTO inventory_transactions
          (item_id, category, user_id, item_name, model, item_unique_id,
           transaction_type, quantity_change, remarks, status, timestamp, change_summary)
        VALUES
          ($1, $2, $3, $4, $5, $6, 'Restore Item', $7,
           'Item restored back to dashboard', 'Approved', NOW(),
           'Item restored from archive to dashboard.')
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

    // Automatically resequence the display_order after restoration
    await pool.query(`
      WITH ordered AS (
        SELECT item_id,
               ROW_NUMBER() OVER (ORDER BY display_order) AS new_order
        FROM items
        WHERE archived_at IS NULL
      )
      UPDATE items
      SET display_order = ordered.new_order
      FROM ordered
      WHERE items.item_id = ordered.item_id;
    `);

    return res.status(200).json({
      message: `${restoreResult.rows.length} item(s) restored successfully`,
      restoredItems: restoreResult.rows,
    });
  })
);
app.patch(
  '/admin-dashboard/items/fix-item-ids',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Step 1: Shift archived items away by adding a large offset.
      const shiftArchivedQuery = `
        UPDATE items
        SET item_id = item_id + 1000000
        WHERE archived_at IS NOT NULL;
      `;
      console.log('Executing shiftArchived query:', shiftArchivedQuery);
      await client.query(shiftArchivedQuery);

      // Step 2: For active items (archived_at IS NULL), assign temporary negative IDs based on desired order.
      const tempUpdateQuery = `
        WITH ordered AS (
          SELECT item_id,
                 ROW_NUMBER() OVER (ORDER BY CASE WHEN starred THEN 0 ELSE 1 END, item_id) AS new_id
          FROM items
          WHERE archived_at IS NULL
        )
        UPDATE items
        SET item_id = -ordered.new_id
        FROM ordered
        WHERE items.item_id = ordered.item_id
          AND archived_at IS NULL;
      `;
      console.log('Executing temporary update query:', tempUpdateQuery);
      await client.query(tempUpdateQuery);

      // Step 3: Convert negative IDs to positive.
      const finalUpdateQuery = `
        UPDATE items
        SET item_id = ABS(item_id)
        WHERE archived_at IS NULL;
      `;
      console.log('Executing final update query:', finalUpdateQuery);
      await client.query(finalUpdateQuery);

      await client.query('COMMIT');
      console.log('Item IDs fixed successfully.');
      return res.status(200).json({ message: 'Item IDs fixed successfully.' });
    } catch (error) {
      console.error('Failed to fix item IDs:', error);
      await client.query('ROLLBACK');
      return res.status(500).json({ error: error.message });
    } finally {
      client.release();
    }
  })
);



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
      starred
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

    // 4) Flags to detect changes
    let isUniqueIdUpdated = false;
    let isQuantityUpdated = false;
    let isPriceUpdated = false;
    let isSiteUpdated = false;
    let isRemarksUpdated = false;
    let isUnitUpdated = false;
    let isAuditDateUpdated = false;
    let isStarredUpdated = false;

    // 5) Array to collect textual logs
    const changeLogs = [];

    // ---------------------------------------------------------------------
    // Unique ID
    // ---------------------------------------------------------------------
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
        changeLogs.push(
          `Unique ID updated from "${currentItem.item_unique_id || 'N/A'}" to "${updatedUniqueId}"`
        );
      }
    }

    // ---------------------------------------------------------------------
    // Quantity Updates (newQuantity or quantityChange)
    // ---------------------------------------------------------------------
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
        changeLogs.push(
          `Quantity updated from ${currentItem.quantity} to ${updatedQuantity} on ${formatMYT(updatedAuditDate)}`
        );
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
        changeLogs.push(
          `Quantity changed from ${currentItem.quantity} to ${updatedQuantity} (Change: ${parsedChange}) on ${formatMYT(updatedAuditDate)}`
        );
      }
    }

    // ---------------------------------------------------------------------
    // Price Update
    // ---------------------------------------------------------------------
    if (req.body.hasOwnProperty('price')) {
      const parsedPrice = parseFloat(price);
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ message: 'Invalid price value.' });
      }
      // Compare to current price
      if (parsedPrice !== parseFloat(currentItem.price)) {
        updatedPrice = parsedPrice;
        isPriceUpdated = true;
        // Removed "RM" prefix here to avoid duplicate when concatenated in the SQL logs query.
        changeLogs.push(`Price updated from ${currentItem.price} to ${updatedPrice}`);
      }
    }

    // ---------------------------------------------------------------------
    // Site Name Update
    // ---------------------------------------------------------------------
    if (req.body.hasOwnProperty('site_name') && site_name !== currentItem.site_name) {
      isSiteUpdated = true;
      changeLogs.push(`Site name updated from "${currentItem.site_name}" to "${updatedSiteName}"`);
    }

    // ---------------------------------------------------------------------
    // Remarks Update
    // ---------------------------------------------------------------------
    if (req.body.hasOwnProperty('remarks') && remarks !== currentItem.remarks) {
      isRemarksUpdated = true;
      changeLogs.push(`Remarks updated from "${currentItem.remarks || 'N/A'}" to "${remarks}"`);
    }

    // ---------------------------------------------------------------------
    // Unit Update
    // ---------------------------------------------------------------------
    if (req.body.hasOwnProperty('unit') && unit !== currentItem.unit) {
      isUnitUpdated = true;
      changeLogs.push(`Unit updated from "${currentItem.unit}" to "${updatedUnit}"`);
    }

    // ---------------------------------------------------------------------
    // Audit Date (Key-in Date)
    // ---------------------------------------------------------------------
    if (req.body.hasOwnProperty('audit_date') && audit_date !== currentItem.audit_date) {
      isAuditDateUpdated = true;
      const formattedOld = formatMYT(currentItem.audit_date);
      const formattedNew = formatMYT(audit_date);
      changeLogs.push(`Audit date updated from "${formattedOld}" to "${formattedNew}"`);
      updatedAuditDate = audit_date;
    }

    // ---------------------------------------------------------------------
    // Starred Update
    // ---------------------------------------------------------------------
    if (req.body.hasOwnProperty('starred') && starred !== currentItem.starred) {
      isStarredUpdated = true;
      updatedStarred = starred;
      changeLogs.push(`Starred status updated from "${currentItem.starred}" to "${updatedStarred}"`);
    }

    // ---------------------------------------------------------------------
    // If no changes, return early
    // ---------------------------------------------------------------------
    if (
      !isQuantityUpdated &&
      !isPriceUpdated &&
      !isSiteUpdated &&
      !isRemarksUpdated &&
      !isUnitUpdated &&
      !isUniqueIdUpdated &&
      !isAuditDateUpdated &&
      !isStarredUpdated
    ) {
      return res.json({ message: 'No changes detected.', item: currentItem });
    }

    // ---------------------------------------------------------------------
    // Build change summary
    // ---------------------------------------------------------------------
    const changeSummary = changeLogs.join('. ');

    // ---------------------------------------------------------------------
    // Determine transaction type
    // ---------------------------------------------------------------------
    const changesCount = [
      isQuantityUpdated,
      isPriceUpdated,
      isSiteUpdated,
      isRemarksUpdated,
      isUnitUpdated,
      isUniqueIdUpdated,
      isAuditDateUpdated,
      isStarredUpdated
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
    } else {
      transactionType = 'Inventory Update';
    }

    // ---------------------------------------------------------------------
    // Update the item in "items" table
    // ---------------------------------------------------------------------
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
        updated_at = NOW()
      WHERE item_id = $9
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
      itemId
    ]);
    const updatedItem = updatedRows[0];

    // ---------------------------------------------------------------------
    // Insert transaction into "inventory_transactions"
    // (Storing numeric-only price in "price_update")
    // ---------------------------------------------------------------------
    const keyInDateOldValue = isAuditDateUpdated ? currentItem.audit_date : null;
    let quantityToLog = 0;
    if (isQuantityUpdated) {
      quantityToLog = req.body.hasOwnProperty('newQuantity')
        ? updatedQuantity - currentItem.quantity
        : parseInt(quantityChange, 10);
    }

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
  quantityToLog,
  updatedAuditDate,
  keyInDateOldValue,
  updatedRemarks,
  isPriceUpdated ? updatedPrice : null,  // Ensure only numeric value is stored
  updatedSiteName,
  updatedUnit,
  changeSummary
]);


    // ---------------------------------------------------------------------
    // Return response
    // ---------------------------------------------------------------------
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

// ---------------------------------------------------------------------
// 10) Logs & Pending Transactions
// ---------------------------------------------------------------------
app.get(
  '/logs',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const query = `
      (
        -- 1) Inventory Transactions
        SELECT
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
          COALESCE(it.price_update::text, 'N/A') AS price_update,  -- ✅ No "RM", only numeric or "N/A"
          it.timestamp,
          it.key_in_date,
          COALESCE(it.remarks, 'N/A') AS remarks,
          it.status,
          it.change_summary
        FROM inventory_transactions it
        LEFT JOIN items i ON it.item_id = i.item_id
        LEFT JOIN users u ON it.user_id = u.user_id
      )
      UNION ALL
      (
        -- 2) Site History
        SELECT
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
      )
      UNION ALL
      (
        -- 3) Remarks History
        SELECT
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
      )
      ORDER BY timestamp DESC;
    `;

    const { rows } = await pool.query(query);
    res.json({ logs: rows });
  })
);


app.get(
  '/pending-transactions',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
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
      ORDER BY it.timestamp DESC;
    `;
    const { rows } = await pool.query(query);
    res.json({ pendingTransactions: rows });
  })
);

app.patch(
  '/approve-transaction/:transactionId',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const { transactionId } = req.params;
    const result = await pool.query(
      `UPDATE inventory_transactions
       SET status = 'Approved'
       WHERE transaction_id = $1 AND status = 'Pending'
       RETURNING *`,
      [transactionId]
    );
    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ message: 'Transaction not found or already approved.' });
    }
    res.json({
      message: 'Transaction approved successfully.',
      transaction: result.rows[0],
    });
  })
);

app.patch(
  '/cancel-transaction/:transactionId',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const { transactionId } = req.params;
    const result = await pool.query(
      `UPDATE inventory_transactions
       SET status = 'Cancelled'
       WHERE transaction_id = $1 AND status = 'Pending'
       RETURNING *`,
      [transactionId]
    );
    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ message: 'Transaction not found or already processed.' });
    }
    res.json({
      message: 'Transaction cancelled successfully.',
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